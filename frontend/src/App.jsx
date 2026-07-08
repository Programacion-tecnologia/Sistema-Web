import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute/RoleProtectedRoute";
import { ROLES } from "./utils/roles";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard/Dashboard";
import Inventario from "./pages/Inventario/Inventario";
import Productos from "./pages/Productos/Productos";
import ProductoDetalle from "./pages/Productos/ProductoDetalle";
import Compras from "./pages/Compras/Compras";
import Ventas from "./pages/Ventas/Ventas";
import Clientes from "./pages/Clientes/Clientes";
import ClienteDetalle from "./pages/Clientes/ClienteDetalle";
import Proveedores from "./pages/Proveedores/Proveedores";
import Cotizaciones from "./pages/Cotizaciones/Cotizaciones";
import CotizacionDetalle from "./pages/Cotizaciones/CotizacionDetalle";
import Scanner from "./pages/Scanner/Scanner";
import Reportes from "./pages/Reportes/Reportes";
import Usuarios from "./pages/Usuarios/Usuarios";
import Configuracion from "./pages/Configuracion/Configuracion";
import Login from "./pages/Login/Login";
import NotFound from "./pages/NotFound/NotFound";

// xlsx (SheetJS) es pesado y solo hace falta en esta pantalla: se separa en su
// propio chunk para no engordar el bundle inicial que descarga todo el mundo.
const ProductosImportar = lazy(() => import("./pages/Productos/ProductosImportar"));

// jsPDF y html5-qrcode son pesados y solo hacen falta en esta pantalla: mismo
// motivo de code-splitting que ProductosImportar.
const ScannerVerificacion = lazy(() => import("./pages/Scanner/ScannerVerificacion"));

// pdfjs-dist es pesado y solo hace falta en esta pantalla: mismo motivo de
// code-splitting que ProductosImportar/ScannerVerificacion.
const CotizacionImportarPdf = lazy(() => import("./pages/Cotizaciones/CotizacionImportarPdf"));

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
            <Route element={<RoleProtectedRoute roles={[ROLES.ADMIN, ROLES.GERENCIA]} />}>
              <Route path="productos/nuevo" element={<ProductoDetalle />} />
              <Route
                path="productos/importar"
                element={
                  <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
                    <ProductosImportar />
                  </Suspense>
                }
              />
            </Route>
            {/* /productos/:id queda abierto a todos los roles: es la misma
                pantalla de "ver detalle" para todos, aunque solo admin/gerencia
                pueda efectivamente guardar cambios (RLS + oculto en la UI) */}
            <Route path="productos/:id" element={<ProductoDetalle />} />
            <Route path="compras" element={<Compras />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/nuevo" element={<ClienteDetalle />} />
            <Route path="clientes/:id" element={<ClienteDetalle />} />
            <Route path="proveedores" element={<Proveedores />} />
            <Route path="cotizaciones" element={<Cotizaciones />} />
            <Route element={<RoleProtectedRoute roles={[ROLES.VENTAS, ROLES.ADMIN, ROLES.GERENCIA]} />}>
              <Route path="cotizaciones/nuevo" element={<CotizacionDetalle />} />
              <Route
                path="cotizaciones/importar"
                element={
                  <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
                    <CotizacionImportarPdf />
                  </Suspense>
                }
              />
            </Route>
            <Route path="cotizaciones/:id" element={<CotizacionDetalle />} />

            <Route element={<RoleProtectedRoute roles={[ROLES.ALMACEN, ROLES.GERENCIA, ROLES.ADMIN]} />}>
              <Route path="scanner" element={<Scanner />} />
              <Route
                path="scanner/:id"
                element={
                  <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
                    <ScannerVerificacion />
                  </Suspense>
                }
              />
            </Route>

            <Route path="reportes" element={<Reportes />} />

            <Route element={<RoleProtectedRoute roles={[ROLES.ADMIN]} />}>
              <Route path="usuarios" element={<Usuarios />} />
            </Route>

            <Route path="configuracion" element={<Configuracion />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
