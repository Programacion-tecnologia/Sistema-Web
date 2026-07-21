-- Rios System: guia de remision en compras (dato de referencia/trazabilidad
-- que llega fisicamente con la mercaderia - NO es una guia electronica; eso,
-- si hace falta, va en la fase de facturacion electronica al final del
-- roadmap). Correr en el SQL Editor de Supabase, DESPUES de 0012.

alter table compras add column guia_remision text;

-- Permite anotar la guia en cualquier momento mientras la compra sigue
-- pendiente (antes de recibir) - lo natural es que Almacen la escriba justo
-- antes de tocar "Recibir mercaderia", que es cuando tiene la guia fisica en
-- mano. Por eso el rol incluye almacen ademas de admin/gerencia (a
-- diferencia de "compras: anular admin/gerencia", que es solo para
-- admin/gerencia).
--
-- El "with check (estado = 'pendiente')" es la parte que importa: RLS no
-- puede restringir por columna (es por fila completa), asi que en teoria
-- esta policy tambien deja tocar otras columnas de la fila (ej.
-- proveedor_id) mientras la compra siga pendiente - se acepta el mismo
-- trade-off que ya existe con precio_compra en productos (el frontend solo
-- expone un input para guia_remision en este estado; no es una barrera de
-- seguridad dura contra un cliente tecnico). Lo que SI garantiza duro el
-- "with check" es que estado no puede cambiar por esta via: intentar poner
-- estado='recibida' aca falla el check, esa transicion sigue siendo
-- exclusiva de la RPC recibir_compra() (0012).
create policy "compras: registrar guia de remision" on compras
  for update to authenticated
  using (mi_rol() in ('admin', 'gerencia', 'almacen') and estado = 'pendiente')
  with check (estado = 'pendiente');
