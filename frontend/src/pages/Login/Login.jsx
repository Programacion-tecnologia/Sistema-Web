import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const switchMode = () => {
    setError(null);
    setInfo(null);
    setMode((current) => (current === "login" ? "signup" : "login"));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const { data, error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { nombre } },
          });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "login") {
      navigate("/");
      return;
    }

    if (data.session) {
      navigate("/");
      return;
    }

    setInfo("Cuenta creada. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.");
    setMode("login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center">System Web</h1>
        <p className="mt-1 text-sm text-slate-500 text-center">
          {mode === "login" ? "Inicia sesión para continuar" : "Crea tu cuenta"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="nombre">
                Nombre
              </label>
              <input
                id="nombre"
                type="text"
                required
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          {error && <p className="text-sm text-danger-600">{error}</p>}
          {info && <p className="text-sm text-success-600">{info}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Procesando..." : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </Button>
        </form>

        <button
          type="button"
          onClick={switchMode}
          className="mt-4 text-sm text-primary-600 hover:underline text-center w-full"
        >
          {mode === "login" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </Card>
    </div>
  );
}
