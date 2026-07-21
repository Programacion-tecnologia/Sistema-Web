import { supabase } from "./supabaseClient";

const BUCKET = "empresa";

// La configuración de empresa es una fila única (id = 1, sembrada en 0018).
export async function getConfiguracionEmpresa() {
  const { data, error } = await supabase
    .from("configuracion_empresa")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateConfiguracionEmpresa(payload) {
  const { data, error } = await supabase
    .from("configuracion_empresa")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// Sube el logo o la tira de marcas al bucket 'empresa'. tipo = 'logo' | 'marcas'.
// Path fijo por tipo (upsert) + cache-busting, igual que las fotos de producto.
export async function uploadBranding(tipo, file) {
  const ext = (/\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1] ?? "png").toLowerCase();
  const path = `${tipo}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
