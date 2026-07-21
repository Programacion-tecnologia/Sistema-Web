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
  "precio mayorista": "precio_mayorista",
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
  "Precio mayorista",
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
  "58.00",
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
      precio_mayorista: Number(fila.precio_mayorista) || 0,
      stock_fisico: Math.trunc(Number(fila.stock_fisico)) || 0,
      ubicacion: fila.ubicacion || null,
      foto_archivo: fila.foto_archivo || null,
    });
  });

  return { filas, errores };
}

// --- Formato "pedido a proveedor" (Compras > Importar Excel) --------------
//
// Es el Excel que el negocio ya usa para armar el pedido al proveedor (ej.
// "BIKER Y LAQUILLA JUN 25.xlsx"), tal cual, sin pedirle que lo re-arme en
// la plantilla del sistema. Columnas conocidas:
//
//   CÓDIGO | UN | CANT. | DESCRIPCIÓN | MARCA | X MAYOR | PUBLICO | COSTO?
//
// - X MAYOR / PUBLICO son precios de VENTA (mayorista/publico) - el costo
//   real al proveedor no viene en este archivo (llega despues con la
//   factura), salvo que se agregue una columna COSTO opcional.
// - CONTEO y la columna de total (sin encabezado) se ignoran: son para la
//   hoja impresa de almacen.
// - Al pie suele haber filas de notas sueltas ("LO DE CELESTE ES NUEVO...")
//   sin codigo ni cantidad: se ignoran sin marcar error.

const PROVEEDOR_HEADER_MAP = {
  codigo: "codigo",
  un: "unidad",
  "cant.": "cantidad",
  cant: "cantidad",
  cantidad: "cantidad",
  descripcion: "nombre",
  marca: "marca",
  "x mayor": "precio_mayorista",
  publico: "precio_venta",
  costo: "costo",
};

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

export function parseCompraProveedorExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // El encabezado no siempre es la fila 1 (a veces hay titulo/logo arriba):
  // se busca la primera fila que tenga "codigo" y alguna variante de "cant".
  let filaEncabezado = -1;
  const columnaPorCampo = {};
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const campos = {};
    rawRows[i].forEach((celda, col) => {
      const campo = PROVEEDOR_HEADER_MAP[normalizeHeader(celda)];
      if (campo && !(campo in campos)) campos[campo] = col;
    });
    if ("codigo" in campos && "cantidad" in campos) {
      filaEncabezado = i;
      Object.assign(columnaPorCampo, campos);
      break;
    }
  }

  if (filaEncabezado === -1) {
    throw new Error(
      'No se encontró la fila de encabezados (se esperan al menos las columnas "CÓDIGO" y "CANT.").'
    );
  }

  const filas = [];
  const errores = [];
  let notasIgnoradas = 0;

  for (let i = filaEncabezado + 1; i < rawRows.length; i++) {
    const numeroFila = i + 1;
    const celda = (campo) => {
      const col = columnaPorCampo[campo];
      return col === undefined ? "" : rawRows[i][col] ?? "";
    };

    const codigo = String(celda("codigo")).trim();
    const cantidadCruda = celda("cantidad");
    const tieneCantidad = String(cantidadCruda).trim() !== "";

    if (!codigo && !tieneCantidad) {
      // Fila vacia o nota al pie: si tiene algun texto suelto cuenta como
      // nota ignorada, si no es solo una fila en blanco.
      if (rawRows[i].some((c) => String(c).trim() !== "")) notasIgnoradas += 1;
      continue;
    }

    if (!codigo) {
      errores.push({ fila: numeroFila, motivo: "Falta el código" });
      continue;
    }

    const cantidad = Math.trunc(Number(cantidadCruda));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      errores.push({ fila: numeroFila, motivo: `Cantidad inválida ("${cantidadCruda}")` });
      continue;
    }

    const nombre = String(celda("nombre")).trim();
    if (!nombre) {
      errores.push({ fila: numeroFila, motivo: "Falta la descripción" });
      continue;
    }

    filas.push({
      numeroFila,
      codigo_referencia: codigo,
      unidad: String(celda("unidad")).trim() || null,
      cantidad,
      nombre,
      marca: String(celda("marca")).trim() || null,
      precio_venta: redondear2(celda("precio_venta")),
      precio_mayorista: redondear2(celda("precio_mayorista")),
      costo: redondear2(celda("costo")),
    });
  }

  return { filas, errores, notasIgnoradas, tieneColumnaCosto: "costo" in columnaPorCampo };
}

export function generarPlantillaExcel() {
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");
  XLSX.writeFile(workbook, "plantilla-productos.xlsx");
}
