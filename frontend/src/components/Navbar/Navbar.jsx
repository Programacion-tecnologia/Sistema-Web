import Button from "../Button/Button";
import { useAuth } from "../../hooks/useAuth";

export default function Navbar({ onToggleSidebar }) {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.nombre || user?.email || "Usuario";

  return (
    <header className="h-16 shrink-0 bg-primary-700 text-white flex items-center justify-between px-4 sm:px-6 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Botón de menú: solo en móvil/tablet (en desktop el sidebar es fijo). */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Abrir menú"
          className="lg:hidden -ml-1 flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <h1 className="text-lg sm:text-xl font-bold tracking-tight">System Web</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <span className="hidden sm:inline text-sm text-primary-100">
          Bienvenido, <span className="font-semibold text-white">{displayName}</span>
        </span>

        <Button variant="ghost" size="sm" onClick={signOut}>
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
