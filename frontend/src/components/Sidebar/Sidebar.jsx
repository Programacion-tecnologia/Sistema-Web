import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";

// "roles" ausente = visible para cualquier rol logueado. Solo se restringen
// los modulos donde eso realmente importa hoy (Scanner, Usuarios, Reportes).
const MENU = [
  { path: "/", label: "Dashboard", end: true },
  { path: "/inventario", label: "Inventario" },
  { path: "/productos", label: "Productos" },
  { path: "/compras", label: "Compras" },
  { path: "/ventas", label: "Ventas" },
  { path: "/caja", label: "Caja" },
  { path: "/guias", label: "Guías de remisión" },
  { path: "/clientes", label: "Clientes" },
  { path: "/proveedores", label: "Proveedores" },
  { path: "/cotizaciones", label: "Cotizaciones" },
  { path: "/scanner", label: "Scanner", roles: [ROLES.ALMACEN, ROLES.GERENCIA, ROLES.ADMIN] },
  { path: "/reportes", label: "Reportes", roles: [ROLES.ADMIN, ROLES.GERENCIA] },
  { path: "/usuarios", label: "Usuarios", roles: [ROLES.ADMIN] },
  { path: "/configuracion", label: "Configuración" },
];

export default function Sidebar({ abierto, onCerrar }) {
  const { rol } = useAuth();
  const menuVisible = MENU.filter((item) => !item.roles || item.roles.includes(rol));

  return (
    <>
      {/* Fondo oscuro: solo en móvil, cuando el cajón está abierto. */}
      {abierto && (
        <div className="fixed inset-0 z-30 bg-slate-900/60 lg:hidden" onClick={onCerrar} aria-hidden="true" />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 h-full overflow-y-auto bg-slate-900 text-white transition-transform duration-200 ease-out lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Menú</h2>
          {/* Cerrar: solo en móvil. */}
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar menú"
            className="lg:hidden -mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="p-3">
          {menuVisible.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onCerrar}
              className={({ isActive }) =>
                `block w-full text-left px-4 py-3 rounded-lg transition mb-1 text-sm font-medium ${
                  isActive
                    ? "bg-primary-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
