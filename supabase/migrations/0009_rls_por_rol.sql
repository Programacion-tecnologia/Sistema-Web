-- Rios System: RLS real por rol (reemplaza las policies permisivas de 0001)
-- Correr en el SQL Editor de Supabase, DESPUES de 0008 (necesita mi_rol()).
--
-- Antes de esto, casi todas las tablas tenian una sola policy "for all ...
-- using (true)": cualquier usuario autenticado podia hacer cualquier cosa.
-- Esto la reemplaza por policies separadas por operacion, usando mi_rol()
-- (0008) para decidir segun el rol real del usuario.

-- ---------------------------------------------------------------------
-- categorias / productos: catalogo. Lectura abierta (todos los roles
-- necesitan ver nombre/stock/precio_venta para cotizar o verificar), pero
-- solo Admin/Gerencia puede crear/editar/borrar - es funcion de gestion, no
-- de ventas/almacen. precio_compra NO se puede ocultar aca a nivel de fila
-- (RLS es por fila completa, no por columna); se oculta en el frontend.
-- ---------------------------------------------------------------------
drop policy "categorias: acceso autenticado" on categorias;

create policy "categorias: lectura autenticada" on categorias
  for select to authenticated using (true);
create policy "categorias: insertar admin/gerencia" on categorias
  for insert to authenticated with check (mi_rol() in ('admin', 'gerencia'));
create policy "categorias: actualizar admin/gerencia" on categorias
  for update to authenticated using (mi_rol() in ('admin', 'gerencia'));
create policy "categorias: eliminar admin/gerencia" on categorias
  for delete to authenticated using (mi_rol() in ('admin', 'gerencia'));

drop policy "productos: acceso autenticado" on productos;

create policy "productos: lectura autenticada" on productos
  for select to authenticated using (true);
create policy "productos: insertar admin/gerencia" on productos
  for insert to authenticated with check (mi_rol() in ('admin', 'gerencia'));
create policy "productos: actualizar admin/gerencia" on productos
  for update to authenticated using (mi_rol() in ('admin', 'gerencia'));
create policy "productos: eliminar admin/gerencia" on productos
  for delete to authenticated using (mi_rol() in ('admin', 'gerencia'));

-- ---------------------------------------------------------------------
-- clientes: lectura abierta (Scanner necesita ver el nombre del cliente),
-- creacion/edicion para quienes realmente tratan con clientes.
-- ---------------------------------------------------------------------
drop policy "clientes: acceso autenticado" on clientes;

create policy "clientes: lectura autenticada" on clientes
  for select to authenticated using (true);
create policy "clientes: insertar ventas/admin/gerencia" on clientes
  for insert to authenticated with check (mi_rol() in ('ventas', 'admin', 'gerencia'));
create policy "clientes: actualizar ventas/admin/gerencia" on clientes
  for update to authenticated using (mi_rol() in ('ventas', 'admin', 'gerencia'));

-- ---------------------------------------------------------------------
-- cotizaciones: la mas delicada. Insertar: quien puede cotizar. Leer:
-- almacen solo ve lo que le toca despachar, no todo el pipeline comercial.
-- Actualizar: SOLO las transiciones que NO mueven stock (aprobar_cotizacion
-- y verificar_despacho_cotizacion son security definer y bypasean esta
-- policy - siguen andando igual). Antes de esto, cualquier autenticado
-- podia saltarse esas RPC llamando "update cotizaciones set estado =
-- 'reservada'" directo desde la consola del navegador.
--
-- "despachada" es un caso aparte: el boton "Despachado y enviado" no pasa
-- por ninguna RPC (es un update directo sin mover stock), pero se restringe
-- a Admin/Gerencia unicamente (decision de negocio: Almacen ya termino su
-- parte en el Scanner, Admin/Gerencia confirma con la boleta de la agencia
-- que llego al destino correcto) - por eso el with check distingue el
-- estado resultante ademas del rol, no alcanza con una sola condicion.
-- ---------------------------------------------------------------------
drop policy "cotizaciones: acceso autenticado" on cotizaciones;

create policy "cotizaciones: insertar segun rol" on cotizaciones
  for insert to authenticated
  with check (mi_rol() in ('ventas', 'admin', 'gerencia'));

create policy "cotizaciones: leer segun rol" on cotizaciones
  for select to authenticated
  using (
    mi_rol() in ('admin', 'gerencia', 'ventas')
    or (mi_rol() = 'almacen' and estado in ('reservada', 'lista_despacho', 'despachada', 'entregada'))
  );

create policy "cotizaciones: actualizar transiciones no atomicas" on cotizaciones
  for update to authenticated
  using (mi_rol() in ('ventas', 'admin', 'gerencia'))
  with check (
    (estado in ('enviada', 'rechazada', 'cancelada') and mi_rol() in ('ventas', 'admin', 'gerencia'))
    or (estado = 'despachada' and mi_rol() in ('admin', 'gerencia'))
  );

-- ---------------------------------------------------------------------
-- cotizacion_items: espeja la visibilidad de su cotizacion padre. Si no,
-- quedaria un hueco: Almacen no ve la cotizacion en borrador, pero podria
-- seguir viendo sus lineas directamente en esta tabla.
-- ---------------------------------------------------------------------
drop policy "cotizacion_items: acceso autenticado" on cotizacion_items;

create policy "cotizacion_items: insertar segun rol" on cotizacion_items
  for insert to authenticated
  with check (mi_rol() in ('ventas', 'admin', 'gerencia'));

create policy "cotizacion_items: leer segun rol de la cotizacion padre" on cotizacion_items
  for select to authenticated
  using (
    exists (
      select 1 from cotizaciones c
      where c.id = cotizacion_items.cotizacion_id
        and (
          mi_rol() in ('admin', 'gerencia', 'ventas')
          or (mi_rol() = 'almacen' and c.estado in ('reservada', 'lista_despacho', 'despachada', 'entregada'))
        )
    )
  );

-- ---------------------------------------------------------------------
-- auditoria: se bloquea la insercion directa para todos los usuarios.
-- Las unicas escrituras reales son desde aprobar_cotizacion() y
-- verificar_despacho_cotizacion(), que son security definer y bypasean
-- esta policy - siguen escribiendo igual. Antes de esto, cualquier
-- autenticado podia insertar una fila de auditoria falsa via la API REST
-- directa, lo cual le quita todo valor a un registro de auditoria.
-- La lectura se deja abierta a todos los roles (el Dashboard ya construido
-- muestra "Actividad reciente" a todos).
-- ---------------------------------------------------------------------
drop policy "auditoria: insercion autenticada" on auditoria;

create policy "auditoria: sin insercion directa" on auditoria
  for insert to authenticated with check (false);

-- ---------------------------------------------------------------------
-- profiles: no se toca la policy de "actualiza su propio perfil" (RLS no
-- puede restringir columnas especificas dentro de un mismo update), pero un
-- trigger bloquea el cambio de "rol" salvo que lo haga un admin real - hoy
-- cualquier usuario podia auto-asignarse rol = 'admin' actualizando su
-- propia fila, ya que la policy solo chequeaba "es mi propia fila", no que
-- columnas cambiaba.
-- ---------------------------------------------------------------------
create or replace function prevenir_cambio_rol_no_autorizado()
returns trigger
language plpgsql
as $$
begin
  if new.rol is distinct from old.rol and mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar el rol de un usuario';
  end if;
  return new;
end;
$$;

create trigger profiles_prevenir_cambio_rol
  before update on profiles
  for each row execute procedure prevenir_cambio_rol_no_autorizado();

-- ---------------------------------------------------------------------
-- cambiar_rol_usuario: forma normal de cambiar el rol de otro usuario desde
-- el modulo Usuarios. El trigger de arriba es la garantia dura (corre
-- siempre, la use quien la use); esta funcion da un mensaje de error mas
-- claro y es la que llama el frontend.
-- ---------------------------------------------------------------------
create or replace function cambiar_rol_usuario(p_usuario_id uuid, p_nuevo_rol text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  if p_nuevo_rol not in ('admin', 'gerencia', 'ventas', 'almacen') then
    raise exception 'Rol invalido: %', p_nuevo_rol;
  end if;

  update profiles set rol = p_nuevo_rol where id = p_usuario_id;
end;
$$;
