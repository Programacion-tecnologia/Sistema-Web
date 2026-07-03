const SIZES = {
  sm: "w-10 h-10",
  md: "w-16 h-16",
  lg: "w-40 h-40",
};

function IconoGenerico({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.7 6.3a3 3 0 0 0-4.24 4.24l-6.36 6.36a1.5 1.5 0 0 0 2.12 2.12l6.36-6.36a3 3 0 0 0 4.24-4.24l-1.94 1.94-1.42-1.42 1.94-1.94ZM4.5 19.5l1.5-1.5"
      />
    </svg>
  );
}

export default function FotoProducto({ fotoUrl, nombre = "", size = "md", className = "" }) {
  const sizeClass = SIZES[size] ?? SIZES.md;

  return (
    <div
      className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden ${className}`}
    >
      {fotoUrl ? (
        <img src={fotoUrl} alt={nombre} className="w-full h-full object-cover" />
      ) : (
        <IconoGenerico className="w-1/2 h-1/2 text-slate-300" />
      )}
    </div>
  );
}
