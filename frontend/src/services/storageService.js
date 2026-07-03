import { supabase } from "./supabaseClient";

const BUCKET = "productos";

function extensionFromFileName(fileName) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : "jpg";
}

export async function uploadProductoFoto(productoId, file) {
  const path = `${productoId}.${extensionFromFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  // Cache-busting: el path es siempre el mismo (upsert), así que sin esto
  // el navegador podría seguir mostrando la foto anterior tras reemplazarla.
  return `${data.publicUrl}?v=${Date.now()}`;
}
