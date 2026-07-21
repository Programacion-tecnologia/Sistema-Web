-- Rios System: campos del catálogo (WhatsApp del QR + encabezado tipo lista de precios)
-- Correr en el SQL Editor de Supabase, DESPUES de 0018.
--
-- El catálogo PDF replica el formato de la lista de precios de la empresa:
--   - whatsapp_catalogo: número al que apunta el QR (un vendedor), editable.
--   - descripcion_catalogo: el rótulo/rubro que va bajo el logo.
--   - cuenta_bancaria: la línea de cuenta que aparece en el encabezado.
-- Se siembran con los valores actuales de la empresa (del catálogo de referencia).

-- "if not exists" para poder re-correr sin chocar si alguna columna ya se
-- agregó en un intento anterior.
alter table configuracion_empresa add column if not exists whatsapp_catalogo text;
alter table configuracion_empresa add column if not exists descripcion_catalogo text;
alter table configuracion_empresa add column if not exists cuenta_bancaria text;

update configuracion_empresa
set whatsapp_catalogo = '971742996',
    descripcion_catalogo = 'IMPORTADORA DE REPUESTOS Y ACCESORIOS PARA MOTOS DE PISTA Y OFF ROAD.',
    cuenta_bancaria = 'N° CUENTA BCP: 44524436230088'
where id = 1;
