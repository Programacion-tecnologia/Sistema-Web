// Íconos del menú lateral, uno por ruta. SVG de línea (currentColor) para que
// hereden el color del ítem (activo/inactivo) sin depender de librerías.
const svg = (children) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const MENU_ICONS = {
  "/": svg(
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  "/inventario": svg(
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 8 0 5" />
    </>
  ),
  "/productos": svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 4v5" />
    </>
  ),
  "/compras": svg(
    <>
      <path d="M6 7h12l-1 12H7L6 7z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
      <path d="M12 11v4M10 13h4" />
    </>
  ),
  "/ventas": svg(
    <>
      <path d="M3 4h2l2.4 11h9.2L19 7H6.2" />
      <circle cx="9.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  "/caja": svg(
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v6M18 9v6" />
    </>
  ),
  "/guias": svg(
    <>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h3.5L21 12v3h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </>
  ),
  "/clientes": svg(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M20.5 19a5 5 0 0 0-3.2-4.7" />
    </>
  ),
  "/proveedores": svg(
    <>
      <path d="M4 9h16v11H4z" />
      <path d="M4 9 6 4h12l2 5" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  "/cotizaciones": svg(
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  "/ofertas": svg(
    <>
      <path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1 1 0 0 1 0 1.4z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  "/scanner": svg(
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M4 12h16" />
    </>
  ),
  "/codigos-barras": svg(
    <>
      <path d="M4 5v14M7.5 5v14M11 5v14M14 5v10M14 16.5v2.5M17 5v14M20 5v14" />
    </>
  ),
  "/reportes": svg(
    <>
      <path d="M3 21h18" />
      <rect x="5" y="11" width="3.4" height="8" rx="0.5" />
      <rect x="10.3" y="6" width="3.4" height="13" rx="0.5" />
      <rect x="15.6" y="14" width="3.4" height="5" rx="0.5" />
    </>
  ),
  "/usuarios": svg(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  "/configuracion": svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
    </>
  ),
};
