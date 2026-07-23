import { useEffect, useMemo, useState } from "react";
import { buscarProductosPaginado, PRODUCTOS_PAGE_SIZE } from "../../services/productosService";
import { generarCodigoBarras, generarCodigosFaltantes } from "../../services/codigosBarrasService";
import { imprimirEtiquetas } from "../../utils/etiquetaCodigoImprimible";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const DEBOUNCE_MS = 300;

export default function CodigosBarras() {
  const { rol } = useAuth();

  const [busqueda, setBusqueda] = useState("");
  const [terminoDebounced, setTerminoDebounced] = useState("");
  const [soloSinCodigo, setSoloSinCodigo] = useState(true);
  const [pagina, setPagina] = useState(0);

  const [productos, setProductos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [seleccion, setSeleccion] = useState(() => new Set());
  const [procesandoId, setProcesandoId] = useState(null);
  const [generandoTodos, setGenerandoTodos] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTerminoDebounced(busqueda.trim());
      setPagina(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [busqueda]);

  const recargar = () => {
    setLoading(true);
    setError(null);
    buscarProductosPaginado({ rol, pagina, termino: terminoDebounced, sinCodigoBarras: soloSinCodigo })
      .then(({ data, count }) => {
        setProductos(data);
        setTotal(count);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(recargar, [rol, pagina, terminoDebounced, soloSinCodigo]);

  const totalPaginas = Math.max(1, Math.ceil(total / PRODUCTOS_PAGE_SIZE));

  const seleccionados = useMemo(
    () => productos.filter((p) => seleccion.has(p.id) && p.codigo_barras),
    [productos, seleccion]
  );

  const toggleSel = (id) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const handleGenerar = async (producto) => {
    setProcesandoId(producto.id);
    setError(null);
    try {
      const codigo = await generarCodigoBarras(producto.id);
      setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, codigo_barras: codigo } : p)));
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  };

  const handleGenerarTodos = async () => {
    if (!window.confirm("¿Generar un código de barras para TODOS los productos que no tienen? Se guarda en cada producto.")) {
      return;
    }
    setGenerandoTodos(true);
    setError(null);
    setMensaje(null);
    try {
      const cuenta = await generarCodigosFaltantes();
      setMensaje(`Se generaron ${cuenta} código(s) de barras.`);
      recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerandoTodos(false);
    }
  };

  const puedeGenerarLote = rol === "admin" || rol === "gerencia";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">Códigos de barras</h2>
          <p className="text-sm text-slate-500">
            Generá y asigná códigos EAN-13 a productos que no los tienen, e imprimí sus etiquetas.
          </p>
        </div>
        {puedeGenerarLote && (
          <Button variant="secondary" disabled={generandoTodos} onClick={handleGenerarTodos}>
            {generandoTodos ? "Generando..." : "Generar todos los faltantes"}
          </Button>
        )}
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código de referencia..."
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={soloSinCodigo}
              onChange={(e) => {
                setSoloSinCodigo(e.target.checked);
                setPagina(0);
              }}
              className="h-4 w-4"
            />
            Solo sin código
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={seleccionados.length === 0}
            onClick={() => imprimirEtiquetas(seleccionados)}
          >
            Imprimir etiquetas ({seleccionados.length})
          </Button>
        </div>

        {mensaje && <p className="mt-3 text-sm text-success-700">{mensaje}</p>}
        {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
        {loading && <p className="mt-4 text-sm text-slate-500">Cargando productos...</p>}

        {!loading && productos.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            {soloSinCodigo ? "No hay productos sin código de barras." : "Sin resultados."}
          </p>
        )}

        {!loading && productos.length > 0 && (
          <div className="mt-4 divide-y divide-slate-100">
            {productos.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <input
                  type="checkbox"
                  checked={seleccion.has(p.id)}
                  disabled={!p.codigo_barras}
                  onChange={() => toggleSel(p.id)}
                  className="h-4 w-4"
                  title={p.codigo_barras ? "Seleccionar para imprimir" : "Sin código: generalo primero"}
                />
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium text-slate-800">{p.nombre}</p>
                  <p className="text-xs text-slate-400">
                    {p.codigo_referencia ? `Ref: ${p.codigo_referencia}` : "Sin referencia"}
                  </p>
                </div>
                <div className="min-w-[8rem] text-sm">
                  {p.codigo_barras ? (
                    <span className="font-mono text-slate-700">{p.codigo_barras}</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
                      Sin código
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!p.codigo_barras && (
                    <button
                      type="button"
                      disabled={procesandoId === p.id}
                      onClick={() => handleGenerar(p)}
                      className="text-sm font-medium text-primary-600 hover:underline disabled:opacity-50"
                    >
                      {procesandoId === p.id ? "..." : "Generar"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!p.codigo_barras}
                    onClick={() => imprimirEtiquetas([p])}
                    className="text-sm text-slate-600 hover:underline disabled:opacity-40"
                  >
                    Imprimir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && total > PRODUCTOS_PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {total} producto(s) · página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
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
    </>
  );
}
