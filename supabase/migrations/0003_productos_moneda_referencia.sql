-- Rios System: moneda, tipo de cambio y codigo de referencia en productos
-- Correr en el SQL Editor de Supabase (Project > SQL Editor > New query).

alter table productos add column moneda text not null default 'PEN' check (moneda in ('PEN', 'USD'));
alter table productos add column tipo_cambio numeric(10, 4);
alter table productos add column codigo_referencia text unique;
