export const UMBRAL_STOCK_BAJO = 3;

export function getNivelStock(stockDisponible, umbral = UMBRAL_STOCK_BAJO) {
  if (stockDisponible <= 0) return "agotado";
  if (stockDisponible <= umbral) return "bajo";
  return "normal";
}

export const STOCK_NIVEL_CLASS = {
  agotado: "text-danger-600 font-semibold",
  bajo: "text-warning-600 font-semibold",
  normal: "text-slate-800",
};
