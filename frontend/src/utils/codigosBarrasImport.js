// Matching de un respaldo de la app vieja "verificador_pedidos" contra los
// productos actuales, para importar sus códigos de barras REALES (de fábrica).
// El respaldo indexa por un id interno que NO coincide con codigo_referencia,
// así que el match es por NOMBRE normalizado. Nada acá escribe en la base: solo
// clasifica para que el usuario revise y confirme.

// Normaliza un nombre para comparar: sin acentos, mayúsculas, solo alfanumérico
// con espacios simples. (Mismo criterio con el que se midió el 281/303.)
export function normalizarNombre(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// catalogo: productCatalog del respaldo ({ id: {name, barcodes:[...]} }).
// productos: [{ id, nombre, codigo_referencia, codigo_barras }] de la base.
// Devuelve tres grupos + un resumen.
export function matchearRespaldo(catalogo, productos) {
  const porNombre = new Map();
  for (const p of productos) {
    const k = normalizarNombre(p.nombre);
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(p);
  }
  const barrasUsadas = new Map();
  for (const p of productos) if (p.codigo_barras) barrasUsadas.set(p.codigo_barras, p);

  const listos = []; // { backupName, barcode, producto }
  const ambiguos = []; // { backupName, barcode, candidatos: [producto] }
  const sinMatch = []; // { backupName, barcode }
  const conflictos = []; // { backupName, barcode, producto, motivo }

  for (const id of Object.keys(catalogo)) {
    const e = catalogo[id];
    const barcode = (e.barcodes || [])[0];
    if (!barcode) continue; // sin código de barras en el respaldo: se ignora

    const matches = porNombre.get(normalizarNombre(e.name)) || [];
    if (matches.length === 0) {
      sinMatch.push({ backupName: e.name, barcode });
    } else if (matches.length > 1) {
      ambiguos.push({ backupName: e.name, barcode, candidatos: matches });
    } else {
      const producto = matches[0];
      if (producto.codigo_barras === barcode) {
        // ya lo tiene: nada que hacer
      } else if (producto.codigo_barras) {
        conflictos.push({ backupName: e.name, barcode, producto, motivo: `ya tiene ${producto.codigo_barras}` });
      } else if (barrasUsadas.has(barcode)) {
        conflictos.push({ backupName: e.name, barcode, producto, motivo: "ese código ya está en otro producto" });
      } else {
        listos.push({ backupName: e.name, barcode, producto });
      }
    }
  }

  return {
    listos,
    ambiguos,
    sinMatch,
    conflictos,
    resumen: {
      listos: listos.length,
      ambiguos: ambiguos.length,
      sinMatch: sinMatch.length,
      conflictos: conflictos.length,
    },
  };
}
