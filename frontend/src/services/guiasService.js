import { supabase } from "./supabaseClient";

const GUIA_SELECT =
  "*, creador:profiles!creada_por(id, nombre), cliente:clientes(id, nombre, ruc_dni, telefono), items:guia_remision_items(id, producto_id, codigo, descripcion, cantidad, unidad)";

// crear_guia_remision (0018): RPC atómica que toma el correlativo de la serie y
// crea la guía + items. No devuelve la guía completa (solo id/serie/correlativo),
// así que se refetch como en compras/ventas.
export async function crearGuiaRemision(cabecera, items) {
  const { data, error } = await supabase.rpc("crear_guia_remision", {
    p_cabecera: cabecera,
    p_items: items,
  });
  if (error) throw error;
  return data; // { guia_id, serie, correlativo }
}

export async function listGuias() {
  const { data, error } = await supabase
    .from("guias_remision")
    .select(GUIA_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data;
}

export async function getGuia(id) {
  const { data, error } = await supabase.from("guias_remision").select(GUIA_SELECT).eq("id", id).single();
  if (error) throw error;
  return data;
}

// Anular: UPDATE directo permitido por la policy (Admin/Gerencia, de 'emitida'
// a 'anulada'). Si ya no está emitida, la policy no matchea ninguna fila.
export async function anularGuia(id) {
  const { data, error } = await supabase
    .from("guias_remision")
    .update({ estado: "anulada" })
    .eq("id", id)
    .select(GUIA_SELECT)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Esta guía ya no se puede anular.");
    }
    throw error;
  }
  return data;
}
