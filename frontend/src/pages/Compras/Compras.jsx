import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listCompras } from "../../services/comprasService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { ESTADO_LABEL, ESTADO_BADGE_CLASS } from "../../utils/compraEstado";
import { formatearPrecio } from "../../utils/currency";

const PUEDE_CREAR = [ROLES.ADMIN, ROLES.GERENCIA];

function calcularTotal(items) {
  return items.reduce((total, item) => total + item.cantidad * item.costo_unitario, 0);
}

export default function Compras() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeCrear = PUEDE_CREAR.includes(rol);

  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;

    listCompras()
      .then((data) => {
        if (activo) setCompras(data);
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

  const comprasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return compras;
    return compras.filter((compra) => (compra.proveedor?.nombre ?? "").toLowerCase().includes(termino));
  }, [compras, busqueda]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Compras</h2>

        {puedeCrear && (
          <div className="flex items-center gap-3">
            <Link to="/compras/importar">
              <Button variant="secondary">Importar Excel</Button>
            </Link>
            <Link to="/compras/nuevo">
              <Button>Nueva compra</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 max-w-sm">
        <input
          type="search"
          placeholder="Buscar por proveedor..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando compras...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && comprasFiltradas.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {compras.length === 0
              ? "Todavía no hay compras. Crea una nueva."
              : "Ninguna compra coincide con la búsqueda."}
          </p>
        )}

        {!loading && !error && comprasFiltradas.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Creada por</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Creada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comprasFiltradas.map((compra) => (
                <tr
                  key={compra.id}
                  onClick={() => navigate(`/compras/${compra.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{compra.proveedor?.nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{compra.creador?.nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE_CLASS[compra.estado]}`}
                    >
                      {ESTADO_LABEL[compra.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatearPrecio(calcularTotal(compra.items), compra.moneda)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(compra.created_at).toLocaleDateString("es-PE")}
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
