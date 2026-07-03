# Ríos System

Sistema ERP web hecho a medida para negocios pequeños y medianos que hoy gestionan su operación a punta de WhatsApp y Excel — el caso concreto detrás de este proyecto es **Rios Performance**, una tienda de repuestos de moto. El problema real que resuelve: sin un sistema, no hay una sola fuente de verdad sobre qué stock existe, qué stock ya está comprometido en una cotización, y qué cotizaciones quedaron "colgadas" porque el cliente nunca confirmó — lo que termina en ventas prometidas sobre stock que en realidad no está disponible.

Ríos System implementa el flujo de negocio real de punta a punta: **Cliente → Cotización → Aprobación → Reserva de stock → Preparación en almacén → Despacho**, con inventario en tiempo real dividido en stock físico, reservado y disponible, para que nunca se prometa lo que no se tiene.

No es un proyecto de práctica: se construye con la arquitectura, las decisiones y el nivel de cuidado de un sistema pensado para producción real.

## Stack tecnológico

| Pieza | Por qué se eligió |
|---|---|
| **React + Vite** | SPA moderna, arranque y build rápidos, ecosistema maduro para una interfaz que va a crecer en módulos durante años. |
| **Tailwind CSS v4** | Diseño propio, consistente, sin depender de una librería de componentes pesada ni de estilos hechos a mano sin sistema. |
| **React Router** | Navegación real con URLs propias, historial del navegador y rutas protegidas — no un simple `useState` de "qué página mostrar". |
| **Supabase (PostgreSQL gestionado + Auth + Storage)** | Reemplaza la necesidad de un backend propio (Node/Express/Prisma/JWT) sin sacrificar PostgreSQL real ni escalabilidad futura. Autenticación robusta sin construirla desde cero, y Storage para las fotos de productos sin montar almacenamiento de archivos aparte. |
| **xlsx (SheetJS)** | Único punto donde se necesitó una librería externa puntual: parsear archivos Excel en el navegador para la importación masiva de productos. |

## Estado actual del proyecto

### Módulos completos y funcionando contra la base de datos real

- **Autenticación** — registro e inicio de sesión con Supabase Auth, sesión persistida, rutas protegidas (redirige a `/login` si no hay sesión activa).
- **Productos** — alta, edición y listado real: código de referencia y código de barras (independientes entre sí), variantes por color/modelo, categoría, moneda por producto (soles o dólares, con tipo de cambio referencial sugerido y editable), los tres niveles de stock, foto individual o en lote. Incluye **importación masiva desde Excel** con plantilla descargable, emparejamiento opcional de fotos por lote, y detección de duplicados (actualiza en vez de duplicar si el código ya existe).
- **Cotizaciones (básico)** — alta con selección de cliente y armado de líneas de producto, envío, y **aprobación con reserva de stock atómica** (ver decisiones de arquitectura abajo). Vencimiento automático a las 48 horas si nadie aprueba. Rechazo y cancelación para cotizaciones aún no aprobadas.

### Módulos que son placeholder (navegación existe, funcionalidad todavía no)

Dashboard, Inventario, Compras, Ventas, Clientes (la lógica de buscar/crear cliente ya existe y se usa desde Cotizaciones, pero no hay una pantalla propia de gestión de clientes todavía), Proveedores, Scanner, Reportes, Configuración, y Usuarios/Roles (no existe ni siquiera como pantalla placeholder — depende de que exista el módulo de Configuración).

## Decisiones de arquitectura

**Stock en tres capas (físico / reservado / disponible).** El sistema nunca vende directamente sobre el stock físico. `stock_disponible` es una columna calculada por la base de datos (`stock_fisico − stock_reservado`), así nunca queda desincronizada. Esto es lo que evita vender algo que ya está comprometido en otra cotización aprobada.

**La aprobación de cotizaciones vive en una función de base de datos (RPC), no en el frontend.** Reservar stock implica leer disponibilidad, verificarla y escribir — si eso se hace con varias llamadas sueltas desde el navegador, dos vendedores aprobando cotizaciones por el mismo producto al mismo tiempo pueden terminar reservando más de lo que existe (condición de carrera clásica). La función `aprobar_cotizacion()` corre entera en una sola transacción de Postgres con bloqueo de filas (`for update`), así que una aprobación concurrente espera a que la otra termine y relee el stock ya actualizado antes de decidir. Si falta stock para cualquier línea, revierte todo — nunca queda una reserva parcial.

**Vencimiento automático de cotizaciones a las 48 horas.** Una cotización en borrador o enviada que nadie aprueba en 48 horas pasa sola a cancelada y libera cualquier stock que tuviera reservado. Corre con `pg_cron` directamente en la base de datos cada 15 minutos, sin depender de que alguien tenga la aplicación abierta — evita el "stock fantasma" de reservas que quedan colgadas para siempre.

**RLS (Row Level Security) todavía permisiva.** Por ahora cualquier usuario autenticado puede leer y escribir en todas las tablas — es una decisión temporal y consciente hasta que exista el módulo de Usuarios/Roles, documentada explícitamente en cada migración que la usa.

## Cómo levantar el proyecto en local

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Programacion-tecnologia/Sistema-Web.git
   cd Sistema-Web/frontend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno:** copiar `.env.example` a `.env` y completarlo con las credenciales de **tu propio proyecto de Supabase** (Project Settings → API en el dashboard de Supabase):
   ```bash
   cp .env.example .env
   ```
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```

4. **Correr las migraciones:** en el **SQL Editor** de tu proyecto de Supabase, ejecutar cada archivo de `supabase/migrations/` **en orden numérico** (`0001_init.sql`, `0002_...`, `0003_...`, etc. — cada una depende de que la anterior ya esté aplicada, así que no se pueden saltear ni ejecutar fuera de orden). El progreso de cuáles ya están corridas en el proyecto original queda registrado en `supabase/MIGRATIONS.md`.

5. **Levantar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

## Estructura de carpetas

Todo el código vive en `frontend/src/`:

- **`components/`** — piezas de UI reutilizables sin lógica de negocio propia (`Button`, `Card`, `Navbar`, `Sidebar`, `FotoProducto`, `PlaceholderPage`, `ProtectedRoute`).
- **`pages/`** — una carpeta por módulo del sistema (`Productos/`, `Cotizaciones/`, etc.), con las pantallas reales de ese módulo.
- **`layouts/`** — `MainLayout`, el layout único que envuelve todas las pantallas autenticadas (Navbar + Sidebar + contenido).
- **`services/`** — toda la comunicación con Supabase (consultas, inserciones, RPC) vive acá, nunca directo en los componentes de página.
- **`hooks/`** — hooks propios reutilizables (`useAuth`).
- **`context/`** — estado global de React (`AuthContext`, la sesión del usuario).
- **`utils/`** — funciones puras sin estado ni llamadas a red (formateo de moneda, niveles de stock, etiquetas de estado de cotización) — pensadas para reutilizarse entre módulos, por ejemplo el color de "stock bajo" en Productos es el mismo que va a usar el Dashboard más adelante.

## Roadmap / próximos pasos

- **Scanner (Almacén)** — el diferenciador principal del proyecto: preparar pedidos escaneando únicamente los productos de una cotización ya aprobada y con stock reservado, validando cantidades antes de liberar el despacho.
- **Usuarios y Roles** — perfiles con permisos reales (Administrador, Ventas, Almacén, Gerencia) y políticas de RLS específicas por rol, reemplazando el acceso permisivo actual.
- **Nube / multiusuario para producción real** — hoy el proyecto corre contra un proyecto de Supabase de desarrollo; pasar a un entorno de producción implica revisar límites de plan, backups, y credenciales separadas por ambiente.
