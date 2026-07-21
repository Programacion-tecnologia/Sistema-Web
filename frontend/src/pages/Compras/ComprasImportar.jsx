import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseCompraProveedorExcel } from "../../services/excelService";
import { buscarIdsPorCodigoReferencia, importProductos } from "../../services/productosService";
import { createCompra, listComprasPendientes } from "../../services/comprasService";
import { listProveedores } from "../../services/proveedoresService";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

// Compras > Importar Excel: recibe el archivo de pedido al proveedor TAL
// CUAL el negocio ya lo arma (CÓDIGO/UN/CANT./DESCRIPCIÓN/MARCA/X MAYOR/
// PUBLICO, ver parseCompraProveedorExcel) y genera la compra completa de
// una vez, en lugar de cargar las líneas una por una en Nueva compra.
//
// Reglas de negocio (confirmadas 2026-07-17):
// - Un código que ya existe en el catálogo NO se duplica ni se le pisa el
//   nombre/marca: solo se le actualizan los precios de venta (el archivo
//   trae la lista de precios nueva) y se agrega la línea a la compra.
// - Un código que no existe se crea en el catálogo con stock 0; el stock
//   recién sube cuando Almacén recibe la compra (recibir_compra, 0012).
// - El costo real no viene en el archivo (llega después con la factura):
//   las líneas nacen con costo 0 —o con la columna COSTO si el archivo la
//   trae— y se corrigen en la compra pendiente antes de recibirla.
export default function ComprasImportar() {
  const navigate = useNavigate();

  const [excelFile, setExcelFile] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [existentes, setExistentes] = useState(new Map());
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);

  // Edicion inline de una fila de la vista previa (corregir un codigo o
  // descripcion mal escritos en el archivo antes de importar). Toda la
  // pantalla ya es solo Admin/Gerencia (ruta protegida por rol en App.jsx).
  const [editando, setEditando] = useState(null); // numeroFila en edicion
  const [borrador, setBorrador] = useState(null);

  // Destino: compra nueva (proveedor + moneda) o una pendiente existente.
  const [destino, setDestino] = useState("nueva"); // "nueva" | "existente"
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [moneda, setMoneda] = useState("PEN");
  const [comprasPendientes, setComprasPendientes] = useState([]);
  const [compraExistenteId, setCompraExistenteId] = useState("");
  const [compraResultanteId, setCompraResultanteId] = useState(null);

  useEffect(() => {
    listProveedores().then(setProveedores).catch(() => {});
    listComprasPendientes().then(setComprasPendientes).catch(() => {});
  }, []);

  const handleAnalizar = async () => {
    if (!excelFile) return;
    setAnalizando(true);
    setError(null);
    setResumen(null);

    try {
      const buffer = await excelFile.arrayBuffer();
      const resultado = parseCompraProveedorExcel(buffer);
      const codigos = resultado.filas.map((f) => f.codigo_referencia);
      const mapa = await buscarIdsPorCodigoReferencia(codigos);
      setAnalisis(resultado);
      setExistentes(mapa);
      setEditando(null);
      setBorrador(null);
    } catch (err) {
      setError(`No se pudo leer el archivo: ${err.message}`);
      setAnalisis(null);
    } finally {
      setAnalizando(false);
    }
  };

  const empezarEdicion = (fila) => {
    setBorrador({ ...fila });
    setEditando(fila.numeroFila);
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setBorrador(null);
  };

  const cambiarBorrador = (campo) => (event) => {
    setBorrador((prev) => ({ ...prev, [campo]: event.target.value }));
  };

  const guardarEdicion = async () => {
    const codigo = String(borrador.codigo_referencia).trim();
    const nombre = String(borrador.nombre).trim();
    if (!codigo || !nombre) {
      setError("El código y la descripción no pueden quedar vacíos.");
      return;
    }

    const filaCorregida = {
      numeroFila: borrador.numeroFila,
      codigo_referencia: codigo,
      unidad: String(borrador.unidad ?? "").trim() || null,
      cantidad: Math.max(1, Math.trunc(Number(borrador.cantidad)) || 1),
      nombre,
      marca: String(borrador.marca ?? "").trim() || null,
      precio_venta: Math.round((Number(borrador.precio_venta) || 0) * 100) / 100,
      precio_mayorista: Math.round((Number(borrador.precio_mayorista) || 0) * 100) / 100,
      costo: Math.round((Number(borrador.costo) || 0) * 100) / 100,
    };

    try {
      // Si el codigo cambio, el badge Nuevo/Existente tiene que reflejar el
      // codigo corregido: se re-chequea ese codigo puntual contra el catalogo.
      const mapa = await buscarIdsPorCodigoReferencia([codigo]);
      setExistentes((prev) => {
        const copia = new Map(prev);
        if (mapa.has(codigo)) copia.set(codigo, mapa.get(codigo));
        else copia.delete(codigo);
        return copia;
      });
      setAnalisis((prev) => ({
        ...prev,
        filas: prev.filas.map((f) => (f.numeroFila === filaCorregida.numeroFila ? filaCorregida : f)),
      }));
      setEditando(null);
      setBorrador(null);
      setError(null);
    } catch (err) {
      setError(`No se pudo verificar el código corregido: ${err.message}`);
    }
  };

  const conteos = useMemo(() => {
    if (!analisis) return null;
    const nuevos = analisis.filas.filter((f) => !existentes.has(f.codigo_referencia)).length;
    return { nuevos, existentes: analisis.filas.length - nuevos };
  }, [analisis, existentes]);

  const handleImportar = async () => {
    if (!analisis || analisis.filas.length === 0) return;

    if (destino === "nueva" && !proveedorId) {
      setError("Elige un proveedor para la compra nueva.");
      return;
    }
    if (destino === "existente" && !compraExistenteId) {
      setError("Elige una compra pendiente.");
      return;
    }

    setImportando(true);
    setError(null);
    setProgreso({ etapa: "guardando", actual: 0, total: 0 });

    try {
      let opcionesCompra;
      if (destino === "nueva") {
        // Cabecera vacia primero, igual que en ProductosImportar: las
        // lineas las agrega importProductos() de abajo.
        const cabecera = await createCompra({ proveedor_id: proveedorId, moneda, items: [] });
        opcionesCompra = { compra_id: cabecera.id, moneda };
        setCompraResultanteId(cabecera.id);
      } else {
        const compraElegida = comprasPendientes.find((c) => c.id === compraExistenteId);
        opcionesCompra = { compra_id: compraExistenteId, moneda: compraElegida?.moneda ?? "PEN" };
        setCompraResultanteId(compraExistenteId);
      }

      // Traduccion al formato de fila que espera importProductos(). En un
      // producto YA existente se vacian nombre/marca a proposito: el
      // archivo del proveedor solo manda a actualizar los PRECIOS del
      // catalogo, no a renombrar el producto (limpiarCamposVacios descarta
      // los campos vacios del update).
      const filas = analisis.filas.map((fila) => {
        const esExistente = existentes.has(fila.codigo_referencia);
        return {
          numeroFila: fila.numeroFila,
          codigo_referencia: fila.codigo_referencia,
          codigo_barras: null,
          nombre: esExistente ? "" : fila.nombre,
          descripcion: null,
          categoria: esExistente ? null : fila.marca,
          color: null,
          modelo: null,
          precio_venta: fila.precio_venta,
          precio_mayorista: fila.precio_mayorista,
          precio_compra: fila.costo,
          stock_fisico: fila.cantidad,
          ubicacion: null,
          foto_archivo: null,
        };
      });

      const resultado = await importProductos(
        filas,
        new Map(),
        (etapa, actual, total) => setProgreso({ etapa, actual, total }),
        opcionesCompra
      );
      setResumen(resultado);
    } catch (err) {
      setError(`No se pudo completar la importación: ${err.message}`);
    } finally {
      setImportando(false);
      setProgreso(null);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-bold">Importar compra desde Excel del proveedor</h2>
      <p className="mt-2 text-sm text-slate-500 max-w-2xl">
        Sube el archivo de pedido tal cual lo armas (columnas CÓDIGO, UN, CANT., DESCRIPCIÓN, MARCA, X
        MAYOR, PUBLICO). Los códigos que ya existen en el catálogo solo actualizan sus precios; los que
        no existen se crean con stock 0. El stock sube recién al recibir la compra.
      </p>

      <Card className="mt-6 max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">1. ¿A qué compra van las líneas?</p>
          <select
            value={destino}
            onChange={(event) => setDestino(event.target.value)}
            className={`${INPUT_CLASS} max-w-xs`}
          >
            <option value="nueva">Compra nueva</option>
            <option value="existente">Compra pendiente existente</option>
          </select>

          {destino === "nueva" && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor</label>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Moneda</label>
                <select value={moneda} onChange={(event) => setMoneda(event.target.value)} className={INPUT_CLASS}>
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
            </div>
          )}

          {destino === "existente" && (
            <div className="mt-3 max-w-md">
              <label className="block text-xs font-medium text-slate-600 mb-1">Compra pendiente</label>
              <select
                value={compraExistenteId}
                onChange={(event) => setCompraExistenteId(event.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Selecciona una compra...</option>
                {comprasPendientes.map((compra) => (
                  <option key={compra.id} value={compra.id}>
                    {compra.proveedor?.nombre ?? "—"} — {new Date(compra.created_at).toLocaleDateString("es-PE")} (
                    {compra.moneda})
                  </option>
                ))}
              </select>
              {comprasPendientes.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">No hay compras pendientes todavía.</p>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">2. Archivo del proveedor</p>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                setExcelFile(event.target.files?.[0] ?? null);
                setAnalisis(null);
                setResumen(null);
                setError(null);
              }}
              className="text-sm"
            />
            <Button type="button" onClick={handleAnalizar} disabled={!excelFile || analizando}>
              {analizando ? "Analizando..." : "Analizar archivo"}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        {analisis && !resumen && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 p-4 text-sm space-y-1">
              <p className="text-slate-700">
                <span className="font-medium">{analisis.filas.length}</span> línea(s) leídas:{" "}
                <span className="font-medium">{conteos.existentes}</span> de producto existente (solo
                actualizan precios) y{" "}
                <span className="font-medium">{conteos.nuevos}</span> nueva(s) (se crean en el catálogo con
                stock 0).
              </p>
              {analisis.notasIgnoradas > 0 && (
                <p className="text-slate-500">
                  {analisis.notasIgnoradas} fila(s) de notas al pie ignoradas.
                </p>
              )}
              {!analisis.tieneColumnaCosto && (
                <p className="text-warning-700">
                  El archivo no trae columna de COSTO: las líneas nacen con costo 0. Podrás cargar el
                  costo real en la compra pendiente cuando llegue la factura (un costo en 0 no pisa el
                  precio de compra del producto al recibir).
                </p>
              )}
              {analisis.errores.length > 0 && (
                <div className="text-danger-600">
                  <p className="font-medium">{analisis.errores.length} fila(s) con error (se omiten):</p>
                  <ul className="list-disc list-inside">
                    {analisis.errores.map((e) => (
                      <li key={e.fila}>
                        Fila {e.fila}: {e.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 font-medium">Marca</th>
                    <th className="px-3 py-2 font-medium">UN</th>
                    <th className="px-3 py-2 font-medium text-right">Cant.</th>
                    <th className="px-3 py-2 font-medium text-right">Costo</th>
                    <th className="px-3 py-2 font-medium text-right">Mayorista</th>
                    <th className="px-3 py-2 font-medium text-right">Público</th>
                    <th className="px-3 py-2 font-medium">Catálogo</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analisis.filas.map((fila) => {
                    const esNuevo = !existentes.has(fila.codigo_referencia);

                    if (editando === fila.numeroFila) {
                      const CELDA_INPUT =
                        "rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";
                      return (
                        <tr key={fila.numeroFila} className="bg-primary-50/40">
                          <td className="px-3 py-2">
                            <input
                              value={borrador.codigo_referencia}
                              onChange={cambiarBorrador("codigo_referencia")}
                              className={`${CELDA_INPUT} w-28`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={borrador.nombre}
                              onChange={cambiarBorrador("nombre")}
                              className={`${CELDA_INPUT} w-full min-w-[16rem]`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={borrador.marca ?? ""}
                              onChange={cambiarBorrador("marca")}
                              className={`${CELDA_INPUT} w-20`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={borrador.unidad ?? ""}
                              onChange={cambiarBorrador("unidad")}
                              className={`${CELDA_INPUT} w-14`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              value={borrador.cantidad}
                              onChange={cambiarBorrador("cantidad")}
                              className={`${CELDA_INPUT} w-16 text-right`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={borrador.costo}
                              onChange={cambiarBorrador("costo")}
                              className={`${CELDA_INPUT} w-20 text-right`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={borrador.precio_mayorista}
                              onChange={cambiarBorrador("precio_mayorista")}
                              className={`${CELDA_INPUT} w-20 text-right`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={borrador.precio_venta}
                              onChange={cambiarBorrador("precio_venta")}
                              className={`${CELDA_INPUT} w-20 text-right`}
                            />
                          </td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={guardarEdicion}
                              className="text-xs font-medium text-primary-600 hover:underline mr-2"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={cancelarEdicion}
                              className="text-xs text-slate-500 hover:underline"
                            >
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={fila.numeroFila}>
                        <td className="px-3 py-2 whitespace-nowrap">{fila.codigo_referencia}</td>
                        <td className="px-3 py-2">{fila.nombre}</td>
                        <td className="px-3 py-2">{fila.marca ?? "—"}</td>
                        <td className="px-3 py-2">{fila.unidad ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{fila.cantidad}</td>
                        <td className="px-3 py-2 text-right">{fila.costo > 0 ? fila.costo.toFixed(2) : "—"}</td>
                        <td className="px-3 py-2 text-right">{fila.precio_mayorista.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{fila.precio_venta.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          {esNuevo ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
                              Nuevo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                              Existente
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={editando !== null || importando}
                            onClick={() => empezarEdicion(fila)}
                            className="text-xs text-primary-600 hover:underline disabled:text-slate-300 disabled:no-underline"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Button
              type="button"
              variant="success"
              onClick={handleImportar}
              disabled={importando || editando !== null || analisis.filas.length === 0}
            >
              {importando ? "Importando..." : `Confirmar e importar ${analisis.filas.length} línea(s)`}
            </Button>
            {editando !== null && (
              <p className="text-xs text-slate-500">
                Termina de editar la fila (OK o Cancelar) para poder importar.
              </p>
            )}

            {progreso && (
              <p className="text-sm text-slate-500">
                {progreso.etapa === "guardando" && `Guardando productos... ${progreso.actual}/${progreso.total}`}
                {progreso.etapa === "compra" && `Registrando líneas de compra... ${progreso.actual}/${progreso.total}`}
              </p>
            )}
          </div>
        )}

        {resumen && (
          <div className="rounded-lg border border-success-100 bg-success-50 p-4 space-y-2 text-sm">
            <p className="font-medium text-success-700">Importación completada.</p>
            <ul className="text-slate-700 space-y-1">
              <li>{resumen.creados} producto(s) nuevos creados en el catálogo</li>
              <li>{resumen.actualizados} producto(s) existentes con precios actualizados</li>
              <li>{resumen.itemsCompra} línea(s) registradas en la compra</li>
              {resumen.errores.length > 0 && (
                <li className="text-danger-600">{resumen.errores.length} error(es) durante la importación</li>
              )}
            </ul>
            <div className="flex gap-3 mt-2">
              <Button type="button" onClick={() => navigate(`/compras/${compraResultanteId}`)}>
                Ver la compra
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate("/compras")}>
                Volver a Compras
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
