import { useEffect, useState } from "react";
import {
  contarCotizacionesPendientes,
  contarCotizacionesPorVencer,
  listarAlertasStock,
  obtenerResumenComercial,
  listarDespachosRecientes,
  contarCotizacionesPorEstado,
  calcularValorInventario,
  listarActividadReciente,
  obtenerVentasPorMes,
} from "../../services/dashboardService";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import StatTile from "../../components/Dashboard/StatTile";
import VentasPorMesChart from "../../components/Dashboard/VentasPorMesChart";
import Skeleton from "../../components/ui/Skeleton";
import { ESTADO_LABEL, ESTADO_BARRA_CLASS } from "../../utils/cotizacionEstado";
import { formatearPrecio } from "../../utils/currency";

// Íconos de los stat tiles (SVG de línea, heredan el color del chip).
const di = (children) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    {children}
  </svg>
);
const ICONS = {
  doc: di(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>),
  reloj: di(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4l2.5 2" /></>),
  alerta: di(<><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4M12 17h.01" /></>),
  caja: di(<><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /><path d="M3 7l9 4 9-4M12 21V11" /></>),
  dinero: di(<><path d="M12 3v18M8 7h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h7" /></>),
  camion: di(<><path d="M3 6h11v9H3z" /><path d="M14 9h3.5L21 12v3h-7" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></>),
  porcentaje: di(<><path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></>),
  ticket: di(<><path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5z" /><path d="M9 9h6M9 13h4" /></>),
};

// Solo estados que alguna funcion del sistema realmente asigna hoy (no
// incluye "aprobada": aprobar_cotizacion pasa directo a "reservada").
const ORDEN_ESTADOS = [
  "borrador",
  "enviada",
  "reservada",
  "en_preparacion",
  "lista_despacho",
  "despachada",
  "entregada",
  "cancelada",
  "rechazada",
];

function calcularTotal(items) {
  return items.reduce((total, item) => total + item.cantidad * item.precio_unitario, 0);
}

export default function Dashboard() {
  const { rol } = useAuth();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    Promise.all([
      contarCotizacionesPendientes(),
      contarCotizacionesPorVencer(),
      listarAlertasStock(),
      obtenerResumenComercial(),
      listarDespachosRecientes(),
      contarCotizacionesPorEstado(),
      calcularValorInventario(rol),
      listarActividadReciente(),
      // Tolerante a fallos: si la RPC 0024 aún no se corrió, el gráfico muestra
      // su estado vacío en vez de tumbar todo el Dashboard.
      obtenerVentasPorMes().catch(() => []),
    ])
      .then(
        ([
          pendientes,
          porVencer,
          alertasStock,
          resumenComercial,
          despachosRecientes,
          porEstado,
          valorInventario,
          actividadReciente,
          ventasPorMes,
        ]) => {
          if (!activo) return;
          setDatos({
            pendientes,
            porVencer,
            alertasStock,
            resumenComercial,
            despachosRecientes,
            porEstado,
            valorInventario,
            actividadReciente,
            ventasPorMes,
          });
        }
      )
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, [rol]);

  if (loading) {
    return (
      <>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="mt-8 h-72" />
      </>
    );
  }

  if (error) {
    return <p className="text-sm text-danger-600">{error}</p>;
  }

  const {
    pendientes,
    porVencer,
    alertasStock,
    resumenComercial,
    despachosRecientes,
    porEstado,
    valorInventario,
    actividadReciente,
    ventasPorMes,
  } = datos;

  const totalCotizaciones = Object.values(porEstado).reduce((a, b) => a + b, 0);

  return (
    <>
      <h2 className="text-3xl font-bold">Dashboard</h2>
      <p className="mt-1 text-sm text-slate-500">Resumen general del negocio.</p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Cotizaciones pendientes de aprobar"
          value={pendientes}
          variant={pendientes > 0 ? "warning" : "neutral"}
          to="/cotizaciones"
          icon={ICONS.doc}
        />
        <StatTile
          label="Por vencer (próximas 24h)"
          value={porVencer}
          variant={porVencer > 0 ? "warning" : "neutral"}
          to="/cotizaciones"
          icon={ICONS.reloj}
        />
        <StatTile
          label="Productos agotados"
          value={alertasStock.agotados.length}
          variant={alertasStock.agotados.length > 0 ? "danger" : "neutral"}
          to="/productos"
          icon={ICONS.alerta}
        />
        <StatTile
          label="Productos con stock bajo"
          value={alertasStock.bajos.length}
          variant={alertasStock.bajos.length > 0 ? "warning" : "neutral"}
          to="/productos"
          icon={ICONS.caja}
        />
      </div>

      <h3 className="mt-8 text-lg font-semibold text-slate-800">Resumen comercial del mes</h3>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Cotizado este mes"
          value={formatearPrecio(resumenComercial.montoCotizado.PEN, "PEN")}
          variant="primary"
          icon={ICONS.dinero}
          sublabel={resumenComercial.montoCotizado.USD > 0 ? formatearPrecio(resumenComercial.montoCotizado.USD, "USD") : null}
        />
        <StatTile
          label="Despachado este mes"
          value={formatearPrecio(resumenComercial.montoDespachado.PEN, "PEN")}
          variant="success"
          icon={ICONS.camion}
          sublabel={
            resumenComercial.montoDespachado.USD > 0 ? formatearPrecio(resumenComercial.montoDespachado.USD, "USD") : null
          }
        />
        <StatTile
          label="Tasa de conversión"
          value={resumenComercial.tasaConversion !== null ? `${resumenComercial.tasaConversion.toFixed(0)}%` : "—"}
          icon={ICONS.porcentaje}
          sublabel={
            resumenComercial.tasaConversion === null
              ? "Sin cotizaciones resueltas este mes"
              : "Aprobadas vs. rechazadas/canceladas"
          }
        />
        <StatTile
          label="Ticket promedio"
          value={resumenComercial.ticketPromedio.PEN !== null ? formatearPrecio(resumenComercial.ticketPromedio.PEN, "PEN") : "—"}
          icon={ICONS.ticket}
          sublabel={
            resumenComercial.ticketPromedio.USD !== null ? formatearPrecio(resumenComercial.ticketPromedio.USD, "USD") : null
          }
        />
      </div>

      <Card className="mt-8">
        <VentasPorMesChart data={ventasPorMes} />
      </Card>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Despachos recientes</h3>
          {despachosRecientes.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay despachos registrados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {despachosRecientes.map((cotizacion) => (
                <li key={cotizacion.id} className="py-2 flex items-center justify-between text-sm gap-3">
                  <span className="text-slate-700 truncate">{cotizacion.cliente?.nombre ?? "—"}</span>
                  <span className="text-slate-500 shrink-0">
                    {formatearPrecio(calcularTotal(cotizacion.items), cotizacion.moneda)}
                  </span>
                  <span className="text-slate-400 text-xs shrink-0">
                    {new Date(cotizacion.updated_at).toLocaleDateString("es-PE")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Cotizaciones por estado</h3>
          {totalCotizaciones === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay cotizaciones cargadas.</p>
          ) : (
            <div className="space-y-2">
              {ORDEN_ESTADOS.filter((estado) => porEstado[estado]).map((estado) => (
                <div key={estado} className="flex items-center gap-3">
                  <span className="w-32 text-xs text-slate-500 shrink-0">{ESTADO_LABEL[estado]}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ESTADO_BARRA_CLASS[estado]}`}
                      style={{ width: `${(porEstado[estado] / totalCotizaciones) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-slate-600">{porEstado[estado]}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {valorInventario.PEN !== null && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatTile label="Valor de inventario (PEN)" value={formatearPrecio(valorInventario.PEN, "PEN")} />
          <StatTile label="Valor de inventario (USD)" value={formatearPrecio(valorInventario.USD, "USD")} />
        </div>
      )}

      <Card className="mt-8">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Actividad reciente</h3>
        {actividadReciente.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay actividad registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {actividadReciente.map((entrada) => (
              <li key={entrada.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-700 truncate">
                  {entrada.usuario?.nombre ?? "—"} — {entrada.accion} en {entrada.tabla}
                </span>
                <span className="text-slate-400 text-xs shrink-0">
                  {new Date(entrada.created_at).toLocaleString("es-PE")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
