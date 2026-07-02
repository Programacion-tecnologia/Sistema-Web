import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Sidebar from "../components/Sidebar/Sidebar";

export default function MainLayout() {
  return (
    <div className="h-screen flex flex-col bg-surface">

      <Navbar />

      <div className="flex flex-1 min-h-0">

        <Sidebar />

        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>

      </div>

    </div>
  );
}
