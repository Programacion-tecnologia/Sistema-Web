// Portado de un prototipo HTML/JS previo, probado contra cotizaciones reales
// de Rios Performance en el sistema Mifact (incluye el caso real de codigos
// partidos en dos lineas del PDF, ej. "A06-29OD-" + "F04"). Se mantiene el
// algoritmo de parseo tal cual esta probado; la unica adaptacion real es que
// el precio unitario importado se calcula neto de descuento
// (precio_total / cantidad) en vez del precio unitario bruto del PDF, para
// que el total importado coincida siempre con el total acordado con el
// cliente aunque haya descuento.
const PATRON_LINEA_A_OMITIR =
  /CODIGO|ARTICULO|CANT\.|U\.M\.|PRECIO|SUBTOTAL|IGV|^TOTAL|SON:|OBSERVACIONES|COTIZACI|DEVOLUCION|R\.U\.C\.|EMISI[OÓ]N|CLIENTE|VENDEDOR|COND\. VENTA|DIRECCI[OÓ]N|^ITEM$/i;

function sacarTokenDecimal(tokens) {
  if (tokens.length === 0) return null;
  const ultimo = tokens[tokens.length - 1];
  if (/^\d+(?:[.,]\d{1,2})?$/.test(ultimo)) return tokens.pop();
  return null;
}

function parsearLineaAItem(linea) {
  if (PATRON_LINEA_A_OMITIR.test(linea)) return null;

  const tokens = linea.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;
  if (!/^\d{1,3}$/.test(tokens[0])) return null;
  tokens.shift(); // numero de item

  if (tokens.length < 2) return null;

  const codigo = tokens.shift();
  if (codigo.length < 3 || !/^[A-Z0-9][A-Z0-9.\-_]+$/i.test(codigo)) return null;

  const tokenPrecioTotal = sacarTokenDecimal(tokens);

  if (tokens.length && tokens[tokens.length - 1] === "%") {
    tokens.pop();
    sacarTokenDecimal(tokens); // dsc: se descarta, ya queda reflejado en precio_total
  } else if (tokens.length && /^\d+(?:[.,]\d{1,2})?%$/.test(tokens[tokens.length - 1])) {
    tokens.pop(); // dsc y "%" pegados en un solo token, ej. "12.00%"
  }

  const tokenPrecioUnitarioPdf = sacarTokenDecimal(tokens);

  if (tokens.length && /^[A-ZÁÉÍÓÚÑ]{2,10}$/i.test(tokens[tokens.length - 1])) {
    tokens.pop(); // U.M. (a veces no viene, ej. "KIT CARBURADOR ... 1 21.18 ...")
  }

  let tokenCantidad = null;
  if (tokens.length && /^\d{1,4}$/.test(tokens[tokens.length - 1])) {
    tokenCantidad = tokens.pop();
  }

  if (!tokenCantidad || !tokenPrecioUnitarioPdf) return null;

  const cantidad = parseInt(tokenCantidad, 10) || 1;
  const precioTotal = tokenPrecioTotal ? parseFloat(tokenPrecioTotal.replace(",", ".")) || 0 : null;
  const precioUnitarioPdf = parseFloat(tokenPrecioUnitarioPdf.replace(",", ".")) || 0;
  // Neto de descuento (precio_total ya lo incluye) en vez del precio unitario
  // bruto del PDF: cotizacion_items no modela un % de descuento aparte.
  const precioUnitario = precioTotal !== null ? precioTotal / cantidad : precioUnitarioPdf;

  return {
    codigo_pdf: codigo,
    descripcion_pdf: tokens.join(" ").trim() || "(sin nombre)",
    cantidad,
    precio_unitario: precioUnitario,
  };
}

/**
 * Parsea el texto ya extraido de un PDF de cotizacion Mifact. `lineas` son
 * las lineas visuales reconstruidas del PDF. Ademas de lineas de item
 * completas en una sola linea fisica, reconstruye dos casos reales de
 * continuacion en la linea siguiente: descripciones que se cortan a la mitad
 * (se pegan al nombre del item anterior) y codigos que quedan partidos en
 * dos lineas, ej. "A06-29OD-" + "F04" (se pegan al codigo del item anterior
 * cuando el fragmento siguiente es corto y el codigo anterior termina en
 * "-", "." o "_").
 */
export function parsearTextoCotizacionMifact(lineasOriginales) {
  // Se recorta cada linea antes de cualquier chequeo anclado (^Cliente,
  // ^TOTAL, ^ITEM$): la extraccion real del PDF a veces deja un espacio
  // inicial en algunas lineas (no todas), y un regex anclado con "^" no lo
  // tolera aunque el tokenizado por split(/\s+/) si lo ignore.
  const lineas = lineasOriginales.map((linea) => linea.trim());

  const items = [];
  let ultimoItem = null;
  let cliente = null;
  let rucDni = null;

  for (const linea of lineas) {
    // No se exige que "Vendedor" este en la misma linea reconstruida: en el
    // PDF real, "Cliente : X" y "Vendedor : Y" a veces quedan en dos lineas
    // separadas (columnas con distinta posicion Y), asi que alcanza con
    // "Cliente :" solo, y si "Vendedor" aparece pegado en la misma linea se
    // recorta del nombre capturado.
    const match = linea.match(/^Cliente\s*:\s*(.+)$/i);
    if (match) {
      cliente = match[1].replace(/\s+Vendedor\s*:.*$/i, "").trim();
      break;
    }
  }

  // "RUC o DNI :" es el del CLIENTE (distinto del "R.U.C." de la empresa
  // emisora que aparece arriba del todo, ese lo descarta PATRON_LINEA_A_OMITIR
  // por tener puntos: "R.U.C."). Como no tiene puntos, no cae en ese patron,
  // y como aparece antes de cualquier item real, el chequeo de "!ultimoItem"
  // mas abajo ya lo ignora sin necesidad de agregarlo ahi tambien.
  for (const linea of lineas) {
    const match = linea.match(/^RUC\s*o\s*DNI\s*:\s*(.+)$/i);
    if (match) {
      rucDni = match[1].trim();
      break;
    }
  }

  for (const linea of lineas) {
    if (PATRON_LINEA_A_OMITIR.test(linea)) {
      ultimoItem = null;
      continue;
    }

    const parseado = parsearLineaAItem(linea);
    if (parseado) {
      items.push(parseado);
      ultimoItem = parseado;
      continue;
    }

    if (!ultimoItem) continue;

    const tokens = linea.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const pareceFragmentoDeCodigo =
      tokens.length <= 2 &&
      tokens.every((t) => /^[A-Z0-9.\-_]{1,12}$/i.test(t)) &&
      tokens.some((t) => /\d/.test(t));

    if (pareceFragmentoDeCodigo && /[-._]$/.test(ultimoItem.codigo_pdf)) {
      ultimoItem.codigo_pdf = ultimoItem.codigo_pdf + tokens.join("");
    } else {
      ultimoItem.descripcion_pdf = (ultimoItem.descripcion_pdf + " " + linea).trim();
    }
  }

  return { cliente, rucDni, items };
}
