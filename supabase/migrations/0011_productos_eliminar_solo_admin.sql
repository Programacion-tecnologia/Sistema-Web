-- Rios System: eliminar productos queda restringido solo a Admin (antes lo
-- permitia tambien Gerencia, junto con crear/editar). Correr en el SQL
-- Editor de Supabase, DESPUES de 0009 (necesita mi_rol()).
--
-- Un producto que ya fue cotizado alguna vez no se puede borrar: la FK
-- cotizacion_items.producto_id -> productos(id) (0001_init.sql) no tiene ON
-- DELETE CASCADE ni SET NULL, asi que el borrado falla con una violacion de
-- foreign key. Es el comportamiento deseado: se pierde el historial de esa
-- cotizacion si se borra el producto. Para productos que no volveran a
-- venderse pero ya tienen historial, la alternativa es marcarlos "inactivo"
-- (columna estado, ya existente) en vez de borrarlos.

drop policy "productos: eliminar admin/gerencia" on productos;

create policy "productos: eliminar admin" on productos
  for delete to authenticated using (mi_rol() = 'admin');
