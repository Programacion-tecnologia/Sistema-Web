import { useEffect, useMemo, useState } from "react";
import { buscarProductosPaginado, PRODUCTOS_PAGE_SIZE } from "../../services/productosService";
import { ajustarStock, listMovimientos, updateStockMinimo } from "../../services/inventarioService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { getNivelStock, STOCK_NIVEL_CLASS } from "../../utils/stock";

const PUEDE_AJUSTAR = [ROLES.ADMIN, ROLES.GERENCIA];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const DEBOUNCE_BUSQUEDA_MS = 300;

const MOVIMIENTO_BADGE = {
  entrada: "bg-success-100 text-success-700",
  salida: "bg-danger-100 text-danger-700",
  ajuste: "bg-primary-100 text-primary-700",
};

const MOVIMIENTO_LABEL = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
};

function formatearFecha(iso) {
  return iso ? new Date(iso).toLocaleString("es-PE") : "—";
}

export default function Inventario() {
  const { rol } = useAuth();
  const puedeAjustar = PUEDE_AJUSTAR.includes(rol);

  const [productos, setProductos] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [terminoDebounced, setTerminoDebounced] = useState("");
  const [porReponer, setPorReponer] = useState(false);

  // Modales: a lo sumo uno abierto a la vez. ajusteProducto abre el panel de
  // ajuste + stock minimo; kardexProducto abre el historial de movimientos.
  const [ajusteProducto, setAjusteProducto] = useState(null);
  const [kardexProducto, setKardexProducto] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setTerminoDebounced(busqueda.trim()), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(id);
  }, [busqueda]);

  // Cambiar búsqueda o el filtro "por reponer" siempre vuelve a la página 0.
  const cambiarBusqueda = (valor) => {
    setBusqueda(valor);
    setPagina(0);
  };

  const alternarPorReponer = () => {
    setPorReponer((prev) => !prev);
    setPagina(0);
  };

  const filtrosKey = JSON.stringify({ rol, pagina, terminoDebounced, porReponer });
  const [filtrosKeyCargada, setFiltrosKeyCargada] = useState(null);
  if (filtrosKey !== filtrosKeyCargada) {
    setFiltrosKeyCargada(filtrosKey);
    setLoading(true);
    setError(null);
  }

  const recargar = () => {
    let activo = true;
    buscarProductosPaginado({ rol, pagina, termino: terminoDebounced, porReponer })
      .then(({ data, count }) => {
        if (!activo) return;
        setProductos(data);
        setTotalCount(count);
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));
    return () => {
      activo = false;
    };
  };

  useEffect(recargar, [rol, pagina, terminoDebounced, porReponer]);

  // Tras un ajuste o un cambio de mínimo se refresca la fila afectada sin
  // recargar toda la página: se reemplaza solo ese producto en el listado.
  const reemplazarProducto = (id, cambios) => {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  };

  const totalPaginas = Math.max(1, Math.ceil(totalCount / PRODUCTOS_PAGE_SIZE));
  const hayFiltros = Boolean(terminoDebounced) || porReponer;

  return (
    <>
      <h2 className="text-3xl font-bold">Inventario</h2>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={(event) => cambiarBusqueda(event.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <button
          type="button"
          onClick={alternarPorReponer}
          aria-pressed={porReponer}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            porReponer
              ? "border-warning-500 bg-warning-50 text-warning-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Solo por reponer
        </button>
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando inventario...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && productos.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {hayFiltros
              ? "Ningún producto coincide con los filtros."
              : "Todavía no hay productos cargados."}
          </p>
        )}

        {!loading && !error && productos.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Físico</th>
                <th className="px-4 py-3 font-medium text-right">Reservado</th>
                <th className="px-4 py-3 font-medium text-right">Disponible</th>
                <th className="px-4 py-3 font-medium text-right">Mínimo</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.map((producto) => {
                const necesitaReposicion =
                  producto.stock_minimo > 0 && producto.stock_disponible <= producto.stock_minimo;
                return (
                  <tr key={producto.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{producto.nombre}</p>
                      {producto.codigo_referencia && (
                        <p className="text-xs text-slate-400">CÓDIGO REF: {producto.codigo_referencia}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800">{producto.stock_fisico}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{producto.stock_reservado}</td>
                    <td
                      className={`px-4 py-3 text-right ${STOCK_NIVEL_CLASS[getNivelStock(producto.stock_disponible)]}`}
                    >
                      {producto.stock_disponible}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          necesitaReposicion ? "text-warning-700 font-semibold" : "text-slate-500"
                        }`}
                      >
                        {producto.stock_minimo || "—"}
                        {necesitaReposicion && (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-warning-500"
                            title="Por reponer"
                          />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setKardexProducto(producto)}>
                          Kardex
                        </Button>
                        {puedeAjustar && (
                          <Button variant="secondary" size="sm" onClick={() => setAjusteProducto(producto)}>
                            Ajustar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && !error && totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>
              {totalCount} producto{totalCount === 1 ? "" : "s"} — página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina + 1 >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      {ajusteProducto && (
        <AjusteModal
          producto={ajusteProducto}
          onClose={() => setAjusteProducto(null)}
          onAjusteAplicado={(id, stockResultante) => {
            reemplazarProducto(id, {
              stock_fisico: stockResultante,
              stock_disponible: stockResultante - (ajusteProducto.stock_reservado ?? 0),
            });
          }}
          onMinimoGuardado={(id, stockMinimo) => reemplazarProducto(id, { stock_minimo: stockMinimo })}
        />
      )}

      {kardexProducto && (
        <KardexModal producto={kardexProducto} onClose={() => setKardexProducto(null)} />
      )}
    </>
  );
}

// Overlay simple (no hay componente Modal en el proyecto): fondo oscuro +
// tarjeta centrada. Cerrar con la X o clic en el fondo.
function ModalShell({ titulo, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-lg font-semibold text-slate-800">{titulo}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AjusteModal({ producto, onClose, onAjusteAplicado, onMinimoGuardado }) {
  // stockFisico refleja el valor actual y se actualiza en el acto tras un
  // ajuste, para que "Fijar conteo" y el resumen usen siempre el saldo real.
  const [stockFisico, setStockFisico] = useState(producto.stock_fisico);
  const [modo, setModo] = useState("sumar"); // "sumar" | "restar" | "fijar"
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const [stockMinimo, setStockMinimo] = useState(String(producto.stock_minimo ?? 0));
  const [guardandoMinimo, setGuardandoMinimo] = useState(false);
  const [minimoOk, setMinimoOk] = useState(false);

  // delta que se enviará a ajustar_stock, según el modo elegido.
  const delta = useMemo(() => {
    const n = Math.trunc(Number(cantidad));
    if (!Number.isFinite(n)) return 0;
    if (modo === "sumar") return Math.abs(n);
    if (modo === "restar") return -Math.abs(n);
    return n - stockFisico; // fijar: llevar el stock a n
  }, [cantidad, modo, stockFisico]);

  const handleAplicar = async () => {
    if (delta === 0) {
      setError("El ajuste no puede dejar el stock igual.");
      return;
    }
    if (!motivo.trim()) {
      setError("Indica el motivo del ajuste.");
      return;
    }

    setAplicando(true);
    setError(null);
    setOk(null);
    try {
      const res = await ajustarStock(producto.id, delta, motivo.trim());
      setStockFisico(res.stock_resultante);
      onAjusteAplicado(producto.id, res.stock_resultante);
      setCantidad("");
      setMotivo("");
      setOk(`Stock ajustado. Nuevo stock físico: ${res.stock_resultante}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAplicando(false);
    }
  };

  const handleGuardarMinimo = async () => {
    const valor = Math.max(0, Math.trunc(Number(stockMinimo)) || 0);
    setGuardandoMinimo(true);
    setError(null);
    setMinimoOk(false);
    try {
      const res = await updateStockMinimo(producto.id, valor);
      setStockMinimo(String(res.stock_minimo));
      onMinimoGuardado(producto.id, res.stock_minimo);
      setMinimoOk(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoMinimo(false);
    }
  };

  return (
    <ModalShell titulo={`Ajustar: ${producto.nombre}`} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          Stock físico actual: <span className="font-semibold text-slate-800">{stockFisico}</span>
        </p>

        <div className="space-y-3">
          <div className="flex gap-1 text-xs">
            {[
              ["sumar", "Sumar (+)"],
              ["restar", "Restar (−)"],
              ["fijar", "Fijar conteo"],
            ].map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setModo(valor)}
                className={`rounded px-2 py-1 ${
                  modo === valor ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {modo === "fijar" ? "Stock físico contado" : "Cantidad"}
            </label>
            <input
              type="number"
              min="0"
              value={cantidad}
              onChange={(event) => setCantidad(event.target.value)}
              className={INPUT_CLASS}
            />
            {cantidad !== "" && (
              <p className="mt-1 text-xs text-slate-400">
                Quedará en <span className="font-medium text-slate-600">{stockFisico + delta}</span>{" "}
                (ajuste de {delta > 0 ? `+${delta}` : delta}).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo</label>
            <input
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Merma, robo, corrección de conteo..."
              className={INPUT_CLASS}
            />
          </div>

          {ok && <p className="text-sm text-success-700">{ok}</p>}

          <Button type="button" disabled={aplicando} onClick={handleAplicar}>
            {aplicando ? "Aplicando..." : "Aplicar ajuste"}
          </Button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Stock mínimo (umbral de alerta de reposición)
          </label>
          <div className="flex gap-2 max-w-[16rem]">
            <input
              type="number"
              min="0"
              value={stockMinimo}
              onChange={(event) => {
                setStockMinimo(event.target.value);
                setMinimoOk(false);
              }}
              className={INPUT_CLASS}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={guardandoMinimo}
              onClick={handleGuardarMinimo}
            >
              {guardandoMinimo ? "..." : "Guardar"}
            </Button>
          </div>
          {minimoOk && <p className="mt-1 text-xs text-success-700">Stock mínimo guardado.</p>}
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}
      </div>
    </ModalShell>
  );
}

function KardexModal({ producto, onClose }) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    listMovimientos(producto.id)
      .then((data) => activo && setMovimientos(data))
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));
    return () => {
      activo = false;
    };
  }, [producto.id]);

  return (
    <ModalShell titulo={`Kardex: ${producto.nombre}`} onClose={onClose}>
      {loading && <p className="text-sm text-slate-500">Cargando movimientos...</p>}
      {error && <p className="text-sm text-danger-600">{error}</p>}

      {!loading && !error && movimientos.length === 0 && (
        <p className="text-sm text-slate-500">
          Este producto todavía no tiene movimientos registrados. El kardex empieza a registrar desde
          las compras, despachos y ajustes hechos de aquí en adelante.
        </p>
      )}

      {!loading && !error && movimientos.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 font-medium text-right">Cantidad</th>
              <th className="py-2 font-medium text-right">Saldo</th>
              <th className="py-2 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movimientos.map((mov) => (
              <tr key={mov.id}>
                <td className="py-2 text-slate-500 whitespace-nowrap">{formatearFecha(mov.created_at)}</td>
                <td className="py-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${MOVIMIENTO_BADGE[mov.tipo]}`}
                  >
                    {MOVIMIENTO_LABEL[mov.tipo] ?? mov.tipo}
                  </span>
                </td>
                <td
                  className={`py-2 text-right font-medium ${
                    mov.cantidad >= 0 ? "text-success-700" : "text-danger-700"
                  }`}
                >
                  {mov.cantidad > 0 ? `+${mov.cantidad}` : mov.cantidad}
                </td>
                <td className="py-2 text-right text-slate-800">{mov.stock_resultante}</td>
                <td className="py-2 text-slate-600">
                  {mov.motivo ?? "—"}
                  {mov.usuario?.nombre && (
                    <span className="block text-xs text-slate-400">{mov.usuario.nombre}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}
