export const ESTADO_LABEL = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  reservada: "Reservada",
  en_preparacion: "En preparación",
  lista_despacho: "Lista para despacho",
  despachada: "Despachada",
  entregada: "Entregada",
  cancelada: "Cancelada",
  rechazada: "Rechazada",
};

export const ESTADO_BADGE_CLASS = {
  borrador: "bg-slate-100 text-slate-700",
  enviada: "bg-primary-100 text-primary-700",
  aprobada: "bg-success-100 text-success-700",
  reservada: "bg-success-100 text-success-700",
  en_preparacion: "bg-warning-100 text-warning-700",
  lista_despacho: "bg-warning-100 text-warning-700",
  despachada: "bg-success-100 text-success-700",
  entregada: "bg-success-100 text-success-700",
  cancelada: "bg-danger-100 text-danger-700",
  rechazada: "bg-danger-100 text-danger-700",
};

// Version solida (no bg-*-100) del mismo color por estado, para barras/graficos.
// Clases completas y literales a proposito: Tailwind escanea el codigo fuente
// buscando nombres de clase completos, no los arma a partir de strings
// concatenados/reemplazados en tiempo de ejecucion.
export const ESTADO_BARRA_CLASS = {
  borrador: "bg-slate-400",
  enviada: "bg-primary-500",
  aprobada: "bg-success-500",
  reservada: "bg-success-500",
  en_preparacion: "bg-warning-500",
  lista_despacho: "bg-warning-500",
  despachada: "bg-success-500",
  entregada: "bg-success-500",
  cancelada: "bg-danger-500",
  rechazada: "bg-danger-500",
};
