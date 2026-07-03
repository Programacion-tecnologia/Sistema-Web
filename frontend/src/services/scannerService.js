import { supabase } from "./supabaseClient";

// Select liviano para el listado: solo lo necesario para elegir una cotización.
const RESERVADA_SELECT =
  "id, created_at, cliente:clientes(id, nombre), vendedor:profiles!vendedor_id(id, nombre)";

// Select completo para la pantalla de verificación: cada línea trae los
// códigos del producto (codigo_referencia y codigo_barras) contra los que se
// matchea cada escaneo.
const VERIFICACION_SELECT =
  "id, estado, created_at, cliente:clientes(id, nombre), vendedor:profiles!vendedor_id(id, nombre), items:cotizacion_items(id, cantidad, producto:productos(id, nombre, codigo_referencia, codigo_barras))";

export async function listCotizacionesReservadas() {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select(RESERVADA_SELECT)
    .eq("estado", "reservada")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getCotizacionParaVerificar(id) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select(VERIFICACION_SELECT)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * @param {string} cotizacionId
 * @param {Array<{producto_id: string, cantidad_verificada: number}>} lineas
 * @returns {Promise<Array>} detalle por línea (pedido/verificado/estado) que devuelve la RPC
 */
export async function verificarDespachoCotizacion(cotizacionId, lineas) {
  const { data, error } = await supabase.rpc("verificar_despacho_cotizacion", {
    p_cotizacion_id: cotizacionId,
    p_lineas: lineas,
  });

  if (error) throw error;
  return data;
}
