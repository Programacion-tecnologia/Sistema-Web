// Helpers de promociones/ofertas: % de descuento y estado segun fechas.

// % de descuento del precio de oferta contra el precio normal. Se calcula
// siempre en vivo (no se guarda) para que sea una sola fuente de verdad.
export function descuentoPct(precioNormal, precioOferta) {
  const normal = Number(precioNormal);
  const oferta = Number(precioOferta);
  if (!normal || normal <= 0 || oferta >= normal) return 0;
  return Math.round((1 - oferta / normal) * 100);
}

// Precio de oferta a partir de un % de descuento (para el input inverso).
export function precioDesdeDescuento(precioNormal, pct) {
  const normal = Number(precioNormal);
  const p = Number(pct);
  if (!normal || !p) return normal;
  return Math.round(normal * (1 - p / 100) * 100) / 100;
}

export const ESTADO_PROMO = {
  PROGRAMADA: "programada",
  VIGENTE: "vigente",
  FINALIZADA: "finalizada",
  PAUSADA: "pausada",
};

export const ESTADO_PROMO_LABEL = {
  [ESTADO_PROMO.PROGRAMADA]: "Programada",
  [ESTADO_PROMO.VIGENTE]: "Vigente",
  [ESTADO_PROMO.FINALIZADA]: "Finalizada",
  [ESTADO_PROMO.PAUSADA]: "Pausada",
};

export const ESTADO_PROMO_BADGE_CLASS = {
  [ESTADO_PROMO.PROGRAMADA]: "bg-primary-100 text-primary-700",
  [ESTADO_PROMO.VIGENTE]: "bg-success-100 text-success-700",
  [ESTADO_PROMO.FINALIZADA]: "bg-slate-100 text-slate-500",
  [ESTADO_PROMO.PAUSADA]: "bg-warning-100 text-warning-700",
};

export function estadoPromocion(promo, ahora = new Date()) {
  if (!promo.activa) return ESTADO_PROMO.PAUSADA;
  const inicio = new Date(promo.fecha_inicio);
  const fin = new Date(promo.fecha_fin);
  if (ahora < inicio) return ESTADO_PROMO.PROGRAMADA;
  if (ahora > fin) return ESTADO_PROMO.FINALIZADA;
  return ESTADO_PROMO.VIGENTE;
}

// Texto tipo "Termina en 3 días" / "Último día" / "Termina en 5 h" para el
// showcase. Devuelve null si ya termino.
export function tiempoRestante(fechaFin, ahora = new Date()) {
  const fin = new Date(fechaFin);
  const ms = fin - ahora;
  if (ms <= 0) return null;
  const dias = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (dias > 1) return `Termina en ${dias} días`;
  const horas = Math.ceil(ms / (1000 * 60 * 60));
  if (horas > 1) return `Termina en ${horas} h`;
  return "Último día";
}

// Fechas <input type="date"> <-> timestamptz. La promo arranca al inicio del
// dia de inicio y termina al final del dia de fin (23:59:59), asi el ultimo
// dia cuenta completo.
export function fechaInicioAIso(fechaStr) {
  return new Date(`${fechaStr}T00:00:00`).toISOString();
}

export function fechaFinAIso(fechaStr) {
  return new Date(`${fechaStr}T23:59:59`).toISOString();
}

export function isoAFechaInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d - offset).toISOString().slice(0, 10);
}
