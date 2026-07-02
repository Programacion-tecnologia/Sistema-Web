export default function Sidebar() {

    const menu = [

        "Dashboard",
        "Inventario",
        "Productos",
        "Compras",
        "Ventas",
        "Clientes",
        "Proveedores",
        "Cotizaciones",
        "Scanner",
        "Reportes",
        "Configuración"

    ];

    return (

        <aside className="w-64 h-[calc(100vh-64px)] bg-slate-900 text-white">

            <div className="p-5 border-b border-slate-700">

                <h2 className="text-xl font-bold">

                    Menú

                </h2>

            </div>

            <nav className="p-3">

                {

                    menu.map((item) => (

                        <button

                            key={item}

                            className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-700 transition mb-1"

                        >

                            {item}

                        </button>

                    ))

                }

            </nav>

        </aside>

    );

}