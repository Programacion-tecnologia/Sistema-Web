import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Se carga el perfil (nombre + rol) por separado de la sesion: rol es la
  // fuente de verdad para permisos (puede cambiar despues del login via el
  // modulo Usuarios), a diferencia de user_metadata que solo se fija en el
  // signup/invitacion y puede quedar desactualizado.
  useEffect(() => {
    if (session === undefined) return;

    let activo = true;

    const cargarPerfil = session?.user
      ? supabase
          .from("profiles")
          .select("nombre, rol")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => data ?? null)
      : Promise.resolve(null);

    cargarPerfil
      .then((data) => {
        if (activo) setProfile(data);
      })
      .finally(() => {
        if (activo) setProfileLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [session]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    rol: profile?.rol ?? null,
    loading: session === undefined || profileLoading,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
