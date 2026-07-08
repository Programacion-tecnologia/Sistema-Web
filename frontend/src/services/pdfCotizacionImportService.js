import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { parsearTextoCotizacionMifact } from "../utils/parserCotizacionMifact";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Cuanto puede variar la coordenada Y entre dos items de texto para
// considerarse la misma linea visual (tolerancia chica, en unidades de PDF).
const TOLERANCIA_Y = 2;

/**
 * getTextContent() de pdfjs-dist NO garantiza que los items vengan en orden
 * de lectura (depende de como el generador del PDF escribio el stream) -
 * critico aca porque el PDF es una tabla con columnas. Se agrupan los items
 * por coordenada Y (con tolerancia) para reconstruir cada linea visual, y
 * dentro de cada linea se ordenan por X ascendente antes de unir el texto.
 */
function reconstruirLineas(items) {
  const grupos = [];

  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    let grupo = grupos.find((g) => Math.abs(g.y - y) <= TOLERANCIA_Y);
    if (!grupo) {
      grupo = { y, items: [] };
      grupos.push(grupo);
    }
    grupo.items.push({ x, texto: item.str });
  }

  // Y en PDF crece hacia arriba: se ordena descendente para leer de arriba
  // hacia abajo, como en la pagina.
  grupos.sort((a, b) => b.y - a.y);

  return grupos.map((grupo) =>
    grupo.items
      .sort((a, b) => a.x - b.x)
      .map((i) => i.texto)
      .join(" ")
  );
}

async function extraerLineasDePdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  const lineas = [];
  for (let numeroPagina = 1; numeroPagina <= pdf.numPages; numeroPagina++) {
    const pagina = await pdf.getPage(numeroPagina);
    const contenido = await pagina.getTextContent();
    lineas.push(...reconstruirLineas(contenido.items));
  }

  return lineas;
}

/**
 * @param {File} file
 * @returns {Promise<{clienteSugerido: string|null, rucDniSugerido: string|null, items: Array, lineasCrudas: string[]}>}
 */
export async function analizarPdfCotizacion(file) {
  const lineasCrudas = await extraerLineasDePdf(file);
  const { cliente, rucDni, items } = parsearTextoCotizacionMifact(lineasCrudas);

  return { clienteSugerido: cliente, rucDniSugerido: rucDni, items, lineasCrudas };
}
