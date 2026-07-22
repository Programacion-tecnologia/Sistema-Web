import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listOfertasVigentes,
  listPromociones,
  deletePromocion,
  updatePromocion,
} from "../../services/promocionesService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import FotoProducto from "../../components/Productos/FotoProducto";
import { formatearPrecio } from "../../utils/currency";
import {
  descuentoPct,
  tiempoRestante,
  estadoPromocion,
  ESTADO_PROMO_LABEL,
  ESTADO_PROMO_BADGE_CLASS,
} from "../../utils/promocion";

const PUEDE_GESTIONAR = [ROLES.ADMIN, ROLES.GERENCIA];

function rangoTexto(promo) {
  const opts = { day: "2-digit", month: "2-digit" };
  const ini = new Date(promo.fecha_inicio).toLocaleDateString("es-PE", opts);
  const fin = new Date(promo.fecha_fin).toLocaleDateString("es-PE", opts);
  return `${ini} → ${fin}`;
}

// Tarjeta llamativa de una oferta vigente.
function TarjetaOferta({ oferta }) {
  const p = oferta.producto;
  const pct = descuentoPct(p.precio_venta, oferta.precio_oferta);
  const resta = tiempoRestante(oferta.promocion.fecha_fin);

  return (
    <Link
      to={`/productos/${p.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {pct > 0 && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-danger-600 px-2.5 py-1 text-xs font-bold text-white shadow">
          −{pct}%
        </span>
      )}

      <div className="flex items-center justify-center bg-slate-50 p-4">
        <FotoProducto fotoUrl={p.foto_url} nombre={p.nombre} size="lg" ampliable={false} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {p.categoria?.nombre && (
          <span className="text-xs font-medium uppercase tracking-wide text-primary-600">
            {p.categoria.nombre}
          </span>
        )}
        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{p.nombre}</p>

        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-danger-600">
              {formatearPrecio(oferta.precio_oferta, p.moneda)}
            </span>
            {pct > 0 && (
              <span className="text-sm text-slate-400 line-through">
                {formatearPrecio(p.precio_venta, p.moneda)}
              </span>
            )}
          </div>
          {resta && <p className="mt-1 text-xs font-medium text-warning-700">⏳ {resta}</p>}
          {p.stock_disponible <= 0 && (
            <p className="mt-1 text-xs font-medium text-slate-400">Sin stock</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// Fila del panel de gestion (Admin/Gerencia).
function FilaPromocion({ promo, onToggle, onEliminar, procesando }) {
  const estado = estadoPromocion(promo);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-[8rem] flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-800">{promo.nombre}</p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PROMO_BADGE_CLASS[estado]}`}
          >
            {ESTADO_PROMO_LABEL[estado]}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {rangoTexto(promo)} · {promo.total_productos} producto{promo.total_productos === 1 ? "" : "s"}
        </p>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={promo.activa}
          disabled={procesando}
          onChange={() => onToggle(promo)}
          className="h-4 w-4"
        />
        Activa
      </label>
      <Link to={`/ofertas/${promo.id}`} className="text-sm font-medium text-primary-600 hover:underline">
        Editar
      </Link>
      <button
        type="button"
        disabled={procesando}
        onClick={() => onEliminar(promo)}
        className="text-sm text-danger-600 hover:underline"
      >
        Eliminar
      </button>
    </div>
  );
}

export default function Ofertas() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeGestionar = PUEDE_GESTIONAR.includes(rol);

  const [ofertas, setOfertas] = useState([]);
  const [promociones, setPromociones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  const recargar = () => {
    setLoading(true);
    setError(null);
    const tareas = [listOfertasVigentes()];
    if (puedeGestionar) tareas.push(listPromociones());

    Promise.all(tareas)
      .then(([vigentes, promos]) => {
        setOfertas(vigentes);
        if (promos) setPromociones(promos);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(recargar, [puedeGestionar]);

  const handleToggle = async (promo) => {
    setProcesandoId(promo.id);
    try {
      await updatePromocion(promo.id, { ...promo, activa: !promo.activa });
      recargar();
    } catch (err) {
      setError(err.message);
      setProcesandoId(null);
    }
  };

  const handleEliminar = async (promo) => {
    if (!window.confirm(`¿Eliminar la promoción "${promo.nombre}"? Se quitan sus productos de oferta.`)) {
      return;
    }
    setProcesandoId(promo.id);
    try {
      await deletePromocion(promo.id);
      recargar();
    } catch (err) {
      setError(err.message);
      setProcesandoId(null);
    }
  };

  // Agrupa las tarjetas por promocion para un showcase mas ordenado cuando hay
  // varias campanas corriendo a la vez.
  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const oferta of ofertas) {
      const key = oferta.promocion.id;
      if (!mapa.has(key)) mapa.set(key, { promocion: oferta.promocion, items: [] });
      mapa.get(key).items.push(oferta);
    }
    return Array.from(mapa.values());
  }, [ofertas]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">Productos en oferta</h2>
          <p className="text-sm text-slate-500">Promociones vigentes de la tienda.</p>
        </div>
        {puedeGestionar && (
          <Button onClick={() => navigate("/ofertas/nueva")}>Nueva promoción</Button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}
      {loading && <p className="mt-6 text-sm text-slate-500">Cargando ofertas...</p>}

      {!loading && ofertas.length === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-slate-500">
            No hay productos en oferta ahora mismo.
            {puedeGestionar && " Creá una promoción para empezar."}
          </p>
        </Card>
      )}

      {!loading &&
        grupos.map((grupo) => (
          <section key={grupo.promocion.id} className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-800">{grupo.promocion.nombre}</h3>
              {tiempoRestante(grupo.promocion.fecha_fin) && (
                <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
                  {tiempoRestante(grupo.promocion.fecha_fin)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {grupo.items.map((oferta) => (
                <TarjetaOferta key={oferta.id} oferta={oferta} />
              ))}
            </div>
          </section>
        ))}

      {/* Panel de gestion: solo Admin/Gerencia. */}
      {puedeGestionar && (
        <Card className="mt-8 p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-800">Promociones</h3>
            <Button size="sm" variant="secondary" onClick={() => navigate("/ofertas/nueva")}>
              Nueva
            </Button>
          </div>
          {promociones.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Todavía no creaste ninguna promoción.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {promociones.map((promo) => (
                <FilaPromocion
                  key={promo.id}
                  promo={promo}
                  procesando={procesandoId === promo.id}
                  onToggle={handleToggle}
                  onEliminar={handleEliminar}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
