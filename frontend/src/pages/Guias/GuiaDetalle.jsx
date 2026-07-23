import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { anularGuia, getGuia } from "../../services/guiasService";
import { getConfiguracionEmpresa } from "../../services/configuracionService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { imprimirGuia, numeroGuia } from "../../utils/guiaImprimible";
import { compartirPorWhatsApp } from "../../utils/whatsapp";
import RotuloEnvioModal from "../../components/Guias/RotuloEnvioModal";

const PUEDE_ANULAR = [ROLES.ADMIN, ROLES.GERENCIA];

// Texto de la guía para compartir por WhatsApp.
function textoGuiaWhatsApp(guia, config) {
  const lineas = [];
  if (config?.razon_social) lineas.push(`*${config.razon_social}*`);
  lineas.push(
    `Guía de remisión ${numeroGuia(guia)}`,
    `Fecha: ${guia.fecha_emision}`,
    `Destinatario: ${guia.destinatario_nombre}`,
    `Motivo: ${guia.motivo_traslado}`,
    ""
  );
  for (const it of guia.items) {
    lineas.push(`• ${it.cantidad} ${it.unidad ?? ""} — ${it.descripcion}`);
  }
  lineas.push("", "Documento de traslado.");
  return lineas.join("\n");
}

function Dato({ label, valor }) {
  if (!valor && valor !== 0) return null;
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{valor}</dd>
    </div>
  );
}

export default function GuiaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeAnular = PUEDE_ANULAR.includes(rol);

  const [guia, setGuia] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [anulando, setAnulando] = useState(false);
  const [mostrarRotulo, setMostrarRotulo] = useState(false);

  const cargar = () => {
    setLoading(true);
    getGuia(id)
      .then(setGuia)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, [id]);
  useEffect(() => {
    getConfiguracionEmpresa().then(setConfig).catch(() => {});
  }, []);

  const handleAnular = async () => {
    if (!window.confirm("¿Anular esta guía de remisión?")) return;
    setAnulando(true);
    setError(null);
    try {
      const actualizada = await anularGuia(id);
      setGuia(actualizada);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnulando(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Cargando guía...</p>;
  if (error && !guia) return <p className="text-sm text-danger-600">{error}</p>;

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-3xl font-bold">Guía {numeroGuia(guia)}</h2>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            guia.estado === "anulada" ? "bg-danger-100 text-danger-700" : "bg-success-100 text-success-700"
          }`}
        >
          {guia.estado === "anulada" ? "Anulada" : "Emitida"}
        </span>
      </div>

      <Card className="mt-6 max-w-3xl">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Dato label="Emisión" valor={guia.fecha_emision} />
          <Dato label="Fecha de traslado" valor={guia.fecha_traslado} />
          <Dato label="Motivo" valor={guia.motivo_traslado} />
          <Dato label="Destinatario" valor={guia.destinatario_nombre} />
          <Dato label="RUC/DNI" valor={guia.destinatario_doc} />
          <Dato label="Dirección" valor={guia.destinatario_direccion} />
          <Dato label="Punto de partida" valor={guia.punto_partida} />
          <Dato label="Punto de llegada" valor={guia.punto_llegada} />
          <Dato label="Modalidad" valor={guia.modalidad_transporte} />
          <Dato label="Transportista" valor={guia.transportista_nombre} />
          <Dato label="Conductor" valor={guia.conductor_nombre} />
          <Dato label="Placa" valor={guia.placa} />
          <Dato label="Peso bruto (kg)" valor={guia.peso_bruto} />
          <Dato label="N° de bultos" valor={guia.num_bultos} />
          <Dato label="Emitida por" valor={guia.creador?.nombre} />
        </dl>

        {/* Móvil: cada ítem como bloque (descripción a todo el ancho + código/cantidad/U.M.). */}
        <div className="mt-6 divide-y divide-slate-100 lg:hidden">
          {guia.items.map((it) => (
            <div key={it.id} className="py-2">
              <p className="text-sm font-medium text-slate-800">{it.descripcion}</p>
              <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-0.5 text-xs text-slate-500">
                <span>Código: {it.codigo ?? "—"}</span>
                <span>U.M.: {it.unidad ?? "—"}</span>
                <span className="ml-auto text-sm font-medium text-slate-800">
                  {it.cantidad}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: tabla. */}
        <table className="mt-6 hidden w-full text-sm lg:table">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-2 font-medium">Descripción</th>
              <th className="py-2 font-medium">Código</th>
              <th className="py-2 font-medium text-right">Cantidad</th>
              <th className="py-2 font-medium">U.M.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {guia.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2 text-slate-800">{it.descripcion}</td>
                <td className="py-2 text-slate-600">{it.codigo ?? "—"}</td>
                <td className="py-2 text-right text-slate-600">{it.cantidad}</td>
                <td className="py-2 text-slate-600">{it.unidad ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {guia.observaciones && (
          <p className="mt-4 text-sm text-slate-600">
            <span className="text-slate-500">Observaciones:</span> {guia.observaciones}
          </p>
        )}

        {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <Button variant="secondary" onClick={() => imprimirGuia(guia, config)}>
            Imprimir
          </Button>
          <Button variant="secondary" onClick={() => setMostrarRotulo(true)}>
            Rótulo de envío
          </Button>
          <Button
            variant="success"
            onClick={() => compartirPorWhatsApp(guia.cliente?.telefono, textoGuiaWhatsApp(guia, config))}
          >
            WhatsApp
          </Button>
          {puedeAnular && guia.estado === "emitida" && (
            <Button variant="danger" disabled={anulando} onClick={handleAnular}>
              {anulando ? "Anulando..." : "Anular"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/guias")}>
            Volver
          </Button>
        </div>
      </Card>

      {mostrarRotulo && (
        <RotuloEnvioModal guia={guia} config={config} onCerrar={() => setMostrarRotulo(false)} />
      )}
    </>
  );
}
