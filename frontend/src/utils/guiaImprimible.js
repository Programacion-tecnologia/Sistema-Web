import { imprimirDocumento } from "./documentoEmpresa";

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function numeroGuia(guia) {
  return `${guia.serie} - ${String(guia.correlativo).padStart(8, "0")}`;
}

// Motivos de traslado estándar SUNAT (checkboxes de la guía). El motivo guardado
// en la guía se mapea a uno de estos para marcar la casilla correspondiente.
const MOTIVOS_STD = [
  "Venta",
  "Venta sujeta a confirmación del comprador",
  "Compra",
  "Traslado entre establecimientos de la misma empresa",
  "Importación",
  "Traslado emisor itinerante CP",
  "Exportación",
  "Traslado a zona primaria",
  "Otros",
];

function motivoMarcado(std, motivo) {
  const m = (motivo ?? "").toLowerCase().trim();
  const mapa = {
    venta: "Venta",
    "traslado entre locales": "Traslado entre establecimientos de la misma empresa",
    "traslado entre establecimientos de la misma empresa": "Traslado entre establecimientos de la misma empresa",
    compra: "Compra",
    importacion: "Importación",
    importación: "Importación",
    "traslado por emisor itinerante": "Traslado emisor itinerante CP",
    "traslado emisor itinerante cp": "Traslado emisor itinerante CP",
    exportacion: "Exportación",
    exportación: "Exportación",
    "traslado a zona primaria": "Traslado a zona primaria",
  };
  const objetivo = mapa[m] ?? (m ? "Otros" : "");
  return std === objetivo;
}

function casilla(std, motivo) {
  const marcado = motivoMarcado(std, motivo);
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:8px">
    <span style="display:inline-block;width:9px;height:9px;border:1px solid #334155;text-align:center;line-height:8px;font-size:8px">${marcado ? "✔" : ""}</span>
    ${esc(std)}
  </span>`;
}

// Construye el HTML del documento de guía (sin imprimir). Se separa para poder
// previsualizarlo sin abrir la ventana de impresión.
export function construirGuiaHTML(guia, config) {
  const c = config ?? {};
  const numero = numeroGuia(guia);
  const logo = c.logo_url
    ? `<img src="${esc(c.logo_url)}" alt="logo" style="max-height:52px;max-width:140px;object-fit:contain" />`
    : `<div style="font-weight:800;font-size:13px">${esc(c.razon_social || "")}</div>`;

  const filas = guia.items
    .map(
      (it, i) => `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(it.codigo ?? "")}</td>
        <td>${esc(it.descripcion)}</td>
        <td style="text-align:center">${esc(it.cantidad)}</td>
        <td style="text-align:center">${esc(it.unidad ?? "")}</td>
      </tr>`
    )
    .join("");

  const checkboxes = MOTIVOS_STD.map((m) => `<div style="width:48%;padding:2px 0">${casilla(m, guia.motivo_traslado)}</div>`).join("");

  return `
    <table style="width:100%;border:none;margin:0 0 5px">
      <tr>
        <td style="border:none;width:150px;vertical-align:top;text-align:center">${logo}</td>
        <td style="border:none;text-align:center;vertical-align:top;padding-top:3px">
          <div style="font-weight:800;font-size:11px">${esc(c.razon_social || "")}</div>
          <div style="font-size:8px;color:#334155">${esc(c.direccion_fiscal || "")}</div>
          <div style="font-size:8px;color:#334155">${c.telefonos ? "Telf: " + esc(c.telefonos) : ""}</div>
        </td>
        <td style="border:none;width:165px;vertical-align:top">
          <div style="border:1.5px solid #0f172a;border-radius:8px;padding:6px 10px;text-align:center">
            <div style="font-weight:800;font-size:9px">R.U.C. ${esc(c.ruc || "")}</div>
            <div style="font-weight:700;margin-top:3px;font-size:8px">GUÍA DE REMISIÓN<br/>REMITENTE</div>
            <div style="font-weight:800;font-size:11px;margin-top:3px">N° ${esc(numero)}</div>
          </div>
        </td>
      </tr>
    </table>

    ${guia.estado === "anulada" ? '<div style="color:#dc2626;font-weight:800;font-size:13px;text-align:center;margin-bottom:4px">— ANULADA —</div>' : ""}

    <div style="border-top:2px solid #0f172a;padding-top:5px;font-size:9px">
      <b>Fecha de inicio de traslado:</b> ${esc(guia.fecha_traslado || guia.fecha_emision)}
    </div>

    <table style="width:100%;border:none;margin:4px 0;font-size:9px">
      <tr>
        <td style="border:none;width:50%;vertical-align:top">
          <div><b>Destinatario</b> ${esc(guia.destinatario_nombre)}</div>
          <div><b>RUC/DNI</b> ${esc(guia.destinatario_doc ?? "")}</div>
        </td>
        <td style="border:none;vertical-align:top">
          <div><b>Punto de partida:</b> ${esc(guia.punto_partida ?? "")}</div>
          <div><b>Punto de llegada:</b> ${esc(guia.punto_llegada ?? "")}</div>
        </td>
      </tr>
    </table>

    <div style="font-size:9px;margin-top:3px"><b>Motivo de traslado</b></div>
    <div style="border:1px solid #94a3b8;padding:4px 6px;display:flex;flex-wrap:wrap;margin-bottom:5px">${checkboxes}</div>

    <div style="font-size:9px"><b>Datos del bien transportado</b></div>
    <table style="width:100%">
      <thead>
        <tr>
          <th style="width:28px;text-align:center">Nº</th>
          <th style="width:90px">Código</th>
          <th>Descripción</th>
          <th style="width:52px;text-align:center">Cantidad</th>
          <th style="width:62px;text-align:center">Unidad de despacho</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <div style="font-size:9px;margin-top:5px"><b>Empresa de transporte</b></div>
    <table style="width:100%;font-size:9px">
      <tr>
        <td style="width:55%;vertical-align:top">
          <div><b>RUC / Razón social:</b></div>
          <div>${esc([guia.transportista_doc, guia.transportista_nombre].filter(Boolean).join(" — ") || "—")}</div>
          ${guia.conductor_nombre ? `<div><b>Conductor:</b> ${esc(guia.conductor_nombre)} ${guia.conductor_licencia ? "(Lic. " + esc(guia.conductor_licencia) + ")" : ""}</div>` : ""}
        </td>
        <td style="vertical-align:top">
          <div><b>Modalidad de transporte:</b> ${esc((guia.modalidad_transporte || "").toUpperCase() === "PUBLICO" ? "TRANSPORTE PÚBLICO" : guia.modalidad_transporte === "privado" ? "TRANSPORTE PRIVADO" : "—")}</div>
          <div><b>Placa:</b> ${esc(guia.placa ?? "—")}</div>
          <div><b>Peso total aprox. (KGM):</b> ${esc(guia.peso_bruto ?? "—")}${guia.num_bultos ? ` &nbsp; <b>Bultos:</b> ${esc(guia.num_bultos)}` : ""}</div>
        </td>
      </tr>
    </table>

    ${
      guia.observaciones
        ? `<div style="border:1px solid #94a3b8;padding:4px 6px;margin-top:4px;font-size:9px"><b>Observaciones</b><br/>${esc(guia.observaciones)}</div>`
        : ""
    }

    <div style="display:flex;justify-content:flex-end;margin-top:22px;font-size:9px">
      <div style="text-align:center">
        <div style="border-top:1px solid #334155;width:180px;padding-top:3px">Conformidad del cliente</div>
        <div style="text-align:left;margin-top:4px">Nombre:</div>
        <div style="text-align:left">DNI:</div>
      </div>
    </div>

    <div style="margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:5px;font-size:7px;color:#64748b">
      <div style="font-weight:700;color:#334155">LA MERCADERÍA VIAJA POR CUENTA Y RIESGO DEL COMPRADOR. NO ADMITIMOS RECLAMO POR ROBO O AVERÍA.</div>
      <div style="margin-top:3px">Documento de traslado — representación interna. La emisión electrónica ante SUNAT (con QR y número de autorización) se realiza desde el módulo de facturación electrónica.</div>
    </div>`;
}

// Arma e imprime la guía de remisión con la marca de la empresa (config). Se
// imprime en A5 (media hoja) con densidad compacta, al estilo de la guía
// electrónica de referencia.
export function imprimirGuia(guia, config) {
  imprimirDocumento(`Guía ${numeroGuia(guia)}`, construirGuiaHTML(guia, config), {
    pageSize: "A5 portrait",
    compacto: true,
  });
}
