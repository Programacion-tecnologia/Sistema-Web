import { useEffect, useState } from "react";

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

function LightboxFoto({ fotoUrl, nombre, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // stopPropagation en los tres handlers: el lightbox vive dentro del <tr>
  // clickeable de la fila (no hay portal), asi que sin esto cerrar la imagen
  // termina "cayendo" en el onClick de la fila y navega al detalle del
  // producto.
  const cerrar = (event) => {
    event.stopPropagation();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={cerrar}
    >
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar"
        className="absolute top-4 right-4 text-white/80 hover:text-white text-4xl leading-none"
      >
        &times;
      </button>
      <img
        src={fotoUrl}
        alt={nombre}
        onClick={(event) => event.stopPropagation()}
        className="w-[90vw] h-[90vh] max-w-5xl rounded-lg bg-white object-contain"
      />
    </div>
  );
}

export default function FotoProducto({
  fotoUrl,
  nombre = "",
  size = "md",
  className = "",
  ampliable = true,
}) {
  const [lightboxAbierto, setLightboxAbierto] = useState(false);
  const sizeClass = SIZES[size] ?? SIZES.md;
  const puedeAmpliar = ampliable && Boolean(fotoUrl);

  return (
    <>
      <div
        role={puedeAmpliar ? "button" : undefined}
        tabIndex={puedeAmpliar ? 0 : undefined}
        onClick={
          puedeAmpliar
            ? (event) => {
                event.stopPropagation();
                setLightboxAbierto(true);
              }
            : undefined
        }
        onKeyDown={
          puedeAmpliar
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  setLightboxAbierto(true);
                }
              }
            : undefined
        }
        className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden ${
          puedeAmpliar ? "cursor-zoom-in" : ""
        } ${className}`}
      >
        {fotoUrl ? (
          <img src={fotoUrl} alt={nombre} className="w-full h-full object-contain" />
        ) : (
          <IconoGenerico className="w-1/2 h-1/2 text-slate-300" />
        )}
      </div>

      {lightboxAbierto && (
        <LightboxFoto fotoUrl={fotoUrl} nombre={nombre} onClose={() => setLightboxAbierto(false)} />
      )}
    </>
  );
}
