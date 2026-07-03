import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

const ELEMENT_ID = "escaner-camara-viewport";
const COOLDOWN_MS = 1500;

/**
 * Visor de cámara para escanear códigos de barras/QR. Se monta solo cuando
 * el usuario activa "Usar cámara" (ver ScannerVerificacion), y llama a
 * `onScan` con el mismo formato que EscanerInput para compartir la lógica de
 * negocio en un único lugar.
 */
export default function EscanerCamara({ onScan }) {
  const onScanRef = useRef(onScan);
  const ultimoCodigoRef = useRef({ codigo: null, timestamp: 0 });

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const html5Qrcode = new Html5Qrcode(ELEMENT_ID);

    html5Qrcode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (codigoDecodificado) => {
          const ahora = Date.now();
          const ultimo = ultimoCodigoRef.current;
          // Evita contar el mismo producto varias veces mientras sigue
          // en cuadro: ignora repeticiones del mismo código dentro del cooldown.
          if (ultimo.codigo === codigoDecodificado && ahora - ultimo.timestamp < COOLDOWN_MS) {
            return;
          }
          ultimoCodigoRef.current = { codigo: codigoDecodificado, timestamp: ahora };
          onScanRef.current(codigoDecodificado);
        },
        () => {
          // Callback de error por frame sin código detectado: es el caso normal
          // entre escaneos, no hay nada que reportar.
        }
      )
      .catch((err) => {
        console.error("No se pudo iniciar la cámara:", err);
      });

    return () => {
      html5Qrcode
        .stop()
        .then(() => html5Qrcode.clear())
        .catch(() => {});
    };
  }, []);

  return (
    <div className="rounded-lg overflow-hidden border border-slate-300 max-w-sm">
      <div id={ELEMENT_ID} />
    </div>
  );
}
