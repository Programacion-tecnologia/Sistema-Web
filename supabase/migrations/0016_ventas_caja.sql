-- Rios System: modulo Ventas internas + Caja (fase 3 del roadmap)
-- Correr en el SQL Editor de Supabase, DESPUES de 0015 (la venta deja
-- movimiento en movimientos_inventario) y necesita mi_rol() de 0009.
--
-- Alcance (decisiones de negocio confirmadas 2026-07-20):
--   - Caja GLOBAL: una sola sesion de caja abierta a la vez para toda la
--     tienda; cualquier vendedor registra ventas contra esa caja.
--   - Pago MIXTO: una venta puede combinar metodos (efectivo + tarjeta, etc).
--   - Anulacion/devolucion incluida: anular_venta reversa el stock.
--
-- Ventas es una operacion INTERNA sin valor tributario (la empresa sigue
-- emitiendo boletas/facturas por separado con MiFact mientras tanto). Por eso
-- la tabla ventas NO tiene campos de comprobante: el comprobante tributario se
-- modelara como entidad SEPARADA cuando se integre SUNAT al final del roadmap.
-- Asi esa integracion se "enchufa" despues sin rehacer Ventas.
--
-- La venta descarga stock_fisico y deja un movimiento 'salida' en el kardex:
-- esto es lo que completa el ledger de la fase 2 (Inventario). No pasa por
-- stock_reservado (eso es solo para cotizaciones): una venta de mostrador
-- descuenta directo, validando contra stock_disponible para no vender unidades
-- ya reservadas por una cotizacion.

-- ---------------------------------------------------------------------
-- caja_sesiones: apertura/cierre diario de caja con arqueo.
-- ---------------------------------------------------------------------
create table caja_sesiones (
  id uuid primary key default gen_random_uuid(),
  abierta_por uuid references profiles (id) default auth.uid(),
  monto_inicial numeric(12, 2) not null default 0 check (monto_inicial >= 0),
  abierta_at timestamptz not null default now(),
  cerrada_por uuid references profiles (id),
  monto_final_contado numeric(12, 2),
  monto_esperado numeric(12, 2),
  diferencia numeric(12, 2),
  cerrada_at timestamptz,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  notas text
);

-- Garantiza a nivel de base que haya como maximo UNA caja abierta a la vez
-- (todas las filas abiertas comparten estado='abierta', el unico indice sobre
-- esa condicion no deja que exista una segunda). Es el respaldo real de la
-- decision "caja global"; abrir_caja tambien lo chequea para dar un error
-- claro, pero este indice es la garantia dura contra una carrera.
create unique index caja_sesiones_una_abierta on caja_sesiones (estado) where estado = 'abierta';

-- ---------------------------------------------------------------------
-- ventas: cabecera de una venta interna. Sin total (se suma de venta_items,
-- igual que cotizaciones/compras) y SIN campos tributarios (ver nota arriba).
-- cliente_id nullable = venta a "Publico general" (mostrador sin cliente).
-- ---------------------------------------------------------------------
create table ventas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid references profiles (id) default auth.uid(),
  cliente_id uuid references clientes (id),
  caja_sesion_id uuid not null references caja_sesiones (id),
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  estado text not null default 'completada' check (estado in ('completada', 'anulada')),
  anulada_por uuid references profiles (id),
  anulada_at timestamptz,
  motivo_anulacion text,
  created_at timestamptz not null default now()
);

-- venta_items: producto_id SIN "on delete cascade" (mismo motivo que
-- cotizacion_items/compra_items: un producto con historial de venta no se
-- borra). precio_unitario es un snapshot del precio al momento de la venta
-- (puede diferir del precio_venta actual del producto, o ser mayorista/con
-- descuento) - por eso se guarda, no se lee del producto despues.
create table venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas (id) on delete cascade,
  producto_id uuid not null references productos (id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0)
);

-- venta_pagos: una fila por metodo de pago usado en la venta. Modelado como
-- tabla aparte (no un campo metodo_pago en ventas) para soportar pago mixto:
-- una venta puede tener varias filas (efectivo + tarjeta). registrar_venta
-- valida que la suma de pagos coincida con el total de items.
create table venta_pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas (id) on delete cascade,
  metodo text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'yape_plin')),
  monto numeric(12, 2) not null check (monto > 0)
);

alter table caja_sesiones enable row level security;
alter table ventas enable row level security;
alter table venta_items enable row level security;
alter table venta_pagos enable row level security;

-- Lectura abierta a cualquier autenticado (igual que compras/cotizaciones).
-- No hay policies de insert/update/delete: toda escritura pasa por las RPCs
-- security definer de abajo (que corren por fuera de RLS), asi que la
-- consistencia stock/venta/caja/kardex nunca depende de un insert suelto.
create policy "caja_sesiones: lectura autenticada" on caja_sesiones
  for select to authenticated using (true);
create policy "ventas: lectura autenticada" on ventas
  for select to authenticated using (true);
create policy "venta_items: lectura autenticada" on venta_items
  for select to authenticated using (true);
create policy "venta_pagos: lectura autenticada" on venta_pagos
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- abrir_caja: abre la caja global del dia. Falla si ya hay una abierta.
-- ---------------------------------------------------------------------
create or replace function abrir_caja(p_monto_inicial numeric)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_sesion caja_sesiones;
begin
  if mi_rol() not in ('admin', 'gerencia', 'ventas') then
    raise exception 'Solo Admin, Gerencia o Ventas pueden abrir la caja';
  end if;

  if exists (select 1 from caja_sesiones where estado = 'abierta') then
    raise exception 'Ya hay una caja abierta. Ciérrala antes de abrir otra.';
  end if;

  insert into caja_sesiones (monto_inicial)
  values (coalesce(p_monto_inicial, 0))
  returning * into v_sesion;

  return to_jsonb(v_sesion);
end;
$$;

-- ---------------------------------------------------------------------
-- cerrar_caja: cierra la sesion y calcula el arqueo. El esperado en efectivo
-- es el monto inicial + la suma de los pagos en efectivo de las ventas
-- completadas de esta sesion; la diferencia (contado - esperado) es el
-- sobrante/faltante de caja. Tarjeta/transferencia/yape no entran al arqueo
-- de efectivo (no son plata en el cajon).
-- ---------------------------------------------------------------------
create or replace function cerrar_caja(
  p_sesion_id uuid,
  p_monto_contado numeric,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado text;
  v_inicial numeric;
  v_efectivo numeric;
  v_esperado numeric;
  v_sesion caja_sesiones;
begin
  if mi_rol() not in ('admin', 'gerencia', 'ventas') then
    raise exception 'Solo Admin, Gerencia o Ventas pueden cerrar la caja';
  end if;

  select estado, monto_inicial into v_estado, v_inicial
  from caja_sesiones where id = p_sesion_id for update;

  if v_estado is null then
    raise exception 'La sesión de caja no existe';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'La caja ya está cerrada';
  end if;

  select coalesce(sum(vp.monto), 0) into v_efectivo
  from ventas v
  join venta_pagos vp on vp.venta_id = v.id
  where v.caja_sesion_id = p_sesion_id
    and v.estado = 'completada'
    and vp.metodo = 'efectivo';

  v_esperado := v_inicial + v_efectivo;

  update caja_sesiones
  set estado = 'cerrada',
      cerrada_por = auth.uid(),
      cerrada_at = now(),
      monto_final_contado = p_monto_contado,
      monto_esperado = v_esperado,
      diferencia = p_monto_contado - v_esperado,
      notas = p_notas
  where id = p_sesion_id
  returning * into v_sesion;

  return to_jsonb(v_sesion);
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_venta: RPC atomica. Crea la venta + items + pagos, valida y
-- descuenta stock, y deja el movimiento 'salida' en el kardex - todo o nada.
--
-- p_items: array de {"producto_id": uuid, "cantidad": int, "precio_unitario": num}
-- p_pagos: array de {"metodo": text, "monto": num}
-- ---------------------------------------------------------------------
create or replace function registrar_venta(
  p_cliente_id uuid,
  p_moneda text,
  p_items jsonb,
  p_pagos jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_caja uuid;
  v_venta_id uuid;
  v_total_items numeric;
  v_total_pagos numeric;
  item record;
  pago record;
  v_disponible integer;
  v_nombre text;
  v_resultante integer;
begin
  if mi_rol() not in ('admin', 'gerencia', 'ventas') then
    raise exception 'Solo Admin, Gerencia o Ventas pueden registrar ventas';
  end if;

  -- La venta siempre ocurre dentro de la caja global abierta.
  select id into v_caja from caja_sesiones where estado = 'abierta' limit 1;
  if v_caja is null then
    raise exception 'No hay una caja abierta. Abre la caja antes de vender.';
  end if;

  select coalesce(sum((i ->> 'cantidad')::int * (i ->> 'precio_unitario')::numeric), 0)
    into v_total_items
  from jsonb_array_elements(p_items) i;

  select coalesce(sum((pg ->> 'monto')::numeric), 0)
    into v_total_pagos
  from jsonb_array_elements(p_pagos) pg;

  if v_total_items <= 0 then
    raise exception 'La venta no tiene productos';
  end if;
  -- El pago debe cubrir exactamente el total (no se maneja vuelto como pago:
  -- el vuelto lo calcula el frontend sobre el efectivo entregado).
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'El total de pagos (%) no coincide con el total de la venta (%)',
      round(v_total_pagos, 2), round(v_total_items, 2);
  end if;

  insert into ventas (cliente_id, caja_sesion_id, moneda)
  values (p_cliente_id, v_caja, coalesce(p_moneda, 'PEN'))
  returning id into v_venta_id;

  -- Cada producto se bloquea (for update) y se revalida su stock recien aca,
  -- dentro de la transaccion: mismo patron anti-carrera que aprobar_cotizacion
  -- y recibir_compra. Se valida contra stock_disponible (fisico - reservado)
  -- para no vender unidades ya reservadas por una cotizacion; se descuenta de
  -- stock_fisico.
  for item in
    select (i ->> 'producto_id')::uuid as producto_id,
           (i ->> 'cantidad')::int as cantidad,
           (i ->> 'precio_unitario')::numeric as precio_unitario
    from jsonb_array_elements(p_items) i
  loop
    select nombre, stock_disponible into v_nombre, v_disponible
    from productos where id = item.producto_id for update;

    if v_nombre is null then
      raise exception 'Un producto de la venta no existe';
    end if;
    if v_disponible < item.cantidad then
      raise exception 'Stock insuficiente para "%": disponible %, se necesitan %',
        v_nombre, v_disponible, item.cantidad;
    end if;

    update productos
    set stock_fisico = stock_fisico - item.cantidad
    where id = item.producto_id
    returning stock_fisico into v_resultante;

    insert into venta_items (venta_id, producto_id, cantidad, precio_unitario)
    values (v_venta_id, item.producto_id, item.cantidad, item.precio_unitario);

    insert into movimientos_inventario
      (producto_id, tipo, cantidad, stock_resultante, motivo, referencia_tabla, referencia_id)
    values
      (item.producto_id, 'salida', -item.cantidad, v_resultante, 'Venta', 'ventas', v_venta_id);
  end loop;

  for pago in
    select (pg ->> 'metodo') as metodo, (pg ->> 'monto')::numeric as monto
    from jsonb_array_elements(p_pagos) pg
  loop
    insert into venta_pagos (venta_id, metodo, monto)
    values (v_venta_id, pago.metodo, pago.monto);
  end loop;

  insert into auditoria (tabla, registro_id, accion, usuario_id, detalle)
  values ('ventas', v_venta_id, 'crear', auth.uid(),
    jsonb_build_object('total', round(v_total_items, 2), 'caja_sesion_id', v_caja));

  return jsonb_build_object('venta_id', v_venta_id, 'total', round(v_total_items, 2));
end;
$$;

-- ---------------------------------------------------------------------
-- anular_venta: reversa una venta completada. Devuelve el stock_fisico de
-- cada linea (movimiento 'entrada' = devolucion en el kardex) y marca la
-- venta como anulada. Solo Admin/Gerencia (operacion sensible). Nota: si la
-- caja de esa venta ya se cerro, la anulacion igual procede pero NO reajusta
-- el arqueo historico de esa sesion ya cerrada (queda como estaba).
-- ---------------------------------------------------------------------
create or replace function anular_venta(p_venta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado text;
  item record;
  v_resultante integer;
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden anular ventas';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La anulación requiere un motivo';
  end if;

  select estado into v_estado from ventas where id = p_venta_id for update;

  if v_estado is null then
    raise exception 'La venta no existe';
  end if;
  if v_estado <> 'completada' then
    raise exception 'Solo se pueden anular ventas completadas (actual: %)', v_estado;
  end if;

  for item in
    select vi.producto_id, vi.cantidad, p.nombre
    from venta_items vi
    join productos p on p.id = vi.producto_id
    where vi.venta_id = p_venta_id
    for update of p
  loop
    update productos
    set stock_fisico = stock_fisico + item.cantidad
    where id = item.producto_id
    returning stock_fisico into v_resultante;

    insert into movimientos_inventario
      (producto_id, tipo, cantidad, stock_resultante, motivo, referencia_tabla, referencia_id)
    values
      (item.producto_id, 'entrada', item.cantidad, v_resultante, 'Anulación de venta', 'ventas', p_venta_id);
  end loop;

  update ventas
  set estado = 'anulada', anulada_por = auth.uid(), anulada_at = now(), motivo_anulacion = btrim(p_motivo)
  where id = p_venta_id;

  insert into auditoria (tabla, registro_id, accion, usuario_id, detalle)
  values ('ventas', p_venta_id, 'actualizar', auth.uid(),
    jsonb_build_object('accion', 'anular_venta', 'motivo', btrim(p_motivo)));

  return jsonb_build_object('venta_id', p_venta_id, 'estado', 'anulada');
end;
$$;
