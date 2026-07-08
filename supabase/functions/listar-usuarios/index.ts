// Rios System: lista todos los usuarios (email + nombre + rol). Solo admin.
// El email vive en auth.users (no accesible desde el cliente via la API REST
// normal) y nombre/rol viven en profiles - esta funcion cruza ambas usando
// la service_role key del lado del servidor. Se despliega igual que
// invitar-usuario (Dashboard > Edge Functions > New function).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const clienteUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const {
      data: { user },
    } = await clienteUsuario.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: perfil, error: perfilError } = await clienteUsuario
      .from("profiles")
      .select("rol")
      .eq("id", user.id)
      .single();

    if (perfilError || perfil?.rol !== "admin") {
      return new Response(JSON.stringify({ error: "Solo un administrador puede ver esta lista" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clienteAdmin = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: authData, error: authError }, { data: perfiles, error: perfilesError }] = await Promise.all([
      clienteAdmin.auth.admin.listUsers(),
      clienteAdmin.from("profiles").select("id, nombre, rol, created_at"),
    ]);

    if (authError) throw authError;
    if (perfilesError) throw perfilesError;

    const perfilesPorId = new Map(perfiles.map((p) => [p.id, p]));

    const usuarios = authData.users.map((usuarioAuth) => {
      const perfilUsuario = perfilesPorId.get(usuarioAuth.id);
      return {
        id: usuarioAuth.id,
        email: usuarioAuth.email,
        nombre: perfilUsuario?.nombre ?? usuarioAuth.email,
        rol: perfilUsuario?.rol ?? "ventas",
        created_at: perfilUsuario?.created_at ?? usuarioAuth.created_at,
      };
    });

    return new Response(JSON.stringify({ data: usuarios }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? "Error inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
