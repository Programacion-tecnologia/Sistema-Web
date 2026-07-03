export function getEstadoLinea(cantidadEscaneada, cantidadPedida) {
  if (cantidadEscaneada <= 0) return "pendiente";
  if (cantidadEscaneada < cantidadPedida) return "parcial";
  if (cantidadEscaneada === cantidadPedida) return "ok";
  return "exceso";
}

export const ESTADO_LINEA_LABEL = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  ok: "Completo",
  exceso: "Exceso",
};

export const ESTADO_LINEA_ROW_CLASS = {
  pendiente: "bg-white",
  parcial: "bg-warning-50",
  ok: "bg-success-50",
  exceso: "bg-danger-50",
};

export const ESTADO_LINEA_BADGE_CLASS = {
  pendiente: "bg-slate-100 text-slate-600",
  parcial: "bg-warning-100 text-warning-700",
  ok: "bg-success-100 text-success-700",
  exceso: "bg-danger-100 text-danger-700",
};
