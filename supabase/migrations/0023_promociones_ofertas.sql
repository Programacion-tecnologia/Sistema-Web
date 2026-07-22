-- Rios System: modulo Productos en oferta / Promociones (resto de fase 5)
-- Correr en el SQL Editor de Supabase. Necesita mi_rol() de 0009 y la tabla
-- productos (0001) + profiles.
--
-- Que agrega:
--   1. promociones: la "campana" (ej. "Semana Circuit"), con rango de fechas y
--      un switch activa. Un producto esta EN OFERTA si pertenece a una promo
--      activa y hoy cae dentro de [fecha_inicio, fecha_fin]. Cuando la fecha
--      pasa, el producto sale solo de las ofertas, sin tocar nada.
--   2. promocion_productos: que productos entran a la promo y a que precio de
--      oferta cada uno. El % de descuento NO se guarda: se calcula en la UI
--      contra el precio_venta actual del producto (una sola fuente de verdad).

-- ---------------------------------------------------------------------
-- promociones (cabecera / campana)
-- ---------------------------------------------------------------------
create table promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz not null,
  activa boolean not null default true,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- promocion_productos (productos de la promo + su precio de oferta)
-- ---------------------------------------------------------------------
create table promocion_productos (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references promociones (id) on delete cascade,
  producto_id uuid not null references productos (id) on delete cascade,
  precio_oferta numeric(12, 2) not null check (precio_oferta >= 0),
  unique (promocion_id, producto_id)
);

create index promocion_productos_promocion_idx on promocion_productos (promocion_id);
create index promocion_productos_producto_idx on promocion_productos (producto_id);

-- ---------------------------------------------------------------------
-- RLS: leer ofertas = cualquier autenticado (el showcase lo ve todo el
-- mundo). Crear/editar promociones = solo Admin/Gerencia.
-- ---------------------------------------------------------------------
alter table promociones enable row level security;
alter table promocion_productos enable row level security;

create policy "promos: lectura autenticada" on promociones
  for select to authenticated using (true);
create policy "promos: escritura admin/gerencia" on promociones
  for all to authenticated
  using (mi_rol() in ('admin', 'gerencia'))
  with check (mi_rol() in ('admin', 'gerencia'));

create policy "promo_prod: lectura autenticada" on promocion_productos
  for select to authenticated using (true);
create policy "promo_prod: escritura admin/gerencia" on promocion_productos
  for all to authenticated
  using (mi_rol() in ('admin', 'gerencia'))
  with check (mi_rol() in ('admin', 'gerencia'));
