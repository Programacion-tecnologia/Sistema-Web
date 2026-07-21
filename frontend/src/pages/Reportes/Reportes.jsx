import { useEffect, useMemo, useState } from "react";
import {
  reporteStockInmovilizado,
  reporteTopProductos,
  reporteValorizacionInventario,
  reporteVentas,
  reporteVentasPorModelo,
} from "../../services/reportesService";
import Card from "../../components/Card/Card";
import { formatearPrecio } from "../../utils/currency";
import { METODO_PAGO_LABEL } from "../../utils/pagoMetodo";

// --- helpers de fecha (local, formato YYYY-MM-DD que esperan las RPCs) -----
function aISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function inicioDeMes() {
  const hoy = new Date();
  return aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}
function hoyISO() {
  return aISO(new Date());
}
function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return aISO(d);
}

const INPUT_CLASS =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const soles = (v) => formatearPrecio(Number(v) || 0, "PEN");

// --- componentes de gráfico livianos (SVG/CSS, un solo tono = magnitud) -----

function StatTile({ label, value, sub, acento = "slate" }) {
  const colorValor = acento === "success" ? "text-success-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorValor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// Barras horizontales: una fila por ítem, ancho proporcional al máximo. Los
// negativos (ej. margen bajo costo) se muestran en 0 de ancho pero con su
// valor real a la derecha.
function BarList({ items, labelKey, valueKey, formato = soles, vacio = "Sin datos." }) {
  if (items.length === 0) return <p className="py-4 text-sm text-slate-400">{vacio}</p>;
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const valor = Number(item[valueKey]) || 0;
        const pct = Math.max(0, (valor / max) * 100);
        return (
          <div key={idx} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-slate-600" title={item[labelKey]}>
              {item[labelKey]}
            </span>
            <div className="relative h-5 flex-1 rounded bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 rounded bg-primary-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-28 shrink-0 text-right font-medium text-slate-800">{formato(valor)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Serie diaria: barras verticales, altura proporcional. Hover muestra el total.
function DailyBars({ data }) {
  if (data.length === 0)
    return <p className="py-4 text-sm text-slate-400">Sin ventas en el período.</p>;
  const max = Math.max(1, ...data.map((d) => Number(d.total) || 0));
  return (
    <div className="flex items-end gap-1 h-40 overflow-x-auto">
      {data.map((d) => {
        const alto = Math.max(2, ((Number(d.total) || 0) / max) * 100);
        return (
          <div
            key={d.dia}
            className="flex flex-col items-center gap-1 min-w-[18px]"
            title={`${d.dia}: ${soles(d.total)}`}
          >
            <div className="flex w-full items-end" style={{ height: "128px" }}>
              <div className="w-full rounded-t bg-primary-500" style={{ height: `${alto}%` }} />
            </div>
            <span className="text-[10px] text-slate-400">{d.dia.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SeccionTitulo({ children, nota }) {
  return (
    <div className="mb-3">
      <h3 className="text-lg font-semibold text-slate-800">{children}</h3>
      {nota && <p className="text-xs text-slate-400">{nota}</p>}
    </div>
  );
}

export default function Reportes() {
  const [desde, setDesde] = useState(inicioDeMes);
  const [hasta, setHasta] = useState(hoyISO);

  const [ventas, setVentas] = useState(null);
  const [topProductos, setTopProductos] = useState([]);
  const [porModelo, setPorModelo] = useState([]);
  const [valorizacion, setValorizacion] = useState(null);
  const [inmovilizado, setInmovilizado] = useState([]);
  const [diasInmovil, setDiasInmovil] = useState(60);

  const [metricaTop, setMetricaTop] = useState("ingreso"); // ingreso | unidades | margen
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reportes dependientes del rango de fechas.
  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError(null);
    Promise.all([
      reporteVentas(desde, hasta),
      reporteTopProductos(desde, hasta),
      reporteVentasPorModelo(desde, hasta),
    ])
      .then(([v, top, modelo]) => {
        if (!activo) return;
        setVentas(v);
        setTopProductos(top);
        setPorModelo(modelo);
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setLoading(false));
    return () => {
      activo = false;
    };
  }, [desde, hasta]);

  // Valorización: foto del momento, no depende de fechas (se carga una vez).
  useEffect(() => {
    reporteValorizacionInventario()
      .then(setValorizacion)
      .catch((err) => setError(err.message));
  }, []);

  // Stock inmovilizado: depende de su propio umbral de días.
  useEffect(() => {
    reporteStockInmovilizado(diasInmovil)
      .then(setInmovilizado)
      .catch((err) => setError(err.message));
  }, [diasInmovil]);

  const preset = (nuevoDesde) => {
    setDesde(nuevoDesde);
    setHasta(hoyISO());
  };

  const resumen = ventas?.resumen;
  const margenPct =
    resumen && Number(resumen.total) > 0
      ? Math.round((Number(resumen.margen) / Number(resumen.total)) * 100)
      : 0;

  const topOrdenado = useMemo(() => {
    return [...topProductos]
      .sort((a, b) => (Number(b[metricaTop]) || 0) - (Number(a[metricaTop]) || 0))
      .slice(0, 15);
  }, [topProductos, metricaTop]);

  return (
    <>
      <h2 className="text-3xl font-bold">Reportes</h2>

      {/* Filtro de fechas */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT_CLASS} />
          <label className="text-slate-500">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={() => preset(hoyISO())} className="rounded bg-slate-100 px-2 py-1.5 text-slate-600 hover:bg-slate-200">
            Hoy
          </button>
          <button onClick={() => preset(haceDias(6))} className="rounded bg-slate-100 px-2 py-1.5 text-slate-600 hover:bg-slate-200">
            7 días
          </button>
          <button onClick={() => preset(inicioDeMes())} className="rounded bg-slate-100 px-2 py-1.5 text-slate-600 hover:bg-slate-200">
            Este mes
          </button>
          <button onClick={() => preset(haceDias(29))} className="rounded bg-slate-100 px-2 py-1.5 text-slate-600 hover:bg-slate-200">
            30 días
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Montos en soles (PEN). El margen usa el costo actual de cada producto; los productos sin costo
        de compra cargado lo sobreestiman.
      </p>

      {/* Ventas & Margen */}
      <Card className="mt-4">
        <SeccionTitulo>Ventas &amp; Margen</SeccionTitulo>
        {loading && !ventas ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Total vendido" value={soles(resumen?.total)} />
              <StatTile
                label="Margen bruto"
                value={soles(resumen?.margen)}
                sub={`${margenPct}% del total`}
                acento="success"
              />
              <StatTile label="Ticket promedio" value={soles(resumen?.ticket_promedio)} />
              <StatTile label="N° de ventas" value={resumen?.num_ventas ?? 0} />
            </div>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-slate-700">Ventas por día</p>
              <DailyBars data={ventas?.por_dia ?? []} />
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Por método de pago</p>
                <BarList
                  items={(ventas?.por_metodo ?? []).map((m) => ({
                    label: METODO_PAGO_LABEL[m.metodo] ?? m.metodo,
                    total: m.total,
                  }))}
                  labelKey="label"
                  valueKey="total"
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Por vendedor</p>
                <BarList
                  items={(ventas?.por_vendedor ?? []).map((v) => ({
                    label: `${v.vendedor} (${v.num})`,
                    total: v.total,
                  }))}
                  labelKey="label"
                  valueKey="total"
                />
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Top productos */}
      <Card className="mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SeccionTitulo>Top productos</SeccionTitulo>
          <div className="flex gap-1 text-xs">
            {[
              ["ingreso", "Por ingreso"],
              ["unidades", "Por unidades"],
              ["margen", "Por margen"],
            ].map(([valor, etiqueta]) => (
              <button
                key={valor}
                onClick={() => setMetricaTop(valor)}
                className={`rounded px-2 py-1 ${
                  metricaTop === valor ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        <BarList
          items={topOrdenado.map((p) => ({ nombre: p.nombre, valor: p[metricaTop] }))}
          labelKey="nombre"
          valueKey="valor"
          formato={metricaTop === "unidades" ? (v) => `${v} u.` : soles}
          vacio="No hubo ventas en el período."
        />
      </Card>

      {/* Ventas por modelo de moto */}
      <Card className="mt-6">
        <SeccionTitulo nota="Cada producto suma a todas las motos compatibles de su campo modelo.">
          Ventas por modelo de moto
        </SeccionTitulo>
        <BarList
          items={porModelo.slice(0, 15).map((m) => ({
            label: `${m.modelo} (${m.unidades} u.)`,
            ingreso: m.ingreso,
          }))}
          labelKey="label"
          valueKey="ingreso"
          vacio="No hubo ventas con modelo en el período."
        />
      </Card>

      {/* Valorización de inventario */}
      <Card className="mt-6">
        <SeccionTitulo nota="Foto actual: stock físico × costo. No depende del rango de fechas.">
          Valorización de inventario
        </SeccionTitulo>
        <div className="mb-4">
          <StatTile label="Capital en stock" value={soles(valorizacion?.total)} />
        </div>
        <p className="mb-2 text-sm font-medium text-slate-700">Por marca</p>
        <BarList
          items={(valorizacion?.por_marca ?? []).slice(0, 15).map((m) => ({
            label: `${m.marca} (${m.productos})`,
            valor: m.valor,
          }))}
          labelKey="label"
          valueKey="valor"
        />
      </Card>

      {/* Stock inmovilizado */}
      <Card className="mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SeccionTitulo nota="Productos con stock pero sin ventas: capital dormido.">
            Stock inmovilizado
          </SeccionTitulo>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500">Sin ventas hace</label>
            <select
              value={diasInmovil}
              onChange={(e) => setDiasInmovil(Number(e.target.value))}
              className={INPUT_CLASS}
            >
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
              <option value={180}>180 días</option>
            </select>
          </div>
        </div>
        {inmovilizado.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">
            No hay productos con stock sin ventas en ese período. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left">
                <tr>
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium text-right">Stock</th>
                  <th className="py-2 font-medium text-right">Capital inmovilizado</th>
                  <th className="py-2 font-medium text-right">Última venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inmovilizado.slice(0, 30).map((p) => (
                  <tr key={p.producto_id}>
                    <td className="py-2 text-slate-700">{p.nombre}</td>
                    <td className="py-2 text-right text-slate-600">{p.stock}</td>
                    <td className="py-2 text-right font-medium text-slate-800">
                      {soles(p.costo_inmovilizado)}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {p.ultima_venta ? new Date(p.ultima_venta).toLocaleDateString("es-PE") : "Nunca"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
