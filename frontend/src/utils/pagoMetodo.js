// Métodos de pago aceptados (deben coincidir con el check de venta_pagos.metodo
// en la migración 0016).
export const METODOS_PAGO = [
  { valor: "efectivo", label: "Efectivo" },
  { valor: "tarjeta", label: "Tarjeta" },
  { valor: "transferencia", label: "Transferencia" },
  { valor: "yape_plin", label: "Yape / Plin" },
];

export const METODO_PAGO_LABEL = Object.fromEntries(METODOS_PAGO.map((m) => [m.valor, m.label]));
