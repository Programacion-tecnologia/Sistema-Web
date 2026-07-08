import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatearPrecio } from "./currency";

const NOMBRE_EMPRESA = "Rios Performance";

/**
 * @param {Object} params
 * @param {Object} params.cotizacion - cotización con `id`, `cliente.nombre`, `vendedor.nombre`,
 *   `moneda`, `created_at`, `items` (cada uno con `cantidad`, `precio_unitario`,
 *   `producto.nombre`, `producto.codigo_referencia`)
 * @param {number} params.total
 */
export function generarPdfCotizacion({ cotizacion, total }) {
  const doc = new jsPDF();
  const fecha = new Date(cotizacion.created_at).toLocaleDateString("es-PE");

  doc.setFontSize(16);
  doc.text(NOMBRE_EMPRESA, 14, 18);

  doc.setFontSize(12);
  doc.text("Cotización", 14, 26);

  doc.setFontSize(10);
  doc.text(`N.°: ${cotizacion.id}`, 14, 34);
  doc.text(`Cliente: ${cotizacion.cliente?.nombre ?? "—"}`, 14, 40);
  doc.text(`Vendedor: ${cotizacion.vendedor?.nombre ?? "—"}`, 14, 46);
  doc.text(`Fecha: ${fecha}`, 14, 52);

  autoTable(doc, {
    startY: 59,
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
  doc.text(`Total: ${formatearPrecio(total, cotizacion.moneda)}`, 14, finalY);

  doc.save(`cotizacion-${cotizacion.id}.pdf`);
}
