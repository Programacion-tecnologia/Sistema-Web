import { formatearPrecio } from "../../utils/currency";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function parsearMes(mesStr) {
  const [anio, mes] = mesStr.split("-").map(Number);
  return { anio, mes, corto: MESES_CORTOS[mes - 1], largo: MESES_LARGOS[mes - 1] };
}

// Formato compacto para el eje (S/ 12k) sin ruido de decimales.
function compacto(n) {
  if (n >= 1000) {
    const miles = n / 1000;
    return `S/ ${miles >= 10 ? Math.round(miles) : miles.toFixed(1)}k`;
  }
  return `S/ ${Math.round(n)}`;
}

// Redondea el tope del eje a un número "lindo" para las líneas guía.
function topeEje(max) {
  if (max <= 0) return 1;
  const magnitud = Math.pow(10, Math.floor(Math.log10(max)));
  const normal = max / magnitud;
  const paso = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
  return paso * magnitud;
}

export default function VentasPorMesChart({ data }) {
  const totales = data.map((d) => d.total);
  const maxValor = Math.max(...totales, 0);
  const hayVentas = maxValor > 0;
  const idxMax = hayVentas ? totales.indexOf(maxValor) : -1;
  const totalAnual = totales.reduce((a, b) => a + b, 0);
  const tope = topeEje(maxValor);

  const mejor = idxMax >= 0 ? parsearMes(data[idxMax].mes) : null;

  // Líneas guía a 0 / 25 / 50 / 75 / 100 % del tope del eje.
  const guias = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Ventas por mes</h3>
          <p className="text-sm text-slate-500">
            {hayVentas ? (
              <>
                Mejor mes:{" "}
                <span className="font-medium text-slate-700">
                  {mejor.largo} {mejor.anio}
                </span>{" "}
                — {formatearPrecio(maxValor, "PEN")}
              </>
            ) : (
              "Últimos 12 meses"
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total 12 meses</p>
          <p className="text-lg font-bold text-slate-800">{formatearPrecio(totalAnual, "PEN")}</p>
        </div>
      </div>

      {!hayVentas ? (
        <p className="mt-6 rounded-lg bg-slate-50 py-10 text-center text-sm text-slate-400">
          Todavía no hay ventas registradas en los últimos 12 meses.
        </p>
      ) : (
        <div className="mt-5 flex gap-2">
          {/* Eje Y con las etiquetas de las líneas guía. */}
          <div className="relative hidden h-56 w-12 shrink-0 sm:block">
            {guias.map((g) => (
              <span
                key={g}
                className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-slate-400"
                style={{ top: `${(1 - g) * 100}%` }}
              >
                {compacto(tope * g)}
              </span>
            ))}
          </div>

          {/* Área de barras. */}
          <div className="min-w-0 flex-1">
            <div className="relative h-56">
              {/* Líneas guía horizontales. */}
              {guias.map((g) => (
                <div
                  key={g}
                  className={`absolute inset-x-0 border-t ${g === 0 ? "border-slate-300" : "border-slate-100"}`}
                  style={{ top: `${(1 - g) * 100}%` }}
                />
              ))}

              {/* Barras. */}
              <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
                {data.map((d, i) => {
                  const { largo, anio } = parsearMes(d.mes);
                  const alturaPct = tope > 0 ? (d.total / tope) * 100 : 0;
                  const esMax = i === idxMax;
                  return (
                    <div key={d.mes} className="group relative flex h-full flex-1 flex-col justify-end">
                      {/* Tooltip. */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-center text-[11px] text-white shadow-lg group-hover:block">
                        <span className="block font-medium capitalize">
                          {largo} {anio}
                        </span>
                        <span className="block text-slate-300">{formatearPrecio(d.total, "PEN")}</span>
                      </div>

                      {/* Etiqueta fija del monto en el mes máximo. */}
                      {esMax && (
                        <span className="mb-1 text-center text-[10px] font-semibold tabular-nums text-primary-700">
                          {compacto(d.total)}
                        </span>
                      )}

                      <div
                        className={`w-full rounded-t-md transition-all duration-200 ${
                          esMax
                            ? "bg-primary-600 group-hover:bg-primary-700"
                            : "bg-primary-300 group-hover:bg-primary-400"
                        }`}
                        style={{ height: `${Math.max(alturaPct, d.total > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Etiquetas de mes alineadas bajo cada barra. */}
            <div className="mt-2 flex gap-1 sm:gap-2">
              {data.map((d, i) => {
                const { corto } = parsearMes(d.mes);
                return (
                  <span
                    key={d.mes}
                    className={`flex-1 text-center text-[10px] sm:text-xs ${
                      i === idxMax ? "font-semibold text-primary-700" : "text-slate-500"
                    }`}
                  >
                    {corto}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
