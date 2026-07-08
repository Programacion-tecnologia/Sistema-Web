import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCliente, getCliente, getHistorialCliente, updateCliente } from "../../services/clientesService";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import { ESTADO_LABEL, ESTADO_BADGE_CLASS } from "../../utils/cotizacionEstado";
import { formatearPrecio } from "../../utils/currency";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const FORM_INICIAL = { nombre: "", ruc_dni: "", email: "", telefono: "", direccion: "" };

function calcularTotal(items) {
  return items.reduce((total, item) => total + item.cantidad * item.precio_unitario, 0);
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const modoEdicion = Boolean(id);

  const [form, setForm] = useState(FORM_INICIAL);
  const [clienteDesde, setClienteDesde] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(modoEdicion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    if (!modoEdicion) return;

    let activo = true;
    Promise.all([getCliente(id), getHistorialCliente(id)])
      .then(([cliente, historialData]) => {
        if (!activo) return;
        setForm({
          nombre: cliente.nombre ?? "",
          ruc_dni: cliente.ruc_dni ?? "",
          email: cliente.email ?? "",
          telefono: cliente.telefono ?? "",
          direccion: cliente.direccion ?? "",
        });
        setClienteDesde(cliente.created_at);
        setHistorial(historialData);
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));

    return () => {
      activo = false;
    };
  }, [id, modoEdicion]);

  const resumenMontos = useMemo(() => {
    const totales = { PEN: 0, USD: 0 };
    for (const cotizacion of historial) {
      totales[cotizacion.moneda] += calcularTotal(cotizacion.items);
    }
    return totales;
  }, [historial]);

  const handleChange = (campo) => (event) => {
    setForm((prev) => ({ ...prev, [campo]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);
    setMensaje(null);

    const payload = {
      nombre: form.nombre.trim(),
      ruc_dni: form.ruc_dni.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      direccion: form.direccion.trim() || null,
    };

    try {
      if (modoEdicion) {
        await updateCliente(id, payload);
        setMensaje("Cliente actualizado.");
      } else {
        const nuevo = await createCliente(payload);
        navigate(`/clientes/${nuevo.id}`, { replace: true });
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando cliente...</p>;
  }

  return (
    <>
      <h2 className="text-3xl font-bold">{modoEdicion ? form.nombre || "Cliente" : "Nuevo cliente"}</h2>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 h-fit">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
              <input value={form.nombre} onChange={handleChange("nombre")} className={INPUT_CLASS} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">RUC/DNI</label>
              <input value={form.ruc_dni} onChange={handleChange("ruc_dni")} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={handleChange("email")} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <input value={form.telefono} onChange={handleChange("telefono")} className={INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
              <input value={form.direccion} onChange={handleChange("direccion")} className={INPUT_CLASS} />
            </div>

            {error && <p className="text-sm text-danger-600">{error}</p>}
            {mensaje && <p className="text-sm text-success-700">{mensaje}</p>}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => navigate("/clientes")}>
                Volver
              </Button>
            </div>
          </form>
        </Card>

        {modoEdicion && (
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Cliente desde</dt>
                  <dd className="font-medium text-slate-800">
                    {clienteDesde ? new Date(clienteDesde).toLocaleDateString("es-PE") : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cotizaciones</dt>
                  <dd className="font-medium text-slate-800">{historial.length}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Total cotizado</dt>
                  <dd className="font-medium text-slate-800">
                    {formatearPrecio(resumenMontos.PEN, "PEN")}
                    {resumenMontos.USD > 0 && (
                      <span className="block">{formatearPrecio(resumenMontos.USD, "USD")}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Historial de cotizaciones</h3>
              {historial.length === 0 ? (
                <p className="text-sm text-slate-500">Este cliente todavía no tiene cotizaciones.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-slate-500 text-left">
                    <tr>
                      <th className="py-2 font-medium">Fecha</th>
                      <th className="py-2 font-medium">Estado</th>
                      <th className="py-2 font-medium text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historial.map((cotizacion) => (
                      <tr
                        key={cotizacion.id}
                        onClick={() => navigate(`/cotizaciones/${cotizacion.id}`)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="py-2">{new Date(cotizacion.created_at).toLocaleDateString("es-PE")}</td>
                        <td className="py-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE_CLASS[cotizacion.estado]}`}
                          >
                            {ESTADO_LABEL[cotizacion.estado]}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {formatearPrecio(calcularTotal(cotizacion.items), cotizacion.moneda)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
