import { supabase } from "./supabaseClient";

export async function listClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nombre");

  if (error) throw error;
  return data;
}

export async function getCliente(id) {
  const { data, error } = await supabase.from("clientes").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createCliente(payload) {
  const { data, error } = await supabase.from("clientes").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCliente(id, payload) {
  const { data, error } = await supabase.from("clientes").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getHistorialCliente(clienteId) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("id, estado, moneda, created_at, items:cotizacion_items(cantidad, precio_unitario)")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Fila liviana por cotizacion (sin items) para que Clientes.jsx calcule
// cantidad de cotizaciones + ultima actividad por cliente en una sola query,
// en vez de una consulta por cliente (N+1).
export async function listActividadCotizacionesPorCliente() {
  const { data, error } = await supabase.from("cotizaciones").select("cliente_id, created_at");
  if (error) throw error;
  return data;
}

/**
 * @param {string} nombre
 * @param {string} [rucDni] - opcional (ej. sugerido por la importacion de PDF).
 *   Si el cliente ya existe y ya tiene un ruc_dni cargado, nunca se pisa con
 *   este valor; solo se completa cuando estaba vacio.
 */
export async function findOrCreateCliente(nombre, rucDni) {
  const nombreLimpio = nombre.trim();
  const rucDniLimpio = rucDni?.trim() || null;

  const { data: existente, error: selectError } = await supabase
    .from("clientes")
    .select("*")
    .ilike("nombre", nombreLimpio)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existente) {
    if (rucDniLimpio && !existente.ruc_dni) {
      return updateCliente(existente.id, { ruc_dni: rucDniLimpio });
    }
    return existente;
  }

  const { data: creado, error: insertError } = await supabase
    .from("clientes")
    .insert({ nombre: nombreLimpio, ruc_dni: rucDniLimpio })
    .select()
    .single();

  if (insertError) throw insertError;
  return creado;
}
