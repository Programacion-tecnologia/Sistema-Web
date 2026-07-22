import { descuentoPct } from "../../utils/promocion";

// Chip "Oferta −XX%" para las lineas de venta/cotizacion. El % se calcula en
// vivo contra el precio de lista, asi refleja el descuento aunque el vendedor
// ajuste el precio a mano. No renderiza nada si no hay descuento real.
export default function ChipOferta({ precioLista, precioActual, className = "" }) {
  const pct = descuentoPct(precioLista, precioActual);
  if (pct <= 0) return null;
  return (
    <span
      className={`ml-2 inline-flex items-center rounded-full bg-danger-100 px-1.5 py-0.5 text-xs font-semibold text-danger-700 align-middle ${className}`}
    >
      Oferta −{pct}%
    </span>
  );
}
