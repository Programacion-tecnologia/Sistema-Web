import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { analizarPdfCotizacion } from "../../services/pdfCotizacionImportService";
import { createCotizacion } from "../../services/cotizacionesService";
import { findOrCreateCliente, listClientes } from "../../services/clientesService";
import { listProductos } from "../../services/productosService";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { formatearPrecio } from "../../utils/currency";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

function construirMapaCodigos(productos) {
  const mapa = new Map();
  for (const producto of productos) {
    if (producto.codigo_referencia) mapa.set(producto.codigo_referencia.trim().toUpperCase(), producto);
    if (producto.codigo_barras) mapa.set(producto.codigo_barras.trim().toUpperCase(), producto);
  }
  return mapa;
}

let contadorKeys = 0;
function nuevaKey() {
  contadorKeys += 1;
  return contadorKeys;
}

export default function CotizacionImportarPdf() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [archivo, setArchivo] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [analisisHecho, setAnalisisHecho] = useState(false);
  const [lineasCrudas, setLineasCrudas] = useState([]);
  const [mostrarTexto, setMostrarTexto] = useState(false);

  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteRucDni, setClienteRucDni] = useState("");
  const [clientes, setClientes] = useState([]);
  const [moneda, setMoneda] = useState("PEN");
  const [productos, setProductos] = useState([]);
  const [items, setItems] = useState([]);
  const [productoManual, setProductoManual] = useState("");
  const [cantidadManual, setCantidadManual] = useState("1");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    listClientes().then(setClientes).catch(() => {});
    listProductos().then(setProductos).catch(() => {});
  }, []);

  const productosDisponibles = useMemo(
    () => productos.filter((producto) => producto.moneda === moneda),
    [productos, moneda]
  );

  const total = useMemo(
    () => items.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0),
    [items]
  );

  const hayLineasSinProducto = items.some((item) => !item.producto_id);

  const handleAnalizar = async () => {
    if (!archivo) return;
    setAnalizando(true);
    setError(null);

    try {
      const {
        clienteSugerido,
        rucDniSugerido,
        items: itemsCrudos,
        lineasCrudas: lineas,
      } = await analizarPdfCotizacion(archivo);
      const mapaCodigos = construirMapaCodigos(productos);

      setItems(
        itemsCrudos.map((item) => {
          const producto = mapaCodigos.get(item.codigo_pdf.trim().toUpperCase()) ?? null;
          return {
            key: nuevaKey(),
            codigo_pdf: item.codigo_pdf,
            descripcion_pdf: item.descripcion_pdf,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            producto_id: producto?.id ?? null,
            nombre: producto?.nombre ?? null,
          };
        })
      );
      setLineasCrudas(lineas);
      if (clienteSugerido && !clienteNombre.trim()) setClienteNombre(clienteSugerido);
      if (rucDniSugerido && !clienteRucDni.trim()) setClienteRucDni(rucDniSugerido);
      setAnalisisHecho(true);
    } catch (err) {
      setError(`No se pudo leer el PDF: ${err.message}`);
    } finally {
      setAnalizando(false);
    }
  };

  const asignarProducto = (index, productoId) => {
    const producto = productos.find((p) => p.id === productoId);
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, producto_id: producto?.id ?? null, nombre: producto?.nombre ?? null } : item
      )
    );
  };

  const actualizarCantidad = (index, cantidad) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, cantidad: Math.max(1, Math.trunc(Number(cantidad)) || 1) } : item))
    );
  };

  const actualizarPrecio = (index, precio) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, precio_unitario: Number(precio) || 0 } : item)));
  };

  const quitarItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const agregarProductoManual = () => {
    const producto = productosDisponibles.find((p) => p.id === productoManual);
    if (!producto) return;

    const cantidad = Math.max(1, Math.trunc(Number(cantidadManual)) || 1);
    setItems((prev) => [
      ...prev,
      {
        key: nuevaKey(),
        codigo_pdf: "—",
        descripcion_pdf: "Agregado manualmente",
        cantidad,
        precio_unitario: producto.precio_venta,
        producto_id: producto.id,
        nombre: producto.nombre,
      },
    ]);
    setProductoManual("");
    setCantidadManual("1");
  };

  const handleCrearCotizacion = async () => {
    if (!clienteNombre.trim()) {
      setError("Elige o escribe un cliente.");
      return;
    }
    if (items.length === 0 || hayLineasSinProducto) return;

    setSaving(true);
    setError(null);

    try {
      const cliente = await findOrCreateCliente(clienteNombre, clienteRucDni);
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

  return (
    <>
      <h2 className="text-3xl font-bold">Importar cotización desde PDF</h2>
      <p className="mt-1 text-sm text-slate-500">
        Para cotizaciones ya acordadas con el cliente en otro sistema (ej. Mifact) — se extraen los
        productos y cantidades automáticamente, pero siempre revisá la lista antes de confirmar.
      </p>

      <Card className="mt-6 max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">1. Archivo PDF</p>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                setArchivo(event.target.files?.[0] ?? null);
                setAnalisisHecho(false);
                setItems([]);
              }}
              className="text-sm"
            />
            <Button type="button" onClick={handleAnalizar} disabled={!archivo || analizando}>
              {analizando ? "Analizando..." : "Analizar PDF"}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        {analisisHecho && (
          <>
            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">2. Revisar e importar</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                  <input
                    list="clientes-existentes-import"
                    value={clienteNombre}
                    onChange={(event) => setClienteNombre(event.target.value)}
                    className={INPUT_CLASS}
                  />
                  <datalist id="clientes-existentes-import">
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.nombre} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RUC/DNI</label>
                  <input
                    value={clienteRucDni}
                    onChange={(event) => setClienteRucDni(event.target.value)}
                    className={INPUT_CLASS}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Solo se guarda si el cliente todavía no tenía uno cargado.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                  <select value={moneda} onChange={(event) => setMoneda(event.target.value)} className={INPUT_CLASS}>
                    <option value="PEN">Soles (PEN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No se reconoció ningún producto en el PDF. Agregalos manualmente abajo, o revisá el
                  texto extraído para ver qué pasó.
                </p>
              ) : (
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
                      <tr key={item.key} className={item.producto_id ? "" : "bg-danger-50"}>
                        <td className="py-2">
                          {item.producto_id ? (
                            <>
                              <p className="font-medium text-slate-800">{item.nombre}</p>
                              <p className="text-xs text-slate-400">
                                CÓDIGO REF: {item.codigo_pdf} — {item.descripcion_pdf}
                              </p>
                            </>
                          ) : (
                            <>
                              <select
                                value=""
                                onChange={(event) => asignarProducto(index, event.target.value)}
                                className={INPUT_CLASS}
                              >
                                <option value="">No encontrado — asignar producto...</option>
                                {productosDisponibles.map((producto) => (
                                  <option key={producto.id} value={producto.id}>
                                    {producto.nombre}
                                  </option>
                                ))}
                              </select>
                              <p className="mt-1 text-xs text-danger-600">
                                Código "{item.codigo_pdf}" no encontrado — {item.descripcion_pdf}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="py-2 text-right align-top">
                          <input
                            type="number"
                            min="1"
                            value={item.cantidad}
                            onChange={(event) => actualizarCantidad(index, event.target.value)}
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="py-2 text-right align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.precio_unitario}
                            onChange={(event) => actualizarPrecio(index, event.target.value)}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="py-2 text-right align-top">
                          {formatearPrecio(item.cantidad * item.precio_unitario, moneda)}
                        </td>
                        <td className="py-2 text-right align-top">
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
                <p className="text-right font-semibold text-slate-800 mt-2">
                  Total: {formatearPrecio(total, moneda)}
                </p>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Agregar producto manualmente</p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <select
                    value={productoManual}
                    onChange={(event) => setProductoManual(event.target.value)}
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
                    value={cantidadManual}
                    onChange={(event) => setCantidadManual(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={agregarProductoManual}>
                  Agregar
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setMostrarTexto((prev) => !prev)}
                className="text-xs text-slate-500 hover:underline"
              >
                {mostrarTexto ? "Ocultar" : "Ver"} texto extraído del PDF
              </button>
              {mostrarTexto && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap">
                  {lineasCrudas.join("\n")}
                </pre>
              )}
            </div>

            {hayLineasSinProducto && (
              <p className="text-sm text-danger-600">
                Hay líneas sin producto asignado — resolvelas o quitalas antes de crear la cotización.
              </p>
            )}
            {error && <p className="text-sm text-danger-600">{error}</p>}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleCrearCotizacion}
                disabled={saving || items.length === 0 || hayLineasSinProducto}
              >
                {saving ? "Creando..." : "Crear cotización"}
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => navigate("/cotizaciones")}>
                Cancelar
              </Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
