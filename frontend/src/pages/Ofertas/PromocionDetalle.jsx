import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPromocion,
  createPromocion,
  updatePromocion,
  guardarProductoPromocion,
  quitarProductoPromocion,
} from "../../services/promocionesService";
import { listProductos } from "../../services/productosService";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import FotoProducto from "../../components/Productos/FotoProducto";
import { formatearPrecio } from "../../utils/currency";
import { normalizarTexto } from "../../utils/normalizar";
import {
  descuentoPct,
  precioDesdeDescuento,
  isoAFechaInput,
  fechaInicioAIso,
  fechaFinAIso,
} from "../../utils/promocion";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

function hoyMasDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d - offset).toISOString().slice(0, 10);
}

// Fila de un producto dentro de la promo: precio de oferta editable + % de
// descuento vinculado (editar cualquiera actualiza el otro) + descuento vivo.
function FilaProductoPromo({ fila, onGuardarPrecio, onQuitar, procesando }) {
  const p = fila.producto;
  const [precio, setPrecio] = useState(String(fila.precio_oferta));

  useEffect(() => {
    setPrecio(String(fila.precio_oferta));
  }, [fila.precio_oferta]);

  const pct = descuentoPct(p.precio_venta, precio);

  const persistir = () => {
    const valor = Number(precio);
    if (Number.isNaN(valor) || valor < 0) {
      setPrecio(String(fila.precio_oferta));
      return;
    }
    if (valor !== Number(fila.precio_oferta)) onGuardarPrecio(fila, valor);
  };

  const aplicarDescuento = (pctStr) => {
    const nuevo = precioDesdeDescuento(p.precio_venta, pctStr);
    setPrecio(String(nuevo));
    if (nuevo !== Number(fila.precio_oferta)) onGuardarPrecio(fila, nuevo);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <FotoProducto fotoUrl={p.foto_url} nombre={p.nombre} size="sm" ampliable={false} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-medium text-slate-800">{p.nombre}</p>
        <p className="text-xs text-slate-400">
          {p.codigo_referencia ? `${p.codigo_referencia} · ` : ""}Normal:{" "}
          {formatearPrecio(p.precio_venta, p.moneda)}
        </p>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-0.5">Precio oferta</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={precio}
          disabled={procesando}
          onChange={(e) => setPrecio(e.target.value)}
          onBlur={persistir}
          className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-0.5">% desc.</label>
        <input
          type="number"
          min="0"
          max="100"
          value={pct}
          disabled={procesando}
          onChange={(e) => aplicarDescuento(e.target.value)}
          className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm"
        />
      </div>

      <span className="rounded-full bg-danger-100 px-2 py-1 text-xs font-semibold text-danger-700">
        −{pct}%
      </span>

      <button
        type="button"
        disabled={procesando}
        onClick={() => onQuitar(fila)}
        className="text-xs text-danger-600 hover:underline"
      >
        Quitar
      </button>
    </div>
  );
}

export default function PromocionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rol } = useAuth();
  const modoEdicion = Boolean(id);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyMasDias(0));
  const [fechaFin, setFechaFin] = useState(hoyMasDias(7));
  const [activa, setActiva] = useState(true);

  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(modoEdicion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Buscador de productos para agregar.
  const [catalogo, setCatalogo] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!modoEdicion) return;
    getPromocion(id)
      .then((promo) => {
        setNombre(promo.nombre);
        setDescripcion(promo.descripcion ?? "");
        setFechaInicio(isoAFechaInput(promo.fecha_inicio));
        setFechaFin(isoAFechaInput(promo.fecha_fin));
        setActiva(promo.activa);
        setFilas(promo.productos ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, modoEdicion]);

  useEffect(() => {
    if (!modoEdicion) return;
    listProductos(rol).then(setCatalogo).catch(() => {});
  }, [modoEdicion, rol]);

  const idsEnPromo = useMemo(() => new Set(filas.map((f) => f.producto.id)), [filas]);

  const resultados = useMemo(() => {
    const termino = normalizarTexto(busqueda.trim());
    if (!termino) return [];
    return catalogo
      .filter((p) => p.estado === "activo" && !idsEnPromo.has(p.id))
      .filter((p) => {
        const texto = normalizarTexto(`${p.nombre} ${p.codigo_referencia ?? ""}`);
        return texto.includes(termino);
      })
      .slice(0, 8);
  }, [busqueda, catalogo, idsEnPromo]);

  const construirPayload = () => ({
    nombre: nombre.trim(),
    descripcion: descripcion.trim() || null,
    fecha_inicio: fechaInicioAIso(fechaInicio),
    fecha_fin: fechaFinAIso(fechaFin),
    activa,
  });

  const validar = () => {
    if (!nombre.trim()) return "Ponele un nombre a la promoción.";
    if (fechaFin < fechaInicio) return "La fecha de fin no puede ser anterior a la de inicio.";
    return null;
  };

  const handleGuardarCabecera = async (event) => {
    event.preventDefault();
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (modoEdicion) {
        await updatePromocion(id, construirPayload());
      } else {
        const creada = await createPromocion(construirPayload());
        navigate(`/ofertas/${creada.id}`, { replace: true });
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const agregarProducto = async (producto) => {
    setBusqueda("");
    setMostrarResultados(false);
    setProcesando(true);
    setError(null);
    try {
      // Arranca al precio normal (0% de descuento) para que el usuario ajuste.
      const fila = await guardarProductoPromocion(id, producto.id, producto.precio_venta);
      setFilas((prev) => [...prev, fila]);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  const guardarPrecio = async (fila, precioOferta) => {
    setProcesando(true);
    setError(null);
    try {
      await guardarProductoPromocion(id, fila.producto.id, precioOferta);
      setFilas((prev) =>
        prev.map((f) => (f.id === fila.id ? { ...f, precio_oferta: precioOferta } : f))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  const quitarProducto = async (fila) => {
    setProcesando(true);
    setError(null);
    try {
      await quitarProductoPromocion(fila.id);
      setFilas((prev) => prev.filter((f) => f.id !== fila.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Cargando promoción...</p>;

  return (
    <>
      <h2 className="text-2xl font-bold sm:text-3xl">
        {modoEdicion ? "Editar promoción" : "Nueva promoción"}
      </h2>

      <Card className="mt-6 max-w-3xl">
        <form onSubmit={handleGuardarCabecera} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Semana Circuit"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descripción <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle interno de la promoción"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={activa}
              onChange={(e) => setActiva(e.target.checked)}
              className="h-4 w-4"
            />
            Activa (si la pausás, sus productos dejan de mostrarse en ofertas)
          </label>

          {error && <p className="text-sm text-danger-600">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear y agregar productos"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/ofertas")}>
              Volver
            </Button>
          </div>
        </form>
      </Card>

      {/* Productos de la promo: recien disponible una vez creada (necesita id). */}
      {modoEdicion && (
        <Card className="mt-6 max-w-3xl p-0 overflow-visible">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-800">Productos en oferta</h3>
            <p className="text-xs text-slate-500">
              Buscá y agregá productos; poné el precio de oferta o el % de descuento.
            </p>
          </div>

          <div className="relative px-4 py-3">
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setMostrarResultados(true);
              }}
              onFocus={() => setMostrarResultados(true)}
              onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
              placeholder="Buscar producto por nombre o código..."
              className={INPUT_CLASS}
            />
            {mostrarResultados && resultados.length > 0 && (
              <ul className="absolute z-10 mt-1 w-[calc(100%-2rem)] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={() => agregarProducto(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <FotoProducto fotoUrl={p.foto_url} nombre={p.nombre} size="sm" ampliable={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-800">{p.nombre}</span>
                        <span className="block text-xs text-slate-400">
                          {p.codigo_referencia && `${p.codigo_referencia} · `}
                          {formatearPrecio(p.precio_venta, p.moneda)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {mostrarResultados && busqueda.trim() && resultados.length === 0 && (
              <p className="absolute z-10 mt-1 w-[calc(100%-2rem)] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">
                Ningún producto activo coincide (o ya está en la promoción).
              </p>
            )}
          </div>

          {filas.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-slate-500">Todavía no agregaste productos.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filas.map((fila) => (
                <FilaProductoPromo
                  key={fila.id}
                  fila={fila}
                  procesando={procesando}
                  onGuardarPrecio={guardarPrecio}
                  onQuitar={quitarProducto}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
