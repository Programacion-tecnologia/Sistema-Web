// Rótulo de envío (etiqueta de rotulación) para pegar en el paquete/bulto.
// Formato 15 x 10 cm horizontal, replicando el modelo físico de la empresa:
// bandera del Perú + logo a la cabeza, cajas de DESTINO/ATENCIÓN, AGENCIA y
// ENVÍA/VENDE, y la franja de advertencia al pie. Todos los datos entran por
// `datos` (editables antes de imprimir); el logo/marcas salen de config.

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Bandera del Perú en CSS (rojo-blanco-rojo) como sello del encabezado.
const BANDERA = `<div style="display:flex;width:64px;height:42px;border:1px solid #334155;flex:0 0 auto">
  <div style="flex:1;background:#d91023"></div>
  <div style="flex:1;background:#fff"></div>
  <div style="flex:1;background:#d91023"></div>
</div>`;

// HTML de UN rótulo (una etiqueta). Se repite por bulto si hace falta.
export function construirRotuloHTML(datos, config) {
  const c = config ?? {};
  const d = datos ?? {};

  const logo = c.logo_url
    ? `<img src="${esc(c.logo_url)}" alt="logo" style="max-height:40px;max-width:150px;object-fit:contain" />`
    : `<div style="font-weight:800;font-size:16px">${esc(c.razon_social || "")}</div>`;
  const marcas = c.marcas_url
    ? `<img src="${esc(c.marcas_url)}" alt="marcas" style="max-height:14px;max-width:150px;object-fit:contain;display:block;margin-top:3px" />`
    : "";

  return `<div class="rotulo">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;flex:0 0 auto">
      ${BANDERA}
      <div style="text-align:right">${logo}${marcas}</div>
    </div>

    <div style="border:1.5px solid #0f172a;border-radius:8px;padding:8px 12px;margin-bottom:7px;flex:1.9;display:flex;flex-direction:column;justify-content:center">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:11px;color:#334155;flex:0 0 70px">DESTINO:</span>
        <span style="font-size:17px;font-weight:700;line-height:1.1">${esc(d.destino)}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:8px">
        <span style="font-size:11px;color:#334155;flex:0 0 70px">ATENCIÓN:</span>
        <span style="font-size:25px;font-weight:800;line-height:1.05">${esc(d.atencion)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-size:13px">
        <span>▤ Nro DNI/RUC: <b>${esc(d.doc)}</b></span>
        <span>✆ Nro tel: <b>${esc(d.telefono)}</b></span>
      </div>
    </div>

    <div style="border:1.5px solid #0f172a;border-radius:8px;padding:8px 12px;margin-bottom:7px;flex:1.3;display:flex;flex-direction:column;justify-content:center">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:11px;color:#334155;flex:0 0 70px">AGENCIA:</span>
        <span style="font-size:21px;font-weight:800;line-height:1.1">${esc(d.agencia)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:9px;font-size:12px">
        <span>CANT: <b>${esc(d.cantActual)} / ${esc(d.cantTotal)}</b></span>
        <span>NRO GUÍA INT: <b>${esc(d.nroGuiaInt)}</b></span>
        <span>NRO GUÍA AGENCIA: <b>${esc(d.nroGuiaAgencia)}</b></span>
      </div>
    </div>

    <div style="border:1.5px solid #0f172a;border-radius:8px;padding:7px 12px;margin-bottom:7px;font-size:11px;display:flex;justify-content:space-between;gap:12px;flex:0 0 auto">
      <span>ENVÍA: <b>${esc(d.envia)}</b>${d.enviaRuc ? ` / RUC ${esc(d.enviaRuc)}` : ""}</span>
      <span>VENDE: <b>${esc(d.vende)}</b>${d.vendeTel ? ` &nbsp;${esc(d.vendeTel)}` : ""}</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">
      <span style="font-size:18px">⚠</span>
      <div style="flex:1">
        <div style="background:#0f172a;color:#fff;font-weight:800;font-size:12px;text-align:center;padding:3px 4px;letter-spacing:.3px">NO RECIBA ESTE PAQUETE SI OBSERVA QUE HA SIDO ABIERTO O GOLPEADO</div>
        <div style="font-size:9px;text-align:center;color:#334155">La empresa no se hace responsable por la mala manipulación de los paquetes en su traslado</div>
      </div>
      <span style="font-size:18px">⚠</span>
    </div>
  </div>`;
}

// Imprime uno o varios rótulos (un bulto por página). `labels` = array de
// objetos `datos`. Página de 15 x 10 cm horizontal, sin márgenes.
export function imprimirRotulos(labels, config) {
  const cuerpos = labels.map((d) => construirRotuloHTML(d, config)).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rótulo de envío</title>
    <style>
      *{box-sizing:border-box}
      @page{size:150mm 100mm;margin:0}
      body{margin:0;font-family:system-ui,Arial,sans-serif;color:#0f172a}
      .rotulo{width:150mm;height:100mm;padding:4mm;overflow:hidden;page-break-after:always;display:flex;flex-direction:column}
      .rotulo:last-child{page-break-after:auto}
    </style></head><body>${cuerpos}
    <script>window.onload=function(){window.print()}</script></body></html>`;

  const win = window.open("", "_blank", "width=760,height=560");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
