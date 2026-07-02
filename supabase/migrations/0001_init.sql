-- Rios System: esquema inicial
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles: extiende auth.users con nombre y rol dentro de la empresa
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null default 'ventas' check (rol in ('admin', 'ventas', 'almacen', 'gerencia')),
  created_at timestamptz not null default now()
);

-- Crea automáticamente un profile cuando se registra un usuario en auth.users
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    coalesce(new.raw_user_meta_data ->> 'rol', 'ventas')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------
-- categorias
-- ---------------------------------------------------------------------
create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- productos
-- ---------------------------------------------------------------------
create table productos (
  id uuid primary key default gen_random_uuid(),
  codigo_barras text unique,
  nombre text not null,
  descripcion text,
  categoria_id uuid references categorias (id) on delete set null,
  precio_compra numeric(12, 2) not null default 0,
  precio_venta numeric(12, 2) not null default 0,
  stock_fisico integer not null default 0,
  stock_reservado integer not null default 0,
  stock_disponible integer generated always as (stock_fisico - stock_reservado) stored,
  ubicacion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index productos_categoria_id_idx on productos (categoria_id);

-- ---------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  telefono text,
  direccion text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- proveedores
-- ---------------------------------------------------------------------
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  telefono text,
  direccion text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- cotizaciones
-- ---------------------------------------------------------------------
create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id),
  vendedor_id uuid references profiles (id),
  estado text not null default 'borrador' check (
    estado in (
      'borrador', 'enviada', 'aprobada', 'reservada', 'en_preparacion',
      'lista_despacho', 'despachada', 'entregada', 'cancelada', 'rechazada'
    )
  ),
  aprobada_por uuid references profiles (id),
  aprobada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cotizaciones_cliente_id_idx on cotizaciones (cliente_id);
create index cotizaciones_estado_idx on cotizaciones (estado);

-- ---------------------------------------------------------------------
-- cotizacion_items: líneas de producto dentro de cada cotización
-- ---------------------------------------------------------------------
create table cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones (id) on delete cascade,
  producto_id uuid not null references productos (id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null
);

create index cotizacion_items_cotizacion_id_idx on cotizacion_items (cotizacion_id);
create index cotizacion_items_producto_id_idx on cotizacion_items (producto_id);

-- ---------------------------------------------------------------------
-- auditoria: historial de cambios importantes
-- ---------------------------------------------------------------------
create table auditoria (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  registro_id uuid not null,
  accion text not null check (accion in ('crear', 'actualizar', 'eliminar')),
  usuario_id uuid references profiles (id),
  detalle jsonb,
  created_at timestamptz not null default now()
);

create index auditoria_tabla_registro_idx on auditoria (tabla, registro_id);

-- ---------------------------------------------------------------------
-- updated_at automático en productos y cotizaciones
-- ---------------------------------------------------------------------
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger productos_set_updated_at
  before update on productos
  for each row execute procedure set_updated_at();

create trigger cotizaciones_set_updated_at
  before update on cotizaciones
  for each row execute procedure set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- Política inicial: cualquier usuario autenticado puede leer y escribir.
-- Es intencionalmente permisiva porque el módulo de roles/permisos del
-- frontend todavía no existe. Cuando se construya Usuarios/Roles, estas
-- políticas deben reemplazarse por reglas específicas por rol (ej. solo
-- 'almacen' puede tocar stock_fisico vía Scanner, solo 'admin' aprueba
-- cotizaciones, etc.).
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table clientes enable row level security;
alter table proveedores enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
alter table auditoria enable row level security;

create policy "profiles: lectura autenticada" on profiles
  for select to authenticated using (true);
create policy "profiles: usuario actualiza su propio perfil" on profiles
  for update to authenticated using (auth.uid() = id);

create policy "categorias: acceso autenticado" on categorias
  for all to authenticated using (true) with check (true);

create policy "productos: acceso autenticado" on productos
  for all to authenticated using (true) with check (true);

create policy "clientes: acceso autenticado" on clientes
  for all to authenticated using (true) with check (true);

create policy "proveedores: acceso autenticado" on proveedores
  for all to authenticated using (true) with check (true);

create policy "cotizaciones: acceso autenticado" on cotizaciones
  for all to authenticated using (true) with check (true);

create policy "cotizacion_items: acceso autenticado" on cotizacion_items
  for all to authenticated using (true) with check (true);

create policy "auditoria: lectura e insercion autenticada" on auditoria
  for select to authenticated using (true);
create policy "auditoria: insercion autenticada" on auditoria
  for insert to authenticated with check (true);
