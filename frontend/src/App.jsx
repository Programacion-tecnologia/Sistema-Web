import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard/Dashboard";
import Inventario from "./pages/Inventario/Inventario";
import Productos from "./pages/Productos/Productos";
import Compras from "./pages/Compras/Compras";
import Ventas from "./pages/Ventas/Ventas";
import Clientes from "./pages/Clientes/Clientes";
import Proveedores from "./pages/Proveedores/Proveedores";
import Cotizaciones from "./pages/Cotizaciones/Cotizaciones";
import Scanner from "./pages/Scanner/Scanner";
import Reportes from "./pages/Reportes/Reportes";
import Configuracion from "./pages/Configuracion/Configuracion";
import Login from "./pages/Login/Login";
import NotFound from "./pages/NotFound/NotFound";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="productos" element={<Productos />} />
          <Route path="compras" element={<Compras />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="cotizaciones" element={<Cotizaciones />} />
          <Route path="scanner" element={<Scanner />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
