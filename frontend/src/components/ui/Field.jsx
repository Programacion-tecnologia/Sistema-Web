// Campo de formulario consistente: label (con asterisco opcional) + control
// (children) + ayuda o error debajo. Unifica el espaciado y el manejo de
// errores por campo en todos los formularios.
export default function Field({ label, required, hint, error, htmlFor, className = "", children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-danger-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
