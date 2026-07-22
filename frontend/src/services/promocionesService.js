import { supabase } from "./supabaseClient";

// Campos del producto que necesitan tanto la gestion como el showcase de
// ofertas (imagen, precio normal, moneda, marca para el badge).
const PRODUCTO_EMBED =
  "id, nombre, codigo_referencia, precio_venta, moneda, foto_url, estado, stock_disponible, categoria:categorias(nombre)";

// --- Gestion de promociones (Admin/Gerencia) ---------------------------

// Listado para el panel de gestion: cada promo con la cantidad de productos.
export async function listPromociones() {
  const { data, error } = await supabase
    .from("promociones")
    .select("*, promocion_productos(count)")
    .order("fecha_inicio", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((promo) => ({
    ...promo,
    total_productos: promo.promocion_productos?.[0]?.count ?? 0,
  }));
}

export async function getPromocion(id) {
  const { data, error } = await supabase
    .from("promociones")
    .select(`*, productos:promocion_productos(id, precio_oferta, producto:productos(${PRODUCTO_EMBED}))`)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createPromocion({ nombre, descripcion, fecha_inicio, fecha_fin, activa }) {
  const { data, error } = await supabase
    .from("promociones")
    .insert({ nombre, descripcion, fecha_inicio, fecha_fin, activa })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePromocion(id, { nombre, descripcion, fecha_inicio, fecha_fin, activa }) {
  const { data, error } = await supabase
    .from("promociones")
    .update({ nombre, descripcion, fecha_inicio, fecha_fin, activa })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePromocion(id) {
  const { error } = await supabase.from("promociones").delete().eq("id", id);
  if (error) throw error;
}

// Agregar/actualizar un producto de la promo. Upsert por (promocion, producto)
// para que reagregar el mismo producto solo cambie su precio de oferta.
export async function guardarProductoPromocion(promocionId, productoId, precioOferta) {
  const { data, error } = await supabase
    .from("promocion_productos")
    .upsert(
      { promocion_id: promocionId, producto_id: productoId, precio_oferta: precioOferta },
      { onConflict: "promocion_id,producto_id" }
    )
    .select(`id, precio_oferta, producto:productos(${PRODUCTO_EMBED})`)
    .single();

  if (error) throw error;
  return data;
}

export async function quitarProductoPromocion(promocionProductoId) {
  const { error } = await supabase.from("promocion_productos").delete().eq("id", promocionProductoId);
  if (error) throw error;
}

// --- Showcase de ofertas vigentes (todos los roles) --------------------

// Ofertas que estan corriendo AHORA: promo activa y hoy dentro del rango, y
// solo productos activos. !inner en ambos embeds para que el filtro por
// columnas de la promo/producto descarte las filas que no aplican.
export async function listOfertasVigentes() {
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from("promocion_productos")
    .select(
      `id, precio_oferta,
       producto:productos!inner(${PRODUCTO_EMBED}),
       promocion:promociones!inner(id, nombre, fecha_inicio, fecha_fin, activa)`
    )
    .eq("promocion.activa", true)
    .lte("promocion.fecha_inicio", ahora)
    .gte("promocion.fecha_fin", ahora)
    .eq("producto.estado", "activo");

  if (error) throw error;
  return data ?? [];
}

// Mapa producto_id -> precio_oferta de las ofertas vigentes AHORA. Lo usan los
// flujos de venta (POV, cotizacion manual y cotizacion PDF) para arrancar la
// linea al precio de oferta en vez del precio de lista. Si un producto cae en
// dos promos vigentes a la vez, se queda con el precio mas bajo.
export async function getPreciosOfertaVigentes() {
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from("promocion_productos")
    .select("producto_id, precio_oferta, promocion:promociones!inner(activa, fecha_inicio, fecha_fin)")
    .eq("promocion.activa", true)
    .lte("promocion.fecha_inicio", ahora)
    .gte("promocion.fecha_fin", ahora);

  if (error) throw error;

  const mapa = new Map();
  for (const row of data ?? []) {
    const prev = mapa.get(row.producto_id);
    if (prev === undefined || row.precio_oferta < prev) mapa.set(row.producto_id, row.precio_oferta);
  }
  return mapa;
}
