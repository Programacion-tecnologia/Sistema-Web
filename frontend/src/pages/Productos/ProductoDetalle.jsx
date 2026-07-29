import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createProducto,
  getProducto,
  updateProducto,
} from "../../services/productosService";
import { findOrCreateCategoria, listCategorias } from "../../services/categoriasService";
import { listProveedoresPorProducto } from "../../services/comprasService";
import { uploadProductoFoto } from "../../services/storageService";
import { obtenerTipoCambioReferencial } from "../../services/tipoCambioService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import Field from "../../components/ui/Field";
import FormSection from "../../components/ui/FormSection";
import FotoProducto from "../../components/Productos/FotoProducto";

const PUEDE_ESCRIBIR_PRODUCTOS = [ROLES.ADMIN, ROLES.GERENCIA];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

// Input de precio con el símbolo de la moneda adentro (S/ o $), alineado a la
// derecha para que los montos se lean como cifras.
function MoneyInput({ value, onChange, moneda }) {
  const simbolo = moneda === "USD" ? "$" : "S/";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-400">
        {simbolo}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={onChange}
        className={`${INPUT_CLASS} pl-9 text-right tabular-nums`}
      />
    </div>
  );
}

const FORM_INICIAL = {
  codigo_barras: "",
  codigo_referencia: "",
  nombre: "",
  descripcion: "",
  color: "",
  modelo: "",
  unidad: "",
  moneda: "PEN",
  tipo_cambio: "",
  precio_compra: "",
  precio_venta: "",
  precio_mayorista: "",
  stock_fisico: "",
  ubicacion: "",
  estado: "activo",
};

export default function ProductoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeEscribir = PUEDE_ESCRIBIR_PRODUCTOS.includes(rol);
  const modoEdicion = Boolean(id);

  const [productoId, setProductoId] = useState(id ?? null);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [categoriaNombre, setCategoriaNombre] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(modoEdicion);
  const [saving, setSaving] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [error, setError] = useState(null);
  const [fotoError, setFotoError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [errores, setErrores] = useState({});
  const [tipoCambioSugerido, setTipoCambioSugerido] = useState(null);
  const [proveedoresProducto, setProveedoresProducto] = useState([]);

  useEffect(() => {
    listCategorias().then(setCategorias).catch(() => {});
  }, []);

  useEffect(() => {
    if (!modoEdicion) return;
    listProveedoresPorProducto(id)
      .then(setProveedoresProducto)
      .catch(() => {});
  }, [id, modoEdicion]);

  useEffect(() => {
    obtenerTipoCambioReferencial()
      .then(setTipoCambioSugerido)
      .catch(() => {
        // La sugerencia es opcional: si la API externa falla, el campo
        // tipo_cambio sigue siendo editable a mano sin problema.
      });
  }, []);

  useEffect(() => {
    if (!modoEdicion) return;

    let activo = true;
    getProducto(id, rol)
      .then((producto) => {
        if (!activo) return;
        setForm({
          codigo_barras: producto.codigo_barras ?? "",
          codigo_referencia: producto.codigo_referencia ?? "",
          nombre: producto.nombre ?? "",
          descripcion: producto.descripcion ?? "",
          color: producto.color ?? "",
          modelo: producto.modelo ?? "",
          unidad: producto.unidad ?? "",
          moneda: producto.moneda ?? "PEN",
          tipo_cambio: producto.tipo_cambio != null ? String(producto.tipo_cambio) : "",
          precio_compra: String(producto.precio_compra ?? ""),
          precio_venta: String(producto.precio_venta ?? ""),
          precio_mayorista: String(producto.precio_mayorista ?? ""),
          stock_fisico: String(producto.stock_fisico ?? ""),
          ubicacion: producto.ubicacion ?? "",
          estado: producto.estado ?? "activo",
        });
        setCategoriaNombre(producto.categoria?.nombre ?? "");
        setFotoUrl(producto.foto_url ?? null);
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, [id, modoEdicion, rol]);

  const handleChange = (campo) => (event) => {
    setForm((prev) => ({ ...prev, [campo]: event.target.value }));
    // Al escribir, limpia el error de ese campo (si lo tenía).
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  const usarTipoCambioSugerido = () => {
    if (!tipoCambioSugerido) return;
    setForm((prev) => ({ ...prev, tipo_cambio: tipoCambioSugerido.valor.toFixed(4) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Validación por campo (se muestra debajo del campo que falla).
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio.";
    if (Object.keys(errs).length > 0) {
      setErrores(errs);
      return;
    }
    setErrores({});

    setSaving(true);
    setError(null);
    setMensaje(null);

    try {
      let categoriaId = null;
      if (categoriaNombre.trim()) {
        const categoria = await findOrCreateCategoria(categoriaNombre);
        categoriaId = categoria.id;
      }

      const payload = {
        codigo_barras: form.codigo_barras.trim() || null,
        codigo_referencia: form.codigo_referencia.trim() || null,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        categoria_id: categoriaId,
        color: form.color.trim() || null,
        modelo: form.modelo.trim() || null,
        unidad: form.unidad.trim() || null,
        moneda: form.moneda,
        tipo_cambio: form.tipo_cambio.trim() ? Number(form.tipo_cambio) : null,
        precio_compra: Number(form.precio_compra) || 0,
        precio_venta: Number(form.precio_venta) || 0,
        precio_mayorista: Number(form.precio_mayorista) || 0,
        stock_fisico: Math.trunc(Number(form.stock_fisico)) || 0,
        ubicacion: form.ubicacion.trim() || null,
        estado: form.estado,
      };

      if (productoId) {
        await updateProducto(productoId, payload);
        setMensaje("Producto actualizado.");
      } else {
        const nuevo = await createProducto(payload);
        setProductoId(nuevo.id);
        navigate(`/productos/${nuevo.id}`, { replace: true });
        setMensaje("Producto creado. Ya puedes agregar una foto.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !productoId) return;

    setSubiendoFoto(true);
    setFotoError(null);

    try {
      const url = await uploadProductoFoto(productoId, file);
      await updateProducto(productoId, { foto_url: url });
      setFotoUrl(url);
    } catch (err) {
      setFotoError(err.message);
    } finally {
      setSubiendoFoto(false);
      event.target.value = "";
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando producto...</p>;
  }

  return (
    <>
      <h2 className="text-2xl font-bold sm:text-3xl">
        {modoEdicion ? (puedeEscribir ? "Editar producto" : "Producto") : "Nuevo producto"}
      </h2>

      <div className="mt-6 flex flex-col lg:flex-row gap-6 items-start">
        <Card className="w-full lg:max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset disabled={!puedeEscribir} className="min-w-0 space-y-6">
              <FormSection title="Identificación">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nombre" required error={errores.nombre} className="sm:col-span-2">
                    <input value={form.nombre} onChange={handleChange("nombre")} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Código de referencia">
                    <input
                      value={form.codigo_referencia}
                      onChange={handleChange("codigo_referencia")}
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Código de barras">
                    <input
                      value={form.codigo_barras}
                      onChange={handleChange("codigo_barras")}
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Categoría / Marca" className="sm:col-span-2">
                    <input
                      list="categorias-existentes"
                      value={categoriaNombre}
                      onChange={(event) => setCategoriaNombre(event.target.value)}
                      className={INPUT_CLASS}
                    />
                    <datalist id="categorias-existentes">
                      {categorias.map((categoria) => (
                        <option key={categoria.id} value={categoria.nombre} />
                      ))}
                    </datalist>
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Detalles">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Descripción" className="sm:col-span-2">
                    <textarea
                      value={form.descripcion}
                      onChange={handleChange("descripcion")}
                      rows={2}
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Color">
                    <input value={form.color} onChange={handleChange("color")} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Modelo">
                    <input value={form.modelo} onChange={handleChange("modelo")} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Unidad" hint="Um: PIEZA, PAR, JUEGO...">
                    <input value={form.unidad} onChange={handleChange("unidad")} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Estado">
                    <select value={form.estado} onChange={handleChange("estado")} className={INPUT_CLASS}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Precios">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Moneda">
                    <select value={form.moneda} onChange={handleChange("moneda")} className={INPUT_CLASS}>
                      <option value="PEN">Soles (PEN)</option>
                      <option value="USD">Dólares (USD)</option>
                    </select>
                  </Field>
                  <Field label="Tipo de cambio">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={form.tipo_cambio}
                      onChange={handleChange("tipo_cambio")}
                      className={INPUT_CLASS}
                    />
                    {tipoCambioSugerido && (
                      <p className="mt-1 text-xs text-slate-500">
                        Sugerido (referencial): {tipoCambioSugerido.valor.toFixed(4)}{" "}
                        <button
                          type="button"
                          onClick={usarTipoCambioSugerido}
                          className="text-primary-600 hover:underline"
                        >
                          Usar
                        </button>
                      </p>
                    )}
                  </Field>
                  {puedeEscribir && (
                    <Field label="Precio de compra">
                      <MoneyInput
                        value={form.precio_compra}
                        onChange={handleChange("precio_compra")}
                        moneda={form.moneda}
                      />
                    </Field>
                  )}
                  <Field label="Precio de venta">
                    <MoneyInput
                      value={form.precio_venta}
                      onChange={handleChange("precio_venta")}
                      moneda={form.moneda}
                    />
                  </Field>
                  <Field label="Precio mayorista">
                    <MoneyInput
                      value={form.precio_mayorista}
                      onChange={handleChange("precio_mayorista")}
                      moneda={form.moneda}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Stock">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Stock físico">
                    <input
                      type="number"
                      min="0"
                      value={form.stock_fisico}
                      onChange={handleChange("stock_fisico")}
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Ubicación">
                    <input value={form.ubicacion} onChange={handleChange("ubicacion")} className={INPUT_CLASS} />
                  </Field>
                </div>
              </FormSection>
            </fieldset>

            {error && <p className="text-sm text-danger-600">{error}</p>}
            {mensaje && <p className="text-sm text-success-600">{mensaje}</p>}

            {/* Barra de acción fija: Guardar/Cancelar siempre visibles al pie. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
              {puedeEscribir && (
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => navigate("/productos")}
              >
                {puedeEscribir ? "Cancelar" : "Volver"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="w-full lg:w-64 shrink-0">
          <p className="text-sm font-medium text-slate-700 mb-3">Foto del producto</p>
          <FotoProducto fotoUrl={fotoUrl} nombre={form.nombre} size="lg" className="mx-auto" />

          {puedeEscribir && productoId && (
            <label className="mt-4 block">
              <span className="sr-only">Subir foto</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                disabled={subiendoFoto}
                className="text-sm"
              />
            </label>
          )}
          {puedeEscribir && !productoId && (
            <p className="mt-4 text-xs text-slate-400">
              Guarda el producto primero para poder subirle una foto.
            </p>
          )}

          {subiendoFoto && <p className="mt-2 text-xs text-slate-500">Subiendo...</p>}
          {fotoError && <p className="mt-2 text-xs text-danger-600">{fotoError}</p>}
        </Card>

        {modoEdicion && (
          <Card className="w-full lg:w-64 shrink-0">
            <p className="text-sm font-medium text-slate-700 mb-3">Comprado a</p>
            {proveedoresProducto.length === 0 ? (
              <p className="text-xs text-slate-400">Sin compras recibidas todavía.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {proveedoresProducto.map((proveedor) => (
                  <li key={proveedor.id}>
                    <Link to={`/proveedores/${proveedor.id}`} className="text-primary-600 hover:underline">
                      {proveedor.nombre}
                    </Link>
                    <span className="block text-xs text-slate-400">
                      Última compra: {new Date(proveedor.ultimaCompra).toLocaleDateString("es-PE")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
