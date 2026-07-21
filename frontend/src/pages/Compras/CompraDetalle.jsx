import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  actualizarGuiaRemision,
  anularCompra,
  createCompra,
  deleteCompraItem,
  getCompra,
  recibirCompra,
  updateCompraItem,
} from "../../services/comprasService";
import { listProveedores } from "../../services/proveedoresService";
import { createProducto, listProductos } from "../../services/productosService";
import { findOrCreateCategoria, listCategorias } from "../../services/categoriasService";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { ESTADO_LABEL, ESTADO_BADGE_CLASS } from "../../utils/compraEstado";
import { formatearPrecio } from "../../utils/currency";
import { ROLES } from "../../utils/roles";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const PUEDE_ANULAR = [ROLES.ADMIN, ROLES.GERENCIA];
const PUEDE_RECIBIR = [ROLES.ADMIN, ROLES.GERENCIA, ROLES.ALMACEN];
// Editar cantidades/costos de las lineas de una compra pendiente (0014).
// Caso tipico: la compra se importo del Excel del proveedor sin costos y
// hay que cargarlos cuando llega la factura.
const PUEDE_EDITAR_LINEAS = [ROLES.ADMIN, ROLES.GERENCIA];

function calcularTotal(items) {
  return items.reduce((total, item) => total + item.cantidad * item.costo_unitario, 0);
}

export default function CompraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rol } = useAuth();
  const modoEdicion = Boolean(id);

  const [compra, setCompra] = useState(null);
  const [loading, setLoading] = useState(modoEdicion);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Guia de remision: solo se usa en modo edicion, editable mientras la
  // compra sigue pendiente (0013).
  const [guiaRemision, setGuiaRemision] = useState("");
  const [guardandoGuia, setGuardandoGuia] = useState(false);

  // Copia editable de las lineas (solo compra pendiente + admin/gerencia):
  // se edita local y se persiste todo junto con "Guardar cambios".
  const [lineas, setLineas] = useState([]);
  const [guardandoLineas, setGuardandoLineas] = useState(false);

  // Solo se usan en modo alta (armar una compra nueva).
  const [proveedorId, setProveedorId] = useState("");
  const [proveedores, setProveedores] = useState([]);
  const [moneda, setMoneda] = useState("PEN");
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [items, setItems] = useState([]);
  const [modoAgregar, setModoAgregar] = useState("existente"); // "existente" | "nuevo"
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [cantidadNueva, setCantidadNueva] = useState("1");
  const [nuevoProducto, setNuevoProducto] = useState({
    codigo_referencia: "",
    nombre: "",
    categoriaNombre: "",
    modelo: "",
    color: "",
    precio_venta: "",
  });

  useEffect(() => {
    if (modoEdicion) return;
    listProveedores().then(setProveedores).catch(() => {});
    listProductos(rol).then(setProductos).catch(() => {});
    listCategorias().then(setCategorias).catch(() => {});
  }, [modoEdicion, rol]);

  const aplicarCompra = (data) => {
    setCompra(data);
    setGuiaRemision(data.guia_remision ?? "");
    setLineas(
      data.items.map((item) => ({
        id: item.id,
        cantidad: item.cantidad,
        costo_unitario: item.costo_unitario,
      }))
    );
  };

  useEffect(() => {
    if (!modoEdicion) return;

    let activo = true;
    getCompra(id)
      .then((data) => {
        if (!activo) return;
        aplicarCompra(data);
      })
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

  const totalNuevaCompra = useMemo(
    () => items.reduce((total, item) => total + item.cantidad * item.costo_unitario, 0),
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
        cantidad,
        // Se sugiere el ultimo precio_compra conocido como punto de partida,
        // pero es editable: el costo de esta compra puede diferir.
        costo_unitario: producto.precio_compra ?? 0,
      },
    ]);
    setProductoSeleccionado("");
    setCantidadNueva("1");
  };

  const handleNuevoProductoChange = (campo) => (event) => {
    setNuevoProducto((prev) => ({ ...prev, [campo]: event.target.value }));
  };

  // Producto que todavia no existe en el catalogo (llega con esta compra):
  // se agrega a la tabla marcado como "esNuevo" y recien se crea de verdad
  // en handleGuardar, junto con el resto de la compra. costo_unitario
  // arranca en 0 (no hay precio_compra previo que sugerir, a diferencia de
  // un producto existente) - se edita igual que cualquier otra linea en la
  // tabla.
  const agregarItemNuevo = () => {
    const nombre = nuevoProducto.nombre.trim();
    if (!nombre) return;

    const cantidad = Math.max(1, Math.trunc(Number(cantidadNueva)) || 1);
    setItems((prev) => [
      ...prev,
      {
        esNuevo: true,
        tempId: `nuevo-${Date.now()}-${prev.length}`,
        nombre,
        codigo_referencia: nuevoProducto.codigo_referencia.trim() || null,
        categoriaNombre: nuevoProducto.categoriaNombre.trim(),
        modelo: nuevoProducto.modelo.trim() || null,
        color: nuevoProducto.color.trim() || null,
        precio_venta: Number(nuevoProducto.precio_venta) || 0,
        cantidad,
        costo_unitario: 0,
      },
    ]);
    setNuevoProducto({
      codigo_referencia: "",
      nombre: "",
      categoriaNombre: "",
      modelo: "",
      color: "",
      precio_venta: "",
    });
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

  const actualizarCostoItem = (index, costo) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, costo_unitario: Number(costo) || 0 } : item))
    );
  };

  const handleGuardar = async (event) => {
    event.preventDefault();
    if (!proveedorId) {
      setError("Elige un proveedor.");
      return;
    }
    if (items.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Las lineas "esNuevo" todavia no tienen producto_id: el producto se
      // crea recien aca (secuencial, uno por uno - la cantidad tipica de
      // productos nuevos en una sola compra es chica; para decenas de
      // productos nuevos de golpe existe el flujo de Importar Excel
      // asociado a una compra).
      const itemsResueltos = [];
      for (const item of items) {
        if (!item.esNuevo) {
          itemsResueltos.push({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            costo_unitario: item.costo_unitario,
          });
          continue;
        }

        let categoriaId = null;
        if (item.categoriaNombre) {
          const categoria = await findOrCreateCategoria(item.categoriaNombre);
          categoriaId = categoria.id;
        }

        const nuevoProductoCreado = await createProducto({
          codigo_referencia: item.codigo_referencia,
          nombre: item.nombre,
          categoria_id: categoriaId,
          modelo: item.modelo,
          color: item.color,
          moneda,
          precio_venta: item.precio_venta,
          precio_compra: 0,
          stock_fisico: 0,
        });

        itemsResueltos.push({
          producto_id: nuevoProductoCreado.id,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario,
        });
      }

      const nueva = await createCompra({
        proveedor_id: proveedorId,
        moneda,
        items: itemsResueltos,
      });
      navigate(`/compras/${nueva.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarGuia = async () => {
    setGuardandoGuia(true);
    setError(null);
    try {
      const actualizada = await actualizarGuiaRemision(compra.id, guiaRemision.trim() || null);
      aplicarCompra(actualizada);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoGuia(false);
    }
  };

  const lineasEditables = modoEdicion && compra?.estado === "pendiente" && PUEDE_EDITAR_LINEAS.includes(rol);

  const hayCambiosEnLineas =
    lineasEditables &&
    lineas.some((linea, index) => {
      const original = compra.items[index];
      return linea.cantidad !== original.cantidad || linea.costo_unitario !== original.costo_unitario;
    });

  const actualizarLinea = (index, campo, valor) => {
    setLineas((prev) =>
      prev.map((linea, i) => {
        if (i !== index) return linea;
        if (campo === "cantidad") {
          return { ...linea, cantidad: Math.max(1, Math.trunc(Number(valor)) || 1) };
        }
        return { ...linea, costo_unitario: Number(valor) || 0 };
      })
    );
  };

  const handleGuardarLineas = async () => {
    setGuardandoLineas(true);
    setError(null);
    try {
      for (let i = 0; i < lineas.length; i++) {
        const original = compra.items[i];
        const linea = lineas[i];
        if (linea.cantidad === original.cantidad && linea.costo_unitario === original.costo_unitario) continue;
        await updateCompraItem(linea.id, {
          cantidad: linea.cantidad,
          costo_unitario: linea.costo_unitario,
        });
      }
      aplicarCompra(await getCompra(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoLineas(false);
    }
  };

  const handleQuitarLinea = async (item) => {
    const confirmado = window.confirm(`¿Quitar "${item.producto?.nombre ?? "esta línea"}" de la compra?`);
    if (!confirmado) return;

    setGuardandoLineas(true);
    setError(null);
    try {
      await deleteCompraItem(item.id);
      aplicarCompra(await getCompra(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoLineas(false);
    }
  };

  const handleRecibir = async () => {
    // Costo 0 = "costo aun no cargado" (tipico de una compra importada del
    // Excel del proveedor): se puede recibir igual, pero se avisa que esas
    // lineas no van a actualizar el precio de compra del producto (0014).
    const sinCosto = compra.items.filter((item) => item.costo_unitario === 0).length;
    const avisoSinCosto =
      sinCosto > 0
        ? ` Ojo: ${sinCosto} línea(s) tienen costo 0 y NO actualizarán el precio de compra de esos productos.`
        : "";
    const confirmado = window.confirm(
      `¿Confirmar recepción de esta compra? Se sumará el stock físico y se actualizará el precio de compra de cada producto.${avisoSinCosto}`
    );
    if (!confirmado) return;

    setActionLoading(true);
    setError(null);
    try {
      const actualizada = await recibirCompra(compra.id);
      aplicarCompra(actualizada);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAnular = async () => {
    const confirmado = window.confirm("¿Anular esta compra? Esta acción no se puede deshacer.");
    if (!confirmado) return;

    setActionLoading(true);
    setError(null);
    try {
      const actualizada = await anularCompra(compra.id);
      aplicarCompra(actualizada);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando compra...</p>;
  }

  if (modoEdicion) {
    const totalActual = calcularTotal(compra.items);

    return (
      <>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-3xl font-bold">Compra</h2>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE_CLASS[compra.estado]}`}
          >
            {ESTADO_LABEL[compra.estado]}
          </span>
        </div>

        <Card className="mt-6 max-w-2xl">
          <dl className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <dt className="text-slate-500">Proveedor</dt>
              <dd className="font-medium text-slate-800">{compra.proveedor?.nombre ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Creada por</dt>
              <dd className="font-medium text-slate-800">{compra.creador?.nombre ?? "—"}</dd>
            </div>
            {compra.guia_remision && compra.estado !== "pendiente" && (
              <div>
                <dt className="text-slate-500">Guía de remisión</dt>
                <dd className="font-medium text-slate-800">{compra.guia_remision}</dd>
              </div>
            )}
            {compra.estado === "recibida" && (
              <>
                <div>
                  <dt className="text-slate-500">Recibida por</dt>
                  <dd className="font-medium text-slate-800">{compra.receptor?.nombre ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Recibida el</dt>
                  <dd className="font-medium text-slate-800">
                    {compra.recibida_at ? new Date(compra.recibida_at).toLocaleString("es-PE") : "—"}
                  </dd>
                </div>
              </>
            )}
          </dl>

          {compra.estado === "pendiente" && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">Guía de remisión</label>
              <div className="flex gap-2 max-w-xs">
                <input
                  value={guiaRemision}
                  onChange={(event) => setGuiaRemision(event.target.value)}
                  placeholder="N° de guía"
                  className={INPUT_CLASS}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={guardandoGuia}
                  onClick={handleGuardarGuia}
                >
                  {guardandoGuia ? "..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}

          <table className="w-full text-sm mb-4">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium text-right">Cantidad</th>
                <th className="py-2 font-medium text-right">Costo unit.</th>
                <th className="py-2 font-medium text-right">Subtotal</th>
                {lineasEditables && <th className="py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {compra.items.map((item, index) =>
                lineasEditables ? (
                  <tr key={item.id}>
                    <td className="py-2">{item.producto?.nombre ?? "—"}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min="1"
                        value={lineas[index]?.cantidad ?? item.cantidad}
                        onChange={(event) => actualizarLinea(index, "cantidad", event.target.value)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lineas[index]?.costo_unitario ?? item.costo_unitario}
                        onChange={(event) => actualizarLinea(index, "costo_unitario", event.target.value)}
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-2 text-right">
                      {formatearPrecio(
                        (lineas[index]?.cantidad ?? item.cantidad) *
                          (lineas[index]?.costo_unitario ?? item.costo_unitario),
                        compra.moneda
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={guardandoLineas}
                        onClick={() => handleQuitarLinea(item)}
                        className="text-xs text-danger-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id}>
                    <td className="py-2">{item.producto?.nombre ?? "—"}</td>
                    <td className="py-2 text-right">{item.cantidad}</td>
                    <td className="py-2 text-right">{formatearPrecio(item.costo_unitario, compra.moneda)}</td>
                    <td className="py-2 text-right">
                      {formatearPrecio(item.cantidad * item.costo_unitario, compra.moneda)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          {lineasEditables && hayCambiosEnLineas && (
            <div className="flex justify-end mb-4">
              <Button type="button" variant="secondary" size="sm" disabled={guardandoLineas} onClick={handleGuardarLineas}>
                {guardandoLineas ? "Guardando..." : "Guardar cambios en las líneas"}
              </Button>
            </div>
          )}

          <p className="text-right font-semibold text-slate-800 mb-6">
            Total:{" "}
            {formatearPrecio(
              lineasEditables
                ? lineas.reduce((total, linea) => total + linea.cantidad * linea.costo_unitario, 0)
                : totalActual,
              compra.moneda
            )}
          </p>

          {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

          <div className="flex items-center gap-3 flex-wrap">
            {compra.estado === "pendiente" && PUEDE_RECIBIR.includes(rol) && (
              <Button variant="success" disabled={actionLoading} onClick={handleRecibir}>
                Recibir mercadería
              </Button>
            )}
            {compra.estado === "pendiente" && PUEDE_ANULAR.includes(rol) && (
              <Button variant="danger" disabled={actionLoading} onClick={handleAnular}>
                Anular compra
              </Button>
            )}

            <Button variant="secondary" onClick={() => navigate("/compras")}>
              Volver a la lista
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <h2 className="text-3xl font-bold">Nueva compra</h2>

      <Card className="mt-6 max-w-2xl">
        <form onSubmit={handleGuardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor</label>
              <select
                value={proveedorId}
                onChange={(event) => setProveedorId(event.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Selecciona un proveedor...</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.nombre}
                  </option>
                ))}
              </select>
              {proveedores.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  No hay proveedores todavía.{" "}
                  <Link to="/proveedores/nuevo" className="text-primary-600 hover:underline">
                    Crea uno primero
                  </Link>
                  .
                </p>
              )}
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">Agregar producto</p>
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setModoAgregar("existente")}
                  className={`px-2 py-1 rounded ${
                    modoAgregar === "existente" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Producto existente
                </button>
                <button
                  type="button"
                  onClick={() => setModoAgregar("nuevo")}
                  className={`px-2 py-1 rounded ${
                    modoAgregar === "nuevo" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Producto nuevo
                </button>
              </div>
            </div>

            {modoAgregar === "existente" ? (
              <>
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
                          {producto.nombre}
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
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Se crea en el catálogo con stock 0 al guardar la compra; el stock se suma recién al
                  recibirla.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Código de referencia
                    </label>
                    <input
                      value={nuevoProducto.codigo_referencia}
                      onChange={handleNuevoProductoChange("codigo_referencia")}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                    <input
                      value={nuevoProducto.nombre}
                      onChange={handleNuevoProductoChange("nombre")}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Marca</label>
                    <input
                      list="categorias-nueva-compra"
                      value={nuevoProducto.categoriaNombre}
                      onChange={handleNuevoProductoChange("categoriaNombre")}
                      className={INPUT_CLASS}
                    />
                    <datalist id="categorias-nueva-compra">
                      {categorias.map((categoria) => (
                        <option key={categoria.id} value={categoria.nombre} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Modelo</label>
                    <input
                      value={nuevoProducto.modelo}
                      onChange={handleNuevoProductoChange("modelo")}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                    <input
                      value={nuevoProducto.color}
                      onChange={handleNuevoProductoChange("color")}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Precio de venta</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={nuevoProducto.precio_venta}
                      onChange={handleNuevoProductoChange("precio_venta")}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="w-24">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      value={cantidadNueva}
                      onChange={(event) => setCantidadNueva(event.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={agregarItemNuevo}>
                    Agregar producto nuevo
                  </Button>
                </div>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left">
                <tr>
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium text-right">Cantidad</th>
                  <th className="py-2 font-medium text-right">Costo unit.</th>
                  <th className="py-2 font-medium text-right">Subtotal</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={item.tempId ?? `${item.producto_id}-${index}`}>
                    <td className="py-2">
                      {item.nombre}
                      {item.esNuevo && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
                          Nuevo
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
                        value={item.costo_unitario}
                        onChange={(event) => actualizarCostoItem(index, event.target.value)}
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-2 text-right">
                      {formatearPrecio(item.cantidad * item.costo_unitario, moneda)}
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
              Total: {formatearPrecio(totalNuevaCompra, moneda)}
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
              onClick={() => navigate("/compras")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
