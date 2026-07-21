import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { crearGuiaRemision } from "../../services/guiasService";
import { listVentas } from "../../services/ventasService";
import { listClientes } from "../../services/clientesService";
import { getConfiguracionEmpresa } from "../../services/configuracionService";
import { buscarProductosPaginado } from "../../services/productosService";
import { consultarDocumento, FUENTE_LABEL } from "../../services/documentosService";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const INPUT = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

const MOTIVOS = ["Venta", "Traslado entre locales", "Devolución", "Traslado por emisor itinerante", "Otro"];

export default function GuiaNueva() {
  const navigate = useNavigate();
  const { rol } = useAuth();

  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ventaId, setVentaId] = useState("");
  const [clienteId, setClienteId] = useState("");

  const [cab, setCab] = useState({
    destinatario_nombre: "",
    destinatario_doc: "",
    destinatario_direccion: "",
    motivo_traslado: "Venta",
    fecha_traslado: "",
    punto_partida: "",
    punto_llegada: "",
    modalidad_transporte: "",
    transportista_nombre: "",
    transportista_doc: "",
    conductor_nombre: "",
    conductor_licencia: "",
    placa: "",
    peso_bruto: "",
    num_bultos: "",
    observaciones: "",
  });
  const [items, setItems] = useState([]);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [consultaMsg, setConsultaMsg] = useState(null);
  const [error, setError] = useState(null);

  const set = (campo) => (event) => setCab((prev) => ({ ...prev, [campo]: event.target.value }));

  const handleConsultar = async () => {
    setConsultando(true);
    setError(null);
    setConsultaMsg(null);
    try {
      const r = await consultarDocumento(cab.destinatario_doc);
      setCab((prev) => ({
        ...prev,
        destinatario_nombre: r.nombre ?? prev.destinatario_nombre,
        destinatario_direccion: r.direccion ?? prev.destinatario_direccion,
      }));
      setConsultaMsg(FUENTE_LABEL[r.fuente] ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setConsultando(false);
    }
  };

  useEffect(() => {
    listVentas().then((data) => setVentas(data.filter((v) => v.estado === "completada"))).catch(() => {});
    listClientes().then(setClientes).catch(() => {});
    // Punto de partida por defecto = domicilio comercial de la empresa.
    getConfiguracionEmpresa()
      .then((c) => c?.direccion_comercial && setCab((prev) => ({ ...prev, punto_partida: c.direccion_comercial })))
      .catch(() => {});
  }, []);

  // Prefill del destinatario a partir de un cliente elegido.
  const aplicarCliente = (id) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      setCab((prev) => ({
        ...prev,
        destinatario_nombre: c.nombre ?? prev.destinatario_nombre,
        destinatario_doc: c.ruc_dni ?? prev.destinatario_doc,
      }));
    }
  };

  // Generar desde una venta: copia cliente e ítems.
  const aplicarVenta = (id) => {
    setVentaId(id);
    if (!id) return;
    const v = ventas.find((x) => x.id === id);
    if (!v) return;
    setClienteId(v.cliente?.id ?? "");
    setCab((prev) => ({
      ...prev,
      destinatario_nombre: v.cliente?.nombre ?? "Público general",
      destinatario_doc: v.cliente?.ruc_dni ?? "",
      motivo_traslado: "Venta",
    }));
    setItems(
      v.items.map((it) => ({
        producto_id: it.producto?.id ?? null,
        codigo: it.producto?.codigo_referencia ?? "",
        descripcion: it.producto?.nombre ?? "",
        cantidad: it.cantidad,
        unidad: "UNIDAD",
      }))
    );
  };

  // Búsqueda de productos para agregar ítems (modo en blanco).
  useEffect(() => {
    const t = busqueda.trim();
    if (!t) {
      setResultados([]);
      return;
    }
    let activo = true;
    const id = setTimeout(() => {
      buscarProductosPaginado({ rol, pagina: 0, termino: t })
        .then(({ data }) => activo && setResultados(data))
        .catch(() => {});
    }, 300);
    return () => {
      activo = false;
      clearTimeout(id);
    };
  }, [busqueda, rol]);

  const agregarProducto = (p) => {
    setItems((prev) => [
      ...prev,
      { producto_id: p.id, codigo: p.codigo_referencia ?? "", descripcion: p.nombre, cantidad: 1, unidad: "UNIDAD" },
    ]);
    setBusqueda("");
    setResultados([]);
  };
  const agregarManual = () =>
    setItems((prev) => [...prev, { producto_id: null, codigo: "", descripcion: "", cantidad: 1, unidad: "UNIDAD" }]);
  const actualizarItem = (i, campo, valor) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const puntoLlegada = cab.punto_llegada || cab.destinatario_direccion;

  const handleGuardar = async () => {
    if (!cab.destinatario_nombre.trim()) {
      setError("Indicá el destinatario.");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.descripcion.trim())) {
      setError("Agregá al menos un producto con descripción.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const { guia_id } = await crearGuiaRemision(
        {
          ...cab,
          punto_llegada: puntoLlegada,
          venta_id: ventaId || null,
          cliente_id: clienteId || null,
          peso_bruto: cab.peso_bruto === "" ? null : Number(cab.peso_bruto),
          num_bultos: cab.num_bultos === "" ? null : Math.trunc(Number(cab.num_bultos)),
          modalidad_transporte: cab.modalidad_transporte || null,
          fecha_traslado: cab.fecha_traslado || null,
        },
        items.map((it) => ({
          producto_id: it.producto_id,
          codigo: it.codigo || null,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad) || 1,
          unidad: it.unidad || null,
        }))
      );
      navigate(`/guias/${guia_id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-bold">Nueva guía de remisión</h2>

      <Card className="mt-6 max-w-3xl">
        <div className="mb-4">
          <label className={LABEL}>Generar desde una venta (opcional)</label>
          <select value={ventaId} onChange={(e) => aplicarVenta(e.target.value)} className={INPUT}>
            <option value="">— Crear en blanco —</option>
            {ventas.map((v) => (
              <option key={v.id} value={v.id}>
                {new Date(v.created_at).toLocaleDateString("es-PE")} — {v.cliente?.nombre ?? "Público general"}
              </option>
            ))}
          </select>
        </div>

        {/* Destinatario */}
        <h3 className="text-sm font-semibold text-slate-700 border-t border-slate-100 pt-4">Destinatario</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL}>Cliente (opcional, autocompleta)</label>
            <select value={clienteId} onChange={(e) => aplicarCliente(e.target.value)} className={INPUT}>
              <option value="">— Manual —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.ruc_dni ? ` — ${c.ruc_dni}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Nombre / Razón social</label>
            <input value={cab.destinatario_nombre} onChange={set("destinatario_nombre")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>RUC / DNI</label>
            <div className="flex gap-2">
              <input value={cab.destinatario_doc} onChange={set("destinatario_doc")} className={INPUT} />
              <Button type="button" variant="secondary" disabled={consultando} onClick={handleConsultar}>
                {consultando ? "..." : "Consultar"}
              </Button>
            </div>
            {consultaMsg && <p className="mt-1 text-xs text-success-700">{consultaMsg}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Dirección</label>
            <input value={cab.destinatario_direccion} onChange={set("destinatario_direccion")} className={INPUT} />
          </div>
        </div>

        {/* Traslado */}
        <h3 className="text-sm font-semibold text-slate-700 border-t border-slate-100 pt-4 mt-4">Traslado</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Motivo</label>
            <select value={cab.motivo_traslado} onChange={set("motivo_traslado")} className={INPUT}>
              {MOTIVOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Fecha de traslado</label>
            <input type="date" value={cab.fecha_traslado} onChange={set("fecha_traslado")} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Punto de partida</label>
            <input value={cab.punto_partida} onChange={set("punto_partida")} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Punto de llegada</label>
            <input
              value={cab.punto_llegada}
              onChange={set("punto_llegada")}
              placeholder={cab.destinatario_direccion || "Dirección de entrega"}
              className={INPUT}
            />
          </div>
        </div>

        {/* Transporte */}
        <h3 className="text-sm font-semibold text-slate-700 border-t border-slate-100 pt-4 mt-4">Transporte</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Modalidad</label>
            <select value={cab.modalidad_transporte} onChange={set("modalidad_transporte")} className={INPUT}>
              <option value="">—</option>
              <option value="privado">Privado (transporte propio)</option>
              <option value="publico">Público (empresa de transporte)</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Placa</label>
            <input value={cab.placa} onChange={set("placa")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Transportista</label>
            <input value={cab.transportista_nombre} onChange={set("transportista_nombre")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>RUC/DNI transportista</label>
            <input value={cab.transportista_doc} onChange={set("transportista_doc")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Conductor</label>
            <input value={cab.conductor_nombre} onChange={set("conductor_nombre")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Licencia del conductor</label>
            <input value={cab.conductor_licencia} onChange={set("conductor_licencia")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Peso bruto (kg)</label>
            <input type="number" min="0" step="0.01" value={cab.peso_bruto} onChange={set("peso_bruto")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>N° de bultos</label>
            <input type="number" min="0" value={cab.num_bultos} onChange={set("num_bultos")} className={INPUT} />
          </div>
        </div>

        {/* Ítems */}
        <h3 className="text-sm font-semibold text-slate-700 border-t border-slate-100 pt-4 mt-4">Productos a trasladar</h3>
        <div className="relative mt-2">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto para agregar..."
            className={INPUT}
          />
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{p.nombre}</span>
                  <span className="text-xs text-slate-400">{p.codigo_referencia}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <table className="w-full text-sm mt-3">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1 font-medium">Descripción</th>
                <th className="py-1 font-medium">Código</th>
                <th className="py-1 font-medium text-right">Cant.</th>
                <th className="py-1 font-medium">U.M.</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input
                      value={it.descripcion}
                      onChange={(e) => actualizarItem(i, "descripcion", e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={it.codigo}
                      onChange={(e) => actualizarItem(i, "codigo", e.target.value)}
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-1 text-right">
                    <input
                      type="number"
                      min="1"
                      value={it.cantidad}
                      onChange={(e) => actualizarItem(i, "cantidad", e.target.value)}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={it.unidad}
                      onChange={(e) => actualizarItem(i, "unidad", e.target.value)}
                      className="w-20 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button type="button" onClick={() => quitarItem(i)} className="text-xs text-danger-600 hover:underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" onClick={agregarManual} className="mt-2 text-xs text-primary-600 hover:underline">
          + Agregar fila manual
        </button>

        <div className="mt-4">
          <label className={LABEL}>Observaciones</label>
          <input value={cab.observaciones} onChange={set("observaciones")} className={INPUT} />
        </div>

        {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <Button disabled={guardando} onClick={handleGuardar}>
            {guardando ? "Emitiendo..." : "Emitir guía"}
          </Button>
          <Button variant="secondary" disabled={guardando} onClick={() => navigate("/guias")}>
            Cancelar
          </Button>
        </div>
      </Card>
    </>
  );
}
