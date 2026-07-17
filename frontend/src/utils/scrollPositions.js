// Vive a nivel de modulo (no en un componente) para sobrevivir a que
// MainLayout desmonte y remonte las paginas hijas al navegar - solo se
// pierde con un refresh completo del navegador, que es aceptable.
export const scrollPositions = new Map();
