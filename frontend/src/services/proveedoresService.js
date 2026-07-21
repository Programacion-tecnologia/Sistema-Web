import { supabase } from "./supabaseClient";

export async function listProveedores() {
  const { data, error } = await supabase.from("proveedores").select("*").order("nombre");

  if (error) throw error;
  return data;
}

export async function getProveedor(id) {
  const { data, error } = await supabase.from("proveedores").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createProveedor(payload) {
  const { data, error } = await supabase.from("proveedores").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProveedor(id, payload) {
  const { data, error } = await supabase
    .from("proveedores")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Si el proveedor ya tiene compras registradas, la FK compras.proveedor_id
// (sin ON DELETE CASCADE) hace fallar el borrado con codigo 23503 - mismo
// patron que productosService.deleteProducto.
export async function deleteProveedor(id) {
  const { error } = await supabase.from("proveedores").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new Error("Este proveedor ya tiene compras registradas y no se puede eliminar.");
    }
    throw error;
  }
}

export async function getHistorialCompras(proveedorId) {
  const { data, error } = await supabase
    .from("compras")
    .select("id, estado, moneda, created_at, items:compra_items(cantidad, costo_unitario)")
    .eq("proveedor_id", proveedorId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Fila liviana por compra (sin items) para que Proveedores.jsx calcule
// cantidad de compras + ultima actividad por proveedor en una sola query,
// en vez de una consulta por proveedor (N+1) - mismo patron que
// clientesService.listActividadCotizacionesPorCliente.
export async function listActividadComprasPorProveedor() {
  const { data, error } = await supabase.from("compras").select("proveedor_id, created_at");
  if (error) throw error;
  return data;
}
