import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buscarProductosPaginado } from "../../services/productosService";
import { listClientes } from "../../services/clientesService";
import { getCajaAbierta } from "../../services/cajaService";
import { listVentas, registrarVenta } from "../../services/ventasService";
import { getPreciosOfertaVigentes } from "../../services/promocionesService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import ChipOferta from "../../components/Ofertas/ChipOferta";
import { formatearPrecio } from "../../utils/currency";
import { METODOS_PAGO, METODO_PAGO_LABEL } from "../../utils/pagoMetodo";

const PUEDE_VENDER = [ROLES.ADMIN, ROLES.GERENCIA, ROLES.VENTAS];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const DEBOUNCE_MS = 300;

// Tolerancia al comparar totales en punto flotante (centavos).
const EPS = 0.005;

function redondear(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export default function Ventas() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeVender = PUEDE_VENDER.includes(rol);

  const [caja, setCaja] = useState(null);
  const [loadingCaja, setLoadingCaja] = useState(true);
  const [ventasRecientes, setVentasRecientes] = useState([]);

  const [moneda, setMoneda] = useState("PEN");
  const [busqueda, setBusqueda] = useState("");
  const [terminoDebounced, setTerminoDebounced] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  const [carrito, setCarrito] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [pagos, setPagos] = useState([{ metodo: "efectivo", monto: "" }]);

  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);
  // Mapa producto_id -> precio de oferta vigente: la linea del carrito arranca
  // a ese precio (editable) cuando el producto esta en promocion.
  const [ofertas, setOfertas] = useState(new Map());

  useEffect(() => {
    getCajaAbierta()
      .then(setCaja)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCaja(false));
    listClientes()
      .then(setClientes)
      .catch(() => {});
    listVentas()
      .then((data) => setVentasRecientes(data.slice(0, 8)))
      .catch(() => {});
    getPreciosOfertaVigentes()
      .then(setOfertas)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setTerminoDebounced(busqueda.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [busqueda]);

  useEffect(() => {
    if (!terminoDebounced) {
      setResultados([]);
      return;
    }
    let activo = true;
    setBuscando(true);
    buscarProductosPaginado({ rol, pagina: 0, termino: terminoDebounced })
      .then(({ data }) => {
        if (!activo) return;
        // Solo productos de la moneda de la venta (una venta es de una sola
        // moneda, igual que una compra).
        setResultados(data.filter((p) => p.moneda === moneda));
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setBuscando(false));
    return () => {
      activo = false;
    };
  }, [terminoDebounced, rol, moneda]);

  const agregarProducto = (producto) => {
    setCarrito((prev) => {
      const existente = prev.find((l) => l.producto_id === producto.id);
      if (existente) {
        return prev.map((l) =>
          l.producto_id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l
        );
      }
      const precioLista = Number(producto.precio_venta) || 0;
      const precioOferta = ofertas.get(producto.id);
      const enOferta = precioOferta !== undefined && precioOferta < precioLista;
      return [
        ...prev,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          codigo: producto.codigo_referencia,
          cantidad: 1,
          precio_unitario: enOferta ? precioOferta : precioLista,
          precio_lista: precioLista,
          en_oferta: enOferta,
          stock_disponible: producto.stock_disponible,
        },
      ];
    });
    setBusqueda("");
    setResultados([]);
  };

  const actualizarLinea = (productoId, campo, valor) => {
    setCarrito((prev) =>
      prev.map((l) => {
        if (l.producto_id !== productoId) return l;
        if (campo === "cantidad") return { ...l, cantidad: Math.max(1, Math.trunc(Number(valor)) || 1) };
        return { ...l, precio_unitario: Math.max(0, Number(valor) || 0) };
      })
    );
  };

  const quitarLinea = (productoId) => {
    setCarrito((prev) => prev.filter((l) => l.producto_id !== productoId));
  };

  const cambiarMoneda = (nuevaMoneda) => {
    setMoneda(nuevaMoneda);
    setCarrito([]);
    setResultados([]);
  };

  const total = useMemo(
    () => redondear(carrito.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)),
    [carrito]
  );
  const totalPagado = useMemo(
    () => redondear(pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0)),
    [pagos]
  );
  const restante = redondear(total - totalPagado);

  const actualizarPago = (index, campo, valor) => {
    setPagos((prev) => prev.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)));
  };
  const agregarPago = () => setPagos((prev) => [...prev, { metodo: "efectivo", monto: "" }]);
  const quitarPago = (index) => setPagos((prev) => prev.filter((_, i) => i !== index));
  // Autocompleta el primer pago con el total (caso más común: pago único).
  const pagarTodoEfectivo = () => setPagos([{ metodo: "efectivo", monto: String(total) }]);

  const hayStockInsuficiente = carrito.some((l) => l.cantidad > l.stock_disponible);
  const puedeCobrar =
    carrito.length > 0 && total > 0 && Math.abs(restante) < EPS && !hayStockInsuficiente;

  const handleCobrar = async () => {
    setProcesando(true);
    setError(null);
    try {
      const { venta_id } = await registrarVenta({
        cliente_id: clienteId || null,
        moneda,
        items: carrito.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
        })),
        pagos: pagos
          .filter((p) => (Number(p.monto) || 0) > 0)
          .map((p) => ({ metodo: p.metodo, monto: redondear(p.monto) })),
      });
      navigate(`/ventas/${venta_id}`);
    } catch (err) {
      setError(err.message);
      setProcesando(false);
    }
  };

  if (loadingCaja) {
    return <p className="text-sm text-slate-500">Cargando...</p>;
  }

  if (!caja) {
    return (
      <>
        <h2 className="text-3xl font-bold">Ventas</h2>
        <Card className="mt-6 max-w-md">
          <h3 className="text-lg font-semibold text-slate-800">La caja está cerrada</h3>
          <p className="mt-1 text-sm text-slate-500">
            Para registrar ventas primero hay que abrir la caja del día.
          </p>
          <Link to="/caja" className="mt-4 inline-block">
            <Button>Ir a Caja</Button>
          </Link>
        </Card>
      </>
    );
  }

  if (!puedeVender) {
    return (
      <>
        <h2 className="text-3xl font-bold">Ventas</h2>
        <Card className="mt-6">
          <p className="text-sm text-slate-500">Tu rol no puede registrar ventas.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Punto de venta</h2>
        <span className="inline-flex items-center gap-2 text-sm text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-success-500" />
          Caja abierta desde {new Date(caja.abierta_at).toLocaleTimeString("es-PE")}
        </span>
      </div>

      {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Columna izquierda: búsqueda + carrito */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <input
                  type="search"
                  placeholder="Buscar producto por nombre o código..."
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  className={INPUT_CLASS}
                />
                {(buscando || resultados.length > 0) && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-72 overflow-y-auto">
                    {buscando && <p className="p-3 text-sm text-slate-400">Buscando...</p>}
                    {!buscando &&
                      resultados.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => agregarProducto(p)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span>
                            <span className="font-medium text-slate-800">{p.nombre}</span>
                            <span className="block text-xs text-slate-400">
                              {p.codigo_referencia} · disp. {p.stock_disponible}
                            </span>
                          </span>
                          <span className="font-medium text-slate-700">
                            {formatearPrecio(p.precio_venta, p.moneda)}
                          </span>
                        </button>
                      ))}
                    {!buscando && resultados.length === 0 && terminoDebounced && (
                      <p className="p-3 text-sm text-slate-400">Sin resultados en {moneda}.</p>
                    )}
                  </div>
                )}
              </div>
              <select
                value={moneda}
                onChange={(event) => cambiarMoneda(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </select>
            </div>

            {carrito.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Buscá productos arriba para agregarlos a la venta.
              </p>
            ) : (
              <>
                {/* Móvil: cada línea como bloque (nombre a todo el ancho +
                    inputs cantidad/precio + subtotal + quitar). */}
                <div className="divide-y divide-slate-100 lg:hidden">
                  {carrito.map((l) => (
                    <div key={l.producto_id} className="py-3">
                      <p className="text-sm font-medium text-slate-800">
                        {l.nombre}
                        {l.en_oferta && (
                          <ChipOferta precioLista={l.precio_lista} precioActual={l.precio_unitario} />
                        )}
                      </p>
                      {l.cantidad > l.stock_disponible && (
                        <p className="text-xs text-danger-600">
                          Solo hay {l.stock_disponible} disponibles
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            value={l.cantidad}
                            onChange={(event) =>
                              actualizarLinea(l.producto_id, "cantidad", event.target.value)
                            }
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">Precio</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.precio_unitario}
                            onChange={(event) =>
                              actualizarLinea(l.producto_id, "precio", event.target.value)
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-xs text-slate-500">Subtotal</p>
                          <p className="font-medium text-slate-800">
                            {formatearPrecio(l.cantidad * l.precio_unitario, moneda)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarLinea(l.producto_id)}
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
                    <th className="py-2 font-medium text-right">Precio</th>
                    <th className="py-2 font-medium text-right">Subtotal</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {carrito.map((l) => (
                    <tr key={l.producto_id}>
                      <td className="py-2">
                        <span className="font-medium text-slate-800">{l.nombre}</span>
                        {l.en_oferta && (
                          <ChipOferta precioLista={l.precio_lista} precioActual={l.precio_unitario} />
                        )}
                        {l.cantidad > l.stock_disponible && (
                          <span className="block text-xs text-danger-600">
                            Solo hay {l.stock_disponible} disponibles
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min="1"
                          value={l.cantidad}
                          onChange={(event) =>
                            actualizarLinea(l.producto_id, "cantidad", event.target.value)
                          }
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.precio_unitario}
                          onChange={(event) =>
                            actualizarLinea(l.producto_id, "precio", event.target.value)
                          }
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                        />
                      </td>
                      <td className="py-2 text-right text-slate-800">
                        {formatearPrecio(l.cantidad * l.precio_unitario, moneda)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitarLinea(l.producto_id)}
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
          </Card>
        </div>

        {/* Columna derecha: cliente + pago + cobrar */}
        <div className="space-y-4">
          <Card>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
            <select
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Público general</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.ruc_dni ? ` — ${c.ruc_dni}` : ""}
                </option>
              ))}
            </select>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-800">Pago</h3>
              <button
                type="button"
                onClick={pagarTodoEfectivo}
                disabled={total <= 0}
                className="text-xs text-primary-600 hover:underline disabled:text-slate-300"
              >
                Todo en efectivo
              </button>
            </div>

            <div className="space-y-2">
              {pagos.map((p, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={p.metodo}
                    onChange={(event) => actualizarPago(index, "metodo", event.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.valor} value={m.valor}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.monto}
                    onChange={(event) => actualizarPago(index, "monto", event.target.value)}
                    placeholder="0.00"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
                  />
                  {pagos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarPago(index)}
                      className="text-slate-400 hover:text-danger-600"
                      aria-label="Quitar pago"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={agregarPago}
              className="mt-2 text-xs text-primary-600 hover:underline"
            >
              + Agregar otro método
            </button>

            <div className="mt-4 border-t border-slate-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-semibold text-slate-800">{formatearPrecio(total, moneda)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pagado</span>
                <span className="text-slate-800">{formatearPrecio(totalPagado, moneda)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{restante >= 0 ? "Falta" : "Vuelto"}</span>
                <span
                  className={`font-medium ${
                    Math.abs(restante) < EPS ? "text-success-700" : "text-slate-800"
                  }`}
                >
                  {formatearPrecio(Math.abs(restante), moneda)}
                </span>
              </div>
            </div>

            <Button
              className="mt-4 w-full"
              disabled={!puedeCobrar || procesando}
              onClick={handleCobrar}
            >
              {procesando ? "Cobrando..." : "Cobrar"}
            </Button>
            {hayStockInsuficiente && (
              <p className="mt-2 text-xs text-danger-600">
                Hay líneas con más cantidad que el stock disponible.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Ventas recientes</h3>
        </div>
        {ventasRecientes.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Todavía no hay ventas.</p>
        ) : (
          <>
            {/* Móvil: tarjetas apiladas. */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {ventasRecientes.map((v) => {
                const totalVenta = v.items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => navigate(`/ventas/${v.id}`)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {v.cliente?.nombre ?? "Público general"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {v.vendedor?.nombre ?? "—"} · {new Date(v.created_at).toLocaleString("es-PE")}
                      </p>
                      <span
                        className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          v.estado === "anulada"
                            ? "bg-danger-100 text-danger-700"
                            : "bg-success-100 text-success-700"
                        }`}
                      >
                        {v.estado === "anulada" ? "Anulada" : "Completada"}
                      </span>
                    </div>
                    <p className="shrink-0 font-semibold text-slate-800">
                      {formatearPrecio(totalVenta, v.moneda)}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Desktop: tabla completa. */}
            <table className="hidden w-full text-sm lg:table">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventasRecientes.map((v) => {
                const totalVenta = v.items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
                return (
                  <tr
                    key={v.id}
                    onClick={() => navigate(`/ventas/${v.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(v.created_at).toLocaleString("es-PE")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{v.cliente?.nombre ?? "Público general"}</td>
                    <td className="px-4 py-3 text-slate-600">{v.vendedor?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-800">
                      {formatearPrecio(totalVenta, v.moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          v.estado === "anulada"
                            ? "bg-danger-100 text-danger-700"
                            : "bg-success-100 text-success-700"
                        }`}
                      >
                        {v.estado === "anulada" ? "Anulada" : "Completada"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </Card>
    </>
  );
}
