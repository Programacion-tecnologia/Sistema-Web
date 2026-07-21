// Vive a nivel de modulo (no en el componente) por el mismo motivo que
// scrollPositions.js: MainLayout desmonta y remonta Productos al entrar al
// detalle de un producto y volver (por el boton "Volver"/"Cancelar" o por el
// boton atras del navegador), y sin esto la pagina/busqueda/filtros
// volverian a su valor inicial en cada vuelta. Solo se pierde con un
// refresh completo, que es aceptable.
export const productosListState = {
  busqueda: "",
  marcaId: "",
  modeloClave: "",
  pagina: 0,
};
