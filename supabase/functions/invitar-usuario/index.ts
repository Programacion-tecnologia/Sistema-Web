// Rios System: invita un usuario nuevo por email con un rol determinado.
// Solo un admin puede llamar esta funcion (se verifica adentro, nunca
// confiando en el frontend). Usa la service_role key, que SOLO existe aca
// como variable de entorno del lado del servidor - nunca se envia al
// navegador. Se despliega pegando este archivo en el Dashboard de Supabase
// (Project > Edge Functions > New function > "invitar-usuario").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLES_VALIDOS = ["admin", "gerencia", "ventas", "almacen"];

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

    // Cliente "como el usuario que llama": respeta su JWT y su RLS real,
    // para verificar quien es sin poder ser falseado desde el frontend.
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
      return new Response(JSON.stringify({ error: "Solo un administrador puede invitar usuarios" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, rol } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Falta el email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return new Response(JSON.stringify({ error: `Rol invalido: ${rol}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recien aca se usa la service_role key, y solo despues de confirmar
    // que quien llama es admin.
    const clienteAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await clienteAdmin.auth.admin.inviteUserByEmail(email, {
      data: { rol },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data }), {
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
