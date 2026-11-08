# Gestor Residencial — Conjunto Habitacional Gissel's 2

Plataforma web SaaS para la gestión administrativa, financiera y de convivencia del
Conjunto Habitacional **Gissel's 2** (Llano Grande, Quito — 90 viviendas).
Proyecto de titulación UDLA — Julián Torres.

## Módulos (alcance del anteproyecto)

| Módulo | Residente | Administrador |
|---|---|---|
| **Autenticación y roles (RBAC)** | Inicio de sesión y recuperación de contraseña | Gestión de usuarios y roles |
| **Alícuotas y pagos** | Estado de cuenta y subida de comprobante (PDF/JPG) | Generación de cargos y validación de pagos |
| **Reserva de áreas comunes** | Calendario y reserva sin cruces de horario | Aprobación/rechazo y reportes de ocupación |
| **Tickets de mantenimiento** | Reporte con evidencia y seguimiento | Atención, clasificación y notas |
| **Comunicados oficiales** | Muro de avisos | Publicación de anuncios |

Módulos complementarios: control de acceso QR, chat comunitario, notificaciones en la app y por correo, personalización de marca.

> El pago es **referencial** (transferencia bancaria + comprobante validado por la administración).
> No se integran pasarelas de pago en línea — fuera del alcance del proyecto.

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend (BaaS):** Supabase — PostgreSQL con RLS, Auth (JWT), Storage, Realtime y Edge Functions
- **Correo:** Resend (función `send-notification`; requiere el secreto `RESEND_API_KEY`)

## Configuración

1. Instalar dependencias: `npm install`
2. Variables de entorno en `.env` (proyecto Supabase `isdhzlughnyqhobzwarl`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Levantar en desarrollo: `npm run dev`

### Base de datos

Todo el esquema está en una sola migración, `supabase/migrations/20261107120000_esquema_inicial.sql`
(tablas, políticas RLS, triggers, buckets `receipts`, `chat_images` y `logos`, realtime), y los datos
iniciales en `supabase/seed.sql`. Para crear la base desde cero en el proyecto vinculado:

```bash
npx supabase db reset --linked --sql-paths seed.sql
```

`npm run test:real` comprueba las reglas de seguridad contra la base real sin dejar datos.
Las migraciones antiguas están archivadas en `supabase/migrations_legacy/`.

### Usuarios

El registro público está desactivado. Las cuentas se crean de dos formas:

- Desde **Administración → Residentes**, que llama a la Edge Function `create-resident` (solo administración).
- Las iniciales, con `scripts/seed-users.local.json` (copia de `seed-users.example.json`, ignorado por git):

```bash
node --env-file=.env scripts/seed_users.mjs
```

El script usa la API de administración (pide la clave de servicio a la CLI de Supabase, sin guardarla) y
asigna a cada cuenta el rol indicado: `super_admin`, `admin` o `resident`.

## Seguridad (ISO/IEC 25010 — RNF-01)

- 100 % de las rutas de datos protegidas con autenticación JWT.
- Autorización por roles aplicada en la base de datos mediante **Row Level Security**.
- Los residentes solo acceden a sus propios pagos, tickets, códigos y notificaciones.
