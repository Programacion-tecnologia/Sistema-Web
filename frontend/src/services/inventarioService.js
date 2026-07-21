import { supabase } from "./supabaseClient";

// Kardex de un producto: historial de movimientos de stock_fisico (entradas
// de compra, salidas de despacho, ajustes manuales) con el saldo resultante,
// del mas reciente al mas antiguo. La tabla movimientos_inventario (0015) es
// append-only: solo la escriben las RPCs recibir_compra /
// verificar_despacho_cotizacion / ajustar_stock.
const MOVIMIENTO_SELECT =
  "id, tipo, cantidad, stock_resultante, motivo, referencia_tabla, referencia_id, created_at, usuario:profiles(id, nombre)";

export async function listMovimientos(productoId) {
  const { data, error } = await supabase
    .from("movimientos_inventario")
    .select(MOVIMIENTO_SELECT)
    .eq("producto_id", productoId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ajustar_stock() es la RPC atomica (0015): suma delta al stock_fisico (delta
// puede ser negativo), con motivo obligatorio, y deja el movimiento de kardex
// + auditoria. Solo Admin/Gerencia (validado tambien server-side).
export async function ajustarStock(productoId, delta, motivo) {
  const { data, error } = await supabase.rpc("ajustar_stock", {
    p_producto_id: productoId,
    p_delta: delta,
    p_motivo: motivo,
  });
  if (error) throw error;
  return data;
}

// El stock minimo NO mueve stock, es solo el umbral de la alerta de
// reposicion: se edita con un UPDATE directo sobre productos (la RLS de 0009
// ya restringe el update de productos a Admin/Gerencia).
export async function updateStockMinimo(productoId, stockMinimo) {
  const { data, error } = await supabase
    .from("productos")
    .update({ stock_minimo: stockMinimo })
    .eq("id", productoId)
    .select("id, stock_minimo")
    .single();

  if (error) throw error;
  return data;
}
