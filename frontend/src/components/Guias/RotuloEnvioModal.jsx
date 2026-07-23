import { useState } from "react";
import Button from "../Button/Button";
import { imprimirRotulos, descargarRotulosPDF } from "../../utils/rotuloImprimible";
import { numeroGuia } from "../../utils/guiaImprimible";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

function primerTelefono(telefonos) {
  return String(telefonos ?? "").split("/")[0].trim();
}

// Valores iniciales del rótulo tomados de la guía + configuración de la empresa.
// Todo queda editable antes de imprimir.
function valoresIniciales(guia, config) {
  return {
    destino: guia.punto_llegada || guia.destinatario_direccion || "",
    atencion: guia.destinatario_nombre || guia.cliente?.nombre || "",
    doc: guia.destinatario_doc || guia.cliente?.ruc_dni || "",
    telefono: guia.cliente?.telefono || "",
    agencia: guia.transportista_nombre || "",
    cantActual: "1",
    cantTotal: String(guia.num_bultos || 1),
    nroGuiaInt: numeroGuia(guia),
    nroGuiaAgencia: "",
    envia: config?.razon_social || "",
    enviaRuc: config?.ruc || "",
    vende: guia.creador?.nombre || "",
    vendeTel: primerTelefono(config?.telefonos),
  };
}

function Campo({ label, valor, onChange, ancho = "" }) {
  return (
    <div className={ancho}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input value={valor} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
    </div>
  );
}

export default function RotuloEnvioModal({ guia, config, onCerrar }) {
  const [datos, setDatos] = useState(() => valoresIniciales(guia, config));
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const set = (campo) => (valor) => setDatos((prev) => ({ ...prev, [campo]: valor }));

  const totalBultos = Math.max(1, Math.trunc(Number(datos.cantTotal)) || 1);

  // Un rótulo por bulto: 1/N, 2/N, ... para pegar en cada caja.
  const labelsPorBulto = () =>
    Array.from({ length: totalBultos }, (_, i) => ({
      ...datos,
      cantActual: String(i + 1),
      cantTotal: String(totalBultos),
    }));

  const imprimirUno = () => imprimirRotulos([datos], config);
  const imprimirPorBulto = () => imprimirRotulos(labelsPorBulto(), config);

  const descargarPdf = async () => {
    setGenerandoPdf(true);
    try {
      const labels = totalBultos > 1 ? labelsPorBulto() : [datos];
      const nombre = `rotulo-${String(datos.nroGuiaInt || datos.atencion || "envio").replace(/[^\w-]+/g, "_")}`;
      await descargarRotulosPDF(labels, config, nombre);
    } finally {
      setGenerandoPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-lg font-semibold text-slate-800">Rótulo de envío</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-slate-500">
            Se prellenó con los datos de la guía. Editá lo que necesites antes de imprimir (15 × 10 cm).
          </p>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-500">Destinatario</legend>
            <div className="grid grid-cols-1 gap-3">
              <Campo label="Destino (ciudad / dirección)" valor={datos.destino} onChange={set("destino")} />
              <Campo label="Atención (nombre del cliente)" valor={datos.atencion} onChange={set("atencion")} />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Nro DNI/RUC" valor={datos.doc} onChange={set("doc")} />
                <Campo label="Nro tel" valor={datos.telefono} onChange={set("telefono")} />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-500">Agencia de transporte</legend>
            <div className="grid grid-cols-1 gap-3">
              <Campo label="Agencia / courier" valor={datos.agencia} onChange={set("agencia")} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo label="Bulto N°" valor={datos.cantActual} onChange={set("cantActual")} />
                <Campo label="Total bultos" valor={datos.cantTotal} onChange={set("cantTotal")} />
                <Campo label="Nro guía int." valor={datos.nroGuiaInt} onChange={set("nroGuiaInt")} />
                <Campo label="Nro guía agencia" valor={datos.nroGuiaAgencia} onChange={set("nroGuiaAgencia")} />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-500">Remitente</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Envía (empresa)" valor={datos.envia} onChange={set("envia")} />
              <Campo label="RUC remitente" valor={datos.enviaRuc} onChange={set("enviaRuc")} />
              <Campo label="Vende (vendedor)" valor={datos.vende} onChange={set("vende")} />
              <Campo label="Tel. vendedor" valor={datos.vendeTel} onChange={set("vendeTel")} />
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
          <Button variant="secondary" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button variant="secondary" disabled={generandoPdf} onClick={descargarPdf}>
            {generandoPdf ? "Generando..." : totalBultos > 1 ? `Descargar PDF (${totalBultos})` : "Descargar PDF"}
          </Button>
          {totalBultos > 1 && (
            <Button variant="secondary" onClick={imprimirPorBulto}>
              Imprimir {totalBultos} bultos
            </Button>
          )}
          <Button onClick={imprimirUno}>Imprimir rótulo</Button>
        </div>
      </div>
    </div>
  );
}
