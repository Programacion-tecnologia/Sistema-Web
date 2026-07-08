-- Rios System: chequeo de rol en las RPC sensibles (aprobar, verificar despacho)
-- Correr en el SQL Editor de Supabase, DESPUES de 0008/0009 (necesita mi_rol()).
--
-- Ambas funciones son security definer: bypasean cualquier RLS de tabla, asi
-- que la unica forma real de restringir quien las puede ejecutar es
-- chequear el rol explicitamente adentro de la funcion misma - exactamente
-- lo que los comentarios originales de 0005/0006 venian anunciando.

create or replace function aprobar_cotizacion(p_cotizacion_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado text;
  item record;
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden aprobar cotizaciones';
  end if;

  -- Bloquea la fila de la cotizacion: si dos personas la aprueban a la vez,
  -- la segunda espera a que termine la primera en vez de correr en paralelo.
  select estado into v_estado from cotizaciones where id = p_cotizacion_id for update;

  if v_estado is null then
    raise exception 'La cotizacion no existe';
  end if;
  if v_estado <> 'enviada' then
    raise exception 'Solo se pueden aprobar cotizaciones en estado enviada (actual: %)', v_estado;
  end if;

  -- "for update of p" bloquea cada producto involucrado. Bajo el nivel de
  -- aislamiento por defecto de Postgres (read committed), esto espera a
  -- cualquier otra aprobacion que este tocando el mismo producto y relee
  -- el stock ya actualizado antes de decidir - asi se evita la condicion
  -- de carrera de que dos cotizaciones reserven el mismo stock a la vez.
  for item in
    select ci.producto_id, ci.cantidad, p.nombre, p.stock_disponible
    from cotizacion_items ci
    join productos p on p.id = ci.producto_id
    where ci.cotizacion_id = p_cotizacion_id
    for update of p
  loop
    if item.stock_disponible < item.cantidad then
      raise exception 'Stock insuficiente para "%": disponible %, se necesitan %',
        item.nombre, item.stock_disponible, item.cantidad;
    end if;

    update productos
    set stock_reservado = stock_reservado + item.cantidad
    where id = item.producto_id;
  end loop;

  -- Aprobar y reservar son un solo paso atomico: nunca existe un instante
  -- donde la cotizacion este "aprobada" sin su stock ya reservado.
  update cotizaciones
  set estado = 'reservada', aprobada_por = auth.uid(), aprobada_at = now(), updated_at = now()
  where id = p_cotizacion_id;
end;
$$;

create or replace function verificar_despacho_cotizacion(
  p_cotizacion_id uuid,
  p_lineas jsonb -- array de {"producto_id": uuid, "cantidad_verificada": numero}
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado text;
  item record;
  v_cant_verificada numeric;
  v_detalle jsonb := '[]'::jsonb;
begin
  if mi_rol() not in ('almacen', 'admin') then
    raise exception 'Solo Almacen o Admin pueden verificar un despacho';
  end if;

  -- Bloquea la cotizacion primero, mismo orden que aprobar_cotizacion: evita
  -- que dos check-ins concurrentes sobre la misma cotizacion pisen el estado
  -- o dupliquen el descuento de stock.
  select estado into v_estado from cotizaciones where id = p_cotizacion_id for update;

  if v_estado is null then
    raise exception 'La cotizacion no existe';
  end if;
  if v_estado <> 'reservada' then
    raise exception 'Solo se pueden verificar cotizaciones en estado reservada (actual: %)', v_estado;
  end if;

  -- cotizacion_items es la fuente de verdad de que lineas existen y cuanto se
  -- pidio; p_lineas solo aporta lo que el usuario de almacen escaneo. Se
  -- ignora cualquier producto_id en p_lineas que no pertenezca a esta
  -- cotizacion, porque el loop nunca lo visita.
  for item in
    select ci.producto_id, ci.cantidad, p.nombre, p.stock_fisico, p.stock_reservado
    from cotizacion_items ci
    join productos p on p.id = ci.producto_id
    where ci.cotizacion_id = p_cotizacion_id
    for update of p
  loop
    -- Busca la cantidad_verificada de esta linea dentro del jsonb del
    -- cliente; si no vino (linea faltante u omitida), se trata como 0.
    select coalesce((l ->> 'cantidad_verificada')::numeric, 0)
      into v_cant_verificada
    from jsonb_array_elements(p_lineas) l
    where (l ->> 'producto_id')::uuid = item.producto_id
    limit 1;

    v_cant_verificada := coalesce(v_cant_verificada, 0);

    -- Defensa en profundidad: el frontend ya exige cantidad_escaneada > 0 por
    -- linea antes de habilitar "Finalizar despacho", pero la funcion no
    -- confia en eso.
    if v_cant_verificada = 0 then
      raise exception 'Falta verificar "%" (cantidad escaneada 0)', item.nombre;
    end if;

    -- Descuenta stock_fisico exactamente lo verificado/despachado. A
    -- diferencia de stock_reservado (mas abajo), aca NO se usa
    -- greatest(...,0): un stock_fisico negativo indica una inconsistencia de
    -- datos real (conteo fisico desincronizado) que conviene que falle
    -- ruidosamente, no que se enmascare en 0.
    if item.stock_fisico - v_cant_verificada < 0 then
      raise exception
        'Stock fisico insuficiente para "%": fisico %, se intenta descontar %',
        item.nombre, item.stock_fisico, v_cant_verificada;
    end if;

    update productos
    set stock_fisico = stock_fisico - v_cant_verificada
    where id = item.producto_id;

    -- Libera stock_reservado segun lo PEDIDO originalmente (item.cantidad),
    -- no segun lo verificado: estos dos numeros pueden diferir si hubo
    -- exceso. greatest(...,0) sigue el mismo patron de proteccion que
    -- expirar_cotizaciones_vencidas (0004_cotizaciones_vencimiento.sql).
    update productos
    set stock_reservado = greatest(stock_reservado - item.cantidad, 0)
    where id = item.producto_id;

    -- El exceso (cantidad_verificada > cantidad) es valido y esperado: no
    -- bloquea ni hace raise, solo se etiqueta en el detalle para que quede
    -- visible en la auditoria y en el PDF de verificacion.
    v_detalle := v_detalle || jsonb_build_object(
      'producto_id', item.producto_id,
      'nombre', item.nombre,
      'cantidad_pedida', item.cantidad,
      'cantidad_verificada', v_cant_verificada,
      'estado', case when v_cant_verificada > item.cantidad then 'exceso' else 'ok' end
    );
  end loop;

  -- Cierra la cotizacion como lista para despacho.
  update cotizaciones
  set estado = 'lista_despacho',
      verificada_por = auth.uid(),
      verificada_at = now(),
      updated_at = now()
  where id = p_cotizacion_id;

  -- Primer uso de la tabla auditoria en el sistema: deja registro linea por
  -- linea de lo que efectivamente se despacho, no de lo que el frontend
  -- "creia" tener en su estado local. Se usa accion = 'actualizar' porque el
  -- check de la tabla no contempla un valor mas especifico; la semantica
  -- real vive en el detalle jsonb.
  insert into auditoria (tabla, registro_id, accion, usuario_id, detalle)
  values ('cotizaciones', p_cotizacion_id, 'actualizar', auth.uid(), v_detalle);

  return v_detalle;
end;
$$;
