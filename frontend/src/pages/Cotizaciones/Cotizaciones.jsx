import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCotizaciones } from "../../services/cotizacionesService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { ESTADO_LABEL, ESTADO_BADGE_CLASS } from "../../utils/cotizacionEstado";
import { formatearPrecio } from "../../utils/currency";

const PUEDE_CREAR_COTIZACION = [ROLES.VENTAS, ROLES.ADMIN, ROLES.GERENCIA];

function calcularTotal(items) {
  return items.reduce((total, item) => total + item.cantidad * item.precio_unitario, 0);
}

function vencimientoLabel(cotizacion) {
  if (!cotizacion.vence_en || !["borrador", "enviada"].includes(cotizacion.estado)) return null;

  const horasRestantes = Math.round((new Date(cotizacion.vence_en) - Date.now()) / (1000 * 60 * 60));
  return horasRestantes > 0 ? `Vence en ${horasRestantes}h` : "Vencida";
}

export default function Cotizaciones() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeCrear = PUEDE_CREAR_COTIZACION.includes(rol);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;

    listCotizaciones()
      .then((data) => {
        if (activo) setCotizaciones(data);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  const cotizacionesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return cotizaciones;
    return cotizaciones.filter((cotizacion) =>
      (cotizacion.cliente?.nombre ?? "").toLowerCase().includes(termino)
    );
  }, [cotizaciones, busqueda]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl sm:text-3xl font-bold">Cotizaciones</h2>

        {puedeCrear && (
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/cotizaciones/importar">
              <Button variant="secondary" size="sm">Agregar manualmente</Button>
            </Link>
            <Link to="/cotizaciones/nuevo">
              <Button size="sm">Nueva cotización</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 max-w-sm">
        <input
          type="search"
          placeholder="Buscar por cliente..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando cotizaciones...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && cotizacionesFiltradas.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {cotizaciones.length === 0
              ? "Todavía no hay cotizaciones. Crea una nueva."
              : "Ninguna cotización coincide con la búsqueda."}
          </p>
        )}

        {/* Móvil: tarjetas compactas apiladas (sin scroll lateral). */}
        {!loading && !error && cotizacionesFiltradas.length > 0 && (
          <div className="divide-y divide-slate-100 lg:hidden">
            {cotizacionesFiltradas.map((cotizacion) => {
              const vencimiento = vencimientoLabel(cotizacion);
              return (
                <button
                  key={cotizacion.id}
                  type="button"
                  onClick={() => navigate(`/cotizaciones/${cotizacion.id}`)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {cotizacion.cliente?.nombre ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {cotizacion.vendedor?.nombre ?? "—"} ·{" "}
                      {new Date(cotizacion.created_at).toLocaleDateString("es-PE")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE_CLASS[cotizacion.estado]}`}
                      >
                        {ESTADO_LABEL[cotizacion.estado]}
                      </span>
                      {vencimiento && <span className="text-xs text-warning-600">{vencimiento}</span>}
                    </div>
                  </div>
                  <p className="shrink-0 font-semibold text-slate-800">
                    {formatearPrecio(calcularTotal(cotizacion.items), cotizacion.moneda)}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop: tabla completa. */}
        {!loading && !error && cotizacionesFiltradas.length > 0 && (
          <table className="hidden w-full text-sm lg:table">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Creada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cotizacionesFiltradas.map((cotizacion) => {
                const vencimiento = vencimientoLabel(cotizacion);

                return (
                  <tr
                    key={cotizacion.id}
                    onClick={() => navigate(`/cotizaciones/${cotizacion.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {cotizacion.cliente?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{cotizacion.vendedor?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE_CLASS[cotizacion.estado]}`}
                      >
                        {ESTADO_LABEL[cotizacion.estado]}
                      </span>
                      {vencimiento && (
                        <span className="ml-2 text-xs text-warning-600">{vencimiento}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800">
                      {formatearPrecio(calcularTotal(cotizacion.items), cotizacion.moneda)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(cotizacion.created_at).toLocaleDateString("es-PE")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
