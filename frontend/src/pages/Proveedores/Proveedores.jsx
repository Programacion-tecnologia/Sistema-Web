import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listProveedores, listActividadComprasPorProveedor } from "../../services/proveedoresService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const PUEDE_ESCRIBIR = [ROLES.ADMIN, ROLES.GERENCIA];

export default function Proveedores() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeEscribir = PUEDE_ESCRIBIR.includes(rol);

  const [proveedores, setProveedores] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;

    Promise.all([listProveedores(), listActividadComprasPorProveedor()])
      .then(([proveedoresData, actividadData]) => {
        if (!activo) return;
        setProveedores(proveedoresData);
        setActividad(actividadData);
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, []);

  const resumenPorProveedor = useMemo(() => {
    const resumen = new Map();
    for (const compra of actividad) {
      const actual = resumen.get(compra.proveedor_id) ?? { cantidad: 0, ultima: null };
      actual.cantidad += 1;
      if (!actual.ultima || compra.created_at > actual.ultima) {
        actual.ultima = compra.created_at;
      }
      resumen.set(compra.proveedor_id, actual);
    }
    return resumen;
  }, [actividad]);

  const proveedoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return proveedores;
    return proveedores.filter(
      (proveedor) =>
        proveedor.nombre.toLowerCase().includes(termino) ||
        (proveedor.ruc ?? "").toLowerCase().includes(termino)
    );
  }, [proveedores, busqueda]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Proveedores</h2>

        {puedeEscribir && (
          <Link to="/proveedores/nuevo">
            <Button>Nuevo proveedor</Button>
          </Link>
        )}
      </div>

      <div className="mt-6 max-w-sm">
        <input
          type="search"
          placeholder="Buscar por razón social o RUC..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando proveedores...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && proveedoresFiltrados.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {proveedores.length === 0
              ? "Todavía no hay proveedores. Crea uno nuevo."
              : "Ningún proveedor coincide con la búsqueda."}
          </p>
        )}

        {/* Móvil: tarjetas apiladas. */}
        {!loading && !error && proveedoresFiltrados.length > 0 && (
          <div className="divide-y divide-slate-100 lg:hidden">
            {proveedoresFiltrados.map((proveedor) => {
              const resumen = resumenPorProveedor.get(proveedor.id);
              return (
                <button
                  key={proveedor.id}
                  type="button"
                  onClick={() => navigate(`/proveedores/${proveedor.id}`)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{proveedor.nombre}</p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {[proveedor.ruc, proveedor.contacto, proveedor.telefono].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                    {resumen?.ultima && (
                      <p className="text-xs text-slate-400">
                        Última: {new Date(resumen.ultima).toLocaleDateString("es-PE")}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">{resumen?.cantidad ?? 0} compras</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop: tabla completa. */}
        {!loading && !error && proveedoresFiltrados.length > 0 && (
          <table className="hidden w-full text-sm lg:table">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Razón social</th>
                <th className="px-4 py-3 font-medium">RUC</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium text-right">Compras</th>
                <th className="px-4 py-3 font-medium">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proveedoresFiltrados.map((proveedor) => {
                const resumen = resumenPorProveedor.get(proveedor.id);
                return (
                  <tr
                    key={proveedor.id}
                    onClick={() => navigate(`/proveedores/${proveedor.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{proveedor.nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{proveedor.ruc ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{proveedor.contacto ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{proveedor.telefono ?? "—"}</td>
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
