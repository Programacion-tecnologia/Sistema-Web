import { useEffect, useRef, useState } from "react";
import {
  getConfiguracionEmpresa,
  updateConfiguracionEmpresa,
  uploadBranding,
} from "../../services/configuracionService";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../utils/roles";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

const PUEDE_EDITAR = [ROLES.ADMIN, ROLES.GERENCIA];

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

const CAMPOS = [
  ["razon_social", "Razón social"],
  ["ruc", "RUC"],
  ["direccion_comercial", "Domicilio comercial"],
  ["direccion_fiscal", "Domicilio fiscal"],
  ["telefonos", "Teléfonos"],
  ["email", "Email"],
  ["whatsapp_catalogo", "WhatsApp del catálogo (vendedor)"],
  ["descripcion_catalogo", "Rubro (encabezado del catálogo)"],
  ["cuenta_bancaria", "Cuenta bancaria (catálogo)"],
];

export default function Configuracion() {
  const { rol } = useAuth();
  const puedeEditar = PUEDE_EDITAR.includes(rol);

  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // 'logo' | 'marcas' | null
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  const logoRef = useRef(null);
  const marcasRef = useRef(null);

  useEffect(() => {
    getConfiguracionEmpresa()
      .then((data) => {
        setConfig(data);
        setForm(data ?? {});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const cambiar = (campo) => (event) => {
    setForm((prev) => ({ ...prev, [campo]: event.target.value }));
    setOk(false);
  };

  const handleGuardar = async () => {
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      const payload = Object.fromEntries(CAMPOS.map(([campo]) => [campo, form[campo] ?? null]));
      const actualizada = await updateConfiguracionEmpresa(payload);
      setConfig(actualizada);
      setOk(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleSubir = (tipo) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSubiendo(tipo);
    setError(null);
    try {
      const url = await uploadBranding(tipo, file);
      const actualizada = await updateConfiguracionEmpresa({ [`${tipo}_url`]: url });
      setConfig(actualizada);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(null);
      event.target.value = "";
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando configuración...</p>;
  }

  return (
    <>
      <h2 className="text-3xl font-bold">Configuración</h2>
      <p className="mt-1 text-sm text-slate-500">
        Datos e imágenes de la empresa que salen impresos en las guías de remisión, la nota de venta y
        las cotizaciones.
      </p>

      {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-800">Datos de la empresa</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {CAMPOS.map(([campo, label]) => (
              <div key={campo} className={campo.startsWith("direccion") ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                <input
                  value={form[campo] ?? ""}
                  onChange={cambiar(campo)}
                  disabled={!puedeEditar}
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </div>
          {puedeEditar && (
            <div className="mt-4 flex items-center gap-3">
              <Button disabled={guardando} onClick={handleGuardar}>
                {guardando ? "Guardando..." : "Guardar datos"}
              </Button>
              {ok && <span className="text-sm text-success-700">Guardado.</span>}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-800">Marca</h3>

          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Logo</p>
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
              {config?.logo_url ? (
                <img src={config.logo_url} alt="logo" className="max-h-20 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">Sin logo</span>
              )}
            </div>
            {puedeEditar && (
              <>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleSubir("logo")} hidden />
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={subiendo === "logo"}
                  onClick={() => logoRef.current?.click()}
                >
                  {subiendo === "logo" ? "Subiendo..." : "Subir logo"}
                </Button>
              </>
            )}
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-slate-700 mb-2">Tira de marcas</p>
            <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
              {config?.marcas_url ? (
                <img src={config.marcas_url} alt="marcas" className="max-h-12 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">Sin imagen de marcas</span>
              )}
            </div>
            {puedeEditar && (
              <>
                <input ref={marcasRef} type="file" accept="image/*" onChange={handleSubir("marcas")} hidden />
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={subiendo === "marcas"}
                  onClick={() => marcasRef.current?.click()}
                >
                  {subiendo === "marcas" ? "Subiendo..." : "Subir marcas"}
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>

      {!puedeEditar && (
        <p className="mt-4 text-sm text-slate-400">Solo Admin o Gerencia pueden editar la configuración.</p>
      )}
    </>
  );
}
