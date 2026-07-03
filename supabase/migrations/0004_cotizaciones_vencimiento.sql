-- Rios System: vencimiento automatico de cotizaciones sin aprobar (48h)
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).

-- vence_en: siempre 48h despues de la creacion, calculado solo.
-- No puede ser columna generada: "timestamptz + interval" es STABLE, no
-- IMMUTABLE, en Postgres (por la aritmetica de zona horaria en general),
-- asi que se calcula con un trigger before insert en su lugar. Mismo
-- patron que set_updated_at() en 0001_init.sql.
alter table cotizaciones add column vence_en timestamptz;

create function set_vence_en()
returns trigger
language plpgsql
as $$
begin
  new.vence_en := new.created_at + interval '48 hours';
  return new;
end;
$$;

create trigger cotizaciones_set_vence_en
  before insert on cotizaciones
  for each row execute procedure set_vence_en();

create index cotizaciones_vence_en_idx on cotizaciones (vence_en)
  where estado in ('borrador', 'enviada');

create extension if not exists pg_cron with schema extensions;

create or replace function expirar_cotizaciones_vencidas()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- 1) Libera el stock reservado de las cotizaciones que estan por vencer,
  --    ANTES de tocar su estado (si no, esta consulta ya no las encontraria).
  update productos p
  set stock_reservado = greatest(stock_reservado - ci.cantidad, 0)
  from cotizacion_items ci
  join cotizaciones c on c.id = ci.cotizacion_id
  where ci.producto_id = p.id
    and c.estado in ('borrador', 'enviada')
    and c.vence_en < now();

  -- 2) Marca las cotizaciones vencidas como canceladas.
  update cotizaciones
  set estado = 'cancelada', updated_at = now()
  where estado in ('borrador', 'enviada')
    and vence_en < now();
end;
$$;

-- Corre cada 15 minutos. Se puede ejecutar manualmente para probar con:
-- select expirar_cotizaciones_vencidas();
select cron.schedule(
  'expirar-cotizaciones-vencidas',
  '*/15 * * * *',
  $$ select public.expirar_cotizaciones_vencidas(); $$
);
