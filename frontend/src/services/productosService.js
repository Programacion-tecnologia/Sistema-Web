import { supabase } from "./supabaseClient";
import { findOrCreateCategoria } from "./categoriasService";
import { uploadProductoFoto } from "./storageService";
import { ROLES } from "../utils/roles";

// precio_compra no se puede ocultar por rol a nivel de RLS (es por fila
// completa, no por columna, y todos los usuarios autenticados comparten el
// mismo rol de base de datos) - se excluye aca, en el select mismo, para que
// ni siquiera llegue al navegador si el rol no corresponde. Documentado como
// proteccion de UX, no como blindaje de base de datos: un usuario tecnico
// con su propio token podria pedir la columna igual vía la API REST directa.
const COLUMNAS_BASE =
  "id, codigo_barras, codigo_referencia, nombre, descripcion, categoria_id, precio_venta, precio_mayorista, stock_fisico, stock_reservado, stock_disponible, stock_minimo, ubicacion, estado, color, modelo, unidad, foto_url, moneda, tipo_cambio, created_by, created_at, updated_at";

const PRODUCTO_SELECT_COMPLETO = `${COLUMNAS_BASE}, precio_compra, categoria:categorias(id, nombre)`;

function construirProductoSelect(rol) {
  const puedeVerCosto = rol === ROLES.ADMIN || rol === ROLES.GERENCIA;
  const columnas = puedeVerCosto ? `${COLUMNAS_BASE}, precio_compra` : COLUMNAS_BASE;
  return `${columnas}, categoria:categorias(id, nombre)`;
}

const UPLOAD_CONCURRENCY = 5;

// Tamanos de lote para que una importacion grande (miles de filas) no falle
// ni se cuelgue:
// - LOTE_CONSULTA: los .in(...) para detectar productos existentes van en la
//   URL de la consulta - con miles de codigos esa URL puede superar el
//   limite de longitud del gateway y fallar directo, no solo tardar.
// - LOTE_INSERCION: evita un unico insert gigante en una sola request.
// - CONCURRENCIA_ACTUALIZACION: las actualizaciones (productos que ya
//   existen) no se pueden agrupar en un solo statement (cada fila tiene
//   valores distintos), pero se pueden paralelizar en tandas chicas en vez
//   de una request a la vez - antes, reimportar miles de productos ya
//   existentes tardaba minutos por ser 100% secuencial.
const LOTE_CONSULTA = 200;
const LOTE_INSERCION = 500;
const CONCURRENCIA_ACTUALIZACION = 8;

function dividirEnLotes(array, tamano) {
  const lotes = [];
  for (let i = 0; i < array.length; i += tamano) {
    lotes.push(array.slice(i, i + tamano));
  }
  return lotes;
}

async function buscarExistentesPorColumna(columna, valores) {
  const mapa = new Map();

  for (const lote of dividirEnLotes(valores, LOTE_CONSULTA)) {
    const { data, error } = await supabase.from("productos").select(`id, ${columna}`).in(columna, lote);
    if (error) throw error;
    for (const fila of data) {
      mapa.set(fila[columna], fila.id);
    }
  }

  return mapa;
}

// Para la vista previa de Compras > Importar Excel: que codigos de
// referencia del archivo ya existen en el catalogo (Map codigo -> id). El
// import en si vuelve a chequear adentro de importProductos(), esto es solo
// para mostrar "Nuevo"/"Existente" antes de confirmar.
export async function buscarIdsPorCodigoReferencia(codigos) {
  if (codigos.length === 0) return new Map();
  return buscarExistentesPorColumna("codigo_referencia", codigos);
}

export async function listProductos(rol) {
  const { data, error } = await supabase
    .from("productos")
    .select(construirProductoSelect(rol))
    .order("nombre");

  if (error) throw error;
  return data;
}

// --- Listado paginado de Productos (busqueda server-side) ---------------
//
// A diferencia de listProductos() de arriba (usado por el selector de
// Cotizaciones y el Dashboard, que si necesitan el catalogo completo), la
// pantalla de Productos pagina: nunca baja mas de PRODUCTOS_PAGE_SIZE filas
// completas por pedido.

export const PRODUCTOS_PAGE_SIZE = 30;

// Escapa los caracteres especiales de ILIKE (%, _ y la \ misma) para que se
// busquen tal cual si aparecen en el termino (los codigos de referencia usan
// "_" como separador real, no como wildcard), y ademas la comilla doble, que
// es la que delimita el patron dentro de .or().
function escaparIlike(termino) {
  return termino.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/"/g, '\\"');
}

// Envuelve el patron entre comillas para que .or() no se rompa si el termino
// trae una coma, y lo rodea de % para buscar como substring.
function construirPatronIlike(termino) {
  return `"%${escaparIlike(termino)}%"`;
}

// Filtro de Modelo del lado del servidor, sin bajar ni mandar la lista de ids
// (con cientos de UUIDs la URL de .in("id", ...) superaba el limite y
// PostgREST devolvia 400). El campo modelo guarda una o varias motos
// separadas por " / " (ej. "CRF250R / CRF450R"), y como ya no hay barras
// dentro del nombre de un modelo, un token calza SOLO si aparece como
// elemento completo de esa lista - nunca como substring. Eso se expresa con
// cuatro patrones ILIKE por variante (unico, al inicio, al final, en medio),
// con el token literal (%/_ escapados) y las barras reales como separador,
// para que filtrar "CB300" no traiga "CB250F TWISTER" ni "CBR250-300".
function construirFiltroModelo(modelos) {
  const condiciones = [];
  for (const modelo of modelos) {
    const t = escaparIlike(modelo);
    condiciones.push(`modelo.ilike."${t}"`);
    condiciones.push(`modelo.ilike."${t} / %"`);
    condiciones.push(`modelo.ilike."% / ${t}"`);
    condiciones.push(`modelo.ilike."% / ${t} / %"`);
  }
  return condiciones.join(",");
}

export async function buscarProductosPaginado({
  rol,
  pagina,
  termino = "",
  marcaId = "",
  modelos = null,
  porReponer = false,
}) {
  // modelos: variantes de texto del modelo elegido a las que restringir el
  // listado (ej. ["CRF230F"]), resueltas en el cliente contra el dropdown.
  // null = sin restriccion; [] = filtro activo pero sin variantes conocidas
  // aun (datos del dropdown todavia cargando) => sin resultados.
  if (modelos !== null && modelos.length === 0) {
    return { data: [], count: 0 };
  }

  let consulta = supabase
    .from("productos")
    .select(construirProductoSelect(rol), { count: "exact" })
    .order("nombre");

  const terminoLimpio = termino.trim();
  if (terminoLimpio) {
    const patron = construirPatronIlike(terminoLimpio);
    consulta = consulta.or(`nombre.ilike.${patron},codigo_referencia.ilike.${patron}`);
  }
  if (marcaId) {
    consulta = consulta.eq("categoria_id", marcaId);
  }
  if (porReponer) {
    // necesita_reposicion es la columna calculada de 0015 (stock_minimo > 0 y
    // stock_disponible <= stock_minimo): el filtro se resuelve en el servidor.
    consulta = consulta.eq("necesita_reposicion", true);
  }
  if (modelos !== null) {
    // Cada .or() es un filtro top-level independiente: PostgREST los combina
    // con AND entre si (y con el .eq de marca), asi que este OR de patrones
    // de modelo se intersecta correctamente con la busqueda y la marca.
    consulta = consulta.or(construirFiltroModelo(modelos));
  }

  const desde = pagina * PRODUCTOS_PAGE_SIZE;
  const { data, error, count } = await consulta.range(desde, desde + PRODUCTOS_PAGE_SIZE - 1);

  if (error) throw error;
  return { data, count: count ?? 0 };
}

// Productos para el catálogo PDF: mismos filtros que el listado (búsqueda,
// marca, modelo) pero trae TODOS los que matchean (no paginado), en lotes
// explícitos de 1000 vía .range() para no depender del límite implícito del
// proyecto (mismo patrón que listModelosProductos). Solo los campos que el
// catálogo necesita.
export async function buscarProductosParaCatalogo({ termino = "", marcaId = "", modelos = null }) {
  if (modelos !== null && modelos.length === 0) return [];

  const LOTE = 1000;
  const terminoLimpio = termino.trim();
  const patron = terminoLimpio ? construirPatronIlike(terminoLimpio) : null;

  const filas = [];
  let desde = 0;
  while (true) {
    let consulta = supabase
      .from("productos")
      .select(
        "id, nombre, codigo_referencia, precio_venta, precio_mayorista, moneda, modelo, color, unidad, foto_url, categoria:categorias(nombre)"
      )
      .order("nombre");

    if (patron) consulta = consulta.or(`nombre.ilike.${patron},codigo_referencia.ilike.${patron}`);
    if (marcaId) consulta = consulta.eq("categoria_id", marcaId);
    if (modelos !== null) consulta = consulta.or(construirFiltroModelo(modelos));

    const { data, error } = await consulta.range(desde, desde + LOTE - 1);
    if (error) throw error;
    filas.push(...data);
    if (data.length < LOTE) break;
    desde += LOTE;
  }
  return filas;
}

// Fetch liviano (solo id + modelo) para armar el dropdown de "Modelo" y para
// resolver, en el cliente, que ids calzan con el modelo elegido. Se pide UNA
// sola vez por sesion (se cachea la promesa) y en lotes explicitos de 1000
// via .range() - asi no importa cual sea el limite de filas configurado en
// el proyecto de Supabase, nunca depende de un limite implicito (por eso se
// habia perdido antes el producto 100648 del listado sin paginar).
const LOTE_MODELOS = 1000;
let cacheModelosPromise = null;

export function listModelosProductos() {
  if (!cacheModelosPromise) {
    cacheModelosPromise = (async () => {
      const filas = [];
      let desde = 0;
      while (true) {
        const { data, error } = await supabase
          .from("productos")
          .select("id, modelo")
          .range(desde, desde + LOTE_MODELOS - 1);
        if (error) throw error;
        filas.push(...data);
        if (data.length < LOTE_MODELOS) break;
        desde += LOTE_MODELOS;
      }
      return filas;
    })().catch((error) => {
      cacheModelosPromise = null;
      throw error;
    });
  }
  return cacheModelosPromise;
}

export async function getProducto(id, rol) {
  const { data, error } = await supabase
    .from("productos")
    .select(construirProductoSelect(rol))
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// create/update solo los puede llamar admin/gerencia (RLS + rutas protegidas
// en el frontend), asi que siempre devuelven todas las columnas.
export async function createProducto(payload) {
  const { data, error } = await supabase
    .from("productos")
    .insert(payload)
    .select(PRODUCTO_SELECT_COMPLETO)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe un producto con ese código de referencia o código de barras.");
    }
    throw error;
  }
  return data;
}

export async function updateProducto(id, payload) {
  const { data, error } = await supabase
    .from("productos")
    .update(payload)
    .eq("id", id)
    .select(PRODUCTO_SELECT_COMPLETO)
    .single();

  if (error) throw error;
  return data;
}

// Si el producto ya fue cotizado alguna vez, la FK cotizacion_items ->
// productos (sin ON DELETE CASCADE) hace fallar el borrado con codigo 23503:
// se traduce a un mensaje que sugiere marcarlo inactivo en vez de borrarlo.
export async function deleteProducto(id) {
  const { error } = await supabase.from("productos").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Este producto ya tiene cotizaciones asociadas y no se puede eliminar. Marca su estado como \"Inactivo\" en su lugar."
      );
    }
    throw error;
  }
}

// Trade-off documentado: el parser convierte celdas numericas vacias en 0,
// asi que "0 explicito" y "celda vacia" son indistinguibles - un 0 en
// precio/stock tampoco actualiza. Para poner un stock/precio en 0 de un
// producto existente esta la pantalla de edicion del producto.
function limpiarCamposVacios(payload) {
  const resultado = {};
  for (const [campo, valor] of Object.entries(payload)) {
    if (valor === null || valor === "" || (typeof valor === "number" && valor === 0)) continue;
    resultado[campo] = valor;
  }
  return resultado;
}

async function resolverCategorias(filas) {
  const cache = new Map();
  const categoriaIdPorFila = new Map();

  for (const fila of filas) {
    if (!fila.categoria) continue;

    const clave = fila.categoria.trim().toLowerCase();
    if (!cache.has(clave)) {
      const categoria = await findOrCreateCategoria(fila.categoria);
      cache.set(clave, categoria.id);
    }
    categoriaIdPorFila.set(fila.numeroFila, cache.get(clave));
  }

  return categoriaIdPorFila;
}

async function subirFotosEnTandas(tareas, onProgress) {
  const resultados = [];

  for (let i = 0; i < tareas.length; i += UPLOAD_CONCURRENCY) {
    const tanda = tareas.slice(i, i + UPLOAD_CONCURRENCY);
    const resultadosTanda = await Promise.all(
      tanda.map(async (tarea) => {
        try {
          const fotoUrl = await uploadProductoFoto(tarea.productoId, tarea.file);
          await supabase.from("productos").update({ foto_url: fotoUrl }).eq("id", tarea.productoId);
          return { ...tarea, ok: true };
        } catch (error) {
          return { ...tarea, ok: false, error: error.message };
        }
      })
    );
    resultados.push(...resultadosTanda);
    onProgress?.(resultados.length, tareas.length);
  }

  return resultados;
}

/**
 * @param {Array} filas - filas ya parseadas por excelService.parseProductosExcel
 * @param {Map<string, File>} archivosPorNombre - nombre de archivo (lowercase) -> File, del lote opcional de fotos
 * @param {(etapa: string, actual: number, total: number) => void} [onProgress]
 * @param {{ compra_id: string, moneda: string } | null} [opcionesCompra] - si la
 *   importacion nace asociada a una compra (ver ProductosImportar.jsx): el
 *   stock y el costo de compra NO se escriben directo en productos, nacen
 *   como lineas de compra_items y solo se aplican de verdad cuando alguien
 *   reciba esa compra (recibir_compra(), 0012) - mismo camino y misma
 *   auditoria que cualquier otra compra, sea el producto nuevo o ya
 *   existente (reabastecimiento).
 */
export async function importProductos(filas, archivosPorNombre = new Map(), onProgress, opcionesCompra = null) {
  const resumen = {
    creados: 0,
    actualizados: 0,
    itemsCompra: 0,
    fotosSubidas: 0,
    fotosNoEncontradas: [],
    errores: [],
  };

  if (filas.length === 0) return resumen;

  const categoriaIdPorFila = await resolverCategorias(filas);

  // El codigo de referencia es hoy el codigo principal del negocio (el de
  // barras recien se va a adoptar), asi que un producto ya existente se
  // reconoce por cualquiera de los dos.
  const codigosBarras = filas.map((f) => f.codigo_barras).filter(Boolean);
  const codigosReferencia = filas.map((f) => f.codigo_referencia).filter(Boolean);

  const existentesPorCodigoBarras =
    codigosBarras.length > 0 ? await buscarExistentesPorColumna("codigo_barras", codigosBarras) : new Map();
  const existentesPorCodigoReferencia =
    codigosReferencia.length > 0
      ? await buscarExistentesPorColumna("codigo_referencia", codigosReferencia)
      : new Map();

  const paraInsertar = [];
  const paraActualizar = [];
  const fotoTareasPendientes = [];
  const compraItemsPendientes = [];

  for (const fila of filas) {
    const camposComunes = {
      codigo_referencia: fila.codigo_referencia,
      codigo_barras: fila.codigo_barras,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      categoria_id: categoriaIdPorFila.get(fila.numeroFila) ?? null,
      color: fila.color,
      modelo: fila.modelo,
      precio_venta: fila.precio_venta,
      precio_mayorista: fila.precio_mayorista ?? 0,
      ubicacion: fila.ubicacion,
    };

    const idExistente =
      (fila.codigo_referencia && existentesPorCodigoReferencia.get(fila.codigo_referencia)) ||
      (fila.codigo_barras && existentesPorCodigoBarras.get(fila.codigo_barras)) ||
      undefined;
    const productoId = idExistente ?? crypto.randomUUID();

    if (idExistente) {
      // Reabastecimiento atado a una compra: NO se toca stock_fisico ni
      // precio_compra aca (se omiten del payload) - suben juntos, de verdad,
      // recien cuando se reciba la compra.
      // limpiarCamposVacios: en un producto YA existente, una celda vacia
      // del Excel significa "no tocar ese campo", no "borrarlo" - asi un
      // Excel de reabastecimiento con solo codigo+cantidad+costo no pisa
      // color/modelo/marca/precios del catalogo (decision de negocio,
      // 2026-07-17; antes un vacio sobrescribia con null/0 y borro datos
      // reales en una prueba).
      const payload = limpiarCamposVacios(
        opcionesCompra
          ? camposComunes
          : { ...camposComunes, precio_compra: fila.precio_compra, stock_fisico: fila.stock_fisico }
      );
      paraActualizar.push({ id: idExistente, payload });
    } else {
      // Producto nuevo atado a una compra: nace con stock 0 (y precio_compra
      // en su default 0) - mismo motivo que arriba.
      const payload = opcionesCompra
        ? { ...camposComunes, moneda: opcionesCompra.moneda, stock_fisico: 0 }
        : { ...camposComunes, precio_compra: fila.precio_compra, stock_fisico: fila.stock_fisico };
      paraInsertar.push({ id: productoId, ...payload });
    }

    if (opcionesCompra && fila.stock_fisico > 0) {
      compraItemsPendientes.push({
        compra_id: opcionesCompra.compra_id,
        producto_id: productoId,
        cantidad: fila.stock_fisico,
        costo_unitario: fila.precio_compra ?? 0,
      });
    }

    if (fila.foto_archivo) {
      const archivo = archivosPorNombre.get(fila.foto_archivo.trim().toLowerCase());
      if (archivo) {
        fotoTareasPendientes.push({ productoId, file: archivo, fila: fila.numeroFila });
      } else {
        resumen.fotosNoEncontradas.push({ fila: fila.numeroFila, archivo: fila.foto_archivo });
      }
    }
  }

  const totalGuardar = paraInsertar.length + paraActualizar.length;
  onProgress?.("guardando", 0, totalGuardar);

  if (paraInsertar.length > 0) {
    let insertados = 0;
    for (const lote of dividirEnLotes(paraInsertar, LOTE_INSERCION)) {
      const { error } = await supabase.from("productos").insert(lote);
      if (error) throw error;
      insertados += lote.length;
      onProgress?.("guardando", insertados, totalGuardar);
    }
    resumen.creados = paraInsertar.length;
  }

  for (const tanda of dividirEnLotes(paraActualizar, CONCURRENCIA_ACTUALIZACION)) {
    const resultados = await Promise.all(
      tanda.map(async ({ id, payload }) => {
        const { error } = await supabase.from("productos").update(payload).eq("id", id);
        return { id, error };
      })
    );

    for (const { id, error } of resultados) {
      if (error) {
        resumen.errores.push({ fila: null, motivo: `No se pudo actualizar el producto ${id}: ${error.message}` });
      } else {
        resumen.actualizados += 1;
      }
    }
    onProgress?.("guardando", paraInsertar.length + resumen.actualizados + resumen.errores.length, totalGuardar);
  }

  // Recien aca, con los productos (nuevos y existentes) ya insertados/
  // actualizados de verdad en la base, se registran las lineas de compra -
  // productoId ya se conocia de antemano (mismo motivo que
  // fotoTareasPendientes: se genera client-side antes del insert).
  if (compraItemsPendientes.length > 0) {
    onProgress?.("compra", 0, compraItemsPendientes.length);
    let registrados = 0;
    for (const lote of dividirEnLotes(compraItemsPendientes, LOTE_INSERCION)) {
      const { error } = await supabase.from("compra_items").insert(lote);
      if (error) throw error;
      registrados += lote.length;
      onProgress?.("compra", registrados, compraItemsPendientes.length);
    }
    resumen.itemsCompra = compraItemsPendientes.length;
  }

  if (fotoTareasPendientes.length > 0) {
    const resultadosFotos = await subirFotosEnTandas(fotoTareasPendientes, (actual, total) =>
      onProgress?.("fotos", actual, total)
    );
    for (const resultado of resultadosFotos) {
      if (resultado.ok) {
        resumen.fotosSubidas += 1;
      } else {
        resumen.errores.push({
          fila: resultado.fila,
          motivo: `No se pudo subir la foto: ${resultado.error}`,
        });
      }
    }
  }

  return resumen;
}
