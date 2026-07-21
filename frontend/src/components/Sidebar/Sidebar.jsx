import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";

// "roles" ausente = visible para cualquier rol logueado. Solo se restringen
// los modulos donde eso realmente importa hoy (Scanner, Usuarios). Compras y
// Proveedores se ven abiertos (igual que Cotizaciones): el listado es de
// lectura abierta por RLS, la creacion/edicion se restringe adentro de cada
// pantalla (Admin/Gerencia). Los modulos todavia placeholder (Ventas,
// Reportes, etc.) tampoco tienen todavia una razon de negocio para
// ocultarse por rol.
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

export default function Sidebar() {
    const { rol } = useAuth();
    const menuVisible = MENU.filter((item) => !item.roles || item.roles.includes(rol));

    return (

        <aside className="w-64 shrink-0 h-full overflow-y-auto bg-slate-900 text-white">

            <div className="px-5 py-4 border-b border-slate-800">

                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">

                    Menú

                </h2>

            </div>

            <nav className="p-3">

                {

                    menuVisible.map((item) => (

                        <NavLink

                            key={item.path}

                            to={item.path}

                            end={item.end}

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

                    ))

                }

            </nav>

        </aside>

    );

}
