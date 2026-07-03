import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  aprobarCotizacion,
  cancelarCotizacion,
  createCotizacion,
  enviarCotizacion,
  getCotizacion,
  rechazarCotizacion,
} from "../../services/cotizacionesService";
import { findOrCreateCliente, listClientes } from "../../services/clientesService";
import { listProductos } from "../../services/productosService";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { ESTADO_LABEL, ESTADO_BADGE_CLASS } from "../../utils/cotizacionEstado";
import { formatearPrecio } from "../../utils/currency";
import { getNivelStock, STOCK_NIVEL_CLASS } from "../../utils/stock";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

export default function CotizacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  useEffect(() => {
    if (modoEdicion) return;
    listClientes().then(setClientes).catch(() => {});
    listProductos().then(setProductos).catch(() => {});
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

  const cambiarMoneda = (event) => {
    setMoneda(event.target.value);
    setItems([]);
  };

  const agregarItem = () => {
    const producto = productosDisponibles.find((p) => p.id === productoSeleccionado);
    if (!producto) return;

    const cantidad = Math.max(1, Math.trunc(Number(cantidadNueva)) || 1);
    setItems((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        nombre: producto.nombre,
        stock_disponible: producto.stock_disponible,
        cantidad,
        precio_unitario: producto.precio_venta,
      },
    ]);
    setProductoSeleccionado("");
    setCantidadNueva("1");
  };

  const quitarItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
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

          <table className="w-full text-sm mb-4">
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
            {cotizacion.estado === "borrador" && (
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

            {cotizacion.estado === "enviada" && (
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
              <div className="flex-1 min-w-[200px]">
                <select
                  value={productoSeleccionado}
                  onChange={(event) => setProductoSeleccionado(event.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Selecciona un producto en {moneda}...</option>
                  {productosDisponibles.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.nombre} — stock disponible: {producto.stock_disponible}
                    </option>
                  ))}
                </select>
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
            <table className="w-full text-sm">
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
