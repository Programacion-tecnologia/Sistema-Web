import { supabase } from "./supabaseClient";

// caja_sesiones tiene dos FKs a profiles (abierta_por, cerrada_por): el hint
// "profiles!columna" desambigua cada embed, igual que en compras/cotizaciones.
const SESION_SELECT =
  "*, abridor:profiles!abierta_por(id, nombre), cerrador:profiles!cerrada_por(id, nombre)";

// La caja es global: hay a lo sumo una sesión abierta (garantizado por el
// índice único parcial de 0016). maybeSingle devuelve null si no hay ninguna.
export async function getCajaAbierta() {
  const { data, error } = await supabase
    .from("caja_sesiones")
    .select(SESION_SELECT)
    .eq("estado", "abierta")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function abrirCaja(montoInicial) {
  const { data, error } = await supabase.rpc("abrir_caja", { p_monto_inicial: montoInicial });
  if (error) throw error;
  return data;
}

export async function cerrarCaja(sesionId, montoContado, notas) {
  const { data, error } = await supabase.rpc("cerrar_caja", {
    p_sesion_id: sesionId,
    p_monto_contado: montoContado,
    p_notas: notas ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listSesiones() {
  const { data, error } = await supabase
    .from("caja_sesiones")
    .select(SESION_SELECT)
    .order("abierta_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data;
}

// Resumen en vivo de la sesión abierta para previsualizar el arqueo ANTES de
// cerrar: cuántas ventas y el desglose por método de pago (solo ventas
// completadas). El "esperado en efectivo" definitivo lo recalcula cerrar_caja
// en el servidor; esto es solo para mostrar en pantalla.
export async function getResumenSesion(sesionId) {
  const { data, error } = await supabase
    .from("ventas")
    .select("id, pagos:venta_pagos(metodo, monto)")
    .eq("caja_sesion_id", sesionId)
    .eq("estado", "completada");

  if (error) throw error;

  const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0, yape_plin: 0 };
  for (const venta of data) {
    for (const pago of venta.pagos) {
      porMetodo[pago.metodo] = (porMetodo[pago.metodo] ?? 0) + Number(pago.monto);
    }
  }

  return { porMetodo, totalVentas: data.length };
}
