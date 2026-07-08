import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/**
 * Igual que ProtectedRoute, pero ademas exige que el rol del usuario este en
 * `roles`. Protege la URL en si (no solo esconder el link del Sidebar) para
 * rutas sensibles como Scanner o Usuarios.
 */
export default function RoleProtectedRoute({ roles }) {
  const { rol, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    );
  }

  if (!roles.includes(rol)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
