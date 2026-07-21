import { supabase } from "./supabaseClient";

// compras tiene dos FKs distintas hacia profiles (creada_por, recibida_por):
// el hint "profiles!columna" le dice a PostgREST cual usar en cada embed, sin
// el hint no puede elegir sola y devuelve error de ambiguedad - mismo motivo
// que el hint "profiles!vendedor_id" en cotizacionesService.
const COMPRA_SELECT =
  "*, proveedor:proveedores(id, nombre), creador:profiles!creada_por(id, nombre), receptor:profiles!recibida_por(id, nombre), items:compra_items(id, cantidad, costo_unitario, producto:productos(id, nombre, codigo_referencia, precio_compra))";

export async function listCompras() {
  const { data, error } = await supabase
    .from("compras")
    .select(COMPRA_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getCompra(id) {
  const { data, error } = await supabase.from("compras").select(COMPRA_SELECT).eq("id", id).single();
  if (error) throw error;
  return data;
}

// creada_por se completa solo (default auth.uid() en la tabla, 0012) - no
// hace falta pasarlo desde el frontend, a diferencia de vendedor_id en
// cotizaciones.
export async function createCompra({ proveedor_id, moneda, items }) {
  const { data: compra, error: compraError } = await supabase
    .from("compras")
    .insert({ proveedor_id, moneda })
    .select()
    .single();

  if (compraError) throw compraError;

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("compra_items").insert(
      items.map((item) => ({
        compra_id: compra.id,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        costo_unitario: item.costo_unitario,
      }))
    );

    if (itemsError) throw itemsError;
  }

  return getCompra(compra.id);
}

// Unica transicion permitida por UPDATE directo (ver policy "compras:
// anular admin/gerencia" en 0012): pendiente -> anulada. Si la compra ya no
// esta en pendiente (por ejemplo, ya fue recibida), la policy no le deja
// tocar la fila y el update afecta 0 filas - .single() lo reporta como
// PGRST116, que se traduce a un mensaje mas claro.
export async function anularCompra(id) {
  const { data, error } = await supabase
    .from("compras")
    .update({ estado: "anulada" })
    .eq("id", id)
    .select(COMPRA_SELECT)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Esta compra ya no está pendiente, no se puede anular.");
    }
    throw error;
  }
  return data;
}

// Editar cantidad/costo de una linea mientras la compra siga pendiente
// (0014: policy "compra_items: editar admin/gerencia (compra pendiente)").
// Caso de uso principal: una compra importada del Excel del proveedor nace
// con costo 0 (el archivo no trae el costo real) y se corrige aca cuando
// llega la factura. Si la compra ya no esta pendiente, la policy no matchea
// ninguna fila y .single() reporta PGRST116.
export async function updateCompraItem(itemId, { cantidad, costo_unitario }) {
  const { error } = await supabase
    .from("compra_items")
    .update({ cantidad, costo_unitario })
    .eq("id", itemId)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Esta compra ya no está pendiente, no se pueden editar sus líneas.");
    }
    throw error;
  }
}

export async function deleteCompraItem(itemId) {
  const { error } = await supabase
    .from("compra_items")
    .delete()
    .eq("id", itemId)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Esta compra ya no está pendiente, no se pueden quitar sus líneas.");
    }
    throw error;
  }
}

// Se puede anotar en cualquier momento mientras la compra sigue pendiente
// (0013: policy "compras: registrar guia de remision", incluye Almacen
// ademas de Admin/Gerencia porque es quien tiene la guia fisica en mano).
export async function actualizarGuiaRemision(id, guiaRemision) {
  const { data, error } = await supabase
    .from("compras")
    .update({ guia_remision: guiaRemision })
    .eq("id", id)
    .select(COMPRA_SELECT)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Esta compra ya no está pendiente, no se puede editar la guía.");
    }
    throw error;
  }
  return data;
}

// Para asociar una importacion de Excel a una compra ya existente en vez de
// crear una nueva (ver ProductosImportar.jsx).
export async function listComprasPendientes() {
  const { data, error } = await supabase
    .from("compras")
    .select("id, moneda, proveedor:proveedores(nombre), created_at")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// recibir_compra() es la RPC atomica (0012): mueve stock_fisico, actualiza
// precio_compra por linea y cierra la compra - todo en una sola
// transaccion. No devuelve la compra completa (solo el detalle jsonb de lo
// que movio), asi que se refetch igual que aprobarCotizacion().
export async function recibirCompra(id) {
  const { error } = await supabase.rpc("recibir_compra", { p_compra_id: id });
  if (error) throw error;
  return getCompra(id);
}

// Para la seccion "Comprado a" en ProductoDetalle: de que proveedor(es) se
// compro este producto. Un producto puede tener varias compras recibidas
// del mismo proveedor a lo largo del tiempo, asi que se agrupa por
// proveedor y se muestra solo la mas reciente. Filtra "recibida" del lado
// del cliente en vez de con un filtro anidado de PostgREST (".eq" sobre una
// relacion embebida) porque la lista de compras de un solo producto siempre
// es chica - no vale la pena la complejidad/fragilidad del filtro anidado.
export async function listProveedoresPorProducto(productoId) {
  const { data, error } = await supabase
    .from("compra_items")
    .select("compra:compras(estado, created_at, proveedor:proveedores(id, nombre))")
    .eq("producto_id", productoId);

  if (error) throw error;

  const porProveedor = new Map();
  for (const fila of data) {
    const compra = fila.compra;
    if (!compra || compra.estado !== "recibida" || !compra.proveedor) continue;

    const actual = porProveedor.get(compra.proveedor.id);
    if (!actual || compra.created_at > actual.ultimaCompra) {
      porProveedor.set(compra.proveedor.id, {
        id: compra.proveedor.id,
        nombre: compra.proveedor.nombre,
        ultimaCompra: compra.created_at,
      });
    }
  }

  return Array.from(porProveedor.values()).sort((a, b) => (a.ultimaCompra < b.ultimaCompra ? 1 : -1));
}
