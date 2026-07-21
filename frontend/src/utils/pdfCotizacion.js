import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatearPrecio } from "./currency";

// Carga una imagen (logo de la empresa) como dataURL para embeberla en el PDF.
// El bucket 'empresa' es público, así que el fetch no tiene problema de CORS.
async function cargarImagen(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {Object} params
 * @param {Object} params.cotizacion
 * @param {number} params.total
 * @param {Object} [params.config] - configuracion_empresa (razón social, RUC, direcciones, logo)
 */
export async function generarPdfCotizacion({ cotizacion, total, config }) {
  const doc = new jsPDF();
  const fecha = new Date(cotizacion.created_at).toLocaleDateString("es-PE");

  // Encabezado con la marca de la empresa (logo + datos), desde config.
  if (config?.logo_url) {
    try {
      const img = await cargarImagen(config.logo_url);
      doc.addImage(img, 14, 10, 32, 18);
    } catch {
      // Si el logo no carga, se sigue sin él (el resto del encabezado alcanza).
    }
  }

  const xText = config?.logo_url ? 50 : 14;
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text(config?.razon_social || "Rios Performance", xText, 16);
  doc.setFont(undefined, "normal");
  doc.setFontSize(8);
  let ly = 21;
  const lineas = [
    config?.direccion_comercial,
    config?.direccion_fiscal,
    config?.telefonos ? `Telf: ${config.telefonos}` : "",
    config?.ruc ? `RUC: ${config.ruc}` : "",
  ].filter(Boolean);
  for (const l of lineas) {
    for (const parte of doc.splitTextToSize(String(l), 145)) {
      doc.text(parte, xText, ly);
      ly += 4;
    }
  }

  let y = Math.max(32, ly + 2);
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("COTIZACIÓN", 14, y);
  doc.setFont(undefined, "normal");
  y += 7;

  doc.setFontSize(10);
  doc.text(`N.°: ${cotizacion.id}`, 14, y);
  doc.text(`Cliente: ${cotizacion.cliente?.nombre ?? "—"}`, 14, y + 6);
  doc.text(`Vendedor: ${cotizacion.vendedor?.nombre ?? "—"}`, 14, y + 12);
  doc.text(`Fecha: ${fecha}`, 14, y + 18);

  autoTable(doc, {
    startY: y + 25,
    head: [["Código ref.", "Producto", "Cantidad", "Precio unit.", "Subtotal"]],
    body: cotizacion.items.map((item) => [
      item.producto?.codigo_referencia ?? "—",
      item.producto?.nombre ?? "—",
      item.cantidad,
      formatearPrecio(item.precio_unitario, cotizacion.moneda),
      formatearPrecio(item.cantidad * item.precio_unitario, cotizacion.moneda),
    ]),
  });

  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(`Total: ${formatearPrecio(total, cotizacion.moneda)}`, 14, finalY);

  doc.save(`cotizacion-${cotizacion.id}.pdf`);
}
