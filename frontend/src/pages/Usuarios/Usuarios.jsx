import { useEffect, useState } from "react";
import { listarUsuarios, invitarUsuario, cambiarRolUsuario } from "../../services/usuariosService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES, ROL_LABEL } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const OPCIONES_ROL = [ROLES.ADMIN, ROLES.GERENCIA, ROLES.VENTAS, ROLES.ALMACEN];

export default function Usuarios() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarInvitar, setMostrarInvitar] = useState(false);
  const [emailInvitar, setEmailInvitar] = useState("");
  const [rolInvitar, setRolInvitar] = useState(ROLES.VENTAS);
  const [invitando, setInvitando] = useState(false);
  const [mensajeInvitar, setMensajeInvitar] = useState(null);
  const [errorInvitar, setErrorInvitar] = useState(null);

  const [cambiandoRolId, setCambiandoRolId] = useState(null);

  const recargarUsuarios = () => {
    setLoading(true);
    setError(null);
    listarUsuarios()
      .then(setUsuarios)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let activo = true;

    listarUsuarios()
      .then((data) => {
        if (activo) setUsuarios(data);
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
  }, []);

  const handleInvitar = async (event) => {
    event.preventDefault();
    setInvitando(true);
    setErrorInvitar(null);
    setMensajeInvitar(null);

    try {
      await invitarUsuario(emailInvitar.trim(), rolInvitar);
      setMensajeInvitar(`Invitación enviada a ${emailInvitar.trim()}.`);
      setEmailInvitar("");
      setRolInvitar(ROLES.VENTAS);
      recargarUsuarios();
    } catch (err) {
      setErrorInvitar(err.message);
    } finally {
      setInvitando(false);
    }
  };

  const handleCambiarRol = async (usuarioId, nuevoRol) => {
    setCambiandoRolId(usuarioId);
    setError(null);

    try {
      await cambiarRolUsuario(usuarioId, nuevoRol);
      setUsuarios((prev) =>
        prev.map((usuario) => (usuario.id === usuarioId ? { ...usuario, rol: nuevoRol } : usuario))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoRolId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-3xl font-bold">Usuarios</h2>
        <Button onClick={() => setMostrarInvitar((prev) => !prev)}>
          {mostrarInvitar ? "Cancelar" : "Invitar usuario"}
        </Button>
      </div>

      {mostrarInvitar && (
        <Card className="mt-6 max-w-xl">
          <form onSubmit={handleInvitar} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  required
                  value={emailInvitar}
                  onChange={(event) => setEmailInvitar(event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                <select value={rolInvitar} onChange={(event) => setRolInvitar(event.target.value)} className={INPUT_CLASS}>
                  {OPCIONES_ROL.map((rol) => (
                    <option key={rol} value={rol}>
                      {ROL_LABEL[rol]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorInvitar && <p className="text-sm text-danger-600">{errorInvitar}</p>}
            {mensajeInvitar && <p className="text-sm text-success-700">{mensajeInvitar}</p>}

            <Button type="submit" disabled={invitando}>
              {invitando ? "Enviando invitación..." : "Enviar invitación"}
            </Button>
          </form>
        </Card>
      )}

      <Card className="mt-6 p-0 overflow-hidden">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando usuarios...</p>}
        {error && <p className="p-6 text-sm text-danger-600">{error}</p>}

        {/* Móvil: tarjetas apiladas con el selector de rol visible. */}
        {!loading && !error && (
          <div className="divide-y divide-slate-100 lg:hidden">
            {usuarios.map((usuario) => (
              <div key={usuario.id} className="px-4 py-3">
                <p className="font-medium text-slate-800">{usuario.nombre}</p>
                <p className="text-xs text-slate-500 truncate">{usuario.email}</p>
                <p className="text-xs text-slate-400">
                  Desde {new Date(usuario.created_at).toLocaleDateString("es-PE")}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Rol:</span>
                  <select
                    value={usuario.rol}
                    disabled={cambiandoRolId === usuario.id || usuario.id === user.id}
                    onChange={(event) => handleCambiarRol(usuario.id, event.target.value)}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  >
                    {OPCIONES_ROL.map((rol) => (
                      <option key={rol} value={rol}>
                        {ROL_LABEL[rol]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop: tabla completa. */}
        {!loading && !error && (
          <table className="hidden w-full text-sm lg:table">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{usuario.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{usuario.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={usuario.rol}
                      disabled={cambiandoRolId === usuario.id || usuario.id === user.id}
                      onChange={(event) => handleCambiarRol(usuario.id, event.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      {OPCIONES_ROL.map((rol) => (
                        <option key={rol} value={rol}>
                          {ROL_LABEL[rol]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(usuario.created_at).toLocaleDateString("es-PE")}
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
