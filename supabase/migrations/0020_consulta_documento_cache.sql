-- Rios System: caché para la consulta RUC/DNI (ahorro de cuota de decolecta)
-- Correr en el SQL Editor de Supabase, DESPUES de 0019.
--
-- Reescribe consultar_documento para NO gastar cuota de la API cuando no hace
-- falta. Orden de resolución:
--   1) Si el documento ya es un cliente cargado -> devuelve su ficha (0 API).
--   2) Si está en documento_cache y es reciente (< 90 días) -> caché (0 API).
--   3) Si no -> consulta a decolecta y guarda en caché.
-- Con esto solo se consume cuota en documentos verdaderamente nuevos.
--
-- La respuesta agrega el campo "fuente" ('clientes' | 'cache' | 'api') para
-- que el frontend pueda avisar de dónde salió el dato.

-- documento_cache: respuestas ya consultadas. RLS activa y SIN policies: solo
-- la función security definer la lee/escribe (igual criterio que api_secrets).
create table if not exists documento_cache (
  tipo text not null,
  numero text not null,
  nombre text,
  direccion text,
  estado text,
  consultado_at timestamptz not null default now(),
  primary key (tipo, numero)
);
alter table documento_cache enable row level security;

create or replace function consultar_documento(p_tipo text, p_numero text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_url text;
  v_status int;
  v_body jsonb;
  v_nombre text;
  v_direccion text;
  v_estado text;
  v_cache record;
begin
  if mi_rol() not in ('admin', 'gerencia', 'ventas') then
    raise exception 'No autorizado para consultar documentos';
  end if;

  p_numero := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  if p_tipo = 'ruc' and length(p_numero) <> 11 then
    raise exception 'El RUC debe tener 11 dígitos';
  elsif p_tipo = 'dni' and length(p_numero) <> 8 then
    raise exception 'El DNI debe tener 8 dígitos';
  elsif p_tipo not in ('ruc', 'dni') then
    raise exception 'Tipo de documento inválido';
  end if;

  -- 1) ¿Ya es un cliente cargado? Devolver su ficha, sin gastar cuota.
  select nombre, direccion into v_nombre, v_direccion
  from clientes
  where ruc_dni = p_numero
  order by created_at
  limit 1;
  if v_nombre is not null then
    return jsonb_build_object('tipo', p_tipo, 'numero', p_numero, 'nombre', v_nombre,
      'direccion', v_direccion, 'estado', null, 'fuente', 'clientes');
  end if;

  -- 2) ¿Está en caché y es reciente? Devolverlo, sin gastar cuota.
  select * into v_cache
  from documento_cache
  where tipo = p_tipo and numero = p_numero
    and consultado_at > now() - interval '90 days';
  if found then
    return jsonb_build_object('tipo', p_tipo, 'numero', p_numero, 'nombre', v_cache.nombre,
      'direccion', v_cache.direccion, 'estado', v_cache.estado, 'fuente', 'cache');
  end if;

  -- 3) Consultar a decolecta y cachear.
  select valor into v_token from api_secrets where nombre = 'decolecta';
  if v_token is null then
    raise exception 'Falta configurar el token de decolecta (tabla api_secrets).';
  end if;

  if p_tipo = 'ruc' then
    v_url := 'https://api.decolecta.com/v1/sunat/ruc?numero=' || p_numero;
  else
    v_url := 'https://api.decolecta.com/v1/reniec/dni?numero=' || p_numero;
  end if;

  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');

  select r.status, r.content::jsonb
    into v_status, v_body
  from http((
    'GET',
    v_url,
    array[
      http_header('Authorization', 'Bearer ' || v_token),
      http_header('Referer', 'https://decolecta.com')
    ],
    NULL,
    NULL
  )::http_request) r;

  if v_status = 404 then
    raise exception 'No se encontró ese documento.';
  elsif v_status <> 200 then
    raise exception 'La consulta falló (código %).', v_status;
  end if;

  if p_tipo = 'ruc' then
    v_nombre := v_body ->> 'razon_social';
    v_estado := v_body ->> 'estado';
    v_direccion := nullif(v_body ->> 'direccion', '-');
    if v_direccion is null then
      v_direccion := v_body -> 'locales_anexos' -> 0 ->> 'direccion';
    end if;
  else
    v_nombre := v_body ->> 'full_name';
    v_estado := null;
    v_direccion := null;
  end if;

  insert into documento_cache (tipo, numero, nombre, direccion, estado, consultado_at)
  values (p_tipo, p_numero, v_nombre, v_direccion, v_estado, now())
  on conflict (tipo, numero) do update
    set nombre = excluded.nombre,
        direccion = excluded.direccion,
        estado = excluded.estado,
        consultado_at = excluded.consultado_at;

  return jsonb_build_object('tipo', p_tipo, 'numero', p_numero, 'nombre', v_nombre,
    'direccion', v_direccion, 'estado', v_estado, 'fuente', 'api');
end;
$$;
