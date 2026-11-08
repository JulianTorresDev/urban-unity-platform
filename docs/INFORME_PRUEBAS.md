# Informe de pruebas — Gestor Residencial Gissel's 2

Fecha: 7 de noviembre de 2026 · Alcance: sistema completo (base de datos, seguridad, frontend y Edge Functions)

## 1. Resumen

| Indicador | Antes | Después |
|---|---|---|
| Casos de prueba automatizados | 0 | **302** (todos pasan) |
| Pantallas con pruebas de interfaz | 0 | **24 de 24** |
| Historias de usuario con criterios verificados | 0 | **36 de 36** ([ver documento](HISTORIAS_DE_USUARIO.md)) |
| Casos de BD que fallan contra el esquema sin corregir | — | **48 de 123** |
| Prueba de humo contra la base real de Supabase | — | **23 de 23** (`npm run test:real`) |
| Errores de TypeScript | 32 | **0** |
| Errores de ESLint | 35 | **0** (24 avisos menores) |
| Build de producción | correcto | correcto |

Las 123 pruebas de base de datos corren contra **la migración real** sobre un PostgreSQL 18 real
(PGlite, compilado a WebAssembly) que imita el entorno de Supabase: roles `anon` y `authenticated`,
`auth.uid()` y storage. Contra el esquema anterior, sin corregir, fallan 48 casos. Esos fallos son la
evidencia de los problemas que este informe corrige. Con la migración `20261107120000_esquema_inicial.sql`
y los datos de `supabase/seed.sql` pasan las 123.

Las 106 pruebas de interfaz renderizan **las pantallas reales** con un Supabase simulado
(`src/test/supabaseMock.ts`). Hacen clic en los botones como lo haría una persona y verifican qué se envía
a la base de datos, qué aviso aparece y a quién se notifica.

## 2. Cómo ejecutar las pruebas

```bash
npm test                  # las 302 pruebas
npm run test:db           # solo base de datos y seguridad (123)
npm run test:db:baseline  # mismas pruebas contra el esquema sin corregir (muestra los 48 fallos)
npm run test:coverage     # con cobertura
npm run typecheck         # TypeScript de la app y de las pruebas
```

No requieren Docker ni conexión a Supabase.

## 3. Hallazgos

Severidad: **Crítica** (pérdida económica o toma de control), **Alta**, **Media**, **Baja**.

### 3.1 Seguridad

| ID | Sev. | Hallazgo | Estado | Pruebas |
|---|---|---|---|---|
| S-01 | Crítica | Un residente podía marcar su propia alícuota o pago como **pagado** llamando a la API (la política `Users update own dues receipt` no limitaba columnas). También podía bajar el monto. | Corregido: trigger `guard_receipt_update` | SEG-I01 a I06, FLU-C01 |
| S-02 | Alta | Un residente **suspendido podía reactivarse** solo, y cualquier residente podía cambiar su tipo de departamento (y con ello su cuota), su unidad, su correo o su tarjeta NFC. | Corregido: trigger `guard_profile_update` | SEG-I07 a I10 |
| S-03 | Alta | Las reservas se podían crear **ya confirmadas y con precio 0**. El cruce de horarios, el horario hábil y el máximo de horas solo se validaban en el navegador, y dos reservas simultáneas podían cruzarse. | Corregido: trigger `guard_reservation` con bloqueo por recurso | FUN-V01 a V16, SEG-V02, V08 a V12 |
| S-04 | Alta | El cambio de rol usaba `upsert` y **agregaba una segunda fila** en vez de reemplazar: un residente degradado seguía siendo admin en la BD y un admin promovido aparecía como residente en la interfaz. Un admin podía otorgarse `super_admin`. | Corregido: función `set_user_role` atómica y con jerarquía; el frontend toma el rol más alto | SEG-I13 a I17, FUN-R01, R02, UNI-R02, FRO-A05, FRO-U07 |
| S-05 | Media | Según `20260513_consolidated_fix`, un residente podía crear o reescribir su propio token QR (por ejemplo, copiar el de un vecino). | Corregido: tokens de solo lectura para el residente | SEG-I18, I19 |
| S-06 | Alta | Cualquier usuario autenticado podía **listar y descargar los comprobantes bancarios de todos** los residentes (bucket `receipts`). | Corregido: carpeta por usuario y lectura solo del dueño o la administración | SEG-A01 a A04, UNI-C01 |
| S-07 | Baja | Cualquier usuario podía subir archivos al bucket de logos. | Corregido | SEG-A05 |
| S-08 | Media | La suspensión solo se aplicaba en la pantalla de acceso. Por la API, un residente suspendido seguía reservando, escribiendo en el chat y subiendo imágenes. | Corregido: `is_active_user()` en las políticas | SEG-I11, SEG-V08, SEG-A06 |
| S-09 | Alta | La Edge Function `send-notification` **no verificaba quién la llamaba** y metía los datos sin escapar en el HTML. Con la clave pública se podían enviar correos falsos desde tu cuenta de Resend a cualquier dirección. | Corregido: exige sesión de administrador, valida el destinatario y escapa todo | EDGE-01 a EDGE-10 |
| S-10 | Alta | `scripts/seed_users.mjs` tenía **4 contraseñas reales en texto plano** y está en git (commit `328634f`). | Mitigado: el script lee `seed-users.local.json`, ignorado por git. **Acción pendiente: cambiar esas contraseñas**, porque siguen en el historial. | — |
| S-11 | Media | El alta de residentes usaba `signUp` en el navegador del administrador: la sesión del admin pasaba a ser la del residente nuevo. | Corregido: el alta pasa por la Edge Function `create-resident` (clave de servicio, solo administración) y el registro público quedó desactivado | FRO-U01 a U06, UI-U01, EDGE-11 a EDGE-13 |
| S-12 | Baja | El color de marca no se validaba (permitía inyectar CSS). | Corregido: `CHECK` de color hexadecimal | SEG-I22, UNI-T02, FLU-T02 |
| S-13 | Baja | Mensajes de chat y solicitudes sin límite de tamaño; un residente podía crear una solicitud "resuelta" con respuesta oficial. | Corregido | SEG-I23, I29 |
| S-14 | Media | La migración maestra confirma automáticamente **todos** los correos y vuelve a promover al primer usuario cada vez que se ejecuta. | Corregido: la migración única ya no lo hace | — |

### 3.2 Funcionales

| ID | Sev. | Hallazgo | Estado | Pruebas |
|---|---|---|---|---|
| F-01 | Alta | **Nunca se generaba el token QR** de los residentes: "Acceso QR" mostraba "Aún no tienes un código" y la garita no podía validar a nadie. | Corregido: token permanente automático (244 bits aleatorios) y emisión para perfiles existentes | FUN-Q01 a Q05 |
| F-02 | Media | El chat no mostraba el nombre de los otros vecinos (la tabla de perfiles es privada). | Corregido: directorio mínimo `get_public_profiles` (solo nombre y unidad) | SEG-C09, C10, FRO-U09 a U11 |
| F-03 | Media | En una base nueva, `access_codes`, `access_logs` y `apartment_types` quedaban sin políticas, así que esos módulos eran inaccesibles. | Corregido | SEG-E02, FUN-Q07 a Q09 |
| F-04 | Media | Al recargar una página de administración, la persona terminaba en `/dashboard` (la sesión se daba por cargada antes de conocer el rol). | Corregido | FRO-A04 |
| F-05 | Media | La garita **aceptaba pases temporales vencidos**. | Corregido: `evaluateAccessToken` | UNI-Q01 a Q07 |
| F-06 | Baja | El residente podía cambiar su número de departamento, que es lo que ve el guardia. | Corregido: campo de solo lectura y protegido en la BD | SEG-I08 |
| F-07 | Media | El historial de migraciones no se puede reproducir desde cero (`00_full_setup` y `20260111…` crean las mismas tablas sin `IF NOT EXISTS`). | Corregido: una sola migración, `20261107120000_esquema_inicial.sql`; las antiguas quedan archivadas | SEG-E07 |
| F-08 | Baja | `types.ts` no tenía `system_settings`, `access_tokens`, `status`, `receipt_url`, entre otros (32 errores de TypeScript). | Corregido | `npm run typecheck` |
| F-09 | Baja | Se podían emitir dos alícuotas del mismo mes para el mismo residente. | Corregido: índice único (se omite con un aviso si ya hay duplicados) | — |

### 3.3 Encontrados con las pruebas de interfaz

| ID | Sev. | Hallazgo | Estado | Pruebas |
|---|---|---|---|---|
| U-01 | Alta | **Rechazar un comprobante** solo devolvía el cobro a "pendiente": no quitaba el comprobante ni guardaba el motivo. El residente lo seguía viendo "En revisión" y volvía a aparecer en la cola. Pasaba en Resumen, Alícuotas y Cobranza. | Corregido: helper común `rejectionUpdate` | UI-O03, UI-M02, UI-C02 |
| U-02 | Alta | **Subir un comprobante mostraba "Comprobante enviado"** aunque la base de datos rechazara el cambio. | Corregido: se informa el error real | UI-D05, UI-P03, FLU-C05 |
| U-03 | Media | **Rechazar una reserva** la guardaba como "cancelada"; ninguna pantalla mostraba el estado "Rechazada". | Corregido | UI-R02, UI-E01 |
| U-04 | Media | El residente **no recibía aviso** cuando se aprobaba o rechazaba su reserva ni cuando respondían su solicitud. | Corregido: notificaciones | UI-R01, UI-R02, UI-S01 |
| U-05 | Media | "Pases de acceso", "Reporte de reservas" y "Mis accesos" **no tenían enlace en el menú**. | Corregido | FRO-N01, FRO-N02 |
| U-06 | Media | **Accesibilidad:** 43 etiquetas de formulario no estaban asociadas a su campo; en Perfil los campos no tenían nombre accesible; los botones de icono del chat no tenían nombre. | Corregido | UI-F01, UI-T02, UI-H02, UI-A01 |
| U-07 | Media | **Chat:** la foto se veía rota mientras se enviaba (se liberaba la vista previa antes de tiempo); se podía adjuntar cualquier archivo. | Corregido | UI-H04, UI-H05, FUN-H01 |
| U-08 | Baja | Los **códigos de pase** se generaban con `Math.random` (predecibles); se podían emitir sin nombre de visitante o sin residente. | Corregido: `crypto.getRandomValues` y validación | UI-X01, UI-X02 |
| U-09 | Baja | Se aceptaban **precios negativos**, máximos de horas fuera de rango, cuotas negativas y cargos con monto negativo. | Corregido en pantalla y en la BD | UI-A02, UI-M06, SEG-I30 |
| U-10 | Baja | **Notificaciones:** marcar como leída o eliminar no actualizaba la lista si Realtime no llegaba. | Corregido: actualización inmediata | UI-B02, UI-B03 |
| U-11 | Baja | **Comunicados:** si publicar fallaba, el formulario se cerraba y se perdía lo escrito. | Corregido | UI-N03 |
| U-12 | Baja | Los montos aparecían con **dos formatos** ("$50.00" y "$50,00"). | Corregido: `formatUSD` | UNI-F01, UI-E01 |
| U-13 | Baja | La emisión masiva de alícuotas no informaba cuántas se omitían por estar repetidas. | Corregido | UI-M04 |
| U-14 | Baja | Quedaban botones en MAYÚSCULAS, "Close" en inglés en los diálogos y formatos colombianos (+57, "C.C."). | Corregido | — |

## 4. Matriz de casos

| Grupo | Archivo | Casos |
|---|---|---|
| Confidencialidad (quién puede leer qué) | `tests/db/confidentiality.test.ts` | 34 |
| Integridad y escalada de privilegios | `tests/db/integrity.test.ts` | 45 |
| Reservas sin cruces de horario | `tests/db/reservations.test.ts` | 20 |
| QR, pases, bitácora y archivos | `tests/db/access-and-storage.test.ts` | 16 |
| Revisión estructural del esquema | `tests/db/schema.test.ts` | 8 |
| Lógica pura (roles, garita, comprobantes, color, montos) | `src/lib/logic.test.ts` | 29 |
| Servicios (alta de residentes, roles, directorio) | `src/lib/services.test.ts` | 11 |
| Flujos (subida de comprobantes, marca, notificaciones) | `src/lib/flows.test.tsx` | 9 |
| Rutas protegidas y sesión | `src/lib/auth.test.tsx` | 7 |
| Pantalla de acceso | `src/pages/Auth.test.tsx` | 5 |
| Menú por rol y componentes | `src/components/components.test.tsx` | 10 |
| Calendario de disponibilidad y campana | `src/components/widgets.test.tsx` | 7 |
| Pantallas: alícuotas y pagos del residente | `src/pages/residentPayments.test.tsx` | 10 |
| Pantallas: reservas, solicitudes, comunicados, chat, perfil, QR e inicio | `src/pages/residentCommunity.test.tsx` | 23 |
| Pantallas: resumen, verificación de alícuotas y cobranza | `src/pages/admin/adminFinance.test.tsx` | 11 |
| Pantallas: reservas, solicitudes, áreas, residentes, pases, garita, marca y reporte | `src/pages/admin/adminOperations.test.tsx` | 21 |
| Pantallas: entrada, tipos de departamento, roles, logo, foto en chat, perfil | `src/pages/remainingFlows.test.tsx` | 12 |
| Seguridad de Edge Functions (correo y alta de residentes) | `supabase/functions/_shared/security.test.ts` | 24 |
| **Total** | | **302** |

Prefijos de los identificadores: `SEG` seguridad de datos, `FUN` regla funcional, `UNI` unidad, `FRO` interfaz,
`FLU` flujo con servicios simulados, `UI` pantalla completa, `EDGE` Edge Functions. Cada historia de usuario
indica qué casos la verifican.

Cobertura de los módulos críticos: `roles.ts`, `accessControl.ts`, `profileDirectory.ts`, `utils.ts` y
`_shared/security.ts` al 100 %; `adminUsers.ts` al 96 %; `Sidebar.tsx` al 98 %.

## 5. Limitaciones

- **Base real.** El proyecto anterior (`taofpvayosiltmqnzomf`) no pertenece a la cuenta de Supabase del autor
  y no tenía aplicadas la migración de comprobantes ni la de seguridad. El 7 de noviembre de 2026 se creó un
  proyecto nuevo, `isdhzlughnyqhobzwarl` (organización "Gissels 2", us-east-1), y se construyó desde cero con
  la migración única y los datos iniciales. La app apunta a él. Las pruebas en PGlite usan los mismos archivos.
- **Prueba de humo en la base real** (`tests/db/smoke-real.sql`): suplanta a dos residentes, uno suspendido
  y la administración, igual que PostgREST, y comprueba 23 reglas. Pasan las 23. Todo ocurre en un bloque que
  se revierte, así que no quedan datos de prueba.
- No hay prueba de las pantallas con sesión iniciada contra la base real: requiere cuentas creadas por el
  autor. Las pantallas se probaron con un Supabase simulado.
- Las Edge Functions no se ejecutaron en Deno. Su lógica de seguridad se separó en `_shared/security.ts`
  y se probó al 100 %.
- Los límites de tamaño y tipo de archivo de los buckets se verifican como configuración. Quien los aplica
  es la API de Storage de Supabase, que no se simuló.
- Las pruebas de interfaz corren en jsdom: verifican comportamiento, no el aspecto visual. La cámara de la
  garita y el calendario se probaron con un lector QR simulado y la fecha fijada.

## 6. Estado de Supabase

**Una sola migración.** Las 19 migraciones anteriores estaban duplicadas, se contradecían y no se podían
ejecutar en orden (F-05). Se unificaron en `supabase/migrations/20261107120000_esquema_inicial.sql`, y los
datos iniciales pasaron a `supabase/seed.sql`. Las antiguas quedan archivadas en `supabase/migrations_legacy/`;
de ellas, `20261107000000_security_hardening.sql` sirve para actualizar una base creada con el esquema viejo.

Ya hecho en el proyecto `isdhzlughnyqhobzwarl`:

- Base recreada desde cero con `npx supabase db reset --linked`: 16 tablas con RLS, 44 políticas de datos,
  8 de storage, 15 funciones, 3 buckets con límites de tamaño y tipo, y realtime en chat y notificaciones.
- Datos iniciales: marca, 4 tipos de departamento, 4 áreas comunes y un comunicado de bienvenida. Sin usuarios.
- Edge Functions `create-resident`, `send-notification`, `kushki-initiate` y `kushki-webhook` desplegadas,
  todas con verificación de JWT. `create-resident` rechaza (401) cualquier llamada sin sesión de administración.
- Inicio de sesión: contraseñas de al menos 8 caracteres, URL del sitio `http://localhost:8080`, sin
  confirmación de correo y **sin registro público** (un registro desde fuera devuelve `signup_disabled`).
  Las cuentas las crea la administración. Está en `supabase/config.toml`.
- Tipos de TypeScript regenerados desde la base real.

Pendiente:

1. Crear las cuentas iniciales: completar `scripts/seed-users.local.json` (ignorado por git) con correos,
   contraseñas y el rol de cada una (`super_admin`, `admin` o `resident`) y ejecutar
   `node --env-file=.env scripts/seed_users.mjs`. El script usa la API de administración y asigna los roles.
2. Probar el alta de residentes desde la app con una sesión de administración: la función rechaza bien a
   quien no lo es, pero el caso exitoso solo se puede comprobar cuando exista esa cuenta.
3. Al publicar la app, cambiar `site_url` en `supabase/config.toml` y aplicar con `npx supabase config push`.

## 7. Riesgos que quedan

- Los comprobantes antiguos tienen URL pública. La URL contiene identificadores aleatorios y ya no se
  pueden listar, pero quien tenga el enlace puede abrirlo. Para cerrarlo del todo: bucket privado y URLs firmadas.
- Todos los residentes ven la ocupación de reservas, incluidas las notas. Se necesita para el calendario
  de disponibilidad, pero las notas no deberían contener datos personales.
- El código de pagos Kushki (`KushkiCheckout`, `lib/payments.ts`, funciones `kushki-*`) no se usa y está
  fuera del alcance del anteproyecto. Conviene eliminarlo o dejarlo documentado. El webhook no verifica la
  firma de Kushki, así que debe seguir con verificación de JWT hasta que la verifique: sin ella, cualquiera
  podría marcar un pago como pagado.
