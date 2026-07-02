import Navbar from "../components/Navbar/Navbar";
import Sidebar from "../components/Sidebar/Sidebar";

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-100">

      <Navbar />

      <div className="flex">

        <Sidebar />

        <main className="flex-1 p-8">
          <h2 className="text-3xl font-bold">
            Dashboard
          </h2>

          <p className="mt-4">
            Bienvenido a System Web.
          </p>
        </main>

      </div>

    </div>
  );
}