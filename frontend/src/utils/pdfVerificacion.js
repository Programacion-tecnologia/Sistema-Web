import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * @param {Object} params
 * @param {Object} params.cotizacion - cotización con `id`, `cliente.nombre`
 * @param {Array<{producto_id: string, nombre: string, cantidad_pedida: number, cantidad_verificada: number, estado: 'ok'|'exceso'}>} params.detalle - devuelto por verificar_despacho_cotizacion
 * @param {string} params.verificadoPorNombre
 */
export function generarPdfVerificacion({ cotizacion, detalle, verificadoPorNombre }) {
  const doc = new jsPDF();
  const fecha = new Date().toLocaleString("es-PE");

  doc.setFontSize(16);
  doc.text("Verificación de despacho", 14, 18);

  doc.setFontSize(10);
  doc.text(`Cotización: ${cotizacion.id}`, 14, 27);
  doc.text(`Cliente: ${cotizacion.cliente?.nombre ?? "—"}`, 14, 33);
  doc.text(`Verificado por: ${verificadoPorNombre ?? "—"}`, 14, 39);
  doc.text(`Fecha: ${fecha}`, 14, 45);

  autoTable(doc, {
    startY: 52,
    head: [["Código", "Producto", "Cant. pedida", "Cant. verificada", "Estado"]],
    body: detalle.map((linea) => [
      linea.codigo ?? "—",
      linea.nombre,
      linea.cantidad_pedida,
      linea.cantidad_verificada,
      linea.estado === "exceso" ? "EXCESO" : "OK",
    ]),
  });

  doc.save(`despacho-${cotizacion.id}.pdf`);
}
