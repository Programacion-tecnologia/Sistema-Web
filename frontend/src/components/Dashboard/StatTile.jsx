import { Link } from "react-router-dom";

// Clases completas y literales por variante (Tailwind necesita verlas asi en
// el codigo fuente, no armadas por concatenacion en tiempo de ejecucion).
const BORDE_CLASS = {
  neutral: "border-slate-200",
  primary: "border-primary-200",
  success: "border-success-200",
  warning: "border-warning-200",
  danger: "border-danger-200",
};

const VALOR_CLASS = {
  neutral: "text-slate-800",
  primary: "text-primary-700",
  success: "text-success-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
};

export default function StatTile({ label, value, sublabel, variant = "neutral", to }) {
  const contenido = (
    <div
      className={`h-full bg-white rounded-xl border-2 ${BORDE_CLASS[variant]} shadow-sm p-5 transition ${
        to ? "hover:shadow-md" : ""
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${VALOR_CLASS[variant]}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
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
