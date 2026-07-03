const formatters = {
  PEN: new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }),
  USD: new Intl.NumberFormat("es-PE", { style: "currency", currency: "USD" }),
};

export function formatearPrecio(valor, moneda) {
  return (formatters[moneda] ?? formatters.PEN).format(valor);
}
