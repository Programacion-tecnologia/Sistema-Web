import { NavLink } from "react-router-dom";

const MENU = [

    { path: "/", label: "Dashboard", end: true },
    { path: "/inventario", label: "Inventario" },
    { path: "/productos", label: "Productos" },
    { path: "/compras", label: "Compras" },
    { path: "/ventas", label: "Ventas" },
    { path: "/clientes", label: "Clientes" },
    { path: "/proveedores", label: "Proveedores" },
    { path: "/cotizaciones", label: "Cotizaciones" },
    { path: "/scanner", label: "Scanner" },
    { path: "/reportes", label: "Reportes" },
    { path: "/configuracion", label: "Configuración" },

];

export default function Sidebar() {

    return (

        <aside className="w-64 shrink-0 h-full overflow-y-auto bg-slate-900 text-white">

            <div className="px-5 py-4 border-b border-slate-800">

                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">

                    Menú

                </h2>

            </div>

            <nav className="p-3">

                {

                    MENU.map((item) => (

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
