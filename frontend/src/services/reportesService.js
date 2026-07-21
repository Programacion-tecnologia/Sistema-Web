import { supabase } from "./supabaseClient";

// Todas las RPCs de reportes (0017) son agregaciones server-side restringidas
// a Admin/Gerencia: la base calcula el margen/valorización con precio_compra y
// al cliente solo baja el agregado. Las fechas van como 'YYYY-MM-DD'.

export async function reporteVentas(desde, hasta) {
  const { data, error } = await supabase.rpc("reporte_ventas", { p_desde: desde, p_hasta: hasta });
  if (error) throw error;
  return data;
}

export async function reporteTopProductos(desde, hasta) {
  const { data, error } = await supabase.rpc("reporte_top_productos", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw error;
  return data ?? [];
}

export async function reporteValorizacionInventario() {
  const { data, error } = await supabase.rpc("reporte_valorizacion_inventario");
  if (error) throw error;
  return data;
}

export async function reporteStockInmovilizado(dias) {
  const { data, error } = await supabase.rpc("reporte_stock_inmovilizado", { p_dias: dias });
  if (error) throw error;
  return data ?? [];
}

export async function reporteVentasPorModelo(desde, hasta) {
  const { data, error } = await supabase.rpc("reporte_ventas_por_modelo", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw error;
  return data ?? [];
}
