// Sección titulada dentro de un formulario largo, para agrupar campos
// relacionados (ej. "Precios", "Stock"). Separa con una línea sutil arriba.
export default function FormSection({ title, description, children, className = "" }) {
  return (
    <section className={`border-t border-slate-100 pt-5 first:border-t-0 first:pt-0 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
