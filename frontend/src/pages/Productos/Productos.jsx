import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  buscarProductosPaginado,
  buscarProductosParaCatalogo,
  deleteProducto,
  listModelosProductos,
  PRODUCTOS_PAGE_SIZE,
} from "../../services/productosService";
import { listCategorias } from "../../services/categoriasService";
import { getConfiguracionEmpresa } from "../../services/configuracionService";
import { generarCatalogoPdf } from "../../utils/pdfCatalogo";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import FotoProducto from "../../components/Productos/FotoProducto";
import { getNivelStock, STOCK_NIVEL_CLASS } from "../../utils/stock";
import { formatearPrecio } from "../../utils/currency";
import { normalizarTexto } from "../../utils/normalizar";
import { productosListState } from "../../utils/productosListState";

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

// Ventana de numeros de pagina centrada en la pagina actual (0-indexed),
// con la primera y ultima siempre visibles como acceso directo. Con ~78
// paginas no tiene sentido listarlas todas: se usa "..." para lo que queda
// afuera de la ventana.
function construirPaginasVisibles(paginaActual, totalPaginas, radio = 3) {
  const ultima = totalPaginas - 1;
  const inicio = Math.max(0, paginaActual - radio);
  const fin = Math.min(ultima, paginaActual + radio);

  const paginas = [];
  if (inicio > 0) {
    paginas.push(0);
    if (inicio > 1) paginas.push("...");
  }
  for (let i = inicio; i <= fin; i++) paginas.push(i);
  if (fin < ultima) {
    if (fin < ultima - 1) paginas.push("...");
    paginas.push(ultima);
  }
  return paginas;
}

export default function Productos() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeEscribir = PUEDE_ESCRIBIR_PRODUCTOS.includes(rol);
  const puedeEliminar = rol === ROLES.ADMIN;

  const [productos, setProductos] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pagina, setPagina] = useState(() => productosListState.pagina);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState(() => productosListState.busqueda);
  const [terminoDebounced, setTerminoDebounced] = useState(() => productosListState.busqueda.trim());
  const [marcaId, setMarcaId] = useState(() => productosListState.marcaId);
  const [modeloClave, setModeloClave] = useState(() => productosListState.modeloClave);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [generandoCatalogo, setGenerandoCatalogo] = useState(false);
  const [avisoCatalogo, setAvisoCatalogo] = useState(null);

  // Cambiar de pagina o de cualquier filtro se guarda en el cache de modulo
  // (productosListState) ademas de en el estado local, para que sobreviva a
  // que este componente se desmonte al entrar al detalle de un producto.
  const cambiarPagina = (nueva) => {
    setPagina(nueva);
    productosListState.pagina = nueva;
  };

  const cambiarBusqueda = (valor) => {
    setBusqueda(valor);
    productosListState.busqueda = valor;
  };

  const cambiarMarca = (valor) => {
    setMarcaId(valor);
    productosListState.marcaId = valor;
    cambiarPagina(0);
  };

  const cambiarModelo = (valor) => {
    setModeloClave(valor);
    productosListState.modeloClave = valor;
    cambiarPagina(0);
  };

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
      // Las variantes son las escrituras crudas del token tal cual estan
      // guardadas en la columna modelo (ej. "CRF230F", "CRF 230F"): se pasan
      // al filtro server-side para que matchee todas las formas que el
      // dropdown agrupo bajo esta misma clave normalizada.
      return { clave, label, total, variantes: Array.from(variantes.keys()) };
    }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [modelosData]);

  // Filtro de Modelo: en vez de resolver ids en el cliente y mandarlos con
  // .in("id", [...cientos...]) (URL que superaba el limite y devolvia 400),
  // se pasan las variantes de texto del modelo elegido y el filtrado se hace
  // del lado del servidor sobre la columna modelo. null = sin filtro; [] =
  // filtro puesto pero el dropdown aun no cargo (=> sin resultados por ahora).
  const variantesModelo = useMemo(() => {
    if (!modeloClave) return null;
    const grupo = modelos.find((m) => m.clave === modeloClave);
    return grupo ? grupo.variantes : [];
  }, [modelos, modeloClave]);

  // Se recalcula la key en cada render y se compara contra la ultima
  // cargada: si cambio algun filtro/pagina, arranca un fetch nuevo. Ajustar
  // el estado durante el render (en vez de en un useEffect) es el patron que
  // recomienda React para "resetear estado cuando cambia una dependencia" -
  // evita el flash de un setState sincrono al toque de entrar al effect.
  const filtrosKey = JSON.stringify({ rol, pagina, terminoDebounced, marcaId, variantesModelo });
  const [filtrosKeyCargada, setFiltrosKeyCargada] = useState(null);
  if (filtrosKey !== filtrosKeyCargada) {
    setFiltrosKeyCargada(filtrosKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let activo = true;

    buscarProductosPaginado({ rol, pagina, termino: terminoDebounced, marcaId, modelos: variantesModelo })
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
  }, [rol, pagina, terminoDebounced, marcaId, variantesModelo]);

  const handleCatalogo = async () => {
    setGenerandoCatalogo(true);
    setAvisoCatalogo(null);
    setError(null);
    try {
      const [config, prods] = await Promise.all([
        getConfiguracionEmpresa().catch(() => null),
        buscarProductosParaCatalogo({ termino: terminoDebounced, marcaId, modelos: variantesModelo }),
      ]);
      if (prods.length === 0) {
        setAvisoCatalogo("No hay productos para el catálogo con los filtros actuales.");
        return;
      }
      await generarCatalogoPdf({ productos: prods, config });
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerandoCatalogo(false);
    }
  };

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

  // Chips de filtros activos: cada uno se puede quitar individualmente con su
  // "x". Se arman a partir del estado actual, resolviendo el nombre legible de
  // marca y modelo contra los datos ya cargados de los dropdowns.
  const filtrosActivos = [];
  if (terminoDebounced) {
    filtrosActivos.push({
      clave: "busqueda",
      etiqueta: "Búsqueda",
      valor: terminoDebounced,
      quitar: () => {
        cambiarBusqueda("");
        cambiarPagina(0);
      },
    });
  }
  if (marcaId) {
    const marca = marcas.find((m) => m.id === marcaId);
    filtrosActivos.push({
      clave: "marca",
      etiqueta: "Marca",
      valor: marca?.nombre ?? marcaId,
      quitar: () => cambiarMarca(""),
    });
  }
  if (modeloClave) {
    const modelo = modelos.find((m) => m.clave === modeloClave);
    filtrosActivos.push({
      clave: "modelo",
      etiqueta: "Modelo",
      valor: modelo?.label ?? modeloClave,
      quitar: () => cambiarModelo(""),
    });
  }

  const limpiarFiltros = () => {
    cambiarBusqueda("");
    cambiarMarca("");
    cambiarModelo("");
    cambiarPagina(0);
  };

  const totalPaginas = Math.max(1, Math.ceil(totalCount / PRODUCTOS_PAGE_SIZE));
  const paginasVisibles = useMemo(
    () => construirPaginasVisibles(pagina, totalPaginas),
    [pagina, totalPaginas]
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl sm:text-3xl font-bold">Productos</h2>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={generandoCatalogo} onClick={handleCatalogo}>
            {generandoCatalogo ? "Generando..." : "Catálogo (PDF)"}
          </Button>
          {puedeEscribir && (
            <>
              <Link to="/productos/importar">
                <Button variant="secondary">Importar desde Excel</Button>
              </Link>
              <Link to="/productos/nuevo">
                <Button>Nuevo producto</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {avisoCatalogo && <p className="mt-3 text-sm text-primary-700">{avisoCatalogo}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={(event) => {
            cambiarBusqueda(event.target.value);
            cambiarPagina(0);
          }}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        <select
          value={marcaId}
          onChange={(event) => cambiarMarca(event.target.value)}
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
          onChange={(event) => cambiarModelo(event.target.value)}
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

      {filtrosActivos.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Filtros activos
          </span>
          {filtrosActivos.map((filtro) => (
            <span
              key={filtro.clave}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 py-1 pl-3 pr-1.5 text-sm text-primary-700"
            >
              <span className="text-primary-500">{filtro.etiqueta}:</span>
              <span className="font-medium">{filtro.valor}</span>
              <button
                type="button"
                onClick={filtro.quitar}
                aria-label={`Quitar filtro ${filtro.etiqueta}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-primary-500 transition hover:bg-primary-200 hover:text-primary-800"
              >
                ×
              </button>
            </span>
          ))}
          {filtrosActivos.length > 1 && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              Limpiar todo
            </button>
          )}
        </div>
      )}

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

        {/* Móvil: tarjetas compactas apiladas (sin scroll lateral). El toque
            lleva al detalle, donde se edita/elimina. */}
        {!loading && !error && productos.length > 0 && (
          <div className="divide-y divide-slate-100 lg:hidden">
            {productos.map((producto) => (
              <button
                key={producto.id}
                type="button"
                onClick={() => navigate(`/productos/${producto.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <FotoProducto fotoUrl={producto.foto_url} nombre={producto.nombre} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 truncate">{producto.nombre}</p>
                  {producto.codigo_referencia && (
                    <p className="text-xs text-slate-400 truncate">
                      CÓD: {producto.codigo_referencia}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 truncate">
                    {[producto.color, producto.modelo, producto.categoria?.nombre]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-slate-800">
                    {formatearPrecio(producto.precio_venta, producto.moneda)}
                  </p>
                  <p className={`text-xs ${STOCK_NIVEL_CLASS[getNivelStock(producto.stock_disponible)]}`}>
                    Stock: {producto.stock_disponible}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Desktop: tabla completa. */}
        {!loading && !error && productos.length > 0 && (
          <table className="hidden w-full text-sm lg:table">
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
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>
              {totalCount} producto{totalCount === 1 ? "" : "s"} — página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina === 0}
                onClick={() => cambiarPagina(pagina - 1)}
              >
                Anterior
              </Button>

              {paginasVisibles.map((item, index) =>
                item === "..." ? (
                  <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => cambiarPagina(item)}
                    aria-current={item === pagina ? "page" : undefined}
                    className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                      item === pagina
                        ? "bg-primary-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {item + 1}
                  </button>
                )
              )}

              <Button
                variant="secondary"
                size="sm"
                disabled={pagina + 1 >= totalPaginas}
                onClick={() => cambiarPagina(pagina + 1)}
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
