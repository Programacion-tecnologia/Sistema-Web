// Rótulo de envío (etiqueta de rotulación) para pegar en el paquete/bulto.
// Formato 15 x 10 cm horizontal, replicando el modelo físico de la empresa:
// escudo del Perú entre bandas rojas + logo a la cabeza, cajas de
// DESTINO/ATENCIÓN, AGENCIA y ENVÍA/VENDE, e íconos (documento, teléfono,
// camión, persona, advertencia) igual que el original. Los datos entran por
// `datos` (editables antes de imprimir); logo/marcas salen de config. Pensado
// para impresora térmica de etiquetas (sticker), por eso @page sin márgenes.

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Íconos (paths de Font Awesome, libres) para que salgan crujientes a cualquier
// tamaño y sin depender de assets externos.
const ICON_PATHS = {
  truck: { vb: "0 0 640 512", d: "M48 0C21.5 0 0 21.5 0 48V368c0 26.5 21.5 48 48 48H64c0 53 43 96 96 96s96-43 96-96H384c0 53 43 96 96 96s96-43 96-96h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V237.3c0-17-6.7-33.3-18.7-45.3L512 114.7c-12-12-28.3-18.7-45.3-18.7H416V48c0-26.5-21.5-48-48-48H48zM416 160h50.7L544 237.3V256H416V160zM112 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm368-48a48 48 0 1 1 0 96 48 48 0 1 1 0-96z" },
  idCard: { vb: "0 0 576 512", d: "M0 96C0 60.7 28.7 32 64 32H512c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zM48 368c0 8.8 7.2 16 16 16H208c8.8 0 16-7.2 16-16c0-44.2-35.8-80-80-80H128c-44.2 0-80 35.8-80 80zm80-112a64 64 0 1 0 0-128 64 64 0 1 0 0 128zm192-64c-8.8 0-16 7.2-16 16s7.2 16 16 16H496c8.8 0 16-7.2 16-16s-7.2-16-16-16H320zm0 64c-8.8 0-16 7.2-16 16s7.2 16 16 16H496c8.8 0 16-7.2 16-16s-7.2-16-16-16H320zm0 64c-8.8 0-16 7.2-16 16s7.2 16 16 16h96c8.8 0 16-7.2 16-16s-7.2-16-16-16H320z" },
  phone: { vb: "0 0 512 512", d: "M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z" },
  user: { vb: "0 0 448 512", d: "M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512H418.3c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304H178.3z" },
  warning: { vb: "0 0 512 512", d: "M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" },
};

function icono(nombre, size, color = "#0f172a") {
  const { vb, d } = ICON_PATHS[nombre];
  return `<svg viewBox="${vb}" width="${size}" height="${size}" fill="${color}" style="vertical-align:middle;flex:0 0 auto"><path d="${d}"/></svg>`;
}

// URL absoluta del escudo (public/escudo-peru.jpg): la ventana de impresión es
// about:blank, así que necesita el origen completo para resolver la imagen.
function escudoUrl() {
  return typeof window !== "undefined" ? `${window.location.origin}/escudo-peru.png` : "/escudo-peru.png";
}

// HTML de UN rótulo (una etiqueta). Se repite por bulto si hace falta.
export function construirRotuloHTML(datos, config) {
  const c = config ?? {};
  const d = datos ?? {};

  const logo = c.logo_url
    ? `<img src="${esc(c.logo_url)}" alt="logo" style="max-height:66px;max-width:230px;object-fit:contain" />`
    : `<div style="font-weight:800;font-size:22px">${esc(c.razon_social || "")}</div>`;
  const marcas = c.marcas_url
    ? `<img src="${esc(c.marcas_url)}" alt="marcas" style="max-height:20px;max-width:230px;object-fit:contain;display:block;margin-top:4px" />`
    : "";

  // Emblema redondo: escudo del Perú centrado con bandas rojas a los lados,
  // recortado en círculo (como el modelo físico).
  const bandera = `<div style="width:74px;height:74px;border-radius:50%;overflow:hidden;border:1px solid #334155;display:flex;flex:0 0 auto">
    <div style="flex:1;background:#d91023"></div>
    <div style="flex:1.5;background:#fff;display:flex;align-items:center;justify-content:center">
      <img src="${escudoUrl()}" alt="escudo" style="max-height:58px;max-width:100%;object-fit:contain" />
    </div>
    <div style="flex:1;background:#d91023"></div>
  </div>`;

  return `<div class="rotulo">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex:0 0 auto">
      ${bandera}
      <div style="text-align:right">${logo}${marcas}</div>
    </div>

    <div style="border:1.5px solid #0f172a;border-radius:8px;padding:7px 14px;margin-bottom:5px;flex:1.9;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-around">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:11px;color:#334155;flex:0 0 72px">DESTINO:</span>
        <span style="font-size:18px;font-weight:700;line-height:1.1">${esc(d.destino)}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:11px;color:#334155;flex:0 0 72px">ATENCIÓN:</span>
        <span style="font-size:22px;font-weight:800;line-height:1.05">${esc(d.atencion)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px">
        <span style="display:inline-flex;align-items:center;gap:5px">${icono("idCard", 16)} Nro DNI/RUC: <b>${esc(d.doc)}</b></span>
        <span style="display:inline-flex;align-items:center;gap:5px">${icono("phone", 13)} Nro tel: <b>${esc(d.telefono)}</b></span>
      </div>
    </div>

    <div style="border:1.5px solid #0f172a;border-radius:8px;padding:7px 14px;margin-bottom:5px;flex:1.25;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-around">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="flex:0 0 72px;display:flex;flex-direction:column;align-items:flex-start;gap:2px">
          <span style="font-size:11px;color:#334155">AGENCIA:</span>
          ${icono("truck", 30)}
        </span>
        <span style="font-size:21px;font-weight:800;line-height:1.1">${esc(d.agencia)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px">
        <span>CANT: <b>${esc(d.cantActual)} / ${esc(d.cantTotal)}</b></span>
        <span>NRO GUÍA INT: <b>${esc(d.nroGuiaInt)}</b></span>
        <span>NRO GUÍA AGENCIA: <b>${esc(d.nroGuiaAgencia)}</b></span>
      </div>
    </div>

    <div style="border:1.5px solid #0f172a;border-radius:8px;padding:7px 14px;margin-bottom:5px;font-size:12px;display:flex;justify-content:space-between;gap:12px;flex:0 0 auto">
      <span>ENVÍA: <b>${esc(d.envia)}</b>${d.enviaRuc ? ` / RUC ${esc(d.enviaRuc)}` : ""}</span>
      <span style="display:inline-flex;align-items:center;gap:5px">${icono("user", 13)} VENDE: <b>${esc(d.vende)}</b>${d.vendeTel ? ` &nbsp;${esc(d.vendeTel)}` : ""}</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">
      ${icono("warning", 20)}
      <div style="flex:1">
        <div style="background:#0f172a;color:#fff;font-weight:800;font-size:12px;text-align:center;padding:3px 4px;letter-spacing:.3px">NO RECIBA ESTE PAQUETE SI OBSERVA QUE HA SIDO ABIERTO O GOLPEADO</div>
        <div style="font-size:9px;text-align:center;color:#334155">La empresa no se hace responsable por la mala manipulación de los paquetes en su traslado</div>
      </div>
      ${icono("warning", 20)}
    </div>
  </div>`;
}

// Imprime uno o varios rótulos (un bulto por página). `labels` = array de
// objetos `datos`. Página de 15 x 10 cm horizontal, sin márgenes (sticker).
export function imprimirRotulos(labels, config) {
  const cuerpos = labels.map((d) => construirRotuloHTML(d, config)).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rótulo de envío</title>
    <style>
      *{box-sizing:border-box}
      @page{size:150mm 100mm;margin:0}
      body{margin:0;font-family:system-ui,Arial,sans-serif;color:#0f172a}
      .rotulo{width:150mm;height:100mm;padding:3mm;overflow:hidden;page-break-after:always;display:flex;flex-direction:column}
      .rotulo:last-child{page-break-after:auto}
    </style></head><body>${cuerpos}
    <script>window.onload=function(){window.print()}</script></body></html>`;

  const win = window.open("", "_blank", "width=760,height=560");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// Renderiza UN rótulo fuera de pantalla (a 15x10 cm) y lo captura a canvas para
// meterlo en el PDF conservando escudo, logo e íconos tal cual se imprimen.
async function rotuloACanvas(datos, config) {
  const cont = document.createElement("div");
  cont.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff";
  cont.innerHTML = construirRotuloHTML(datos, config);
  const rot = cont.firstElementChild;
  // El .rotulo del print window trae estos estilos por CSS; acá los fijamos
  // inline para que el render fuera de pantalla tenga el tamaño exacto.
  rot.style.cssText +=
    ";width:150mm;height:100mm;padding:3mm;overflow:hidden;display:flex;flex-direction:column;font-family:system-ui,Arial,sans-serif;color:#0f172a;background:#fff";
  document.body.appendChild(cont);
  try {
    return await html2canvas(rot, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
  } finally {
    document.body.removeChild(cont);
  }
}

// Descarga uno o varios rótulos como un PDF de páginas 15x10 cm (una por bulto).
export async function descargarRotulosPDF(labels, config, nombreArchivo = "rotulo") {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [150, 100] });

  for (let i = 0; i < labels.length; i++) {
    const canvas = await rotuloACanvas(labels[i], config);
    const img = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage([150, 100], "landscape");
    pdf.addImage(img, "JPEG", 0, 0, 150, 100);
  }

  pdf.save(`${nombreArchivo}.pdf`);
}
