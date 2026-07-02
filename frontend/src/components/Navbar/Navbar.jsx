import Button from "../Button/Button";

export default function Navbar() {
  return (
    <header className="h-16 shrink-0 bg-primary-700 text-white flex items-center justify-between px-6 shadow-sm">
      <h1 className="text-xl font-bold tracking-tight">
        System Web
      </h1>

      <div className="flex items-center gap-4">
        <span className="text-sm text-primary-100">Bienvenido</span>

        <Button variant="ghost" size="sm">
          Gustavo
        </Button>
      </div>
    </header>
  );
}