import { supabase } from "./supabaseClient";

// ventas tiene dos FKs a profiles (vendedor_id, anulada_por): hints para
// desambiguar cada embed, igual que compras. cliente puede ser null (venta a
// público general).
const VENTA_SELECT =
  "*, vendedor:profiles!vendedor_id(id, nombre), anulador:profiles!anulada_por(id, nombre), cliente:clientes(id, nombre, ruc_dni, telefono), items:venta_items(id, cantidad, precio_unitario, producto:productos(id, nombre, codigo_referencia)), pagos:venta_pagos(id, metodo, monto)";

// registrar_venta es la RPC atómica (0016): crea venta + items + pagos, valida
// y descuenta stock, y deja el movimiento 'salida' en el kardex. No devuelve
// la venta completa (solo id + total), así que se refetch como en compras.
export async function registrarVenta({ cliente_id, moneda, items, pagos }) {
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_cliente_id: cliente_id ?? null,
    p_moneda: moneda,
    p_items: items,
    p_pagos: pagos,
  });
  if (error) throw error;
  return data; // { venta_id, total }
}

export async function listVentas() {
  const { data, error } = await supabase
    .from("ventas")
    .select(VENTA_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data;
}

export async function getVenta(id) {
  const { data, error } = await supabase.from("ventas").select(VENTA_SELECT).eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function anularVenta(id, motivo) {
  const { data, error } = await supabase.rpc("anular_venta", { p_venta_id: id, p_motivo: motivo });
  if (error) throw error;
  return data;
}
