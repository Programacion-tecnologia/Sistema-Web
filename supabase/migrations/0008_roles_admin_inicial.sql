-- Rios System: fija el admin inicial + helper de rol para RLS
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).
--
-- IMPORTANTE: correr este archivo primero, antes que 0009/0010. Este bloque
-- corre en una sesion del SQL Editor (sin auth.uid(), no hay JWT de por
-- medio), asi que no lo bloquea ningun trigger de los que se agregan en
-- 0009 - es seguro fijar el admin aca antes de que existan restricciones.

update profiles set rol = 'admin'
where id = (select id from auth.users where email = 'onemillion0112@gmail.com');

-- Verificacion manual sugerida antes de seguir con 0009/0010:
-- select id, nombre, rol from profiles where rol = 'admin';

-- ---------------------------------------------------------------------
-- mi_rol(): rol del usuario que hace la request actual (segun su JWT).
--
-- security definer + stable: evita el problema de recursion de RLS que
-- ocurriria si una policy sobre "profiles" llamara a una funcion que vuelve
-- a leer "profiles" bajo las policies normales de esa misma tabla - esta
-- funcion bypassea RLS solo para esta lectura puntual (equivalente a leer
-- la fila propia, nada mas), no da acceso a nada adicional.
-- ---------------------------------------------------------------------
create or replace function mi_rol()
returns text
language sql
stable
security definer set search_path = public
as $$
  select rol from profiles where id = auth.uid();
$$;
