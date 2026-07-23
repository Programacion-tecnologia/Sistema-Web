import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCotizacionParaVerificar, verificarDespachoCotizacion } from "../../services/scannerService";
import { asignarCodigoBarras, generarCodigoBarras } from "../../services/codigosBarrasService";
import { generarPdfVerificacion } from "../../utils/pdfVerificacion";
import { getEstadoLinea, ESTADO_LINEA_LABEL, ESTADO_LINEA_ROW_CLASS, ESTADO_LINEA_BADGE_CLASS } from "../../utils/scannerEstado";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import EscanerInput from "../../components/Scanner/EscanerInput";
import EscanerCamara from "../../components/Scanner/EscanerCamara";

// Normaliza un código para comparar el escaneo contra los del producto: ignora
// espacios de borde y mayúsculas, así el código de referencia matchea aunque
// venga con diferencias mínimas.
const normalizarCodigo = (s) => String(s ?? "").trim().toUpperCase();

export default function ScannerVerificacion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cotizacion, setCotizacion] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  // Una vez que el RPC confirma el despacho (stock movido, estado cambiado,
  // auditoría escrita), nada de lo que pase despues -como un fallo al generar
  // el PDF- debe poder confundirse con que el despacho no se completo. Por
  // eso el resultado del RPC vive separado del estado de error del formulario.
  const [confirmado, setConfirmado] = useState(false);
  const [detalleParaPdf, setDetalleParaPdf] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const avisoTimeoutRef = useRef(null);
  // Asignar al vuelo el código escaneado a un producto del pedido que no lo tiene.
  const [codigoPendiente, setCodigoPendiente] = useState(null);
  const [productoAsignar, setProductoAsignar] = useState("");
  const [asignando, setAsignando] = useState(false);
  const [asignarError, setAsignarError] = useState(null);
  const [generandoId, setGenerandoId] = useState(null);

  useEffect(() => {
    let activo = true;

    getCotizacionParaVerificar(id)
      .then((data) => {
        if (!activo) return;
        setCotizacion(data);
        setLineas(
          data.items.map((item) => ({
            producto_id: item.producto?.id,
            nombre: item.producto?.nombre ?? "—",
            codigo_referencia: item.producto?.codigo_referencia,
            codigo_barras: item.producto?.codigo_barras,
            cantidad_pedida: item.cantidad,
            cantidad_escaneada: 0,
          }))
        );
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, [id]);

  useEffect(() => () => clearTimeout(avisoTimeoutRef.current), []);

  const mostrarAviso = (mensaje) => {
    clearTimeout(avisoTimeoutRef.current);
    setAviso(mensaje);
    avisoTimeoutRef.current = setTimeout(() => setAviso(null), 2500);
  };

  const registrarEscaneo = (codigo) => {
    const norm = normalizarCodigo(codigo);
    const idx = lineas.findIndex(
      (linea) =>
        normalizarCodigo(linea.codigo_referencia) === norm ||
        normalizarCodigo(linea.codigo_barras) === norm
    );
    if (idx === -1) {
      // No matchea: en vez de solo avisar, se ofrece asignar el código a un
      // producto del pedido (típicamente uno que aún no tiene código de barras).
      setCodigoPendiente(codigo.trim());
      setAsignarError(null);
      const sinCodigo = lineas.find((l) => !l.codigo_barras);
      setProductoAsignar(sinCodigo?.producto_id ?? lineas[0]?.producto_id ?? "");
      return;
    }
    setLineas((prev) =>
      prev.map((linea, i) =>
        i === idx ? { ...linea, cantidad_escaneada: linea.cantidad_escaneada + 1 } : linea
      )
    );
  };

  // Asigna el código pendiente al producto elegido y cuenta el escaneo.
  const asignarAProducto = async () => {
    if (!codigoPendiente || !productoAsignar) return;
    setAsignando(true);
    setAsignarError(null);
    try {
      const guardado = await asignarCodigoBarras(productoAsignar, codigoPendiente);
      setLineas((prev) =>
        prev.map((l) =>
          l.producto_id === productoAsignar
            ? { ...l, codigo_barras: guardado, cantidad_escaneada: l.cantidad_escaneada + 1 }
            : l
        )
      );
      mostrarAviso("Código asignado y registrado.");
      setCodigoPendiente(null);
    } catch (err) {
      setAsignarError(err.message);
    } finally {
      setAsignando(false);
    }
  };

  // Genera un EAN-13 para un producto del pedido que no tiene código.
  const generarParaLinea = async (productoId) => {
    setGenerandoId(productoId);
    setAsignarError(null);
    try {
      const codigo = await generarCodigoBarras(productoId);
      setLineas((prev) => prev.map((l) => (l.producto_id === productoId ? { ...l, codigo_barras: codigo } : l)));
    } catch (err) {
      mostrarAviso(err.message);
    } finally {
      setGenerandoId(null);
    }
  };

  const puedeFinalizar = lineas.length > 0 && lineas.every((linea) => linea.cantidad_escaneada > 0);

  const intentarGenerarPdf = (detalle) => {
    try {
      generarPdfVerificacion({
        cotizacion,
        detalle,
        verificadoPorNombre: user?.user_metadata?.nombre || user?.email,
      });
      setPdfError(null);
    } catch (err) {
      console.error("No se pudo generar el PDF de verificación:", err);
      setPdfError(err.message);
    }
  };

  const handleFinalizar = async () => {
    setFinalizando(true);
    setError(null);

    let detalleServidor;
    try {
      const payload = lineas.map((linea) => ({
        producto_id: linea.producto_id,
        cantidad_verificada: linea.cantidad_escaneada,
      }));
      detalleServidor = await verificarDespachoCotizacion(cotizacion.id, payload);
    } catch (err) {
      // El RPC no se completo: nada cambio en el servidor, es seguro dejar
      // reintentar "Finalizar despacho" tal cual estaba.
      setError(err.message);
      setFinalizando(false);
      return;
    }

    // A partir de aca el despacho ya quedo confirmado en el servidor. Se
    // marca "confirmado" antes de siquiera intentar el PDF, para que un
    // fallo en la generacion no pueda mostrarse como si el despacho no
    // hubiera ocurrido.
    setFinalizando(false);
    setConfirmado(true);

    const detalleConCodigo = detalleServidor.map((entrada) => {
      const linea = lineas.find((l) => l.producto_id === entrada.producto_id);
      return { ...entrada, codigo: linea?.codigo_referencia || linea?.codigo_barras || "—" };
    });
    setDetalleParaPdf(detalleConCodigo);
    intentarGenerarPdf(detalleConCodigo);
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando cotización...</p>;
  }

  if (error && !cotizacion) {
    return <p className="text-sm text-danger-600">{error}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Verificar despacho</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cliente: {cotizacion.cliente?.nombre ?? "—"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/scanner")}>
          Volver
        </Button>
      </div>

      <Card className="mt-6 max-w-2xl">
        {!confirmado && (
          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-2">
              Escaneá con el lector físico, escribí el código manualmente y presioná Enter, o usá
              la cámara del celular con el botón de al lado.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <EscanerInput onScan={registrarEscaneo} disabled={camaraActiva} />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCamaraActiva((prev) => !prev)}
              >
                {camaraActiva ? "Cerrar cámara" : "Usar cámara"}
              </Button>
            </div>
            {camaraActiva && (
              <div className="mt-3">
                <EscanerCamara onScan={registrarEscaneo} />
              </div>
            )}
            {aviso && <p className="mt-2 text-sm text-slate-600">{aviso}</p>}

            {codigoPendiente && (
              <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3">
                <p className="text-sm text-slate-700">
                  El código <span className="font-mono font-semibold">{codigoPendiente}</span> no está en
                  ningún producto del pedido. Asignalo al producto correcto (se guarda en el producto):
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={productoAsignar}
                    onChange={(e) => setProductoAsignar(e.target.value)}
                    className="min-w-[12rem] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                  >
                    {lineas.map((l) => (
                      <option key={l.producto_id} value={l.producto_id}>
                        {l.nombre}
                        {l.codigo_barras ? " (ya tiene código)" : ""}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" disabled={asignando} onClick={asignarAProducto}>
                    {asignando ? "Asignando..." : "Asignar y registrar"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setCodigoPendiente(null)}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
                {asignarError && <p className="mt-2 text-xs text-danger-600">{asignarError}</p>}
              </div>
            )}
          </div>
        )}

        {/* Móvil: cada línea como bloque (nombre a todo el ancho + escaneado/pedido y estado). */}
        <div className="mb-4 divide-y divide-slate-100 lg:hidden">
          {lineas.map((linea) => {
            const estado = getEstadoLinea(linea.cantidad_escaneada, linea.cantidad_pedida);
            return (
              <div key={linea.producto_id} className={`px-2 py-3 ${ESTADO_LINEA_ROW_CLASS[estado]}`}>
                <p className="font-medium text-slate-800">{linea.nombre}</p>
                {linea.codigo_referencia && (
                  <p className="text-xs text-slate-400">CÓDIGO REF: {linea.codigo_referencia}</p>
                )}
                {linea.codigo_barras ? (
                  <p className="text-xs text-slate-400">CÓDIGO BARRAS: {linea.codigo_barras}</p>
                ) : (
                  <button
                    type="button"
                    disabled={generandoId === linea.producto_id}
                    onClick={() => generarParaLinea(linea.producto_id)}
                    className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
                  >
                    {generandoId === linea.producto_id ? "Generando..." : "Generar código de barras"}
                  </button>
                )}
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="text-slate-600">
                    {linea.cantidad_escaneada} / {linea.cantidad_pedida}
                  </span>
                  <span
                    className={`ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_LINEA_BADGE_CLASS[estado]}`}
                  >
                    {ESTADO_LINEA_LABEL[estado]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: tabla. */}
        <table className="mb-4 hidden w-full text-sm lg:table">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 font-medium text-right">Escaneado / Pedido</th>
              <th className="py-2 font-medium text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lineas.map((linea) => {
              const estado = getEstadoLinea(linea.cantidad_escaneada, linea.cantidad_pedida);
              return (
                <tr key={linea.producto_id} className={ESTADO_LINEA_ROW_CLASS[estado]}>
                  <td className="py-2">
                    <p className="font-medium text-slate-800">{linea.nombre}</p>
                    {linea.codigo_referencia && (
                      <p className="text-xs text-slate-400">CÓDIGO REF: {linea.codigo_referencia}</p>
                    )}
                    {linea.codigo_barras ? (
                      <p className="text-xs text-slate-400">CÓDIGO BARRAS: {linea.codigo_barras}</p>
                    ) : (
                      <button
                        type="button"
                        disabled={generandoId === linea.producto_id}
                        onClick={() => generarParaLinea(linea.producto_id)}
                        className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
                      >
                        {generandoId === linea.producto_id ? "Generando..." : "Generar código de barras"}
                      </button>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {linea.cantidad_escaneada} / {linea.cantidad_pedida}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_LINEA_BADGE_CLASS[estado]}`}
                    >
                      {ESTADO_LINEA_LABEL[estado]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {confirmado ? (
          <div>
            <p className="text-sm font-medium text-success-700 mb-2">
              Despacho confirmado: la cotización ya pasó a "Lista para despacho" y el stock quedó
              actualizado.
            </p>
            {pdfError ? (
              <>
                <p className="text-sm text-danger-600 mb-3">
                  El despacho ya está confirmado, pero no se pudo generar el PDF automáticamente
                  ({pdfError}). Podés reintentar la descarga sin volver a escanear nada.
                </p>
                <Button
                  variant="secondary"
                  className="mr-3"
                  onClick={() => intentarGenerarPdf(detalleParaPdf)}
                >
                  Reintentar descarga del PDF
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-500 mb-3">El PDF de verificación se descargó.</p>
            )}
            <Button variant="secondary" onClick={() => navigate("/scanner")}>
              Volver a Scanner
            </Button>
          </div>
        ) : (
          <>
            {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

            <Button
              variant="success"
              disabled={!puedeFinalizar || finalizando}
              onClick={handleFinalizar}
            >
              {finalizando ? "Confirmando..." : "Finalizar despacho"}
            </Button>
          </>
        )}
      </Card>
    </>
  );
}
