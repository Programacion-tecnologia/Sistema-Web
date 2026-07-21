// Compartir por WhatsApp con un link wa.me (gratis, sin API). Abre WhatsApp
// (app o web) con el mensaje pre-cargado; si hay teléfono ya apunta al
// destinatario, si no, WhatsApp deja elegir el contacto.

export function normalizarTelefonoPeru(tel) {
  const d = String(tel ?? "").replace(/\D/g, "");
  if (!d) return "";
  // Celular peruano: 9 dígitos empezando en 9 -> se antepone el código país 51.
  if (d.length === 9 && d.startsWith("9")) return "51" + d;
  // Ya viene con código país.
  if (d.length === 11 && d.startsWith("51")) return d;
  return d;
}

export function linkWhatsApp(telefono, texto) {
  const tel = normalizarTelefonoPeru(telefono);
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

export function compartirPorWhatsApp(telefono, texto) {
  window.open(linkWhatsApp(telefono, texto), "_blank", "noopener");
}
