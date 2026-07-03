import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseProductosExcel, generarPlantillaExcel } from "../../services/excelService";
import { importProductos } from "../../services/productosService";
import Card from "../../components/Card/Card";
import Button from "../../components/Button/Button";

export default function ProductosImportar() {
  const navigate = useNavigate();
  const [excelFile, setExcelFile] = useState(null);
  const [imagenes, setImagenes] = useState([]);
  const [analisis, setAnalisis] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);

  const nombresImagenes = new Set(imagenes.map((f) => f.name.toLowerCase()));

  const handleAnalizar = async () => {
    if (!excelFile) return;
    setAnalizando(true);
    setError(null);
    setResumen(null);

    try {
      const buffer = await excelFile.arrayBuffer();
      const resultado = parseProductosExcel(buffer);
      setAnalisis(resultado);
    } catch (err) {
      setError(`No se pudo leer el archivo: ${err.message}`);
    } finally {
      setAnalizando(false);
    }
  };

  const handleImportar = async () => {
    if (!analisis || analisis.filas.length === 0) return;
    setImportando(true);
    setError(null);
    setProgreso({ etapa: "guardando", actual: 0, total: 0 });

    try {
      const archivosPorNombre = new Map(imagenes.map((f) => [f.name.toLowerCase(), f]));
      const resultado = await importProductos(analisis.filas, archivosPorNombre, (etapa, actual, total) =>
        setProgreso({ etapa, actual, total })
      );
      setResumen(resultado);
    } catch (err) {
      setError(`No se pudo completar la importación: ${err.message}`);
    } finally {
      setImportando(false);
      setProgreso(null);
    }
  };

  const filasConFotoEncontrada =
    analisis?.filas.filter((f) => f.foto_archivo && nombresImagenes.has(f.foto_archivo.trim().toLowerCase()))
      .length ?? 0;
  const filasConFotoSinEncontrar =
    analisis?.filas.filter((f) => f.foto_archivo && !nombresImagenes.has(f.foto_archivo.trim().toLowerCase()))
      .length ?? 0;

  return (
    <>
      <h2 className="text-3xl font-bold">Importar productos desde Excel</h2>

      <Card className="mt-6 max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">1. Archivo Excel</p>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                setExcelFile(event.target.files?.[0] ?? null);
                setAnalisis(null);
                setResumen(null);
              }}
              className="text-sm"
            />
            <Button type="button" variant="secondary" size="sm" onClick={generarPlantillaExcel}>
              Descargar plantilla
            </Button>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            2. Fotos (opcional) — selecciona todos los archivos de imagen del lote
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setImagenes(Array.from(event.target.files ?? []))}
            className="text-sm"
          />
          {imagenes.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">{imagenes.length} imagen(es) seleccionadas.</p>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">3. Revisar e importar</p>
          <Button type="button" onClick={handleAnalizar} disabled={!excelFile || analizando}>
            {analizando ? "Analizando..." : "Analizar archivo"}
          </Button>
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        {analisis && !resumen && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
            <p className="text-slate-700">
              <span className="font-medium">{analisis.filas.length}</span> fila(s) válidas para importar.
            </p>
            {analisis.errores.length > 0 && (
              <div className="text-danger-600">
                <p className="font-medium">{analisis.errores.length} fila(s) con error (se omiten):</p>
                <ul className="list-disc list-inside">
                  {analisis.errores.map((e) => (
                    <li key={e.fila}>
                      Fila {e.fila}: {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {imagenes.length > 0 && (
              <p className="text-slate-500">
                {filasConFotoEncontrada} foto(s) emparejadas, {filasConFotoSinEncontrar} sin encontrar en el
                lote seleccionado (el producto se crea igual, sin foto).
              </p>
            )}

            <Button
              type="button"
              variant="success"
              onClick={handleImportar}
              disabled={importando || analisis.filas.length === 0}
              className="mt-2"
            >
              {importando ? "Importando..." : `Importar ${analisis.filas.length} producto(s)`}
            </Button>

            {progreso && (
              <p className="text-slate-500">
                {progreso.etapa === "guardando"
                  ? `Guardando productos... ${progreso.actual}/${progreso.total}`
                  : `Subiendo fotos... ${progreso.actual}/${progreso.total}`}
              </p>
            )}
          </div>
        )}

        {resumen && (
          <div className="rounded-lg border border-success-100 bg-success-50 p-4 space-y-2 text-sm">
            <p className="font-medium text-success-700">Importación completada.</p>
            <ul className="text-slate-700 space-y-1">
              <li>{resumen.creados} producto(s) creados</li>
              <li>{resumen.actualizados} producto(s) actualizados (código de barras ya existente)</li>
              <li>{resumen.fotosSubidas} foto(s) subidas</li>
              {resumen.fotosNoEncontradas.length > 0 && (
                <li>{resumen.fotosNoEncontradas.length} foto(s) referenciadas en el Excel pero no encontradas en el lote</li>
              )}
              {resumen.errores.length > 0 && (
                <li className="text-danger-600">{resumen.errores.length} error(es) durante la importación</li>
              )}
            </ul>
            <Button type="button" onClick={() => navigate("/productos")} className="mt-2">
              Ver productos
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
