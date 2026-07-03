import { useEffect, useRef, useState } from "react";

/**
 * Input siempre enfocado que recibe el tecleo de un lector de código de
 * barras USB/Bluetooth (actúa como teclado: tipea el código y termina con
 * Enter). Se reenfoca solo salvo que `disabled` esté activo (p.ej. mientras
 * la cámara está abierta, para que no compitan por el foco).
 */
export default function EscanerInput({ onScan, disabled = false }) {
  const [valor, setValor] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const codigo = valor.trim();
    setValor("");
    if (codigo) onScan(codigo);
  };

  const handleBlur = () => {
    if (!disabled) inputRef.current?.focus();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={valor}
      onChange={(event) => setValor(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      disabled={disabled}
      autoComplete="off"
      placeholder={disabled ? "Cámara activa..." : "Escaneá un código..."}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-slate-50 disabled:text-slate-400"
    />
  );
}
