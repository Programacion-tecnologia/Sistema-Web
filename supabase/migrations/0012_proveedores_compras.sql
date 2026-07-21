-- Rios System: modulo Proveedores + Compras
-- Correr en el SQL Editor de Supabase, DESPUES de 0009 (necesita mi_rol()).
--
-- proveedores ya existia desde 0001_init.sql pero nunca recibio RLS real:
-- seguia con la policy permisiva original ("acceso autenticado" = using
-- (true) with check (true), cualquier autenticado podia crear/editar/borrar
-- proveedores). Esta migracion la reemplaza por el mismo patron por rol que
-- categorias/productos (0009), y agrega compras/compra_items nuevas
-- siguiendo el patron de cotizaciones/cotizacion_items: cabecera + lineas,
-- con una RPC atomica (recibir_compra) que mueve stock_fisico, actualiza
-- precio_compra y deja auditoria - mismo patron que aprobar_cotizacion()/
-- verificar_despacho_cotizacion() (0005/0006/0010).
--
-- Roles (decision de negocio confirmada): crear/editar proveedores y crear
-- ordenes de compra -> Admin/Gerencia. Recibir una compra (mueve stock) ->
-- Admin/Gerencia/Almacen (Almacen es quien fisicamente recibe la
-- mercaderia, igual que en Scanner verifica los despachos).

-- ---------------------------------------------------------------------
-- proveedores: columnas nuevas + RLS real
-- ---------------------------------------------------------------------
alter table proveedores add column ruc text;
alter table proveedores add column contacto text;
alter table proveedores add column notas text;

drop policy "proveedores: acceso autenticado" on proveedores;

create policy "proveedores: lectura autenticada" on proveedores
  for select to authenticated using (true);
create policy "proveedores: insertar admin/gerencia" on proveedores
  for insert to authenticated with check (mi_rol() in ('admin', 'gerencia'));
create policy "proveedores: actualizar admin/gerencia" on proveedores
  for update to authenticated using (mi_rol() in ('admin', 'gerencia'));
create policy "proveedores: eliminar admin/gerencia" on proveedores
  for delete to authenticated using (mi_rol() in ('admin', 'gerencia'));

-- ---------------------------------------------------------------------
-- compras: cabecera de orden de compra a un proveedor. Sin columna de
-- total: se calcula en el frontend sumando las lineas, igual que
-- cotizaciones.
-- ---------------------------------------------------------------------
create table compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores (id),
  creada_por uuid references profiles (id) default auth.uid(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'recibida', 'anulada')),
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  recibida_por uuid references profiles (id),
  recibida_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- compra_items: lineas de la compra. producto_id SIN "on delete cascade":
-- mismo motivo que cotizacion_items (0001) - un producto con historial de
-- compra no se puede borrar (falla con FK violation, codigo 23503), se
-- marca "inactivo" en su lugar.
create table compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras (id) on delete cascade,
  producto_id uuid not null references productos (id),
  cantidad integer not null check (cantidad > 0),
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0)
);

alter table compras enable row level security;
alter table compra_items enable row level security;

-- Lectura abierta a cualquier autenticado (igual que cotizaciones). El
-- costo de compra ya se trata como dato sensible en productos.precio_compra
-- ocultando la columna en el frontend segun rol (RLS no puede filtrar por
-- columna, es por fila completa) - mismo criterio se aplica aca en la UI de
-- Compras.
create policy "compras: lectura autenticada" on compras
  for select to authenticated using (true);
create policy "compra_items: lectura autenticada" on compra_items
  for select to authenticated using (true);

create policy "compras: insertar admin/gerencia" on compras
  for insert to authenticated with check (mi_rol() in ('admin', 'gerencia'));
create policy "compra_items: insertar admin/gerencia" on compra_items
  for insert to authenticated with check (mi_rol() in ('admin', 'gerencia'));

-- Unica transicion de estado permitida por UPDATE directo: anular una
-- compra que todavia no se recibio ("using" exige que la fila ya este en
-- 'pendiente' antes del update, "with check" exige que el nuevo valor sea
-- 'anulada' - una compra 'recibida' no matchea el using y el update no le
-- afecta ninguna fila). Pasar a "recibida" (que mueve stock) SOLO se puede
-- via la RPC recibir_compra() de abajo - no hay policy que permita ese
-- valor por UPDATE directo, igual que cotizaciones no permite pasar a
-- "reservada" por UPDATE normal.
create policy "compras: anular admin/gerencia" on compras
  for update to authenticated
  using (mi_rol() in ('admin', 'gerencia') and estado = 'pendiente')
  with check (estado = 'anulada');

-- ---------------------------------------------------------------------
-- recibir_compra: RPC atomica. Registra la entrada de stock_fisico de cada
-- linea, actualiza precio_compra al costo de esta compra, deja auditoria y
-- cierra la compra - todo o nada, mismo patron que aprobar_cotizacion()/
-- verificar_despacho_cotizacion() (0005/0006/0010).
-- ---------------------------------------------------------------------
create or replace function recibir_compra(p_compra_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado text;
  item record;
  v_detalle jsonb := '[]'::jsonb;
begin
  if mi_rol() not in ('admin', 'gerencia', 'almacen') then
    raise exception 'Solo Admin, Gerencia o Almacen pueden recibir una compra';
  end if;

  -- Bloquea la cabecera: si dos personas confirman la recepcion a la vez (o
  -- la misma persona hace doble click), la segunda espera a que termine la
  -- primera y luego encuentra estado <> 'pendiente' y falla limpio, sin
  -- duplicar stock.
  select estado into v_estado from compras where id = p_compra_id for update;

  if v_estado is null then
    raise exception 'La compra no existe';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se pueden recibir compras en estado pendiente (actual: %)', v_estado;
  end if;

  -- "for update of p" bloquea cada producto tocado, igual que
  -- aprobar_cotizacion(): evita que dos compras concurrentes sobre el mismo
  -- producto se pisen el stock.
  for item in
    select ci.producto_id, ci.cantidad, ci.costo_unitario, p.nombre
    from compra_items ci
    join productos p on p.id = ci.producto_id
    where ci.compra_id = p_compra_id
    for update of p
  loop
    update productos
    set stock_fisico = stock_fisico + item.cantidad,
        precio_compra = item.costo_unitario
    where id = item.producto_id;

    v_detalle := v_detalle || jsonb_build_object(
      'producto_id', item.producto_id,
      'nombre', item.nombre,
      'cantidad', item.cantidad,
      'costo_unitario', item.costo_unitario
    );
  end loop;

  update compras
  set estado = 'recibida', recibida_por = auth.uid(), recibida_at = now(), updated_at = now()
  where id = p_compra_id;

  -- Mismo patron que verificar_despacho_cotizacion(): deja el detalle
  -- linea por linea en auditoria, dentro de la misma transaccion (si algo
  -- fallo antes, este insert tampoco se ejecuta).
  insert into auditoria (tabla, registro_id, accion, usuario_id, detalle)
  values ('compras', p_compra_id, 'actualizar', auth.uid(), v_detalle);

  return v_detalle;
end;
$$;
