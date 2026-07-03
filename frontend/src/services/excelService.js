import * as XLSX from "xlsx";

const HEADER_MAP = {
  "codigo de referencia": "codigo_referencia",
  "codigo de barras": "codigo_barras",
  nombre: "nombre",
  descripcion: "descripcion",
  categoria: "categoria",
  color: "color",
  modelo: "modelo",
  "precio de compra": "precio_compra",
  "precio de venta": "precio_venta",
  "stock fisico": "stock_fisico",
  ubicacion: "ubicacion",
  "nombre de archivo de foto": "foto_archivo",
};

const TEMPLATE_HEADERS = [
  "Código de referencia",
  "Código de barras",
  "Nombre",
  "Descripción",
  "Categoría",
  "Color",
  "Modelo",
  "Precio de compra",
  "Precio de venta",
  "Stock físico",
  "Ubicación",
  "Nombre de archivo de foto",
];

const TEMPLATE_EXAMPLE_ROW = [
  "REF-001",
  "7501234567890",
  "Kit de arrastre",
  "Kit de arrastre reforzado 428H",
  "Transmisión",
  "Negro",
  "CBR 250",
  "45.00",
  "65.00",
  "10",
  "Estante A-3",
  "kit-arrastre-cbr250-negro.jpg",
];

const COMBINING_DIACRITICS = new RegExp("[̀-ͯ]", "g");

function normalizeHeader(header) {
  return String(header)
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .trim()
    .toLowerCase();
}

export function parseProductosExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const filas = [];
  const errores = [];

  rawRows.forEach((rawRow, index) => {
    const numeroFila = index + 2; // fila 1 = encabezados

    const fila = {};
    for (const [header, value] of Object.entries(rawRow)) {
      const campo = HEADER_MAP[normalizeHeader(header)];
      if (campo) {
        fila[campo] = typeof value === "string" ? value.trim() : value;
      }
    }

    if (!fila.nombre) {
      errores.push({ fila: numeroFila, motivo: "Falta el nombre del producto" });
      return;
    }

    filas.push({
      numeroFila,
      codigo_referencia: fila.codigo_referencia ? String(fila.codigo_referencia).trim() : null,
      codigo_barras: fila.codigo_barras ? String(fila.codigo_barras).trim() : null,
      nombre: fila.nombre,
      descripcion: fila.descripcion || null,
      categoria: fila.categoria || null,
      color: fila.color || null,
      modelo: fila.modelo || null,
      precio_compra: Number(fila.precio_compra) || 0,
      precio_venta: Number(fila.precio_venta) || 0,
      stock_fisico: Math.trunc(Number(fila.stock_fisico)) || 0,
      ubicacion: fila.ubicacion || null,
      foto_archivo: fila.foto_archivo || null,
    });
  });

  return { filas, errores };
}

export function generarPlantillaExcel() {
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");
  XLSX.writeFile(workbook, "plantilla-productos.xlsx");
}
