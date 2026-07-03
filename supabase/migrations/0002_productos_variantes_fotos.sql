-- Rios System: variantes de producto (color/modelo) + fotos en Supabase Storage
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).

alter table productos add column color text;
alter table productos add column modelo text;
alter table productos add column foto_url text;

-- Bucket de Storage para fotos de productos. Publico: las fotos de repuestos
-- no son informacion sensible, y asi foto_url queda como URL estable sin
-- necesidad de renovar URLs firmadas en cada pantalla que la muestre.
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

create policy "productos fotos: lectura publica"
  on storage.objects for select
  using (bucket_id = 'productos');

create policy "productos fotos: escritura autenticada"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'productos');

create policy "productos fotos: actualizacion autenticada"
  on storage.objects for update to authenticated
  using (bucket_id = 'productos');

create policy "productos fotos: borrado autenticado"
  on storage.objects for delete to authenticated
  using (bucket_id = 'productos');
