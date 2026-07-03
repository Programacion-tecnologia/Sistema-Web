-- Rios System: moneda en cotizaciones + aprobacion atomica con reserva de stock
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).

alter table cotizaciones add column moneda text not null default 'PEN' check (moneda in ('PEN', 'USD'));

create or replace function aprobar_cotizacion(p_cotizacion_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado text;
  item record;
begin
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
