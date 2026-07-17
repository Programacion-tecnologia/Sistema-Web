import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Sidebar from "../components/Sidebar/Sidebar";
import { scrollPositions } from "../utils/scrollPositions";

export default function MainLayout() {
  const mainRef = useRef(null);
  const contenidoRef = useRef(null);
  const location = useLocation();

  // Al volver a una ruta ya visitada (ej. "Cancelar" en el detalle de un
  // producto de vuelta a la lista), restaura el scroll donde estaba en vez
  // de dejarlo arriba. El contenido de la pagina destino puede seguir
  // creciendo un momento (fetch en curso) despues del primer intento -  un
  // ResizeObserver reintenta hasta que ya no haga falta recortar.
  useLayoutEffect(() => {
    const main = mainRef.current;
    const contenido = contenidoRef.current;
    if (!main || !contenido) return;

    const objetivo = scrollPositions.get(location.pathname) ?? 0;
    main.scrollTop = objetivo;

    const observer = new ResizeObserver(() => {
      if (main.scrollTop < objetivo) {
        main.scrollTop = objetivo;
      }
    });
    observer.observe(contenido);

    return () => observer.disconnect();
  }, [location.pathname]);

  const handleScroll = () => {
    if (mainRef.current) {
      scrollPositions.set(location.pathname, mainRef.current.scrollTop);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-surface">

      <Navbar />

      <div className="flex flex-1 min-h-0">

        <Sidebar />

        <main ref={mainRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          <div ref={contenidoRef} className="p-8">
            <Outlet />
          </div>
        </main>

      </div>

    </div>
  );
}
