import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { anularVenta, getVenta } from "../../services/ventasService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { formatearPrecio } from "../../utils/currency";
import { METODO_PAGO_LABEL } from "../../utils/pagoMetodo";
import { getConfiguracionEmpresa } from "../../services/configuracionService";
import { encabezadoEmpresaHTML, imprimirDocumento } from "../../utils/documentoEmpresa";
import { compartirPorWhatsApp } from "../../utils/whatsapp";

const PUEDE_ANULAR = [ROLES.ADMIN, ROLES.GERENCIA];

function calcularTotal(items) {
  return items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
}

// Texto de la nota de venta para compartir por WhatsApp.
function textoVentaWhatsApp(venta, config) {
  const total = calcularTotal(venta.items);
  const lineas = [];
  if (config?.razon_social) lineas.push(`*${config.razon_social}*`);
  lineas.push(
    `Nota de venta N° ${venta.id.slice(0, 8).toUpperCase()}`,
    `Fecha: ${new Date(venta.created_at).toLocaleDateString("es-PE")}`,
    `Cliente: ${venta.cliente?.nombre ?? "Público general"}`,
    ""
  );
  for (const it of venta.items) {
    lineas.push(
      `• ${it.cantidad} x ${it.producto?.nombre ?? "-"} — ${formatearPrecio(it.cantidad * it.precio_unitario, venta.moneda)}`
    );
  }
  lineas.push("", `*Total: ${formatearPrecio(total, venta.moneda)}*`, "", "¡Gracias por su compra!");
  return lineas.join("\n");
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Nota de venta INTERNA (sin valor tributario): se abre en una ventana nueva y
// se manda a imprimir, con la marca de la empresa (config) en el encabezado. La
// boleta/factura tributaria es un comprobante aparte (MiFact hoy; SUNAT al final).
function imprimirNota(venta, config) {
  const total = calcularTotal(venta.items);
  const numero = `N° ${venta.id.slice(0, 8).toUpperCase()}`;
  const encabezado = encabezadoEmpresaHTML(config, { tipo: "NOTA DE VENTA INTERNA", numero });
  const filas = venta.items
    .map(
      (it) => `<tr>
        <td>${esc(it.producto?.nombre ?? "—")}</td>
        <td style="text-align:right">${it.cantidad}</td>
        <td style="text-align:right">${formatearPrecio(it.precio_unitario, venta.moneda)}</td>
        <td style="text-align:right">${formatearPrecio(it.cantidad * it.precio_unitario, venta.moneda)}</td>
      </tr>`
    )
    .join("");
  const pagos = venta.pagos
    .map((p) => `<div>${esc(METODO_PAGO_LABEL[p.metodo] ?? p.metodo)}: ${formatearPrecio(p.monto, venta.moneda)}</div>`)
    .join("");

  const cuerpo = `${encabezado}
    <div class="muted">${new Date(venta.created_at).toLocaleString("es-PE")}</div>
    <div class="muted">Cliente: ${esc(venta.cliente?.nombre ?? "Público general")}</div>
    <div class="muted">Vendedor: ${esc(venta.vendedor?.nombre ?? "—")}</div>
    <table>
      <thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div style="text-align:right;font-weight:700;font-size:15px;margin-top:8px">Total: ${formatearPrecio(total, venta.moneda)}</div>
    <div style="margin-top:12px">${pagos}</div>
    <div style="margin-top:20px;font-size:10px;color:#94a3b8;border-top:1px dashed #cbd5e1;padding-top:6px">Documento interno sin valor tributario. No es boleta ni factura.</div>`;

  imprimirDocumento("Nota de venta", cuerpo);
}

export default function VentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeAnular = PUEDE_ANULAR.includes(rol);

  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [anulando, setAnulando] = useState(false);
  const [mostrarAnular, setMostrarAnular] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [config, setConfig] = useState(null);

  useEffect(() => {
    getConfiguracionEmpresa().then(setConfig).catch(() => {});
  }, []);

  const cargar = () => {
    setLoading(true);
    getVenta(id)
      .then(setVenta)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, [id]);

  const handleAnular = async () => {
    if (!motivo.trim()) {
      setError("Indicá el motivo de la anulación.");
      return;
    }
    setAnulando(true);
    setError(null);
    try {
      await anularVenta(id, motivo.trim());
      setMostrarAnular(false);
      setMotivo("");
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnulando(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando venta...</p>;
  }
  if (error && !venta) {
    return <p className="text-sm text-danger-600">{error}</p>;
  }

  const total = calcularTotal(venta.items);

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-3xl font-bold">Venta</h2>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            venta.estado === "anulada"
              ? "bg-danger-100 text-danger-700"
              : "bg-success-100 text-success-700"
          }`}
        >
          {venta.estado === "anulada" ? "Anulada" : "Completada"}
        </span>
      </div>

      <Card className="mt-6 max-w-2xl">
        <dl className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <dt className="text-slate-500">Fecha</dt>
            <dd className="font-medium text-slate-800">
              {new Date(venta.created_at).toLocaleString("es-PE")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Vendedor</dt>
            <dd className="font-medium text-slate-800">{venta.vendedor?.nombre ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Cliente</dt>
            <dd className="font-medium text-slate-800">
              {venta.cliente?.nombre ?? "Público general"}
              {venta.cliente?.ruc_dni ? ` · ${venta.cliente.ruc_dni}` : ""}
            </dd>
          </div>
          {venta.estado === "anulada" && (
            <div>
              <dt className="text-slate-500">Anulada</dt>
              <dd className="font-medium text-slate-800">
                {venta.anulador?.nombre ?? "—"} — {venta.motivo_anulacion}
              </dd>
            </div>
          )}
        </dl>

        {/* Móvil: cada ítem como bloque (nombre a todo el ancho + cantidad×precio y subtotal). */}
        <div className="mb-4 divide-y divide-slate-100 lg:hidden">
          {venta.items.map((it) => (
            <div key={it.id} className="py-2">
              <p className="text-sm font-medium text-slate-800">{it.producto?.nombre ?? "—"}</p>
              {it.producto?.codigo_referencia && (
                <p className="text-xs text-slate-400">{it.producto.codigo_referencia}</p>
              )}
              <div className="mt-1 flex items-end gap-3 text-sm">
                <span className="text-slate-600">
                  {it.cantidad} × {formatearPrecio(it.precio_unitario, venta.moneda)}
                </span>
                <span className="ml-auto font-medium text-slate-800">
                  {formatearPrecio(it.cantidad * it.precio_unitario, venta.moneda)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: tabla. */}
        <table className="mb-4 hidden w-full text-sm lg:table">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 font-medium text-right">Cantidad</th>
              <th className="py-2 font-medium text-right">Precio</th>
              <th className="py-2 font-medium text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {venta.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2">
                  {it.producto?.nombre ?? "—"}
                  {it.producto?.codigo_referencia && (
                    <span className="block text-xs text-slate-400">
                      {it.producto.codigo_referencia}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">{it.cantidad}</td>
                <td className="py-2 text-right">{formatearPrecio(it.precio_unitario, venta.moneda)}</td>
                <td className="py-2 text-right">
                  {formatearPrecio(it.cantidad * it.precio_unitario, venta.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-right font-semibold text-slate-800 mb-4">
          Total: {formatearPrecio(total, venta.moneda)}
        </p>

        <div className="border-t border-slate-100 pt-3 mb-6">
          <p className="text-sm font-medium text-slate-700 mb-1">Pagos</p>
          {venta.pagos.map((p) => (
            <div key={p.id} className="flex justify-between text-sm text-slate-600">
              <span>{METODO_PAGO_LABEL[p.metodo] ?? p.metodo}</span>
              <span>{formatearPrecio(p.monto, venta.moneda)}</span>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-danger-600 mb-4">{error}</p>}

        {mostrarAnular && (
          <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 p-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo de la anulación
            </label>
            <input
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Error de cobro, devolución del cliente..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Se devolverá el stock de los productos al inventario.
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="danger" size="sm" disabled={anulando} onClick={handleAnular}>
                {anulando ? "Anulando..." : "Confirmar anulación"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMostrarAnular(false);
                  setMotivo("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="secondary" onClick={() => imprimirNota(venta, config)}>
            Imprimir nota
          </Button>
          <Button
            variant="success"
            onClick={() => compartirPorWhatsApp(venta.cliente?.telefono, textoVentaWhatsApp(venta, config))}
          >
            WhatsApp
          </Button>
          {puedeAnular && venta.estado === "completada" && !mostrarAnular && (
            <Button variant="danger" onClick={() => setMostrarAnular(true)}>
              Anular venta
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/ventas")}>
            Volver a Ventas
          </Button>
        </div>
      </Card>
    </>
  );
}
