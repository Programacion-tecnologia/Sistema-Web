import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listGuias } from "../../services/guiasService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { numeroGuia } from "../../utils/guiaImprimible";

const PUEDE_EMITIR = [ROLES.ADMIN, ROLES.GERENCIA, ROLES.VENTAS, ROLES.ALMACEN];

export default function GuiasRemision() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeEmitir = PUEDE_EMITIR.includes(rol);

  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    listGuias()
      .then(setGuias)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Guías de remisión</h2>
        {puedeEmitir && (
          <Link to="/guias/nueva">
            <Button>Nueva guía</Button>
          </Link>
        )}
      </div>

      <Card className="mt-6 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando guías...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && guias.length === 0 && (
          <p className="p-6 text-sm text-slate-500">Todavía no hay guías de remisión emitidas.</p>
        )}

        {!loading && !error && guias.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Emisión</th>
                <th className="px-4 py-3 font-medium">Destinatario</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {guias.map((g) => (
                <tr
                  key={g.id}
                  onClick={() => navigate(`/guias/${g.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{numeroGuia(g)}</td>
                  <td className="px-4 py-3 text-slate-600">{g.fecha_emision}</td>
                  <td className="px-4 py-3 text-slate-600">{g.destinatario_nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{g.motivo_traslado}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        g.estado === "anulada"
                          ? "bg-danger-100 text-danger-700"
                          : "bg-success-100 text-success-700"
                      }`}
                    >
                      {g.estado === "anulada" ? "Anulada" : "Emitida"}
                    </span>
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
