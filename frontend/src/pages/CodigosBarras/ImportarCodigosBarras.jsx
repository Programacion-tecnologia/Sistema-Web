import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listProductosParaMatch, asignarCodigoBarras } from "../../services/codigosBarrasService";
import { matchearRespaldo, normalizarNombre } from "../../utils/codigosBarrasImport";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

// Buscador de producto para los casos ambiguos / sin match: filtra la lista ya
// cargada por nombre o código de referencia y deja elegir uno.
function ProductoPicker({ productos, valor, onElegir, placeholder }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const elegido = valor ? productos.find((p) => p.id === valor) : null;

  const resultados = useMemo(() => {
    const t = normalizarNombre(q);
    if (!t) return [];
    return productos
      .filter((p) => normalizarNombre(`${p.nombre} ${p.codigo_referencia ?? ""}`).includes(t))
      .slice(0, 8);
  }, [q, productos]);

  if (elegido) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-800">
          {elegido.nombre}{" "}
          <span className="text-slate-400">({elegido.codigo_referencia ?? "sin ref"})</span>
        </span>
        <button type="button" onClick={() => onElegir("")} className="text-xs text-danger-600 hover:underline">
          cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder || "Buscar producto..."}
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      {abierto && resultados.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={() => {
                  onElegir(p.id);
                  setQ("");
                }}
                className="block w-full px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="block text-sm text-slate-800">{p.nombre}</span>
                <span className="block text-xs text-slate-400">{p.codigo_referencia ?? "sin ref"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ImportarCodigosBarras() {
  const navigate = useNavigate();

  const [productos, setProductos] = useState([]);
  const [match, setMatch] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [listosSel, setListosSel] = useState(() => new Set());
  const [ambiguosSel, setAmbiguosSel] = useState({}); // idx -> producto_id
  const [sinMatchSel, setSinMatchSel] = useState({}); // idx -> producto_id

  const [asignando, setAsignando] = useState(false);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [resultado, setResultado] = useState(null);

  const cargarArchivo = async (file) => {
    if (!file) return;
    setError(null);
    setResultado(null);
    setCargando(true);
    try {
      const texto = await file.text();
      const backup = JSON.parse(texto);
      const catalogo = backup.productCatalog;
      if (!catalogo || typeof catalogo !== "object") {
        throw new Error("El archivo no tiene 'productCatalog'. ¿Es el respaldo correcto?");
      }
      const prods = await listProductosParaMatch();
      setProductos(prods);
      const m = matchearRespaldo(catalogo, prods);
      setMatch(m);
      // Por defecto todos los "listos" quedan seleccionados.
      setListosSel(new Set(m.listos.map((_, i) => i)));
      setAmbiguosSel({});
      setSinMatchSel({});
    } catch (err) {
      setError(err.message);
      setMatch(null);
    } finally {
      setCargando(false);
    }
  };

  const toggleListo = (i) =>
    setListosSel((prev) => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });

  // Todas las asignaciones elegidas (listos marcados + ambiguos/sin-match con producto).
  const paraAsignar = useMemo(() => {
    if (!match) return [];
    const out = [];
    match.listos.forEach((r, i) => {
      if (listosSel.has(i)) out.push({ producto_id: r.producto.id, codigo: r.barcode, nombre: r.producto.nombre });
    });
    match.ambiguos.forEach((r, i) => {
      const pid = ambiguosSel[i];
      if (pid) out.push({ producto_id: pid, codigo: r.barcode, nombre: r.backupName });
    });
    match.sinMatch.forEach((r, i) => {
      const pid = sinMatchSel[i];
      if (pid) out.push({ producto_id: pid, codigo: r.barcode, nombre: r.backupName });
    });
    return out;
  }, [match, listosSel, ambiguosSel, sinMatchSel]);

  const asignar = async () => {
    if (paraAsignar.length === 0) return;
    if (!window.confirm(`¿Asignar ${paraAsignar.length} código(s) de barras a sus productos?`)) return;

    setAsignando(true);
    setError(null);
    setProgreso({ hechos: 0, total: paraAsignar.length });
    const errores = [];
    let ok = 0;

    // Concurrencia limitada para no disparar cientos de requests a la vez.
    const cola = [...paraAsignar];
    const worker = async () => {
      while (cola.length) {
        const item = cola.shift();
        try {
          await asignarCodigoBarras(item.producto_id, item.codigo);
          ok++;
        } catch (err) {
          errores.push({ nombre: item.nombre, codigo: item.codigo, motivo: err.message });
        } finally {
          setProgreso((p) => ({ ...p, hechos: p.hechos + 1 }));
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    setAsignando(false);
    setResultado({ ok, errores });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">Importar códigos de barras</h2>
          <p className="text-sm text-slate-500">
            Desde el respaldo de la app anterior. Se matchea por nombre; revisá antes de asignar.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/codigos-barras")}>
          Volver
        </Button>
      </div>

      <Card className="mt-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">Archivo de respaldo (.json)</label>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => cargarArchivo(e.target.files?.[0])}
          className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-white hover:file:bg-primary-700"
        />
        {cargando && <p className="mt-3 text-sm text-slate-500">Analizando...</p>}
        {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
      </Card>

      {match && (
        <>
          {/* Resumen */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold text-success-700">{match.resumen.listos}</p>
              <p className="text-xs text-slate-500">Listos (1:1)</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold text-warning-700">{match.resumen.ambiguos}</p>
              <p className="text-xs text-slate-500">Ambiguos (elegir)</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold text-slate-600">{match.resumen.sinMatch}</p>
              <p className="text-xs text-slate-500">Sin match</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold text-danger-700">{match.resumen.conflictos}</p>
              <p className="text-xs text-slate-500">Conflictos (se omiten)</p>
            </div>
          </div>

          {/* Barra de acción */}
          <div className="sticky top-0 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
            <span className="text-sm text-slate-700">
              Se asignarán <b>{paraAsignar.length}</b> código(s).
            </span>
            <div className="flex items-center gap-3">
              {asignando && (
                <span className="text-sm text-slate-500">
                  {progreso.hechos} / {progreso.total}...
                </span>
              )}
              <Button disabled={asignando || paraAsignar.length === 0} onClick={asignar}>
                {asignando ? "Asignando..." : `Asignar ${paraAsignar.length}`}
              </Button>
            </div>
          </div>

          {resultado && (
            <Card className="mt-4">
              <p className="text-sm font-medium text-success-700">
                Se asignaron {resultado.ok} código(s) de barras.
              </p>
              {resultado.errores.length > 0 && (
                <div className="mt-2 text-sm text-danger-600">
                  <p className="font-medium">{resultado.errores.length} con error:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {resultado.errores.map((e, i) => (
                      <li key={i}>
                        {e.nombre} ({e.codigo}) — {e.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {/* Listos */}
          {match.listos.length > 0 && (
            <Card className="mt-4 p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-800">Listos para asignar ({match.listos.length})</h3>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setListosSel(new Set(match.listos.map((_, i) => i)))}
                    className="text-primary-600 hover:underline"
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setListosSel(new Set())}
                    className="text-slate-500 hover:underline"
                  >
                    Ninguno
                  </button>
                </div>
              </div>
              <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {match.listos.map((r, i) => (
                  <label key={i} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-50">
                    <input type="checkbox" checked={listosSel.has(i)} onChange={() => toggleListo(i)} className="h-4 w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{r.producto.nombre}</span>
                      <span className="block text-xs text-slate-400">
                        Ref: {r.producto.codigo_referencia ?? "—"}
                      </span>
                    </span>
                    <span className="font-mono text-sm text-slate-700">{r.barcode}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {/* Ambiguos */}
          {match.ambiguos.length > 0 && (
            <Card className="mt-4 p-0 overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-800">Elegí el producto ({match.ambiguos.length})</h3>
                <p className="text-xs text-slate-500">
                  Estos nombres coinciden con varios productos. Elegí a cuál va el código (por su ref).
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {match.ambiguos.map((r, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{r.backupName}</p>
                      <span className="font-mono text-sm text-slate-700">{r.barcode}</span>
                    </div>
                    <select
                      value={ambiguosSel[i] ?? ""}
                      onChange={(e) => setAmbiguosSel((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="">— No asignar (saltar) —</option>
                      {r.candidatos.map((c) => (
                        <option key={c.id} value={c.id} disabled={Boolean(c.codigo_barras)}>
                          {c.codigo_referencia ?? "sin ref"} — {c.nombre}
                          {c.codigo_barras ? ` (ya tiene ${c.codigo_barras})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Sin match */}
          {match.sinMatch.length > 0 && (
            <Card className="mt-4 p-0 overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-800">Sin match ({match.sinMatch.length})</h3>
                <p className="text-xs text-slate-500">
                  No se encontró un producto con ese nombre. Buscalo a mano si querés asignarlo, o dejalo.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {match.sinMatch.map((r, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{r.backupName}</p>
                      <span className="font-mono text-sm text-slate-700">{r.barcode}</span>
                    </div>
                    <div className="mt-2">
                      <ProductoPicker
                        productos={productos}
                        valor={sinMatchSel[i] ?? ""}
                        onElegir={(pid) => setSinMatchSel((prev) => ({ ...prev, [i]: pid }))}
                        placeholder="Buscar el producto por nombre o ref..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
