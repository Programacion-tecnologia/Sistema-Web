-- Rios System: modulo Configuracion de empresa + Guias de remision (fase 5)
-- Correr en el SQL Editor de Supabase, DESPUES de 0016 (usa ventas para las
-- guias generadas desde una venta) y necesita mi_rol() de 0009.
--
-- Que agrega:
--   1. configuracion_empresa (fila unica): la identidad que sale IMPRESA en
--      todos los documentos - razon social, RUC, domicilios, telefonos, logo y
--      la tira de marcas. Es la parte "editable" que pidio el dueno: se edita
--      en Configuracion y alimenta la guia de remision, la nota de venta
--      interna y el PDF de cotizacion.
--   2. Bucket de Storage 'empresa' para el logo y la imagen de marcas.
--   3. guias_remision + guia_remision_items: documento de traslado imprimible
--      (interno por ahora; estructurado como guia remitente para que enchufe a
--      SUNAT en la fase 6 sin rehacer). Se puede generar desde una venta o de
--      cero. Numeracion serie-correlativo atomica via documento_correlativos.

-- ---------------------------------------------------------------------
-- configuracion_empresa: fila unica (id fijo = 1). Se siembra con los datos
-- reales de la empresa (tomados de sus comprobantes) para que los documentos
-- salgan con la marca desde el primer momento; el logo y las marcas se suben
-- despues desde la pantalla de Configuracion.
-- ---------------------------------------------------------------------
create table configuracion_empresa (
  id smallint primary key default 1 check (id = 1),
  razon_social text,
  ruc text,
  direccion_fiscal text,
  direccion_comercial text,
  telefonos text,
  email text,
  logo_url text,
  marcas_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

insert into configuracion_empresa
  (id, razon_social, ruc, direccion_fiscal, direccion_comercial, telefonos)
values
  (1, 'KEVIN YOIS RIOS HASSINGER', '10702389190',
   'AV. SAN MARTIN NRO 0812 URB OXAPAMPA - OXAPAMPA - PASCO',
   'CALLE VICTOR ALZAMORA, NRO 280 A, BARRIO MEDICO - SURQUILLO - LIMA',
   '963700727 / 968559782');

alter table configuracion_empresa enable row level security;

-- Lectura abierta a cualquier autenticado: todos los documentos imprimibles
-- necesitan leer la marca. La edicion es solo Admin/Gerencia.
create policy "config_empresa: lectura autenticada" on configuracion_empresa
  for select to authenticated using (true);
create policy "config_empresa: editar admin/gerencia" on configuracion_empresa
  for update to authenticated
  using (mi_rol() in ('admin', 'gerencia'))
  with check (mi_rol() in ('admin', 'gerencia'));

-- ---------------------------------------------------------------------
-- Bucket de Storage 'empresa' para el logo y la tira de marcas. Publico igual
-- que 'productos' (0002): no es dato sensible y deja URLs estables. Escritura
-- restringida a Admin/Gerencia (a diferencia de productos, que es abierta),
-- porque cambiar el logo de la empresa es una accion de configuracion.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('empresa', 'empresa', true)
on conflict (id) do nothing;

create policy "empresa branding: lectura publica"
  on storage.objects for select
  using (bucket_id = 'empresa');

create policy "empresa branding: escritura admin/gerencia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'empresa' and mi_rol() in ('admin', 'gerencia'));

create policy "empresa branding: actualizacion admin/gerencia"
  on storage.objects for update to authenticated
  using (bucket_id = 'empresa' and mi_rol() in ('admin', 'gerencia'));

-- ---------------------------------------------------------------------
-- documento_correlativos: contador por (tipo, serie) para numerar documentos
-- de forma atomica. Generico para reusar en futuros tipos (facturas, etc.).
-- ---------------------------------------------------------------------
create table documento_correlativos (
  tipo text not null,
  serie text not null,
  ultimo integer not null default 0,
  primary key (tipo, serie)
);

alter table documento_correlativos enable row level security;
create policy "correlativos: lectura autenticada" on documento_correlativos
  for select to authenticated using (true);
-- Sin policy de escritura: solo lo toca crear_guia_remision (security definer).

-- ---------------------------------------------------------------------
-- guias_remision: cabecera de la guia de remision (remitente = la empresa).
-- Los datos del destinatario se guardan como SNAPSHOT (nombre/doc/direccion),
-- no solo como FK a clientes: un documento emitido no debe cambiar si despues
-- se edita la ficha del cliente. cliente_id/venta_id quedan como referencia.
-- ---------------------------------------------------------------------
create table guias_remision (
  id uuid primary key default gen_random_uuid(),
  serie text not null default 'T001',
  correlativo integer not null,
  fecha_emision date not null default current_date,
  fecha_traslado date,
  venta_id uuid references ventas (id),
  cliente_id uuid references clientes (id),
  destinatario_nombre text not null,
  destinatario_doc text,
  destinatario_direccion text,
  motivo_traslado text not null default 'Venta',
  punto_partida text,
  punto_llegada text,
  modalidad_transporte text check (modalidad_transporte in ('publico', 'privado')),
  transportista_nombre text,
  transportista_doc text,
  conductor_nombre text,
  conductor_licencia text,
  placa text,
  peso_bruto numeric(12, 2),
  num_bultos integer,
  observaciones text,
  estado text not null default 'emitida' check (estado in ('emitida', 'anulada')),
  creada_por uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (serie, correlativo)
);

create table guia_remision_items (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references guias_remision (id) on delete cascade,
  producto_id uuid references productos (id),
  codigo text,
  descripcion text not null,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  unidad text
);

alter table guias_remision enable row level security;
alter table guia_remision_items enable row level security;

create policy "guias: lectura autenticada" on guias_remision
  for select to authenticated using (true);
create policy "guia_items: lectura autenticada" on guia_remision_items
  for select to authenticated using (true);

-- Anular una guia (unica escritura directa permitida): Admin/Gerencia, y solo
-- de 'emitida' a 'anulada'. Crear pasa siempre por la RPC de abajo.
create policy "guias: anular admin/gerencia" on guias_remision
  for update to authenticated
  using (mi_rol() in ('admin', 'gerencia') and estado = 'emitida')
  with check (estado = 'anulada');

-- ---------------------------------------------------------------------
-- crear_guia_remision: RPC atomica. Toma el siguiente correlativo de la serie
-- (upsert con incremento, sin condicion de carrera) y crea la guia + items en
-- una sola transaccion.
--
-- p_cabecera: objeto con los campos de la guia (destinatario, transporte, etc.)
-- p_items: array de {"producto_id"?, "codigo"?, "descripcion", "cantidad", "unidad"?}
-- ---------------------------------------------------------------------
create or replace function crear_guia_remision(p_cabecera jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_serie text := coalesce(p_cabecera ->> 'serie', 'T001');
  v_correlativo integer;
  v_guia_id uuid;
  item record;
begin
  if mi_rol() not in ('admin', 'gerencia', 'ventas', 'almacen') then
    raise exception 'No tienes permiso para emitir guías de remisión';
  end if;

  if coalesce(btrim(p_cabecera ->> 'destinatario_nombre'), '') = '' then
    raise exception 'La guía necesita un destinatario';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La guía necesita al menos un producto';
  end if;

  -- Siguiente correlativo de la serie, atomico: el upsert bloquea la fila del
  -- contador, asi dos emisiones concurrentes nunca toman el mismo numero.
  insert into documento_correlativos (tipo, serie, ultimo)
  values ('guia_remision', v_serie, 1)
  on conflict (tipo, serie) do update set ultimo = documento_correlativos.ultimo + 1
  returning ultimo into v_correlativo;

  insert into guias_remision (
    serie, correlativo, fecha_emision, fecha_traslado, venta_id, cliente_id,
    destinatario_nombre, destinatario_doc, destinatario_direccion, motivo_traslado,
    punto_partida, punto_llegada, modalidad_transporte, transportista_nombre,
    transportista_doc, conductor_nombre, conductor_licencia, placa, peso_bruto,
    num_bultos, observaciones
  )
  values (
    v_serie, v_correlativo,
    coalesce((p_cabecera ->> 'fecha_emision')::date, current_date),
    (p_cabecera ->> 'fecha_traslado')::date,
    (p_cabecera ->> 'venta_id')::uuid,
    (p_cabecera ->> 'cliente_id')::uuid,
    p_cabecera ->> 'destinatario_nombre',
    p_cabecera ->> 'destinatario_doc',
    p_cabecera ->> 'destinatario_direccion',
    coalesce(p_cabecera ->> 'motivo_traslado', 'Venta'),
    p_cabecera ->> 'punto_partida',
    p_cabecera ->> 'punto_llegada',
    p_cabecera ->> 'modalidad_transporte',
    p_cabecera ->> 'transportista_nombre',
    p_cabecera ->> 'transportista_doc',
    p_cabecera ->> 'conductor_nombre',
    p_cabecera ->> 'conductor_licencia',
    p_cabecera ->> 'placa',
    (p_cabecera ->> 'peso_bruto')::numeric,
    (p_cabecera ->> 'num_bultos')::integer,
    p_cabecera ->> 'observaciones'
  )
  returning id into v_guia_id;

  for item in
    select (i ->> 'producto_id')::uuid as producto_id,
           i ->> 'codigo' as codigo,
           i ->> 'descripcion' as descripcion,
           (i ->> 'cantidad')::numeric as cantidad,
           i ->> 'unidad' as unidad
    from jsonb_array_elements(p_items) i
  loop
    insert into guia_remision_items (guia_id, producto_id, codigo, descripcion, cantidad, unidad)
    values (v_guia_id, item.producto_id, item.codigo, item.descripcion, item.cantidad, item.unidad);
  end loop;

  return jsonb_build_object('guia_id', v_guia_id, 'serie', v_serie, 'correlativo', v_correlativo);
end;
$$;
