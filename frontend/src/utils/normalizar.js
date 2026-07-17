// Los codigos de referencia y nombres del catalogo se escriben de forma
// inconsistente (espacios, guiones, guion bajo, puntos, barras: "CP331BCM",
// "CP-331-BCM", "CP331BCM_CAL261BC40"). Se ignoran esos separadores para que
// buscar "cp331bcm" encuentre cualquiera de esas variantes.
const SEPARADORES = /[\s\-_./]+/g;

export function normalizarTexto(valor) {
  return (valor ?? "").toString().toLowerCase().replace(SEPARADORES, "");
}
