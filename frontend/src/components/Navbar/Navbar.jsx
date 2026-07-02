export default function Navbar() {
  return (
    <header className="h-16 bg-blue-700 text-white flex items-center justify-between px-6 shadow">
      <h1 className="text-2xl font-bold">
        System Web
      </h1>

      <div className="flex items-center gap-3">
        <span>Bienvenido</span>

        <button className="bg-blue-800 px-4 py-2 rounded hover:bg-blue-900">
          Gustavo
        </button>
      </div>
    </header>
  );
}