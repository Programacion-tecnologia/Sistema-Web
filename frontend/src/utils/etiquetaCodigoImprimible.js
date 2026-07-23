import JsBarcode from "jsbarcode";
import { formatearPrecio } from "./currency";

// Etiqueta de código de barras para pegar en el producto. Formato 50 x 30 mm
// (una por página, para impresora térmica de etiquetas). Renderiza el código
// con jsbarcode a una imagen PNG y la embebe, así el HTML de impresión es
// autocontenido (no depende de la librería en la ventana nueva).

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// EAN-13 si son 13 dígitos; si no (o si el EAN no valida), cae a CODE128, que
// codifica cualquier texto.
function barcodeDataUrl(codigo) {
  const canvas = document.createElement("canvas");
  const opts = { width: 2, height: 45, fontSize: 13, margin: 4, displayValue: true };
  try {
    JsBarcode(canvas, codigo, { ...opts, format: /^\d{13}$/.test(codigo) ? "EAN13" : "CODE128" });
  } catch {
    JsBarcode(canvas, codigo, { ...opts, format: "CODE128" });
  }
  return canvas.toDataURL("image/png");
}

export function construirEtiquetaHTML(producto) {
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

  return `<div class="etq">
    <div class="nom">${esc(producto.nombre)}</div>
    ${img ? `<img class="bc" src="${img}" alt="${esc(codigo)}" />` : `<div class="cod">${esc(codigo)}</div>`}
    ${precio ? `<div class="pr">${esc(precio)}</div>` : ""}
  </div>`;
}

export function imprimirEtiquetas(productos) {
  const cuerpos = productos.map(construirEtiquetaHTML).filter(Boolean).join("");
  if (!cuerpos) return;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
    <style>
      *{box-sizing:border-box}
      @page{size:50mm 30mm;margin:0}
      body{margin:0;font-family:system-ui,Arial,sans-serif;color:#0f172a}
      .etq{width:50mm;height:30mm;padding:1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;page-break-after:always}
      .etq:last-child{page-break-after:auto}
      .nom{font-size:8px;font-weight:700;line-height:1.05;max-height:20px;overflow:hidden}
      .bc{max-width:100%;height:auto}
      .cod{font-size:11px;font-weight:700;letter-spacing:1px}
      .pr{font-size:11px;font-weight:800;margin-top:1px}
    </style></head><body>${cuerpos}
    <script>window.onload=function(){window.print()}</script></body></html>`;

  const win = window.open("", "_blank", "width=420,height=320");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
