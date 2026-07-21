-- Rios System: importacion de compras desde el Excel del proveedor
-- Correr en el SQL Editor de Supabase, DESPUES de 0013.
--
-- Tres cambios que pide el flujo "Compras > Importar Excel":
--
-- 1) productos.precio_mayorista: el negocio maneja dos precios de venta
--    (mayorista y publico) y el Excel del proveedor trae ambos ("X MAYOR" /
--    "PUBLICO"). Hasta ahora el catalogo solo tenia precio_venta (= publico);
--    se agrega el mayorista como columna aparte. No es dato sensible como
--    precio_compra: es un precio de venta, visible para todos los roles.
--
-- 2) Editar/quitar lineas de una compra pendiente: el Excel del proveedor
--    NO trae el costo real (llega despues, con la factura), asi que una
--    compra importada nace con costo 0 y alguien tiene que poder corregirlo
--    antes de recibirla. Hasta ahora compra_items solo tenia policies de
--    select/insert - update y delete no existian y fallaban en silencio
--    (0 filas afectadas).
--
-- 3) recibir_compra(): un costo_unitario en 0 significa "costo aun no
--    cargado", no "me lo regalaron" - al recibir, ese caso deja el
--    precio_compra que el producto ya tenia en vez de pisarlo con 0.

-- ---------------------------------------------------------------------
-- 1) precio_mayorista
-- ---------------------------------------------------------------------
alter table productos add column precio_mayorista numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------
-- 2) compra_items: editar/quitar lineas mientras la compra siga pendiente
--    (mismos roles que pueden crear la compra). El "exists" contra compras
--    congela la edicion apenas la compra pasa a recibida/anulada.
-- ---------------------------------------------------------------------
create policy "compra_items: editar admin/gerencia (compra pendiente)" on compra_items
  for update to authenticated
  using (
    mi_rol() in ('admin', 'gerencia')
    and exists (select 1 from compras c where c.id = compra_id and c.estado = 'pendiente')
  )
  with check (
    mi_rol() in ('admin', 'gerencia')
    and exists (select 1 from compras c where c.id = compra_id and c.estado = 'pendiente')
  );

create policy "compra_items: eliminar admin/gerencia (compra pendiente)" on compra_items
  for delete to authenticated
  using (
    mi_rol() in ('admin', 'gerencia')
    and exists (select 1 from compras c where c.id = compra_id and c.estado = 'pendiente')
  );

-- ---------------------------------------------------------------------
-- 3) recibir_compra: costo 0 no pisa precio_compra
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
    -- costo_unitario = 0 se interpreta como "costo no cargado" (tipico de
    -- una compra importada del Excel del proveedor, que no trae costos):
    -- suma el stock igual pero conserva el precio_compra anterior.
    update productos
    set stock_fisico = stock_fisico + item.cantidad,
        precio_compra = case when item.costo_unitario > 0 then item.costo_unitario else precio_compra end
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
