import Button from "../Button/Button";
import { useAuth } from "../../hooks/useAuth";

export default function Navbar() {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.nombre || user?.email || "Usuario";

  return (
    <header className="h-16 shrink-0 bg-primary-700 text-white flex items-center justify-between px-6 shadow-sm">
      <h1 className="text-xl font-bold tracking-tight">
        System Web
      </h1>

      <div className="flex items-center gap-4">
        <span className="text-sm text-primary-100">
          Bienvenido, <span className="font-semibold text-white">{displayName}</span>
        </span>

        <Button variant="ghost" size="sm" onClick={signOut}>
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
