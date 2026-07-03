import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard/Dashboard";
import Inventario from "./pages/Inventario/Inventario";
import Productos from "./pages/Productos/Productos";
import ProductoDetalle from "./pages/Productos/ProductoDetalle";
import Compras from "./pages/Compras/Compras";
import Ventas from "./pages/Ventas/Ventas";
import Clientes from "./pages/Clientes/Clientes";
import Proveedores from "./pages/Proveedores/Proveedores";
import Cotizaciones from "./pages/Cotizaciones/Cotizaciones";
import CotizacionDetalle from "./pages/Cotizaciones/CotizacionDetalle";
import Scanner from "./pages/Scanner/Scanner";
import Reportes from "./pages/Reportes/Reportes";
import Configuracion from "./pages/Configuracion/Configuracion";
import Login from "./pages/Login/Login";
import NotFound from "./pages/NotFound/NotFound";

// xlsx (SheetJS) es pesado y solo hace falta en esta pantalla: se separa en su
// propio chunk para no engordar el bundle inicial que descarga todo el mundo.
const ProductosImportar = lazy(() => import("./pages/Productos/ProductosImportar"));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="productos" element={<Productos />} />
            <Route path="productos/nuevo" element={<ProductoDetalle />} />
            <Route
              path="productos/importar"
              element={
                <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
                  <ProductosImportar />
                </Suspense>
              }
            />
            <Route path="productos/:id" element={<ProductoDetalle />} />
            <Route path="compras" element={<Compras />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="proveedores" element={<Proveedores />} />
            <Route path="cotizaciones" element={<Cotizaciones />} />
            <Route path="cotizaciones/nuevo" element={<CotizacionDetalle />} />
            <Route path="cotizaciones/:id" element={<CotizacionDetalle />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
