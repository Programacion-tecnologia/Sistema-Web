// Bloque gris animado para estados de carga (en vez de "Cargando..."). Respeta
// prefers-reduced-motion vía la utilidad animate-pulse de Tailwind.
export default function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}
