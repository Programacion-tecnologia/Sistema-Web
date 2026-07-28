import { Link } from "react-router-dom";

// Clases completas y literales por variante (Tailwind necesita verlas asi en
// el codigo fuente, no armadas por concatenacion en tiempo de ejecucion).
const VALOR_CLASS = {
  neutral: "text-slate-800",
  primary: "text-primary-700",
  success: "text-success-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
};

// Color del chip del ícono por variante (fondo suave + ícono).
const CHIP_CLASS = {
  neutral: "bg-slate-100 text-slate-500",
  primary: "bg-primary-100 text-primary-600",
  success: "bg-success-100 text-success-700",
  warning: "bg-warning-100 text-warning-700",
  danger: "bg-danger-100 text-danger-600",
};

export default function StatTile({ label, value, sublabel, variant = "neutral", to, icon }) {
  const contenido = (
    <div
      className={`h-full bg-white rounded-xl border border-slate-200 shadow-sm p-5 transition ${
        to ? "hover:shadow-md hover:border-slate-300" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${CHIP_CLASS[variant]}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums ${VALOR_CLASS[variant]}`}>{value}</p>
        </div>
      </div>
      {sublabel && <p className="mt-2 text-xs text-slate-400">{sublabel}</p>}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {contenido}
      </Link>
    );
  }

  return contenido;
}
