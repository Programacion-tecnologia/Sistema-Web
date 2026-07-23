import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  aprobarCotizacion,
  cancelarCotizacion,
  createCotizacion,
  despacharCotizacion,
  enviarCotizacion,
  getCotizacion,
  rechazarCotizacion,
} from "../../services/cotizacionesService";
import { findOrCreateCliente, listClientes } from "../../services/clientesService";
import { listProductos } from "../../services/productosService";
import { getPreciosOfertaVigentes } from "../../services/promocionesService";
import { generarCodigoBarras } from "../../services/codigosBarrasService";
import ChipOferta from "../../components/Ofertas/ChipOferta";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { ESTADO_LABEL, ESTADO_BADGE_CLASS } from "../../utils/cotizacionEstado";
import { formatearPrecio } from "../../utils/currency";
import { getNivelStock, STOCK_NIVEL_CLASS } from "../../utils/stock";
import { normalizarTexto } from "../../utils/normalizar";
import { generarPdfCotizacion } from "../../utils/pdfCotizacion";
import { getConfiguracionEmpresa } from "../../services/configuracionService";
import { compartirPorWhatsApp } from "../../utils/whatsapp";
import { ROLES } from "../../utils/roles";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const PUEDE_ENVIAR_CANCELAR = [ROLES.VENTAS, ROLES.ADMIN, ROLES.GERENCIA];
const PUEDE_APROBAR_RECHAZAR = [ROLES.ADMIN, ROLES.GERENCIA];
const PUEDE_DESPACHAR = [ROLES.ADMIN, ROLES.GERENCIA];

export default function CotizacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, rol } = useAuth();
  const modoEdicion = Boolean(id);

  const [cotizacion, setCotizacion] = useState(null);
  const [loading, setLoading] = useState(modoEdicion);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Solo se usan en modo alta (armar una cotizacion nueva).
  const [clienteNombre, setClienteNombre] = useState("");
  const [clientes, setClientes] = useState([]);
  const [moneda, setMoneda] = useState("PEN");
  const [productos, setProductos] = useState([]);
  const [items, setItems] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [cantidadNueva, setCantidadNueva] = useState("1");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mostrarResultados, setMostrarResultados] = useState(false);
  // Mapa producto_id -> precio de oferta vigente: la linea arranca a ese precio
  // (editable) cuando el producto esta en promocion.
  const [ofertas, setOfertas] = useState(new Map());

  useEffect(() => {
    if (modoEdicion) return;
    listClientes().then(setClientes).catch(() => {});
    listProductos().then(setProductos).catch(() => {});
    getPreciosOfertaVigentes().then(setOfertas).catch(() => {});
  }, [modoEdicion]);

  useEffect(() => {
    if (!modoEdicion) return;

    let activo = true;
    getCotizacion(id)
      .then((data) => activo && setCotizacion(data))
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, [id, modoEdicion]);

  const productosDisponibles = useMemo(
    () => productos.filter((producto) => producto.moneda === moneda),
    [productos, moneda]
  );

  const totalNuevaCotizacion = useMemo(
    () => items.reduce((total, item) => total + item.cantidad * item.precio_unitario, 0),
    [items]
  );

  // Busqueda con la misma normalizacion que el modulo Productos: ignora
  // espacios/guiones/puntos/underscore/slash, asi pegar "cp331bcm" encuentra
  // "CP331BCM _ CAL261BC40" tal como esta escrito en el catalogo.
  const resultadosBusqueda = useMemo(() => {
    const termino = normalizarTexto(busquedaProducto);
    if (!termino) return [];
    return productosDisponibles
      .filter(
        (producto) =>
          normalizarTexto(producto.nombre).includes(termino) ||
          normalizarTexto(producto.codigo_referencia).includes(termino)
      )
      .slice(0, 15);
  }, [productosDisponibles, busquedaProducto]);

  const cambiarMoneda = (event) => {
    setMoneda(event.target.value);
    setItems([]);
    setProductoSeleccionado("");
    setBusquedaProducto("");
  };

  const agregarItem = () => {
    const producto = productosDisponibles.find((p) => p.id === productoSeleccionado);
    if (!producto) return;

    const cantidad = Math.max(1, Math.trunc(Number(cantidadNueva)) || 1);
    const precioOferta = ofertas.get(producto.id);
    const enOferta = precioOferta !== undefined && precioOferta < producto.precio_venta;
    setItems((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        nombre: producto.nombre,
        stock_disponible: producto.stock_disponible,
        cantidad,
        precio_unitario: enOferta ? precioOferta : producto.precio_venta,
        precio_lista: producto.precio_venta,
        en_oferta: enOferta,
        codigo_barras: producto.codigo_barras,
      },
    ]);
    setProductoSeleccionado("");
    setBusquedaProducto("");
    setCantidadNueva("1");
  };

  const quitarItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Genera un EAN-13 para un producto sin código de barras y lo marca en la línea.
  const generarCodigoItem = async (index) => {
    const item = items[index];
    if (!item?.producto_id) return;
    try {
      const codigo = await generarCodigoBarras(item.producto_id);
      setItems((prev) => prev.map((it, i) => (i === index ? { ...it, codigo_barras: codigo } : it)));
    } catch (err) {
      setError(err.message);
    }
  };

  const actualizarCantidadItem = (index, cantidad) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, cantidad: Math.max(1, Math.trunc(Number(cantidad)) || 1) } : item))
    );
  };

  const actualizarPrecioItem = (index, precio) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, precio_unitario: Number(precio) || 0 } : item))
    );
  };

  const handleGuardar = async (event) => {
    event.preventDefault();
    if (!clienteNombre.trim()) {
      setError("Elige o escribe un cliente.");
      return;
    }
    if (items.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const cliente = await findOrCreateCliente(clienteNombre);
      const nueva = await createCotizacion({
        cliente_id: cliente.id,
        vendedor_id: user.id,
        moneda,
        items: items.map(({ producto_id, cantidad, precio_unitario }) => ({
          producto_id,
          cantidad,
          precio_unitario,
        })),
      });
      navigate(`/cotizaciones/${nueva.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDescargarPdf = async (total) => {
    try {
      const config = await getConfiguracionEmpresa().catch(() => null);
      await generarPdfCotizacion({ cotizacion, total, config });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWhatsApp = async (total) => {
    const config = await getConfiguracionEmpresa().catch(() => null);
    const lineas = [];
    if (config?.razon_social) lineas.push(`*${config.razon_social}*`);
    lineas.push(
      `Cotización N° ${cotizacion.id.slice(0, 8).toUpperCase()}`,
      `Cliente: ${cotizacion.cliente?.nombre ?? "—"}`,
      ""
    );
    for (const it of cotizacion.items) {
      lineas.push(
        `• ${it.cantidad} x ${it.producto?.nombre ?? "-"} — ${formatearPrecio(it.cantidad * it.precio_unitario, cotizacion.moneda)}`
      );
    }
    lineas.push("", `*Total: ${formatearPrecio(total, cotizacion.moneda)}*`, "", "Cotización válida por 3 días.");
    compartirPorWhatsApp(cotizacion.cliente?.telefono, lineas.join("\n"));
  };

  const ejecutarAccion = async (accion) => {
    setActionLoading(true);
    setError(null);
    try {
      const actualizada = await accion(cotizacion.id);
      setCotizacion(actualizada);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando cotización...</p>;
  }

  if (modoEdicion) {
    const totalActual = calcularTotal(cotizacion.items);

    return (
      <>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-3xl font-bold">Cotización</h2>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE_CLASS[cotizacion.estado]}`}
          >
            {ESTADO_LABEL[cotizacion.estado]}
          </span>
        </div>

        <Card className="mt-6 max-w-2xl">
          <dl className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <dt className="text-slate-500">Cliente</dt>
              <dd className="font-medium text-slate-800">{cotizacion.cliente?.nombre ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Vendedor</dt>
              <dd className="font-medium text-slate-800">{cotizacion.vendedor?.nombre ?? "—"}</dd>
            </div>
          </dl>

          {/* Móvil: cada ítem como bloque (nombre a todo el ancho + cantidad×precio y subtotal). */}
          <div className="mb-4 divide-y divide-slate-100 lg:hidden">
            {cotizacion.items.map((item) => (
              <div key={item.id} className="py-2">
                <p className="text-sm font-medium text-slate-800">{item.producto?.nombre ?? "—"}</p>
                <div className="mt-1 flex items-end gap-3 text-sm">
                  <span className="text-slate-600">
                    {item.cantidad} × {formatearPrecio(item.precio_unitario, cotizacion.moneda)}
                  </span>
                  <span className="ml-auto font-medium text-slate-800">
                    {formatearPrecio(item.cantidad * item.precio_unitario, cotizacion.moneda)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla. */}
          <table className="mb-4 hidden w-full text-sm lg:table">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium text-right">Cantidad</th>
                <th className="py-2 font-medium text-right">Precio unit.</th>
                <th className="py-2 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cotizacion.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2">{item.producto?.nombre ?? "—"}</td>
                  <td className="py-2 text-right">{item.cantidad}</td>
                  <td className="py-2 text-right">{formatearPrecio(item.precio_unitario, cotizacion.moneda)}</td>
                  <td className="py-2 text-right">
                    {formatearPrecio(item.cantidad * item.precio_unitario, cotizacion.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-right font-semibold text-slate-800 mb-6">
            Total: {formatearPrecio(totalActual, cotizacion.moneda)}
          </p>

          {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

          <div className="flex items-center gap-3 flex-wrap">
            {["borrador", "enviada"].includes(cotizacion.estado) && (
              <>
                <Button variant="secondary" onClick={() => handleDescargarPdf(totalActual)}>
                  Descargar cotización (PDF)
                </Button>
                <Button variant="success" onClick={() => handleWhatsApp(totalActual)}>
                  WhatsApp
                </Button>
              </>
            )}

            {cotizacion.estado === "borrador" && PUEDE_ENVIAR_CANCELAR.includes(rol) && (
              <>
                <Button disabled={actionLoading} onClick={() => ejecutarAccion(enviarCotizacion)}>
                  Enviar
                </Button>
                <Button
                  variant="danger"
                  disabled={actionLoading}
                  onClick={() => ejecutarAccion(cancelarCotizacion)}
                >
                  Cancelar cotización
                </Button>
              </>
            )}

            {cotizacion.estado === "enviada" && PUEDE_APROBAR_RECHAZAR.includes(rol) && (
              <>
                <Button
                  variant="success"
                  disabled={actionLoading}
                  onClick={() => ejecutarAccion(aprobarCotizacion)}
                >
                  Aprobar (reserva stock)
                </Button>
                <Button
                  variant="danger"
                  disabled={actionLoading}
                  onClick={() => ejecutarAccion(rechazarCotizacion)}
                >
                  Rechazar
                </Button>
              </>
            )}

            {cotizacion.estado === "lista_despacho" && PUEDE_DESPACHAR.includes(rol) && (
              <Button
                variant="success"
                disabled={actionLoading}
                onClick={() => ejecutarAccion(despacharCotizacion)}
              >
                Despachado y enviado
              </Button>
            )}

            <Button variant="secondary" onClick={() => navigate("/cotizaciones")}>
              Volver a la lista
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <h2 className="text-3xl font-bold">Nueva cotización</h2>

      <Card className="mt-6 max-w-2xl">
        <form onSubmit={handleGuardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
              <input
                list="clientes-existentes"
                value={clienteNombre}
                onChange={(event) => setClienteNombre(event.target.value)}
                className={INPUT_CLASS}
              />
              <datalist id="clientes-existentes">
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.nombre} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
              <select value={moneda} onChange={cambiarMoneda} className={INPUT_CLASS}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Agregar producto</p>
            <div className="flex items-end gap-3 flex-wrap">
              {/* El dropdown usa onMouseDown (no onClick) para ganar la
                  carrera contra el onBlur del input, que cierra la lista. */}
              <div className="flex-1 min-w-[200px] relative">
                <input
                  value={busquedaProducto}
                  onChange={(event) => {
                    setBusquedaProducto(event.target.value);
                    setProductoSeleccionado("");
                  }}
                  onFocus={() => setMostrarResultados(true)}
                  onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
                  placeholder={`Busca por nombre o código (${moneda})...`}
                  className={INPUT_CLASS}
                />
                {mostrarResultados && !productoSeleccionado && resultadosBusqueda.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {resultadosBusqueda.map((producto) => (
                      <li key={producto.id}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setProductoSeleccionado(producto.id);
                            setBusquedaProducto(producto.nombre);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        >
                          <span className="block text-sm text-slate-800">{producto.nombre}</span>
                          <span className="block text-xs text-slate-400">
                            {producto.codigo_referencia && `REF: ${producto.codigo_referencia} — `}
                            stock disponible: {producto.stock_disponible}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {mostrarResultados &&
                  !productoSeleccionado &&
                  busquedaProducto.trim() &&
                  resultadosBusqueda.length === 0 && (
                    <p className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2 text-xs text-slate-400">
                      Ningún producto en {moneda} coincide con la búsqueda.
                    </p>
                  )}
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min="1"
                  value={cantidadNueva}
                  onChange={(event) => setCantidadNueva(event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <Button type="button" variant="secondary" onClick={agregarItem}>
                Agregar
              </Button>
            </div>
            {productosDisponibles.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">
                No hay productos cargados en {moneda === "PEN" ? "soles" : "dólares"}.
              </p>
            )}
          </div>

          {items.length > 0 && (
            <>
              {/* Móvil: cada ítem como bloque (nombre a todo el ancho + inputs y quitar). */}
              <div className="divide-y divide-slate-100 lg:hidden">
                {items.map((item, index) => (
                  <div key={`${item.producto_id}-${index}`} className="py-3">
                    <p className="text-sm font-medium text-slate-800">
                      {item.nombre}
                      {item.en_oferta && (
                        <ChipOferta precioLista={item.precio_lista} precioActual={item.precio_unitario} />
                      )}
                    </p>
                    {!item.codigo_barras && (
                      <button
                        type="button"
                        onClick={() => generarCodigoItem(index)}
                        className="text-xs font-medium text-primary-600 hover:underline"
                      >
                        Sin código · Generar código de barras
                      </button>
                    )}
                    {item.cantidad > item.stock_disponible && (
                      <p className={`text-xs ${STOCK_NIVEL_CLASS[getNivelStock(item.stock_disponible)]}`}>
                        Solo hay {item.stock_disponible} disponibles
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(event) => actualizarCantidadItem(index, event.target.value)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Precio unit.</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.precio_unitario}
                          onChange={(event) => actualizarPrecioItem(index, event.target.value)}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-slate-500">Subtotal</p>
                        <p className="font-medium text-slate-800">
                          {formatearPrecio(item.cantidad * item.precio_unitario, moneda)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarItem(index)}
                        className="pb-1 text-xs text-danger-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: tabla. */}
              <table className="hidden w-full text-sm lg:table">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-2 font-medium">Producto</th>
                    <th className="py-2 font-medium text-right">Cantidad</th>
                    <th className="py-2 font-medium text-right">Precio unit.</th>
                    <th className="py-2 font-medium text-right">Subtotal</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => (
                    <tr key={`${item.producto_id}-${index}`}>
                      <td className="py-2">
                        {item.nombre}
                        {item.en_oferta && (
                          <ChipOferta precioLista={item.precio_lista} precioActual={item.precio_unitario} />
                        )}
                        {!item.codigo_barras && (
                          <button
                            type="button"
                            onClick={() => generarCodigoItem(index)}
                            className="block text-xs font-medium text-primary-600 hover:underline"
                          >
                            Sin código · Generar código de barras
                          </button>
                        )}
                        {item.cantidad > item.stock_disponible && (
                          <span className={`block text-xs ${STOCK_NIVEL_CLASS[getNivelStock(item.stock_disponible)]}`}>
                            Solo hay {item.stock_disponible} disponibles
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(event) => actualizarCantidadItem(index, event.target.value)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.precio_unitario}
                          onChange={(event) => actualizarPrecioItem(index, event.target.value)}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                      </td>
                      <td className="py-2 text-right">
                        {formatearPrecio(item.cantidad * item.precio_unitario, moneda)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitarItem(index)}
                          className="text-xs text-danger-600 hover:underline"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {items.length > 0 && (
            <p className="text-right font-semibold text-slate-800">
              Total: {formatearPrecio(totalNuevaCotizacion, moneda)}
            </p>
          )}

          {error && <p className="text-sm text-danger-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => navigate("/cotizaciones")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

function calcularTotal(items) {
  return items.reduce((total, item) => total + item.cantidad * item.precio_unitario, 0);
}
