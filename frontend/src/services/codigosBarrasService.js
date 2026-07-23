import { supabase } from "./supabaseClient";

// Asigna un código puntual (escaneado/tipeado) a un producto. Falla si el
// código ya pertenece a otro producto (unicidad). Devuelve el código guardado.
export async function asignarCodigoBarras(productoId, codigo) {
  const { data, error } = await supabase.rpc("asignar_codigo_barras", {
    p_producto_id: productoId,
    p_codigo: codigo,
  });
  if (error) throw error;
  return data;
}

// Genera un EAN-13 único y lo asigna al producto. Devuelve el código generado.
export async function generarCodigoBarras(productoId) {
  const { data, error } = await supabase.rpc("generar_codigo_barras", {
    p_producto_id: productoId,
  });
  if (error) throw error;
  return data;
}

// Asigna un EAN-13 a TODOS los productos sin código. Devuelve cuántos generó.
export async function generarCodigosFaltantes() {
  const { data, error } = await supabase.rpc("generar_codigos_barras_faltantes");
  if (error) throw error;
  return data;
}
