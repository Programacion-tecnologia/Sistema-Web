import { supabase } from "./supabaseClient";

export async function listClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nombre");

  if (error) throw error;
  return data;
}

export async function findOrCreateCliente(nombre) {
  const nombreLimpio = nombre.trim();

  const { data: existente, error: selectError } = await supabase
    .from("clientes")
    .select("*")
    .ilike("nombre", nombreLimpio)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existente) return existente;

  const { data: creado, error: insertError } = await supabase
    .from("clientes")
    .insert({ nombre: nombreLimpio })
    .select()
    .single();

  if (insertError) throw insertError;
  return creado;
}
