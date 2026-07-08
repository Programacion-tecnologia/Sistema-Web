-- Rios System: RUC/DNI por cliente
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).

-- Necesario para el modulo Clientes (los PDF de cotizacion Mifact ya lo traen
-- por cliente) y, mas adelante, para la facturacion electronica real con
-- SUNAT que se va a construir en el modulo Ventas (toda boleta/factura
-- necesita el RUC o DNI del cliente).
alter table clientes add column ruc_dni text;
