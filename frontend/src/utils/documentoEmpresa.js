// Encabezado de marca compartido por los documentos imprimibles (guía de
// remisión, nota de venta interna). Replica el layout de los comprobantes de la
// empresa: logo + tira de marcas a la izquierda, datos de empresa al centro,
// caja con RUC / tipo de documento / número a la derecha. Los datos y las
// imágenes salen de configuracion_empresa (editable en Configuración).

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// config: fila de configuracion_empresa. doc: { tipo, numero }.
export function encabezadoEmpresaHTML(config, doc) {
  const c = config ?? {};
  const logo = c.logo_url
    ? `<img src="${esc(c.logo_url)}" alt="logo" style="max-height:70px;max-width:170px;object-fit:contain" />`
    : `<div style="font-weight:800;font-size:20px;color:#0f172a">${esc(c.razon_social || "")}</div>`;
  const marcas = c.marcas_url
    ? `<img src="${esc(c.marcas_url)}" alt="marcas" style="max-height:22px;max-width:180px;object-fit:contain;margin-top:6px" />`
    : "";

  const direcciones = [c.direccion_comercial, c.direccion_fiscal ? `Dom. Fiscal: ${c.direccion_fiscal}` : ""]
    .filter(Boolean)
    .map((d) => `<div>${esc(d)}</div>`)
    .join("");

  return `<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:12px">
    <div style="flex:0 0 auto;text-align:center">${logo}${marcas}</div>
    <div style="flex:1;font-size:11px;color:#334155;line-height:1.4">
      <div style="font-weight:800;font-size:16px;color:#0f172a;margin-bottom:2px">${esc(c.razon_social || "")}</div>
      ${direcciones}
      ${c.telefonos ? `<div>Telf: ${esc(c.telefonos)}</div>` : ""}
      ${c.email ? `<div>${esc(c.email)}</div>` : ""}
    </div>
    <div style="flex:0 0 auto;border:1.5px solid #0f172a;border-radius:10px;padding:10px 16px;text-align:center;min-width:180px">
      <div style="font-weight:800">R.U.C. ${esc(c.ruc || "")}</div>
      <div style="font-weight:700;margin-top:2px">${esc(doc.tipo)}</div>
      <div style="font-weight:800;font-size:15px;margin-top:2px">${esc(doc.numero)}</div>
    </div>
  </div>`;
}

// Abre una ventana nueva con el documento y lo manda a imprimir. Recibe el
// cuerpo (sin <html>) ya armado; agrega el reset y dispara window.print().
//
// opciones.pageSize: fija el tamaño de hoja (ej. "A5 portrait"); vacío = default
//   del navegador (A4/Letter). opciones.compacto: escala fuentes/celdas/márgenes
//   para documentos densos (guía en A5). Por defecto todo queda como estaba, así
//   la nota de venta no cambia.
export function imprimirDocumento(titulo, cuerpoHTML, opciones = {}) {
  const { pageSize = "", compacto = false } = opciones;

  const bodyFont = compacto ? 9 : 12;
  const bodyPad = compacto ? 0 : 24;
  const maxW = compacto ? "none" : "800px";
  const cellPad = compacto ? "2px 5px" : "5px 8px";
  const thFont = compacto ? 8 : 11;
  const tableMargin = compacto ? 5 : 12;
  const pageCss = pageSize ? `@page{size:${pageSize};margin:7mm}` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <style>
      *{box-sizing:border-box}
      ${pageCss}
      body{font-family:system-ui,Arial,sans-serif;color:#0f172a;padding:${bodyPad}px;max-width:${maxW};margin:0 auto;font-size:${bodyFont}px}
      table{width:100%;border-collapse:collapse;margin:${tableMargin}px 0}
      th,td{padding:${cellPad};border:1px solid #cbd5e1;text-align:left}
      th{background:#f1f5f9;font-size:${thFont}px}
      .muted{color:#64748b}
    </style></head><body>${cuerpoHTML}
    <script>window.onload=function(){window.print()}</script></body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
