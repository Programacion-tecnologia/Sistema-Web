import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  buscarProductosPaginado,
  deleteProducto,
  listModelosProductos,
  PRODUCTOS_PAGE_SIZE,
} from "../../services/productosService";
import { listCategorias } from "../../services/categoriasService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import FotoProducto from "../../components/Productos/FotoProducto";
import { getNivelStock, STOCK_NIVEL_CLASS } from "../../utils/stock";
import { formatearPrecio } from "../../utils/currency";
import { normalizarTexto } from "../../utils/normalizar";

const PUEDE_ESCRIBIR_PRODUCTOS = [ROLES.ADMIN, ROLES.GERENCIA];

const SELECT_CLASS =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const DEBOUNCE_BUSQUEDA_MS = 300;

// El catalogo escribe "modelo" con varias motos compatibles separadas por
// "/" en un mismo campo (ej. "CRF250F / XR250R / TORNADO").
function extraerModelos(modeloRaw) {
  return (modeloRaw ?? "")
    .split("/")
    .map((m) => m.trim())
    .filter(Boolean);
}

export default function Productos() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeEscribir = PUEDE_ESCRIBIR_PRODUCTOS.includes(rol);
  const puedeEliminar = rol === ROLES.ADMIN;

  const [productos, setProductos] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [terminoDebounced, setTerminoDebounced] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [modeloClave, setModeloClave] = useState("");
  const [eliminandoId, setEliminandoId] = useState(null);

  const [marcas, setMarcas] = useState([]);
  const [modelosData, setModelosData] = useState([]);

  // Busqueda instantanea pero con debounce: evita un pedido al servidor por
  // cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setTerminoDebounced(busqueda.trim()), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(id);
  }, [busqueda]);

  // Datos para armar los dropdowns: marcas es una tabla chica (se pide tal
  // cual), modelos es el fetch liviano de id+modelo que se cachea una sola
  // vez por sesion en el servicio.
  useEffect(() => {
    listCategorias()
      .then(setMarcas)
      .catch(() => {});
    listModelosProductos()
      .then(setModelosData)
      .catch(() => {});
  }, []);

  // "modelo" es texto libre e inconsistente, y ademas un mismo producto
  // puede calzar con varias motos a la vez separadas por "/" (ej. "CRF250F /
  // XR250R / TORNADO" = compatible con las tres). Se separan esos tokens
  // primero y recien despues se normaliza cada uno (espacios/guiones), asi
  // el dropdown lista motos individuales y no combinaciones completas.
  const modelos = useMemo(() => {
    const grupos = new Map();
    for (const fila of modelosData) {
      for (const token of extraerModelos(fila.modelo)) {
        const clave = normalizarTexto(token);
        if (!clave) continue;
        if (!grupos.has(clave)) grupos.set(clave, new Map());
        const variantes = grupos.get(clave);
        variantes.set(token, (variantes.get(token) ?? 0) + 1);
      }
    }

    return Array.from(grupos, ([clave, variantes]) => {
      const [label] = Array.from(variantes).reduce((mejor, actual) =>
        actual[1] > mejor[1] ? actual : mejor
      );
      const total = Array.from(variantes.values()).reduce((suma, count) => suma + count, 0);
      return { clave, label, total };
    }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [modelosData]);

  // El filtro de Modelo no se puede expresar como un filtro simple en
  // Supabase (requiere normalizar texto libre), asi que se resuelve en el
  // cliente contra el fetch liviano de arriba y se manda como .in("id", ...)
  // en la consulta paginada.
  const idsPorModelo = useMemo(() => {
    if (!modeloClave) return null;
    const ids = [];
    for (const fila of modelosData) {
      const tokens = extraerModelos(fila.modelo).map(normalizarTexto);
      if (tokens.includes(modeloClave)) ids.push(fila.id);
    }
    return ids;
  }, [modelosData, modeloClave]);

  // Se recalcula la key en cada render y se compara contra la ultima
  // cargada: si cambio algun filtro/pagina, arranca un fetch nuevo. Ajustar
  // el estado durante el render (en vez de en un useEffect) es el patron que
  // recomienda React para "resetear estado cuando cambia una dependencia" -
  // evita el flash de un setState sincrono al toque de entrar al effect.
  const filtrosKey = JSON.stringify({ rol, pagina, terminoDebounced, marcaId, idsPorModelo });
  const [filtrosKeyCargada, setFiltrosKeyCargada] = useState(null);
  if (filtrosKey !== filtrosKeyCargada) {
    setFiltrosKeyCargada(filtrosKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let activo = true;

    buscarProductosPaginado({ rol, pagina, termino: terminoDebounced, marcaId, ids: idsPorModelo })
      .then(({ data, count }) => {
        if (!activo) return;
        setProductos(data);
        setTotalCount(count);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [rol, pagina, terminoDebounced, marcaId, idsPorModelo]);

  const handleEliminar = async (producto) => {
    const confirmado = window.confirm(
      `¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    setEliminandoId(producto.id);
    setError(null);

    try {
      await deleteProducto(producto.id);
      setProductos((prev) => prev.filter((p) => p.id !== producto.id));
      setTotalCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(err.message);
    } finally {
      setEliminandoId(null);
    }
  };

  const hayFiltrosActivos = Boolean(terminoDebounced || marcaId || modeloClave);
  const totalPaginas = Math.max(1, Math.ceil(totalCount / PRODUCTOS_PAGE_SIZE));

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Productos</h2>

        {puedeEscribir && (
          <div className="flex items-center gap-3">
            <Link to="/productos/importar">
              <Button variant="secondary">Importar desde Excel</Button>
            </Link>
            <Link to="/productos/nuevo">
              <Button>Nuevo producto</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            setPagina(0);
          }}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <select
          value={marcaId}
          onChange={(event) => {
            setMarcaId(event.target.value);
            setPagina(0);
          }}
          className={SELECT_CLASS}
        >
          <option value="">Todas las marcas</option>
          {marcas.map((marca) => (
            <option key={marca.id} value={marca.id}>
              {marca.nombre}
            </option>
          ))}
        </select>

        <select
          value={modeloClave}
          onChange={(event) => {
            setModeloClave(event.target.value);
            setPagina(0);
          }}
          className={SELECT_CLASS}
        >
          <option value="">Todos los modelos</option>
          {modelos.map((modelo) => (
            <option key={modelo.clave} value={modelo.clave}>
              {modelo.label} ({modelo.total})
            </option>
          ))}
        </select>
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando productos...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && productos.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {hayFiltrosActivos
              ? "Ningún producto coincide con los filtros."
              : "Todavía no hay productos cargados. Crea uno nuevo o importa un Excel."}
          </p>
        )}

        {!loading && !error && productos.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Color / Modelo</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium text-right">Precio venta</th>
                <th className="px-4 py-3 font-medium text-right">Stock disponible</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.map((producto) => (
                <tr
                  key={producto.id}
                  onClick={() => navigate(`/productos/${producto.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FotoProducto fotoUrl={producto.foto_url} nombre={producto.nombre} size="md" />
                      <div>
                        <p className="font-medium text-slate-800">{producto.nombre}</p>
                        {producto.codigo_referencia && (
                          <p className="text-xs text-slate-400">
                            CÓDIGO REF: {producto.codigo_referencia}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[producto.color, producto.modelo].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{producto.categoria?.nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatearPrecio(producto.precio_venta, producto.moneda)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${STOCK_NIVEL_CLASS[getNivelStock(producto.stock_disponible)]}`}
                  >
                    {producto.stock_disponible}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <Link to={`/productos/${producto.id}`}>
                        <Button variant="secondary" size="sm">
                          {puedeEscribir ? "Editar" : "Ver"}
                        </Button>
                      </Link>
                      {puedeEliminar && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={eliminandoId === producto.id}
                          onClick={() => handleEliminar(producto)}
                        >
                          {eliminandoId === producto.id ? "Eliminando..." : "Eliminar"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && !error && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>
              {totalCount} producto{totalCount === 1 ? "" : "s"} — página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
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
    </>
  );
}
