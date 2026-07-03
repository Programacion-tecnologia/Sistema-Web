import { supabase } from "./supabaseClient";

export async function listCategorias() {
  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .order("nombre");

  if (error) throw error;
  return data;
}

export async function findOrCreateCategoria(nombre) {
  const nombreLimpio = nombre.trim();

  const { data: existente, error: selectError } = await supabase
    .from("categorias")
    .select("*")
    .ilike("nombre", nombreLimpio)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existente) return existente;

  const { data: creada, error: insertError } = await supabase
    .from("categorias")
    .insert({ nombre: nombreLimpio })
    .select()
    .single();

  if (insertError) throw insertError;
  return creada;
}
