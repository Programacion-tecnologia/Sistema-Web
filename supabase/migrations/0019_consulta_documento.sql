-- Rios System: consulta RUC/DNI (SUNAT/RENIEC) vía API decolecta (fase 5+)
-- Correr en el SQL Editor de Supabase, DESPUES de 0009 (necesita mi_rol()).
--
-- Objetivo: autocompletar nombre/dirección del cliente o destinatario tipeando
-- el documento, sin exponer el token de decolecta en el frontend. La llamada
-- HTTP se hace desde la base (extensión http) dentro de una RPC security
-- definer; el token vive en una tabla privada (api_secrets) que NINGUN cliente
-- puede leer por la API - solo la función, que corre como owner.
--
-- IMPORTANTE: el token NO va en esta migración (no se commitea el secreto). Se
-- carga aparte con un INSERT en el SQL Editor (ver instrucciones del chat):
--   insert into api_secrets (nombre, valor) values ('decolecta', 'sk_...')
--   on conflict (nombre) do update set valor = excluded.valor;
--
-- Si tu proyecto no permite habilitar la extensión http, el fallback es una
-- Edge Function; avisar para armarla.

create extension if not exists http with schema extensions;

-- api_secrets: tokens de APIs externas. RLS activa y SIN policies => ningún rol
-- (ni authenticated) puede leerla/escribirla vía PostgREST; solo las funciones
-- security definer de abajo la leen.
create table if not exists api_secrets (
  nombre text primary key,
  valor text not null
);
alter table api_secrets enable row level security;

-- ---------------------------------------------------------------------
-- consultar_documento: consulta RUC (11 díg.) o DNI (8 díg.) y devuelve un
-- objeto normalizado { tipo, numero, nombre, direccion, estado }. Restringida
-- a los roles que dan de alta clientes/guías.
-- ---------------------------------------------------------------------
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
  v_direccion text;
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

  select valor into v_token from api_secrets where nombre = 'decolecta';
  if v_token is null then
    raise exception 'Falta configurar el token de decolecta (tabla api_secrets).';
  end if;

  if p_tipo = 'ruc' then
    v_url := 'https://api.decolecta.com/v1/sunat/ruc?numero=' || p_numero;
  else
    v_url := 'https://api.decolecta.com/v1/reniec/dni?numero=' || p_numero;
  end if;

  -- Timeout defensivo: si decolecta no responde, no colgar la conexión.
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
    -- La dirección principal a veces viene como "-"; en ese caso se usa la del
    -- primer local anexo.
    v_direccion := nullif(v_body ->> 'direccion', '-');
    if v_direccion is null then
      v_direccion := v_body -> 'locales_anexos' -> 0 ->> 'direccion';
    end if;
    return jsonb_build_object(
      'tipo', 'ruc',
      'numero', v_body ->> 'numero_documento',
      'nombre', v_body ->> 'razon_social',
      'direccion', v_direccion,
      'estado', v_body ->> 'estado'
    );
  else
    return jsonb_build_object(
      'tipo', 'dni',
      'numero', v_body ->> 'document_number',
      'nombre', v_body ->> 'full_name',
      'direccion', null,
      'estado', null
    );
  end if;
end;
$$;
