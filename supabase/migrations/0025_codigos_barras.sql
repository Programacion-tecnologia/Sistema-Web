-- Rios System: generación/asignación de códigos de barras (EAN-13) a productos.
-- Correr en el SQL Editor de Supabase. Necesita mi_rol() de 0009 y la tabla
-- productos (codigo_barras ya es UNIQUE desde 0001).
--
-- Por qué RPCs security definer: actualizar productos por RLS es solo
-- admin/gerencia (0009), pero el módulo Scanner lo usa Almacén y necesita poder
-- asignar/generar el código de barras de un producto sobre la marcha. Estas
-- funciones corren con permisos del owner (saltan RLS) pero validan el rol
-- adentro, así Almacén puede codificar sin abrir la edición general de productos.

-- ---------------------------------------------------------------------
-- generar_ean13(): un EAN-13 aleatorio válido (prefijo 200 = uso interno,
-- rango GS1 restringido, no colisiona con códigos comerciales) + dígito
-- verificador estándar. NO garantiza unicidad por sí sola: quien la usa debe
-- reintentar si ya existe (lo hacen las funciones de abajo).
-- ---------------------------------------------------------------------
create or replace function generar_ean13()
returns text
language plpgsql
as $$
declare
  base text;
  suma int := 0;
  i int;
  d int;
  verificador int;
begin
  base := '200' || lpad((floor(random() * 1000000000))::bigint::text, 9, '0');
  for i in 1..12 loop
    d := substr(base, i, 1)::int;
    if i % 2 = 0 then
      suma := suma + d * 3;
    else
      suma := suma + d;
    end if;
  end loop;
  verificador := (10 - (suma % 10)) % 10;
  return base || verificador::text;
end;
$$;

-- ---------------------------------------------------------------------
-- asignar_codigo_barras(producto, codigo): setea un código puntual (escaneado
-- o tipeado) en un producto. Falla si ese código ya pertenece a OTRO producto
-- (unicidad, "que no se dupliquen"). Roles: admin/gerencia/almacen.
-- ---------------------------------------------------------------------
create or replace function asignar_codigo_barras(p_producto_id uuid, p_codigo text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_codigo text := btrim(p_codigo);
begin
  if mi_rol() not in ('admin', 'gerencia', 'almacen', 'ventas') then
    raise exception 'No tenés permiso para asignar códigos de barras';
  end if;
  if v_codigo = '' then
    raise exception 'El código no puede estar vacío';
  end if;

  if exists (select 1 from productos where codigo_barras = v_codigo and id <> p_producto_id) then
    raise exception 'Ese código ya está asignado a otro producto';
  end if;

  update productos set codigo_barras = v_codigo where id = p_producto_id;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- generar_codigo_barras(producto): genera un EAN-13 único y lo asigna a un
-- producto (reintenta hasta no colisionar). Roles: admin/gerencia/almacen.
-- ---------------------------------------------------------------------
create or replace function generar_codigo_barras(p_producto_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_codigo text;
begin
  if mi_rol() not in ('admin', 'gerencia', 'almacen', 'ventas') then
    raise exception 'No tenés permiso para generar códigos de barras';
  end if;

  loop
    v_codigo := generar_ean13();
    exit when not exists (select 1 from productos where codigo_barras = v_codigo);
  end loop;

  update productos set codigo_barras = v_codigo where id = p_producto_id;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- generar_codigos_barras_faltantes(): asigna un EAN-13 único a TODOS los
-- productos activos que no tienen código de barras. Devuelve cuántos generó.
-- Operación de gestión masiva: solo admin/gerencia.
-- ---------------------------------------------------------------------
create or replace function generar_codigos_barras_faltantes()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_codigo text;
  v_cuenta int := 0;
begin
  if mi_rol() not in ('admin', 'gerencia') then
    raise exception 'Solo Admin o Gerencia pueden generar códigos en lote';
  end if;

  for r in select id from productos where coalesce(codigo_barras, '') = '' loop
    loop
      v_codigo := generar_ean13();
      exit when not exists (select 1 from productos where codigo_barras = v_codigo);
    end loop;
    update productos set codigo_barras = v_codigo where id = r.id;
    v_cuenta := v_cuenta + 1;
  end loop;

  return v_cuenta;
end;
$$;
