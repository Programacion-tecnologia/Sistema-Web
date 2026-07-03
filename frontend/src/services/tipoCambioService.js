const ENDPOINT = "https://open.er-api.com/v6/latest/USD";

export async function obtenerTipoCambioReferencial() {
  const response = await fetch(ENDPOINT);
  if (!response.ok) {
    throw new Error("No se pudo consultar el tipo de cambio de referencia.");
  }

  const data = await response.json();
  if (data.result !== "success" || !data.rates?.PEN) {
    throw new Error("El tipo de cambio de referencia no está disponible en este momento.");
  }

  return {
    valor: data.rates.PEN,
    fecha: data.time_last_update_utc,
  };
}
