-- Rios System: unidad de medida (Um) por producto — para el catálogo
-- Correr en el SQL Editor de Supabase.
--
-- El catálogo/lista de precios muestra "Um : PIEZA / PAR / JUEGO..." por
-- producto. Se agrega la columna nullable: nace vacía y se completa desde la
-- ficha del producto (o una importación futura). En el catálogo, si está
-- vacía, la línea "Um" no aparece.

alter table productos add column if not exists unidad text;
