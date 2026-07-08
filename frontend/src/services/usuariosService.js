import { supabase } from "./supabaseClient";

export async function listarUsuarios() {
  const { data, error } = await supabase.functions.invoke("listar-usuarios");
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data;
}

export async function invitarUsuario(email, rol) {
  const { data, error } = await supabase.functions.invoke("invitar-usuario", {
    body: { email, rol },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data;
}

export async function cambiarRolUsuario(usuarioId, nuevoRol) {
  const { error } = await supabase.rpc("cambiar_rol_usuario", {
    p_usuario_id: usuarioId,
    p_nuevo_rol: nuevoRol,
  });
  if (error) throw error;
}
