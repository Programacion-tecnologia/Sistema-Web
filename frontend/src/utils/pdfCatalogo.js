import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { linkWhatsApp } from "./whatsapp";

// Carga una imagen (logo) como dataURL. null si falla.
async function cargarImagen(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Miniatura comprimida (JPEG) de una foto de producto: la baja a `maxPx` px de
// lado. Con miles de productos es la diferencia entre un PDF de decenas de MB y
// uno liviano. Devuelve { dataUrl, w, h } o null.
async function cargarMiniatura(url, maxPx = 200) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const escala = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.72), w, h };
  } catch {
    return null;
  }
}

function soles(v) {
  return Number(v) > 0 ? `S/ ${Number(v).toFixed(2)}` : "—";
}

/**
 * Catálogo de productos en PDF replicando el formato de la lista de precios de
 * la empresa: encabezado con logo/rubro/RUC/cuenta, un QR al WhatsApp del
 * vendedor, y una fila por producto con IMAGEN | DESCRIPCIÓN | X Mayor | PÚBLICO.
 */
export async function generarCatalogoPdf({ productos, config }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const PW = 612;
  const PH = 792;
  const mL = 36;
  const mB = 40;
  const right = PW - 36; // 576

  // Columnas
  const imgX = mL;
  const imgW = 92;
  const descX = imgX + imgW + 14; // 142
  const descRight = 430;
  const mayorRight = 508;
  const publicoRight = right;

  // Recursos que se dibujan en cada página (logo + QR), cargados una sola vez.
  const logoImg = config?.logo_url ? await cargarImagen(config.logo_url) : null;
  let qrImg = null;
  const telWa = config?.whatsapp_catalogo || config?.telefonos;
  if (telWa) {
    try {
      qrImg = await QRCode.toDataURL(
        linkWhatsApp(telWa, "Hola, vi su catálogo y quiero hacer una consulta."),
        { margin: 0, width: 240 }
      );
    } catch {
      qrImg = null;
    }
  }

  function encabezadoPagina() {
    if (logoImg) {
      try {
        doc.addImage(logoImg, mL, 28, 132, 58);
      } catch {
        // logo opcional
      }
    }
    if (qrImg) {
      try {
        doc.addImage(qrImg, right - 56, 28, 56, 56);
        doc.setFontSize(6);
        doc.setTextColor(90);
        doc.text("Escaneá para\npedir por WhatsApp", right - 28, 92, { align: "center" });
        doc.setTextColor(0);
      } catch {
        // QR opcional
      }
    }

    doc.setFont(undefined, "bold");
    doc.setFontSize(10);
    const tagline = config?.descripcion_catalogo || config?.razon_social || "";
    doc.text(doc.splitTextToSize(tagline, 300), PW / 2, 44, { align: "center" });

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    let hy = 102;
    if (config?.ruc) {
      doc.text(`RUC ${config.ruc}`, mL, hy);
      hy += 12;
    }
    if (config?.cuenta_bancaria) {
      doc.text(config.cuenta_bancaria, mL, hy);
      hy += 12;
    }
    doc.setFont(undefined, "bold");
    doc.text("VALOR EXPRESO EN MONEDA: SOLES (S/)", mL, hy + 3);
    doc.setFont(undefined, "normal");
    return hy + 14;
  }

  function encabezadoColumnas(y) {
    doc.setFillColor(238, 240, 244);
    doc.rect(mL, y, right - mL, 18, "F");
    doc.setFont(undefined, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(60);
    doc.text("IMAGEN REFERENCIAL", imgX + 2, y + 12);
    doc.text("DESCRIPCIÓN", descX, y + 12);
    doc.text("X Mayor", mayorRight, y + 12, { align: "right" });
    doc.text("PÚBLICO", publicoRight, y + 12, { align: "right" });
    doc.setTextColor(0);
    doc.setFont(undefined, "normal");
    return y + 18;
  }

  let y = encabezadoColumnas(encabezadoPagina());

  const rowH = 82;
  for (const p of productos) {
    if (y + rowH > PH - mB) {
      doc.addPage();
      y = encabezadoColumnas(32);
    }

    const foto = p.foto_url ? await cargarMiniatura(p.foto_url) : null;
    const boxH = rowH - 10;
    if (foto) {
      const esc = Math.min(imgW / foto.w, boxH / foto.h);
      const fw = foto.w * esc;
      const fh = foto.h * esc;
      try {
        doc.addImage(foto.dataUrl, "JPEG", imgX + (imgW - fw) / 2, y + 5 + (boxH - fh) / 2, fw, fh);
      } catch {
        // se omite la foto si falla
      }
    }

    // Descripción
    let dy = y + 13;
    doc.setFont(undefined, "bold");
    doc.setFontSize(8.5);
    const nombreLineas = doc.splitTextToSize(p.nombre || "", descRight - descX).slice(0, 2);
    doc.text(nombreLineas, descX, dy);
    dy += nombreLineas.length * 10 + 2;

    doc.setFont(undefined, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(70);
    const campo = (label, val) => {
      if (val) {
        doc.text(`${label} : ${val}`, descX, dy);
        dy += 9.5;
      }
    };
    campo("Código", p.codigo_referencia);
    campo("Um", p.unidad);
    campo("Modelo", p.modelo);
    campo("Marca", p.categoria?.nombre);
    campo("Color", p.color);
    doc.setTextColor(0);

    // Precios
    doc.setFontSize(9);
    doc.text(soles(p.precio_mayorista), mayorRight, y + 22, { align: "right" });
    doc.setFont(undefined, "bold");
    doc.text(soles(p.precio_venta), publicoRight, y + 22, { align: "right" });
    doc.setFont(undefined, "normal");

    doc.setDrawColor(224);
    doc.line(mL, y + rowH, right, y + rowH);
    y += rowH;
  }

  doc.save("catalogo.pdf");
}
