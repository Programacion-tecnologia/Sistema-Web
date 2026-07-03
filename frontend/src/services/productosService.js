import { supabase } from "./supabaseClient";
import { findOrCreateCategoria } from "./categoriasService";
import { uploadProductoFoto } from "./storageService";

const PRODUCTO_SELECT = "*, categoria:categorias(id, nombre)";
const UPLOAD_CONCURRENCY = 5;

export async function listProductos() {
  const { data, error } = await supabase
    .from("productos")
    .select(PRODUCTO_SELECT)
    .order("nombre");

  if (error) throw error;
  return data;
}

export async function getProducto(id) {
  const { data, error } = await supabase
    .from("productos")
    .select(PRODUCTO_SELECT)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProducto(payload) {
  const { data, error } = await supabase
    .from("productos")
    .insert(payload)
    .select(PRODUCTO_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProducto(id, payload) {
  const { data, error } = await supabase
    .from("productos")
    .update(payload)
    .eq("id", id)
    .select(PRODUCTO_SELECT)
    .single();

  if (error) throw error;
  return data;
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
 */
export async function importProductos(filas, archivosPorNombre = new Map(), onProgress) {
  const resumen = {
    creados: 0,
    actualizados: 0,
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
  let existentesPorCodigoBarras = new Map();
  let existentesPorCodigoReferencia = new Map();

  if (codigosBarras.length > 0) {
    const { data: existentes, error } = await supabase
      .from("productos")
      .select("id, codigo_barras")
      .in("codigo_barras", codigosBarras);

    if (error) throw error;
    existentesPorCodigoBarras = new Map(existentes.map((p) => [p.codigo_barras, p.id]));
  }

  if (codigosReferencia.length > 0) {
    const { data: existentes, error } = await supabase
      .from("productos")
      .select("id, codigo_referencia")
      .in("codigo_referencia", codigosReferencia);

    if (error) throw error;
    existentesPorCodigoReferencia = new Map(existentes.map((p) => [p.codigo_referencia, p.id]));
  }

  const paraInsertar = [];
  const paraActualizar = [];
  const fotoTareasPendientes = [];

  for (const fila of filas) {
    const payloadBase = {
      codigo_referencia: fila.codigo_referencia,
      codigo_barras: fila.codigo_barras,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      categoria_id: categoriaIdPorFila.get(fila.numeroFila) ?? null,
      color: fila.color,
      modelo: fila.modelo,
      precio_compra: fila.precio_compra,
      precio_venta: fila.precio_venta,
      stock_fisico: fila.stock_fisico,
      ubicacion: fila.ubicacion,
    };

    const idExistente =
      (fila.codigo_referencia && existentesPorCodigoReferencia.get(fila.codigo_referencia)) ||
      (fila.codigo_barras && existentesPorCodigoBarras.get(fila.codigo_barras)) ||
      undefined;
    const productoId = idExistente ?? crypto.randomUUID();

    if (idExistente) {
      paraActualizar.push({ id: idExistente, payload: payloadBase });
    } else {
      paraInsertar.push({ id: productoId, ...payloadBase });
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

  onProgress?.("guardando", 0, paraInsertar.length + paraActualizar.length);

  if (paraInsertar.length > 0) {
    const { error } = await supabase.from("productos").insert(paraInsertar);
    if (error) throw error;
    resumen.creados = paraInsertar.length;
  }
  onProgress?.("guardando", paraInsertar.length, paraInsertar.length + paraActualizar.length);

  for (const { id, payload } of paraActualizar) {
    const { error } = await supabase.from("productos").update(payload).eq("id", id);
    if (error) {
      resumen.errores.push({ fila: null, motivo: `No se pudo actualizar el producto ${id}: ${error.message}` });
      continue;
    }
    resumen.actualizados += 1;
  }
  onProgress?.("guardando", paraInsertar.length + paraActualizar.length, paraInsertar.length + paraActualizar.length);

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
