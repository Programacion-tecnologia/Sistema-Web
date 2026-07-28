import Skeleton from "./Skeleton";

// Filas fantasma animadas para el estado de carga de una lista/tabla, en vez de
// "Cargando...". Se usa dentro de la misma Card que después contiene la lista.
export default function TableSkeleton({ rows = 6 }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="hidden h-4 w-16 md:block" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
