import { supabase } from "./supabaseClient";
import { listProductos } from "./productosService";
import { getNivelStock } from "../utils/stock";
import { ROLES } from "../utils/roles";

const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000;
const ESTADOS_AVANZADOS = ["reservada", "en_preparacion", "lista_despacho", "despachada", "entregada"];
const ESTADOS_NEGATIVOS = ["rechazada", "cancelada"];

function inicioDeMes() {
  const fecha = new Date();
  fecha.setDate(1);
  fecha.setHours(0, 0, 0, 0);
  return fecha.toISOString();
}

function sumarMontosPorMoneda(cotizaciones) {
  const totales = { PEN: 0, USD: 0 };
  for (const cotizacion of cotizaciones) {
    const monto = cotizacion.items.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0);
    totales[cotizacion.moneda] += monto;
  }
  return totales;
}

export async function contarCotizacionesPendientes() {
  const { count, error } = await supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("estado", "enviada");

  if (error) throw error;
  return count ?? 0;
}

// Mismo calculo que vencimientoLabel() en Cotizaciones.jsx, pero contando
// cuantas caen dentro de las proximas 24hs en vez de mostrar el texto por fila.
export async function contarCotizacionesPorVencer() {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("id, vence_en")
    .in("estado", ["borrador", "enviada"])
    .not("vence_en", "is", null);

  if (error) throw error;

  const ahora = Date.now();
  return data.filter((cotizacion) => {
    const restante = new Date(cotizacion.vence_en).getTime() - ahora;
    return restante > 0 && restante <= VEINTICUATRO_HORAS_MS;
  }).length;
}

export async function listarAlertasStock() {
  const productos = await listProductos();
  return {
    agotados: productos.filter((p) => getNivelStock(p.stock_disponible) === "agotado"),
    bajos: productos.filter((p) => getNivelStock(p.stock_disponible) === "bajo"),
  };
}

/**
 * Cotizado/despachado/tasa de conversion/ticket promedio del mes en curso.
 * Nunca se suman montos de PEN y USD entre si: todo queda separado por moneda.
 */
export async function obtenerResumenComercial() {
  const inicioMesIso = inicioDeMes();

  const [creadasEsteMes, despachadasEsteMes] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("estado, moneda, items:cotizacion_items(cantidad, precio_unitario)")
      .gte("created_at", inicioMesIso),
    supabase
      .from("cotizaciones")
      .select("moneda, items:cotizacion_items(cantidad, precio_unitario)")
      .in("estado", ["lista_despacho", "despachada"])
      .gte("verificada_at", inicioMesIso),
  ]);

  if (creadasEsteMes.error) throw creadasEsteMes.error;
  if (despachadasEsteMes.error) throw despachadasEsteMes.error;

  const cotizadas = creadasEsteMes.data.filter(
    (c) => c.estado !== "borrador" && !ESTADOS_NEGATIVOS.includes(c.estado)
  );
  const avanzadas = creadasEsteMes.data.filter((c) => ESTADOS_AVANZADOS.includes(c.estado));
  const negativas = creadasEsteMes.data.filter((c) => ESTADOS_NEGATIVOS.includes(c.estado));

  const montoCotizado = sumarMontosPorMoneda(cotizadas);
  const montoDespachado = sumarMontosPorMoneda(despachadasEsteMes.data);

  const resueltas = avanzadas.length + negativas.length;
  const tasaConversion = resueltas > 0 ? (avanzadas.length / resueltas) * 100 : null;

  const ticketPromedio = { PEN: null, USD: null };
  for (const moneda of ["PEN", "USD"]) {
    const deEstaMoneda = avanzadas.filter((c) => c.moneda === moneda);
    if (deEstaMoneda.length > 0) {
      ticketPromedio[moneda] = sumarMontosPorMoneda(deEstaMoneda)[moneda] / deEstaMoneda.length;
    }
  }

  return { montoCotizado, montoDespachado, tasaConversion, ticketPromedio };
}

export async function listarDespachosRecientes() {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("id, moneda, updated_at, cliente:clientes(id, nombre), items:cotizacion_items(cantidad, precio_unitario)")
    .in("estado", ["lista_despacho", "despachada"])
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  return data;
}

export async function contarCotizacionesPorEstado() {
  const { data, error } = await supabase.from("cotizaciones").select("estado");
  if (error) throw error;

  const conteo = {};
  for (const { estado } of data) {
    conteo[estado] = (conteo[estado] ?? 0) + 1;
  }
  return conteo;
}

// Valorizacion a costo: igual que en Productos, solo admin/gerencia puede
// verla. Devuelve null (no 0) para que el Dashboard sepa distinguir "no
// autorizado" de "autorizado pero el inventario vale cero".
export async function calcularValorInventario(rol) {
  if (rol !== ROLES.ADMIN && rol !== ROLES.GERENCIA) {
    return { PEN: null, USD: null };
  }

  const productos = await listProductos(rol);
  const valores = { PEN: 0, USD: 0 };
  for (const producto of productos) {
    valores[producto.moneda] += producto.stock_fisico * producto.precio_compra;
  }
  return valores;
}

export async function listarActividadReciente() {
  const { data, error } = await supabase
    .from("auditoria")
    .select("id, tabla, accion, created_at, usuario:profiles(nombre)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data;
}
