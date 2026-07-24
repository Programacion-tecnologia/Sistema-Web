import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { formatearPrecio } from "./currency";

// Etiqueta de código de barras para pegar en el producto. El tamaño (ancho x
// alto en mm) es configurable para que calce con el rollo de la impresora
// térmica y no se corte. Renderiza el código con jsbarcode a una imagen PNG y
// la embebe (HTML de impresión autocontenido). Ofrece imprimir (ventana) o
// descargar PDF al tamaño exacto (más fiable para la etiquetadora).

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// EAN-13 si son 13 dígitos; si no (o si el EAN no valida), cae a CODE128.
function barcodeDataUrl(codigo) {
  const canvas = document.createElement("canvas");
  const opts = { width: 2, height: 60, fontSize: 16, margin: 4, displayValue: true };
  try {
    JsBarcode(canvas, codigo, { ...opts, format: /^\d{13}$/.test(codigo) ? "EAN13" : "CODE128" });
  } catch {
    JsBarcode(canvas, codigo, { ...opts, format: "CODE128" });
  }
  return canvas.toDataURL("image/png");
}

// HTML de UNA etiqueta, con estilos inline y tamaño dado (mm), así se ve igual
// tanto en la ventana de impresión como capturada para el PDF. El código se
// escala con max-width:100% para nunca pasarse del ancho (no se corta).
export function construirEtiquetaHTML(producto, { anchoMm = 50, altoMm = 30 } = {}) {
  const codigo = producto.codigo_barras;
  if (!codigo) return "";

  let img = null;
  try {
    img = barcodeDataUrl(codigo);
  } catch {
    img = null;
  }

  const precio =
    producto.precio_venta != null && producto.precio_venta !== ""
      ? formatearPrecio(producto.precio_venta, producto.moneda)
      : "";

  return `<div class="etq" style="width:${anchoMm}mm;height:${altoMm}mm;padding:1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;font-family:system-ui,Arial,sans-serif;color:#0f172a">
    <div style="font-size:8px;font-weight:700;line-height:1.1;width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(producto.nombre)}</div>
    ${
      img
        ? `<img src="${img}" alt="${esc(codigo)}" style="max-width:100%;max-height:60%;height:auto;object-fit:contain" />`
        : `<div style="font-size:12px;font-weight:700;letter-spacing:1px">${esc(codigo)}</div>`
    }
    ${precio ? `<div style="font-size:11px;font-weight:800;margin-top:1px">${esc(precio)}</div>` : ""}
  </div>`;
}

// Expande la lista repitiendo cada producto `copias` veces.
function expandir(productos, copias) {
  const n = Math.max(1, Math.trunc(Number(copias)) || 1);
  return productos.flatMap((p) => Array.from({ length: n }, () => p));
}

export function imprimirEtiquetas(productos, { anchoMm = 50, altoMm = 30, copias = 1 } = {}) {
  const items = expandir(productos, copias);
  const cuerpos = items.map((p) => construirEtiquetaHTML(p, { anchoMm, altoMm })).filter(Boolean).join("");
  if (!cuerpos) return;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
    <style>
      *{box-sizing:border-box}
      @page{size:${anchoMm}mm ${altoMm}mm;margin:0}
      body{margin:0}
      .etq{page-break-after:always}
      .etq:last-child{page-break-after:auto}
    </style></head><body>${cuerpos}
    <script>window.onload=function(){window.print()}</script></body></html>`;

  const win = window.open("", "_blank", "width=480,height=360");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// Renderiza una etiqueta fuera de pantalla y la captura a canvas para el PDF.
async function etiquetaACanvas(producto, anchoMm, altoMm) {
  const cont = document.createElement("div");
  cont.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff";
  cont.innerHTML = construirEtiquetaHTML(producto, { anchoMm, altoMm });
  const el = cont.firstElementChild;
  document.body.appendChild(cont);
  try {
    return await html2canvas(el, { scale: 4, backgroundColor: "#ffffff" });
  } finally {
    document.body.removeChild(cont);
  }
}

// Descarga las etiquetas como PDF, una por página al tamaño exacto (mm). Es la
// opción más fiable para imprimir en la etiquetadora sin que se corte.
export async function descargarEtiquetasPDF(
  productos,
  { anchoMm = 50, altoMm = 30, copias = 1, nombreArchivo = "etiquetas" } = {}
) {
  const items = expandir(
    productos.filter((p) => p.codigo_barras),
    copias
  );
  if (items.length === 0) return;

  const orientacion = anchoMm >= altoMm ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation: orientacion, unit: "mm", format: [anchoMm, altoMm] });

  for (let i = 0; i < items.length; i++) {
    const canvas = await etiquetaACanvas(items[i], anchoMm, altoMm);
    const img = canvas.toDataURL("image/png");
    if (i > 0) pdf.addPage([anchoMm, altoMm], orientacion);
    pdf.addImage(img, "PNG", 0, 0, anchoMm, altoMm);
  }

  pdf.save(`${nombreArchivo}.pdf`);
}
