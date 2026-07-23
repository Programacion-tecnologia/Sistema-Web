-- Rios System: RPC ventas_por_mes para el grafico de barras del Dashboard.
-- Correr en el SQL Editor de Supabase, DESPUES de 0016 (usa ventas/venta_items).
--
-- Devuelve los ULTIMOS 12 MESES (incluido el mes actual), cada uno con el total
-- vendido. Misma convencion que reporte_ventas (0017): solo ventas 'completada'
-- y moneda 'PEN', agrupadas en hora de Lima. Los meses sin ventas salen en 0
-- (se rellenan con generate_series) para que el grafico tenga siempre 12 barras.
--
-- Es solo ingreso agregado (NO usa precio_compra), asi que queda disponible a
-- cualquier autenticado, igual que el resumen comercial que el Dashboard ya
-- muestra a todos los roles. security definer => corre sin la RLS del que llama.

create or replace function ventas_por_mes()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
  v_mes_actual timestamp := date_trunc('month', now() at time zone 'America/Lima');
begin
  with meses as (
    select (v_mes_actual - (interval '1 month' * g))::date as mes
    from generate_series(0, 11) as g
  ),
  ventas_mes as (
    select date_trunc('month', (v.created_at at time zone 'America/Lima'))::date as mes,
           sum(vi.cantidad * vi.precio_unitario) as total
    from ventas v
    join venta_items vi on vi.venta_id = v.id
    where v.estado = 'completada'
      and v.moneda = 'PEN'
      and (v.created_at at time zone 'America/Lima') >= (v_mes_actual - interval '11 months')
    group by 1
  )
  select jsonb_agg(
           jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'total', coalesce(vm.total, 0))
           order by m.mes
         )
    into v_result
    from meses m
    left join ventas_mes vm on vm.mes = m.mes;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function ventas_por_mes() to authenticated;
