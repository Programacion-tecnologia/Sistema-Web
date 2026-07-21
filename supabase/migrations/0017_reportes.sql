-- Rios System: modulo Reportes (fase 4 del roadmap) - inteligencia de negocio
-- Correr en el SQL Editor de Supabase, DESPUES de 0016 (usa ventas/venta_items/
-- venta_pagos) y necesita mi_rol() de 0009.
--
-- Todo son RPCs de agregacion security definer restringidas a Admin/Gerencia:
-- usan precio_compra (dato sensible) para calcular margenes y valorizacion, asi
-- que el calculo se hace en la base y al navegador solo baja el agregado, nunca
-- el costo fila por fila de un rol no autorizado.
--
-- Diferenciador vs MiFact (que casi no tiene BI): margen bruto real, top
-- productos por margen, valorizacion de inventario, stock inmovilizado y
-- ventas por modelo de moto (vertical del rubro repuestos).
--
-- Decisiones de calculo:
--   - Solo ventas 'completada' y moneda 'PEN' (las USD son marginales; mezclar
--     monedas en un total sin tipo de cambio seria incorrecto). Montos en soles.
--   - Los dias se agrupan en hora de Lima (America/Lima), no UTC, para que "hoy"
--     sea el dia real del negocio.
--   - El costo para el margen es el precio_compra ACTUAL del producto (no se
--     snapshotea el costo al vender). Es una aproximacion - la misma que hace
--     MiFact al mostrar el precio de compra en el POS. Suficiente para gestion.

-- ---------------------------------------------------------------------
-- reporte_ventas: resumen + series de ventas y margen en un rango de fechas.
-- ---------------------------------------------------------------------
create or replace function reporte_ventas(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden ver reportes';
  end if;

  with ventas_periodo as (
    select v.id, v.vendedor_id,
           (v.created_at at time zone 'America/Lima')::date as dia
    from ventas v
    where v.estado = 'completada' and v.moneda = 'PEN'
      and (v.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  totales_por_venta as (
    select vp.id as venta_id, vp.dia, vp.vendedor_id,
           sum(vi.cantidad * vi.precio_unitario) as total,
           sum(vi.cantidad * (vi.precio_unitario - p.precio_compra)) as margen
    from ventas_periodo vp
    join venta_items vi on vi.venta_id = vp.id
    join productos p on p.id = vi.producto_id
    group by vp.id, vp.dia, vp.vendedor_id
  )
  select jsonb_build_object(
    'resumen', (
      select jsonb_build_object(
        'total', coalesce(sum(total), 0),
        'margen', coalesce(sum(margen), 0),
        'num_ventas', count(*),
        'ticket_promedio', case when count(*) > 0 then round(sum(total) / count(*), 2) else 0 end
      )
      from totales_por_venta
    ),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', total) order by dia), '[]'::jsonb)
      from (select dia, sum(total) as total from totales_por_venta group by dia) d
    ),
    'por_vendedor', (
      select coalesce(
        jsonb_agg(jsonb_build_object('vendedor', nombre, 'total', total, 'num', num) order by total desc),
        '[]'::jsonb
      )
      from (
        select coalesce(pr.nombre, '—') as nombre, sum(t.total) as total, count(*) as num
        from totales_por_venta t
        left join profiles pr on pr.id = t.vendedor_id
        group by pr.nombre
      ) vv
    ),
    'por_metodo', (
      select coalesce(
        jsonb_agg(jsonb_build_object('metodo', metodo, 'total', total) order by total desc),
        '[]'::jsonb
      )
      from (
        select pg.metodo, sum(pg.monto) as total
        from ventas_periodo vp
        join venta_pagos pg on pg.venta_id = vp.id
        group by pg.metodo
      ) m
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- reporte_top_productos: productos vendidos en el rango con unidades, ingreso
-- y margen. El frontend re-ordena por la métrica elegida y muestra el top.
-- ---------------------------------------------------------------------
create or replace function reporte_top_productos(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden ver reportes';
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'producto_id', producto_id, 'nombre', nombre,
          'unidades', unidades, 'ingreso', ingreso, 'margen', margen
        ) order by ingreso desc
      ),
      '[]'::jsonb
    )
    from (
      select p.id as producto_id, p.nombre,
             sum(vi.cantidad) as unidades,
             sum(vi.cantidad * vi.precio_unitario) as ingreso,
             sum(vi.cantidad * (vi.precio_unitario - p.precio_compra)) as margen
      from ventas v
      join venta_items vi on vi.venta_id = v.id
      join productos p on p.id = vi.producto_id
      where v.estado = 'completada' and v.moneda = 'PEN'
        and (v.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
      group by p.id, p.nombre
      order by ingreso desc
      limit 500
    ) sub
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reporte_valorizacion_inventario: capital inmovilizado en stock (stock ×
-- costo), total y por marca. Foto del momento (no depende de fechas).
-- ---------------------------------------------------------------------
create or replace function reporte_valorizacion_inventario()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden ver reportes';
  end if;

  return jsonb_build_object(
    'total', (
      select coalesce(sum(stock_fisico * precio_compra), 0)
      from productos where stock_fisico > 0
    ),
    'por_marca', (
      select coalesce(
        jsonb_agg(jsonb_build_object('marca', marca, 'valor', valor, 'productos', num) order by valor desc),
        '[]'::jsonb
      )
      from (
        select coalesce(c.nombre, 'Sin marca') as marca,
               sum(p.stock_fisico * p.precio_compra) as valor,
               count(*) as num
        from productos p
        left join categorias c on c.id = p.categoria_id
        where p.stock_fisico > 0
        group by c.nombre
      ) v
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reporte_stock_inmovilizado: productos CON stock pero SIN venta en los
-- últimos p_dias días (o que nunca se vendieron). Plata dormida en el almacén.
-- ---------------------------------------------------------------------
create or replace function reporte_stock_inmovilizado(p_dias integer)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden ver reportes';
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'producto_id', p.id, 'nombre', p.nombre, 'stock', p.stock_fisico,
          'costo_inmovilizado', round(p.stock_fisico * p.precio_compra, 2),
          'ultima_venta', uv.ultima
        ) order by p.stock_fisico * p.precio_compra desc
      ),
      '[]'::jsonb
    )
    from productos p
    left join (
      select vi.producto_id, max(v.created_at) as ultima
      from venta_items vi
      join ventas v on v.id = vi.venta_id
      where v.estado = 'completada'
      group by vi.producto_id
    ) uv on uv.producto_id = p.id
    where p.stock_fisico > 0
      and (uv.ultima is null or uv.ultima < now() - make_interval(days => p_dias))
    limit 300
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reporte_ventas_por_modelo: ventas agrupadas por MODELO de moto compatible.
-- El campo productos.modelo guarda varias motos separadas por " / " (ej.
-- "CRF250R / CRF450R"); se separan esos tokens y una venta de ese producto
-- suma a cada modelo compatible. Vertical del rubro: guía de qué comprar.
-- ---------------------------------------------------------------------
create or replace function reporte_ventas_por_modelo(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden ver reportes';
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('modelo', modelo, 'unidades', unidades, 'ingreso', ingreso, 'margen', margen)
        order by ingreso desc
      ),
      '[]'::jsonb
    )
    from (
      select btrim(token) as modelo,
             sum(vi.cantidad) as unidades,
             sum(vi.cantidad * vi.precio_unitario) as ingreso,
             sum(vi.cantidad * (vi.precio_unitario - p.precio_compra)) as margen
      from ventas v
      join venta_items vi on vi.venta_id = v.id
      join productos p on p.id = vi.producto_id
      cross join lateral unnest(string_to_array(coalesce(p.modelo, ''), ' / ')) as token
      where v.estado = 'completada' and v.moneda = 'PEN'
        and (v.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
        and btrim(token) <> ''
      group by btrim(token)
      order by ingreso desc
      limit 100
    ) sub
  );
end;
$$;
