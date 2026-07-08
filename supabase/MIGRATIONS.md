# Migraciones aplicadas

Registro manual de qué migraciones ya se corrieron en el proyecto real de Supabase (rios-system SQL Editor). Actualizar esta lista cada vez que se escriba y corra una migración nueva — evita no saber si una ya se aplicó o no.

- [x] `0001_init.sql` — esquema inicial: `profiles`, `categorias`, `productos`, `clientes`, `proveedores`, `cotizaciones`, `cotizacion_items`, `auditoria` + RLS.
- [x] `0002_productos_variantes_fotos.sql` — columnas `color`/`modelo`/`foto_url` en `productos` + bucket de Storage `productos` (público) con políticas de lectura pública / escritura autenticada.
- [x] `0003_productos_moneda_referencia.sql` — columnas `moneda` (PEN/USD, default PEN), `tipo_cambio` y `codigo_referencia` (único, independiente de `codigo_barras`) en `productos`.
- [x] `0004_cotizaciones_vencimiento.sql` — columna `vence_en` (trigger `before insert`, 48h desde `created_at`) en `cotizaciones` + función `expirar_cotizaciones_vencidas()` + cron job `pg_cron` cada 15 min que libera stock reservado y cancela cotizaciones sin aprobar vencidas.
- [x] `0005_cotizaciones_aprobar.sql` — columna `moneda` (PEN/USD, default PEN) en `cotizaciones` + función `aprobar_cotizacion()` (RPC): reserva stock atómicamente con bloqueo de filas (`for update`) y pasa la cotización de `enviada` a `reservada`, o revierte todo si falta stock.
- [x] `0006_cotizaciones_verificar_despacho.sql` — columnas `verificada_por`/`verificada_at` en `cotizaciones` + función `verificar_despacho_cotizacion()` (RPC, módulo Scanner): descuenta `stock_fisico` real según lo escaneado, libera `stock_reservado` según lo pedido, permite exceso, pasa la cotización de `reservada` a `lista_despacho` y deja el primer registro real en `auditoria`.
- [x] `0007_clientes_ruc_dni.sql` — columna `ruc_dni` en `clientes` (módulo Clientes), necesaria también para la futura facturación electrónica SUNAT en Ventas.
- [x] `0008_roles_admin_inicial.sql` — fija `onemillion0112@gmail.com` como `admin` + función helper `mi_rol()` (módulo Usuarios/Roles). Correr primero, antes que 0009/0010.
- [x] `0009_rls_por_rol.sql` — reemplaza las policies permisivas de `0001_init.sql` por RLS real según rol en `categorias`, `productos`, `clientes`, `cotizaciones`, `cotizacion_items`, `auditoria`; agrega trigger de protección de `rol` en `profiles` + RPC `cambiar_rol_usuario()`.
- [x] `0010_roles_en_rpcs_existentes.sql` — agrega chequeo de `mi_rol()` a `aprobar_cotizacion()` (admin/gerencia) y `verificar_despacho_cotizacion()` (almacen/admin).
