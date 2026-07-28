import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import { getConfiguracionEmpresa } from "../../services/configuracionService";
import { MENU_ICONS } from "./menuIcons";

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
  { path: "/ofertas", label: "Ofertas" },
  { path: "/scanner", label: "Scanner", roles: [ROLES.ALMACEN, ROLES.GERENCIA, ROLES.ADMIN] },
  { path: "/codigos-barras", label: "Códigos de barras", roles: [ROLES.ADMIN, ROLES.GERENCIA] },
  { path: "/reportes", label: "Reportes", roles: [ROLES.ADMIN, ROLES.GERENCIA] },
  { path: "/usuarios", label: "Usuarios", roles: [ROLES.ADMIN] },
  { path: "/configuracion", label: "Configuración" },
];

export default function Sidebar({ abierto, onCerrar }) {
  const { rol } = useAuth();
  const menuVisible = MENU.filter((item) => !item.roles || item.roles.includes(rol));

  // Logo real de la empresa (Configuración). Se pide una vez por sesión.
  const [logoUrl, setLogoUrl] = useState(null);
  useEffect(() => {
    getConfiguracionEmpresa()
      .then((cfg) => setLogoUrl(cfg?.logo_url ?? null))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Fondo oscuro: solo en móvil, cuando el cajón está abierto. */}
      {abierto && (
        <div className="fixed inset-0 z-30 bg-slate-900/60 lg:hidden" onClick={onCerrar} aria-hidden="true" />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 flex w-64 shrink-0 h-full flex-col bg-slate-900 text-white transition-transform duration-200 ease-out lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca: logo de la empresa en una caja blanca (se ve sobre el sidebar
            oscuro sin importar los colores del PNG). */}
        <div className="flex items-center gap-2 border-b border-slate-800 p-3">
          <div className="flex min-h-[46px] flex-1 items-center justify-center rounded-lg bg-white px-3 py-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Rios Performance" className="h-9 max-w-full object-contain" />
            ) : (
              <span className="text-base font-extrabold tracking-tight text-slate-900">
                Rios <span className="text-primary-600">Performance</span>
              </span>
            )}
          </div>
          {/* Cerrar: solo en móvil. */}
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar menú"
            className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {menuVisible.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onCerrar}
              className={({ isActive }) =>
                `flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg transition mb-0.5 text-sm font-medium ${
                  isActive
                    ? "bg-primary-600 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {MENU_ICONS[item.path]}
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
