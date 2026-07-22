import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listClientes, listActividadCotizacionesPorCliente } from "../../services/clientesService";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

export default function Clientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;

    Promise.all([listClientes(), listActividadCotizacionesPorCliente()])
      .then(([clientesData, actividadData]) => {
        if (!activo) return;
        setClientes(clientesData);
        setActividad(actividadData);
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, []);

  const resumenPorCliente = useMemo(() => {
    const resumen = new Map();
    for (const cotizacion of actividad) {
      const actual = resumen.get(cotizacion.cliente_id) ?? { cantidad: 0, ultima: null };
      actual.cantidad += 1;
      if (!actual.ultima || cotizacion.created_at > actual.ultima) {
        actual.ultima = cotizacion.created_at;
      }
      resumen.set(cotizacion.cliente_id, actual);
    }
    return resumen;
  }, [actividad]);

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter(
      (cliente) =>
        cliente.nombre.toLowerCase().includes(termino) ||
        (cliente.ruc_dni ?? "").toLowerCase().includes(termino)
    );
  }, [clientes, busqueda]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Clientes</h2>

        <Link to="/clientes/nuevo">
          <Button>Nuevo cliente</Button>
        </Link>
      </div>

      <div className="mt-6 max-w-sm">
        <input
          type="search"
          placeholder="Buscar por nombre o RUC/DNI..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando clientes...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && clientesFiltrados.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {clientes.length === 0
              ? "Todavía no hay clientes. Crea uno nuevo."
              : "Ningún cliente coincide con la búsqueda."}
          </p>
        )}

        {/* Móvil: tarjetas apiladas. */}
        {!loading && !error && clientesFiltrados.length > 0 && (
          <div className="divide-y divide-slate-100 lg:hidden">
            {clientesFiltrados.map((cliente) => {
              const resumen = resumenPorCliente.get(cliente.id);
              return (
                <button
                  key={cliente.id}
                  type="button"
                  onClick={() => navigate(`/clientes/${cliente.id}`)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{cliente.nombre}</p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {[cliente.ruc_dni, cliente.telefono].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {resumen?.ultima && (
                      <p className="text-xs text-slate-400">
                        Última: {new Date(resumen.ultima).toLocaleDateString("es-PE")}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">
                    {resumen?.cantidad ?? 0} cotiz.
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop: tabla completa. */}
        {!loading && !error && clientesFiltrados.length > 0 && (
          <table className="hidden w-full text-sm lg:table">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">RUC/DNI</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium text-right">Cotizaciones</th>
                <th className="px-4 py-3 font-medium">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientesFiltrados.map((cliente) => {
                const resumen = resumenPorCliente.get(cliente.id);
                return (
                  <tr
                    key={cliente.id}
                    onClick={() => navigate(`/clientes/${cliente.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{cliente.nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{cliente.ruc_dni ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{cliente.telefono ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{resumen?.cantidad ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {resumen?.ultima ? new Date(resumen.ultima).toLocaleDateString("es-PE") : "—"}
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
