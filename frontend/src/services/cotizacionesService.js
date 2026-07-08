import { supabase } from "./supabaseClient";

// vendedor: profiles!vendedor_id especifica cual de las tres FK de cotizaciones
// hacia profiles (vendedor_id, aprobada_por, verificada_por) usar en el embed;
// sin el hint, PostgREST no puede elegir sola y devuelve error de ambiguedad.
const COTIZACION_SELECT =
  "*, cliente:clientes(id, nombre), vendedor:profiles!vendedor_id(id, nombre), items:cotizacion_items(id, cantidad, precio_unitario, producto:productos(id, nombre, codigo_referencia, precio_venta, moneda, stock_disponible))";

export async function listCotizaciones() {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select(COTIZACION_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getCotizacion(id) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select(COTIZACION_SELECT)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createCotizacion({ cliente_id, vendedor_id, moneda, items }) {
  const { data: cotizacion, error: cotizacionError } = await supabase
    .from("cotizaciones")
    .insert({ cliente_id, vendedor_id, moneda })
    .select()
    .single();

  if (cotizacionError) throw cotizacionError;

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("cotizacion_items").insert(
      items.map((item) => ({
        cotizacion_id: cotizacion.id,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      }))
    );

    if (itemsError) throw itemsError;
  }

  return getCotizacion(cotizacion.id);
}

async function actualizarEstado(id, estado) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .update({ estado })
    .eq("id", id)
    .select(COTIZACION_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export function enviarCotizacion(id) {
  return actualizarEstado(id, "enviada");
}

export function rechazarCotizacion(id) {
  return actualizarEstado(id, "rechazada");
}

export function cancelarCotizacion(id) {
  return actualizarEstado(id, "cancelada");
}

export function despacharCotizacion(id) {
  return actualizarEstado(id, "despachada");
}

export async function aprobarCotizacion(id) {
  const { error } = await supabase.rpc("aprobar_cotizacion", { p_cotizacion_id: id });
  if (error) throw error;
  return getCotizacion(id);
}
