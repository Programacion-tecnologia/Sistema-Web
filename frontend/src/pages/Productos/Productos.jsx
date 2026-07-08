import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listProductos } from "../../services/productosService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";
import FotoProducto from "../../components/Productos/FotoProducto";
import { getNivelStock, STOCK_NIVEL_CLASS } from "../../utils/stock";
import { formatearPrecio } from "../../utils/currency";

const PUEDE_ESCRIBIR_PRODUCTOS = [ROLES.ADMIN, ROLES.GERENCIA];

export default function Productos() {
  const navigate = useNavigate();
  const { rol } = useAuth();
  const puedeEscribir = PUEDE_ESCRIBIR_PRODUCTOS.includes(rol);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;

    listProductos(rol)
      .then((data) => {
        if (activo) setProductos(data);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [rol]);

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return productos;
    return productos.filter((producto) => producto.nombre.toLowerCase().includes(termino));
  }, [productos, busqueda]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Productos</h2>

        {puedeEscribir && (
          <div className="flex items-center gap-3">
            <Link to="/productos/importar">
              <Button variant="secondary">Importar desde Excel</Button>
            </Link>
            <Link to="/productos/nuevo">
              <Button>Nuevo producto</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 max-w-sm">
        <input
          type="search"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando productos...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {!loading && !error && productosFiltrados.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            {productos.length === 0
              ? "Todavía no hay productos cargados. Crea uno nuevo o importa un Excel."
              : "Ningún producto coincide con la búsqueda."}
          </p>
        )}

        {!loading && !error && productosFiltrados.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Color / Modelo</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium text-right">Precio venta</th>
                <th className="px-4 py-3 font-medium text-right">Stock disponible</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productosFiltrados.map((producto) => (
                <tr
                  key={producto.id}
                  onClick={() => navigate(`/productos/${producto.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FotoProducto fotoUrl={producto.foto_url} nombre={producto.nombre} size="md" />
                      <div>
                        <p className="font-medium text-slate-800">{producto.nombre}</p>
                        {producto.codigo_referencia && (
                          <p className="text-xs text-slate-400">
                            CÓDIGO REF: {producto.codigo_referencia}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[producto.color, producto.modelo].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{producto.categoria?.nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatearPrecio(producto.precio_venta, producto.moneda)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${STOCK_NIVEL_CLASS[getNivelStock(producto.stock_disponible)]}`}
                  >
                    {producto.stock_disponible}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <Link to={`/productos/${producto.id}`}>
                      <Button variant="secondary" size="sm">
                        {puedeEscribir ? "Editar" : "Ver"}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
