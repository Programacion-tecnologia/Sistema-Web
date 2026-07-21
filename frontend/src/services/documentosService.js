import { supabase } from "./supabaseClient";

// De dónde salió el dato (lo devuelve la RPC en "fuente"): sirve para avisar
// al usuario cuándo la consulta NO gastó cuota de la API.
export const FUENTE_LABEL = {
  clientes: "Ya lo tenías cargado (no gastó consulta).",
  cache: "Desde caché (no gastó consulta).",
  api: "Consultado a SUNAT/RENIEC.",
};

// consultar_documento (0019): consulta RUC (11 díg.) o DNI (8 díg.) a decolecta
// del lado del servidor (el token no vive en el frontend). Autodetecta el tipo
// por la longitud. Devuelve { tipo, numero, nombre, direccion, estado }.
export async function consultarDocumento(numero) {
  const limpio = String(numero ?? "").replace(/\D/g, "");
  const tipo = limpio.length === 11 ? "ruc" : limpio.length === 8 ? "dni" : null;
  if (!tipo) {
    throw new Error("Ingresá un RUC (11 dígitos) o DNI (8 dígitos).");
  }

  const { data, error } = await supabase.rpc("consultar_documento", {
    p_tipo: tipo,
    p_numero: limpio,
  });
  if (error) throw error;
  return data;
}
