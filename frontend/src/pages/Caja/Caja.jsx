import { useEffect, useState } from "react";
import {
  abrirCaja,
  cerrarCaja,
  getCajaAbierta,
  getResumenSesion,
  listSesiones,
} from "../../services/cajaService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { formatearPrecio } from "../../utils/currency";
import { METODOS_PAGO, METODO_PAGO_LABEL } from "../../utils/pagoMetodo";

const PUEDE_OPERAR_CAJA = [ROLES.ADMIN, ROLES.GERENCIA, ROLES.VENTAS];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

function formatearFecha(iso) {
  return iso ? new Date(iso).toLocaleString("es-PE") : "—";
}

export default function Caja() {
  const { rol } = useAuth();
  const puedeOperar = PUEDE_OPERAR_CAJA.includes(rol);

  const [sesion, setSesion] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [montoInicial, setMontoInicial] = useState("");
  const [montoContado, setMontoContado] = useState("");
  const [notas, setNotas] = useState("");
  const [procesando, setProcesando] = useState(false);

  const cargar = async () => {
    setError(null);
    try {
      const abierta = await getCajaAbierta();
      setSesion(abierta);
      setResumen(abierta ? await getResumenSesion(abierta.id) : null);
      setHistorial(await listSesiones());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleAbrir = async (event) => {
    event.preventDefault();
    setProcesando(true);
    setError(null);
    try {
      await abrirCaja(Number(montoInicial) || 0);
      setMontoInicial("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleCerrar = async (event) => {
    event.preventDefault();
    setProcesando(true);
    setError(null);
    try {
      await cerrarCaja(sesion.id, Number(montoContado) || 0, notas.trim() || null);
      setMontoContado("");
      setNotas("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando caja...</p>;
  }

  // Esperado en efectivo = monto inicial + efectivo vendido en la sesión. Es
  // la misma cuenta que hace cerrar_caja en el servidor; acá se previsualiza.
  const efectivoVendido = resumen?.porMetodo.efectivo ?? 0;
  const esperadoEfectivo = sesion ? Number(sesion.monto_inicial) + efectivoVendido : 0;
  const diferenciaPreview =
    montoContado !== "" ? (Number(montoContado) || 0) - esperadoEfectivo : null;

  return (
    <>
      <h2 className="text-3xl font-bold">Caja</h2>

      {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}

      {!sesion ? (
        <Card className="mt-6 max-w-md">
          <h3 className="text-lg font-semibold text-slate-800">No hay caja abierta</h3>
          <p className="mt-1 text-sm text-slate-500">
            Abre la caja con el monto inicial en efectivo para empezar a registrar ventas.
          </p>
          {puedeOperar ? (
            <form onSubmit={handleAbrir} className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Monto inicial en efectivo
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoInicial}
                  onChange={(event) => setMontoInicial(event.target.value)}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </div>
              <Button type="submit" disabled={procesando}>
                {procesando ? "Abriendo..." : "Abrir caja"}
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-slate-400">Tu rol no puede abrir la caja.</p>
          )}
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Caja abierta</h3>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success-100 text-success-700">
                Abierta
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Abierta por</dt>
                <dd className="font-medium text-slate-800">{sesion.abridor?.nombre ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Desde</dt>
                <dd className="font-medium text-slate-800">{formatearFecha(sesion.abierta_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Monto inicial</dt>
                <dd className="font-medium text-slate-800">
                  {formatearPrecio(sesion.monto_inicial, "PEN")}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Ventas registradas</dt>
                <dd className="font-medium text-slate-800">{resumen?.totalVentas ?? 0}</dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Cobrado en esta sesión</p>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {METODOS_PAGO.map((m) => (
                    <tr key={m.valor}>
                      <td className="py-1.5 text-slate-600">{m.label}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800">
                        {formatearPrecio(resumen?.porMetodo[m.valor] ?? 0, "PEN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {puedeOperar && (
            <Card>
              <h3 className="text-lg font-semibold text-slate-800">Cerrar caja (arqueo)</h3>
              <p className="mt-1 text-sm text-slate-500">
                Contá el efectivo físico en el cajón y anotá el total. El sistema lo compara con lo
                esperado.
              </p>

              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Efectivo esperado</span>
                  <span className="font-medium text-slate-800">
                    {formatearPrecio(esperadoEfectivo, "PEN")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Monto inicial {formatearPrecio(sesion.monto_inicial, "PEN")} + efectivo vendido{" "}
                  {formatearPrecio(efectivoVendido, "PEN")}
                </p>
              </div>

              <form onSubmit={handleCerrar} className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Efectivo contado
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={montoContado}
                    onChange={(event) => setMontoContado(event.target.value)}
                    placeholder="0.00"
                    className={INPUT_CLASS}
                  />
                </div>

                {diferenciaPreview !== null && (
                  <p
                    className={`text-sm font-medium ${
                      diferenciaPreview === 0
                        ? "text-success-700"
                        : diferenciaPreview > 0
                          ? "text-warning-700"
                          : "text-danger-600"
                    }`}
                  >
                    {diferenciaPreview === 0
                      ? "Cuadra exacto."
                      : `${diferenciaPreview > 0 ? "Sobrante" : "Faltante"} de ${formatearPrecio(
                          Math.abs(diferenciaPreview),
                          "PEN"
                        )}`}
                  </p>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Notas (opcional)
                  </label>
                  <input
                    value={notas}
                    onChange={(event) => setNotas(event.target.value)}
                    placeholder="Observaciones del cierre..."
                    className={INPUT_CLASS}
                  />
                </div>

                <Button type="submit" variant="danger" disabled={procesando}>
                  {procesando ? "Cerrando..." : "Cerrar caja"}
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}

      <Card className="mt-6 p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Historial de cajas</h3>
        </div>
        {historial.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Todavía no hay sesiones de caja.</p>
        ) : (
          <>
            {/* Móvil: tarjetas apiladas. */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {historial.map((s) => {
                const colorDif =
                  s.diferencia == null
                    ? "text-slate-400"
                    : Number(s.diferencia) === 0
                      ? "text-success-700"
                      : Number(s.diferencia) > 0
                        ? "text-warning-700"
                        : "text-danger-600";
                return (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">{formatearFecha(s.abierta_at)}</p>
                        <p className="text-xs text-slate-400">Abrió: {s.abridor?.nombre ?? "—"}</p>
                      </div>
                      {s.estado === "abierta" ? (
                        <span className="shrink-0 text-xs font-medium text-success-700">En curso</span>
                      ) : (
                        <p className={`shrink-0 text-sm font-semibold ${colorDif}`}>
                          {s.diferencia != null ? formatearPrecio(s.diferencia, "PEN") : "—"}
                        </p>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>Inicial: {formatearPrecio(s.monto_inicial, "PEN")}</span>
                      {s.monto_esperado != null && (
                        <span>Esperado: {formatearPrecio(s.monto_esperado, "PEN")}</span>
                      )}
                      {s.monto_final_contado != null && (
                        <span>Contado: {formatearPrecio(s.monto_final_contado, "PEN")}</span>
                      )}
                    </div>
                    {s.estado !== "abierta" && (
                      <p className="text-xs text-slate-400">Cerró: {s.cerrador?.nombre ?? "—"}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabla completa. */}
            <table className="hidden w-full text-sm lg:table">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Apertura</th>
                <th className="px-4 py-3 font-medium">Cierre</th>
                <th className="px-4 py-3 font-medium text-right">Inicial</th>
                <th className="px-4 py-3 font-medium text-right">Esperado</th>
                <th className="px-4 py-3 font-medium text-right">Contado</th>
                <th className="px-4 py-3 font-medium text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historial.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-slate-600">
                    {formatearFecha(s.abierta_at)}
                    <span className="block text-xs text-slate-400">{s.abridor?.nombre ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.estado === "abierta" ? (
                      <span className="text-success-700 font-medium">En curso</span>
                    ) : (
                      <>
                        {formatearFecha(s.cerrada_at)}
                        <span className="block text-xs text-slate-400">
                          {s.cerrador?.nombre ?? "—"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatearPrecio(s.monto_inicial, "PEN")}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {s.monto_esperado != null ? formatearPrecio(s.monto_esperado, "PEN") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {s.monto_final_contado != null
                      ? formatearPrecio(s.monto_final_contado, "PEN")
                      : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      s.diferencia == null
                        ? "text-slate-400"
                        : Number(s.diferencia) === 0
                          ? "text-success-700"
                          : Number(s.diferencia) > 0
                            ? "text-warning-700"
                            : "text-danger-600"
                    }`}
                  >
                    {s.diferencia != null ? formatearPrecio(s.diferencia, "PEN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Card>
    </>
  );
}
