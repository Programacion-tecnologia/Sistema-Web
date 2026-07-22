import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCotizacionesReservadas } from "../../services/scannerService";
import Card from "../../components/Card/Card";

export default function Scanner() {
  const navigate = useNavigate();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    listCotizacionesReservadas()
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

  return (
    <>
      <h2 className="text-3xl font-bold">Scanner</h2>
      <p className="mt-1 text-sm text-slate-500">
        Cotizaciones con stock reservado, listas para verificar y despachar.
      </p>

      <Card className="mt-6 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando cotizaciones...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && cotizaciones.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            No hay cotizaciones esperando despacho por el momento.
          </p>
        )}

        {/* Móvil: tarjetas apiladas. */}
        {!loading && !error && cotizaciones.length > 0 && (
          <div className="divide-y divide-slate-100 lg:hidden">
            {cotizaciones.map((cotizacion) => (
              <button
                key={cotizacion.id}
                type="button"
                onClick={() => navigate(`/scanner/${cotizacion.id}`)}
                className="block w-full px-4 py-3 text-left hover:bg-slate-50"
              >
                <p className="font-medium text-slate-800 truncate">{cotizacion.cliente?.nombre ?? "—"}</p>
                <p className="mt-0.5 text-xs text-slate-500 truncate">
                  {cotizacion.vendedor?.nombre ?? "—"} · Reservada{" "}
                  {new Date(cotizacion.created_at).toLocaleDateString("es-PE")}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Desktop: tabla completa. */}
        {!loading && !error && cotizaciones.length > 0 && (
          <table className="hidden w-full text-sm lg:table">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Reservada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cotizaciones.map((cotizacion) => (
                <tr
                  key={cotizacion.id}
                  onClick={() => navigate(`/scanner/${cotizacion.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {cotizacion.cliente?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{cotizacion.vendedor?.nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(cotizacion.created_at).toLocaleDateString("es-PE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
