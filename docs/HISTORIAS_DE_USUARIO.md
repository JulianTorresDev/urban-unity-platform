# Historias de usuario — Gestor Residencial Gissel's 2

Conjunto Habitacional Gissel's 2 (Llano Grande, Quito · 90 viviendas). Cada historia tiene criterios de
aceptación en formato *Dado / Cuando / Entonces* y los casos de prueba automatizados que la verifican.
Los identificadores de prueba se buscan con `npx vitest run -t "<ID>"`.

**Estado al 7 de noviembre de 2026: las 36 historias cumplen sus criterios (302 de 302 pruebas pasan).**

## Roles

| Rol | Quién es | Acceso |
|---|---|---|
| Visitante | Cualquier persona sin sesión | Solo la pantalla de acceso |
| Residente | Copropietario o inquilino de una vivienda | Sus datos, reservas, solicitudes, chat, comunicados y QR |
| Administración | Personal de administración y garita | Gestión completa de la comunidad |
| Superadministrador | Responsable del sistema | Lo anterior, y además asignar roles |

Prioridad (MoSCoW): **Debe** = módulos del anteproyecto · **Debería** = complementarios · **Podría** = mejoras.

---

## 1. Acceso y seguridad

### HU-01 · Iniciar sesión
**Como** residente o administrador **quiero** ingresar con mi correo y contraseña **para** usar el portal.
Prioridad: Debe

1. **Dado** un correo y una contraseña válidos, **cuando** pulso "Continuar", **entonces** entro al inicio de mi rol.
2. **Dado** un correo mal escrito, **cuando** intento ingresar, **entonces** veo "Ingresa un correo electrónico válido" y no se consulta el servidor.
3. **Dado** credenciales incorrectas, **cuando** intento ingresar, **entonces** veo un mensaje que no revela cuál dato falló.
4. **Dado** que ya tengo sesión, **cuando** abro la raíz del sitio, **entonces** voy al inicio; sin sesión, voy a la pantalla de acceso.

Pruebas: FRO-L01 a L04, FRO-A01, FRO-A02, UI-Z01, UI-Z02

### HU-02 · Bloquear cuentas suspendidas
**Como** administración **quiero** que un residente suspendido por morosidad no pueda operar **para** hacer cumplir la suspensión.
Prioridad: Debe

1. **Dado** un residente suspendido, **cuando** inicia sesión, **entonces** se cierra su sesión y ve "Tu acceso está suspendido".
2. **Dado** un residente suspendido, **cuando** llama a la API directamente, **entonces** no puede reservar, escribir en el chat ni subir imágenes.
3. **Dado** un residente suspendido, **cuando** intenta reactivarse a sí mismo, **entonces** la base de datos lo impide.
4. **Dado** un residente suspendido, **cuando** necesita reclamar, **entonces** sí puede abrir una solicitud.
5. **Dado** el QR de un residente suspendido, **cuando** se escanea en la garita, **entonces** se niega el acceso.

Pruebas: FRO-L05, SEG-I07, SEG-I11, SEG-I12, SEG-V08, SEG-A06, UI-Q03, UI-G02

### HU-03 · Ver solo lo que me corresponde
**Como** residente **quiero** que nadie más vea mis pagos, comprobantes, solicitudes ni datos **para** proteger mi privacidad (LOPDP).
Prioridad: Debe

1. **Dado** un residente, **cuando** consulta cualquier tabla privada, **entonces** solo recibe sus propias filas.
2. **Dado** un residente, **cuando** abre una ruta de administración, **entonces** es redirigido a su inicio.
3. **Dado** un visitante sin sesión, **cuando** consulta la API, **entonces** solo puede leer la marca del conjunto.
4. **Dado** un residente, **cuando** quiere ver a otro vecino, **entonces** solo obtiene su nombre y unidad, sin correo, teléfono ni estado.
5. **Dado** la administración, **cuando** consulta, **entonces** ve todos los registros.

Pruebas: SEG-C01 a C11, FRO-A03 a A07, FRO-N01, FRO-N02, UI-N01, UI-U05

### HU-04 · Cerrar sesión
**Como** usuario **quiero** cerrar mi sesión **para** que nadie use mi cuenta en un equipo compartido.
Prioridad: Debe

1. **Dado** que tengo sesión, **cuando** pulso "Cerrar sesión" en el menú, **entonces** la sesión termina.

Pruebas: FRO-N03

---

## 2. Alícuotas y pagos (residente)

### HU-05 · Consultar mi estado de cuenta
**Como** residente **quiero** ver mis alícuotas y su estado **para** saber cuánto debo.
Prioridad: Debe

1. **Dado** mis alícuotas, **cuando** abro "Alícuotas", **entonces** veo el total acumulado, lo pagado, lo pendiente y lo vencido.
2. **Dado** una alícuota pendiente, **cuando** abro el inicio, **entonces** veo "Tienes una alícuota pendiente de pago" y el botón para subir el comprobante.
3. **Dado** un comprobante enviado, **cuando** abro el inicio, **entonces** veo que está en revisión.
4. **Dado** que estoy al día, **cuando** abro el inicio, **entonces** se me ofrece la llave QR.

Pruebas: UI-D01, UI-I01 a I03, SEG-C05, SEG-C06

### HU-06 · Subir el comprobante de una alícuota
**Como** residente **quiero** subir la foto o el PDF de mi transferencia **para** que la administración verifique mi pago.
Prioridad: Debe

1. **Dado** una alícuota pendiente, **cuando** subo una imagen o PDF de hasta 5 MB, **entonces** se guarda en mi carpeta privada y la alícuota queda "en revisión".
2. **Dado** un archivo que no es imagen ni PDF, o de más de 5 MB, **cuando** lo elijo, **entonces** veo el motivo y no se envía.
3. **Dado** que la base de datos rechaza el registro, **cuando** subo el comprobante, **entonces** veo el error y no un falso "enviado".
4. **Dado** que subo el comprobante, **cuando** intento marcar mi alícuota como pagada por la API, **entonces** la base de datos lo impide.
5. **Dado** el almacenamiento caído, **cuando** subo el comprobante, **entonces** se guarda una copia optimizada y el flujo continúa.

Pruebas: UI-D02 a D05, FLU-C01, FLU-C02, FLU-C04, FLU-C05, UNI-C01 a C03, SEG-I01 a I04, SEG-A01 a A03

### HU-07 · Pagar cargos extra
**Como** residente **quiero** ver mis multas y servicios adicionales y subir su comprobante **para** ponerme al día.
Prioridad: Debe

1. **Dado** un cargo pendiente, **cuando** abro "Pagos", **entonces** lo veo con su concepto y monto.
2. **Dado** un cargo, **cuando** subo su comprobante, **entonces** queda en revisión.
3. **Dado** un error al registrar, **cuando** subo el comprobante, **entonces** veo el motivo.

Pruebas: UI-P01 a P03, FLU-C03

### HU-08 · Saber por qué se rechazó mi comprobante
**Como** residente **quiero** conocer el motivo del rechazo **para** corregirlo y volver a enviarlo.
Prioridad: Debe

1. **Dado** un comprobante rechazado, **cuando** la administración lo rechaza, **entonces** se quita el comprobante, se guarda el motivo y recibo una notificación.
2. **Dado** un rechazo, **cuando** abro "Alícuotas", **entonces** veo el motivo y puedo subir uno nuevo.
3. **Dado** que reenvío, **cuando** se guarda el nuevo comprobante, **entonces** se limpia el motivo anterior.

Pruebas: UI-D06, UI-O03, UI-M02, UI-C02, FLU-C01, FLU-C03

### HU-09 · Copiar los datos de la transferencia
**Como** residente **quiero** copiar el número de cuenta **para** transferir sin errores.
Prioridad: Debería

1. **Dado** los datos bancarios, **cuando** pulso "Copiar número de cuenta", **entonces** el número queda en el portapapeles.

Pruebas: UI-D07

---

## 3. Reservas de áreas comunes

### HU-10 · Reservar un área sin cruces de horario
**Como** residente **quiero** reservar el salón social u otra área **para** organizar un evento.
Prioridad: Debe

1. **Dado** un turno libre, **cuando** envío la solicitud, **entonces** se crea una reserva *pendiente* y el sistema calcula el precio.
2. **Dado** un turno ocupado, pasado o fuera del horario del área, **cuando** lo veo en el calendario, **entonces** no lo puedo elegir.
3. **Dado** que dos residentes piden el mismo horario a la vez, **cuando** se guardan, **entonces** solo una reserva prospera.
4. **Dado** una reserva más larga que el máximo del área, en el pasado o que cruza la medianoche, **cuando** la envío, **entonces** se rechaza con el motivo.
5. **Dado** un residente, **cuando** intenta crearse una reserva ya confirmada o con precio 0, **entonces** queda pendiente y con el precio real.

Pruebas: UI-V01 a V03, UI-K01 a K04, FUN-V01, FUN-V03 a V07, SEG-V02, SEG-V09

### HU-11 · Cancelar mi reserva
**Como** residente **quiero** cancelar una reserva que ya no necesito **para** liberar el horario a otros vecinos.
Prioridad: Debe

1. **Dado** una reserva vigente mía, **cuando** la cancelo y confirmo, **entonces** queda cancelada y el horario se libera.
2. **Dado** la reserva de otro residente, **cuando** intento cancelarla, **entonces** no se modifica.
3. **Dado** una reserva mía, **cuando** intento confirmarla o moverla de horario, **entonces** la base de datos lo impide.

Pruebas: UI-V04, FUN-V06, FUN-V15, SEG-V10 a V12

### HU-12 · Saber si mi reserva fue aprobada
**Como** residente **quiero** enterarme de la decisión de la administración **para** planificar mi evento.
Prioridad: Debería

1. **Dado** una reserva aprobada, **cuando** la administración la autoriza, **entonces** recibo "Reserva confirmada".
2. **Dado** una reserva rechazada, **cuando** la administración la rechaza con motivo, **entonces** recibo "Reserva rechazada" con el motivo y la veo como *Rechazada*, no como *Cancelada*.

Pruebas: UI-R01, UI-R02, UI-B01

---

## 4. Solicitudes de mantenimiento (PQR)

### HU-13 · Reportar una solicitud
**Como** residente **quiero** reportar un daño, una queja o una sugerencia **para** que la administración la atienda.
Prioridad: Debe

1. **Dado** el formulario completo, **cuando** pulso "Enviar solicitud", **entonces** se crea abierta con mi asunto, descripción y categoría.
2. **Dado** el formulario vacío, **cuando** intento enviarlo, **entonces** no se envía.
3. **Dado** un residente, **cuando** intenta crear una solicitud ya "resuelta" o con respuesta oficial, **entonces** se guarda como abierta y sin respuesta.

Pruebas: UI-T02, UI-T03, SEG-I23, SEG-I24

### HU-14 · Ver la respuesta de la administración
**Como** residente **quiero** ver el estado y la respuesta de mi solicitud **para** saber si se resolvió.
Prioridad: Debe

1. **Dado** una solicitud respondida, **cuando** abro "Solicitudes", **entonces** veo su estado (Abierta, En progreso, Resuelta, Cerrada) y la respuesta.
2. **Dado** que la administración responde, **cuando** guarda la respuesta, **entonces** recibo una notificación.

Pruebas: UI-T01, UI-S01

---

## 5. Comunicación

### HU-15 · Leer los comunicados oficiales
**Como** residente **quiero** leer los avisos de la administración **para** estar informado.
Prioridad: Debe

1. **Dado** comunicados publicados, **cuando** abro "Comunicados", **entonces** los leo sin opciones para editarlos.

Pruebas: UI-N01, SEG-C08

### HU-16 · Conversar con los vecinos
**Como** residente **quiero** un chat comunitario **para** coordinar con mis vecinos.
Prioridad: Debería

1. **Dado** mensajes de otros vecinos, **cuando** abro el chat, **entonces** veo su nombre y unidad.
2. **Dado** un mensaje de hasta 2000 caracteres, **cuando** lo envío, **entonces** se publica a mi nombre. Una foto puede ir sin texto.
3. **Dado** un envío fallido, **cuando** ocurre el error, **entonces** el mensaje se retira y veo el aviso.
4. **Dado** una foto, **cuando** la adjunto, **entonces** se sube a mi carpeta. Otros archivos se rechazan.
5. **Dado** un residente, **cuando** intenta escribir a nombre de otro o borrar mensajes ajenos, **entonces** la base de datos lo impide.

Pruebas: UI-H01 a H05, FUN-H01, SEG-C09, SEG-C10, SEG-I27 a I29, FRO-U09 a U11

### HU-17 · Recibir notificaciones
**Como** residente **quiero** una campana con mis avisos **para** enterarme de pagos, reservas y respuestas.
Prioridad: Debería

1. **Dado** avisos sin leer, **cuando** abro el portal, **entonces** la campana muestra cuántos hay.
2. **Dado** la lista, **cuando** pulso "Marcar todas", **entonces** el contador queda en cero al instante.
3. **Dado** un aviso, **cuando** lo elimino, **entonces** desaparece de la lista.
4. **Dado** un residente, **cuando** intenta enviar notificaciones a otros, **entonces** la base de datos lo impide.

Pruebas: UI-B01 a B03, FLU-N01, SEG-I25, SEG-I26

---

## 6. Acceso con QR

### HU-18 · Tener mi llave digital
**Como** residente **quiero** un código QR personal **para** entrar por la garita sin tarjeta.
Prioridad: Debería

1. **Dado** un residente nuevo, **cuando** se crea su cuenta, **entonces** recibe automáticamente un token QR permanente, único y aleatorio.
2. **Dado** mi token, **cuando** abro "Acceso QR", **entonces** veo el código; sin token, veo "Sin código asignado".
3. **Dado** un residente, **cuando** intenta crear o cambiar su token por la API, **entonces** la base de datos lo impide.

Pruebas: UI-Q01 a Q03, FUN-Q01 a Q03, SEG-Q04, SEG-I18, SEG-I19

### HU-19 · Ver mis pases y mi historial de ingresos
**Como** residente **quiero** ver los pases emitidos a mi nombre y sus ingresos **para** controlar quién entra a mi vivienda.
Prioridad: Podría

1. **Dado** pases y registros, **cuando** abro "Mis accesos", **entonces** veo mis pases y la bitácora; los de otros residentes no.

Pruebas: UI-Q04, SEG-Q08

### HU-20 · Mantener mis datos de contacto
**Como** residente **quiero** actualizar mi nombre y teléfono **para** que la garita me ubique.
Prioridad: Debería

1. **Dado** mi perfil, **cuando** guardo nombre y teléfono, **entonces** se actualizan.
2. **Dado** el campo de departamento, **cuando** abro el perfil, **entonces** lo veo pero no lo puedo editar (lo asigna la administración).
3. **Dado** el nombre vacío, **cuando** intento guardar, **entonces** el campo se marca inválido y no se guarda.

Pruebas: UI-F01 a F03, SEG-I08, SEG-I09

---

## 7. Administración

### HU-21 · Ver el resumen de la comunidad
**Como** administración **quiero** métricas y una cola de comprobantes por revisar **para** priorizar mi trabajo.
Prioridad: Debe

1. **Dado** comprobantes enviados, **cuando** abro el resumen, **entonces** veo solo los que faltan por revisar.
2. **Dado** un comprobante, **cuando** lo apruebo o rechazo desde la cola, **entonces** se actualiza la alícuota y se notifica al residente.
3. **Dado** un error al aprobar, **cuando** ocurre, **entonces** no se notifica al residente.

Pruebas: UI-O01 a O04

### HU-22 · Verificar las alícuotas del mes
**Como** administración **quiero** aprobar, rechazar o reabrir alícuotas **para** mantener la cartera al día.
Prioridad: Debe

1. **Dado** un comprobante, **cuando** lo apruebo, **entonces** la alícuota queda pagada con su fecha.
2. **Dado** un comprobante inválido, **cuando** lo rechazo, **entonces** sale de la cola con su motivo.
3. **Dado** una alícuota pagada por error, **cuando** la reabro, **entonces** vuelve a pendiente.

Pruebas: UI-M01 a M03, SEG-I05

### HU-23 · Emitir las alícuotas del mes
**Como** administración **quiero** generar en un paso las alícuotas de todos los residentes **para** no crearlas una por una.
Prioridad: Debe

1. **Dado** residentes con tipo de departamento, **cuando** emito el mes, **entonces** cada uno recibe una alícuota con la cuota de su tipo.
2. **Dado** alícuotas ya emitidas ese mes, **cuando** emito otra vez, **entonces** se omiten y se informa cuántas.

Pruebas: UI-M04

### HU-24 · Definir tipos de departamento y cuotas
**Como** administración **quiero** registrar cuotas por tipo de vivienda **para** cobrar lo que corresponde a cada una.
Prioridad: Debe

1. **Dado** un nombre y una cuota, **cuando** guardo el tipo, **entonces** queda disponible para emitir alícuotas.
2. **Dado** una cuota negativa, **cuando** intento guardarla, **entonces** se rechaza en la pantalla y en la base de datos.

Pruebas: UI-M05, UI-M06, SEG-I30

### HU-25 · Registrar cargos y verificar sus pagos
**Como** administración **quiero** registrar multas o servicios y verificar sus comprobantes **para** cobrarlos.
Prioridad: Debe

1. **Dado** un formulario incompleto, **cuando** intento crear el cargo, **entonces** no se envía.
2. **Dado** un comprobante de cargo, **cuando** lo apruebo o rechazo, **entonces** se actualiza y se notifica al residente.
3. **Dado** un monto negativo, **cuando** se intenta guardar, **entonces** la base de datos lo rechaza.

Pruebas: UI-C01 a C03, SEG-I30

### HU-26 · Aprobar o rechazar reservas
**Como** administración **quiero** decidir sobre las reservas pendientes **para** controlar el uso de las áreas.
Prioridad: Debe

1. **Dado** una reserva pendiente, **cuando** la autorizo, **entonces** queda confirmada y se notifica al residente.
2. **Dado** una reserva, **cuando** la rechazo con motivo, **entonces** queda *rechazada* y el residente recibe el motivo.
3. **Dado** que aprobarla crearía un cruce de horario, **cuando** la autorizo, **entonces** se rechaza con el motivo.

Pruebas: UI-R01 a R03, FUN-V13, FUN-V14, FUN-V16

### HU-27 · Configurar áreas y tarifas
**Como** administración **quiero** definir precio y máximo de horas de cada área **para** aplicar el reglamento.
Prioridad: Debe

1. **Dado** valores válidos, **cuando** guardo, **entonces** se actualiza la tarifa.
2. **Dado** un precio negativo o un máximo fuera de 1 a 24 horas, **cuando** guardo, **entonces** se rechaza.

Pruebas: UI-A01, UI-A02, SEG-I30

### HU-28 · Atender solicitudes
**Como** administración **quiero** cambiar el estado de una solicitud y responder **para** resolver los problemas de los residentes.
Prioridad: Debe

1. **Dado** una solicitud, **cuando** guardo un estado y una respuesta, **entonces** se actualiza y se notifica al residente.

Pruebas: UI-S01

### HU-29 · Publicar comunicados
**Como** administración **quiero** publicar, editar y eliminar comunicados **para** informar a la comunidad.
Prioridad: Debe

1. **Dado** un título y un contenido, **cuando** publico, **entonces** el comunicado queda con mi autoría.
2. **Dado** un error al publicar, **cuando** ocurre, **entonces** el formulario sigue abierto con lo escrito.
3. **Dado** un comunicado, **cuando** lo elimino y confirmo, **entonces** desaparece.
4. **Dado** un residente, **cuando** intenta publicar por la API, **entonces** la base de datos lo impide.

Pruebas: UI-N02 a N04, SEG-I20, SEG-I21

### HU-30 · Registrar y suspender residentes
**Como** administración **quiero** dar de alta residentes y suspenderlos por morosidad **para** mantener el padrón.
Prioridad: Debe

1. **Dado** los datos del residente, **cuando** lo registro, **entonces** se crea su cuenta con su unidad y mi sesión sigue activa.
2. **Dado** un correo ya registrado o una contraseña de menos de 8 caracteres, **cuando** intento registrar, **entonces** veo el motivo.
3. **Dado** un residente, **cuando** lo suspendo, **entonces** su estado cambia a bloqueado.
4. **Dado** mi propia cuenta, **cuando** veo el padrón, **entonces** no puedo suspenderme.

Pruebas: UI-U01 a U03, FRO-U01 a U06, SEG-I10

### HU-31 · Asignar roles
**Como** superadministrador **quiero** promover o degradar administradores **para** delegar la gestión.
Prioridad: Debe

1. **Dado** un residente, **cuando** lo promuevo, **entonces** queda con un único rol de administrador.
2. **Dado** un administrador común, **cuando** abre el padrón, **entonces** no ve el selector de roles y no puede otorgar ni quitar el rol de superadministrador.
3. **Dado** cualquier usuario, **cuando** intenta cambiar su propio rol, **entonces** la base de datos lo impide.

Pruebas: UI-U04 a U06, FRO-U07, FRO-U08, FUN-R01, FUN-R02, SEG-I13 a I17, UNI-R01 a R05

### HU-32 · Emitir pases para visitantes
**Como** administración **quiero** generar pases temporales y registrar entradas y salidas **para** controlar quién ingresa.
Prioridad: Debería

1. **Dado** un visitante sin nombre, **cuando** intento emitir el pase, **entonces** el botón está deshabilitado.
2. **Dado** un visitante, **cuando** emito el pase, **entonces** recibe un código aleatorio con vigencia de 24 horas.
3. **Dado** un pase vigente, **cuando** registro la entrada, **entonces** queda en la bitácora.
4. **Dado** un pase vencido, **cuando** se valida, **entonces** se rechaza.

Pruebas: UI-X01 a X04, FUN-Q07, SEG-Q09

### HU-33 · Validar QR en la garita
**Como** guardia **quiero** escanear el QR del residente **para** decidir si abro la talanquera.
Prioridad: Debería

1. **Dado** un residente al día, **cuando** escaneo su QR, **entonces** veo "Acceso autorizado" con su nombre y unidad.
2. **Dado** un residente suspendido, un pase vencido o un código desconocido, **cuando** lo escaneo, **entonces** se niega el acceso con el motivo.
3. **Dado** un residente, **cuando** intenta validar tokens ajenos, **entonces** no obtiene resultados.

Pruebas: UI-G01 a G04, UNI-Q01 a Q07, FUN-Q05, SEG-Q06

### HU-34 · Personalizar la marca del conjunto
**Como** administración **quiero** cambiar el nombre, el logotipo y el color **para** que el portal represente al conjunto.
Prioridad: Podría

1. **Dado** un nombre, **cuando** guardo, **entonces** se aplica en todos los dispositivos.
2. **Dado** el nombre vacío, **cuando** intento guardar, **entonces** se rechaza.
3. **Dado** un logo de imagen de hasta 3 MB, **cuando** lo subo, **entonces** se guarda; otros archivos se rechazan.
4. **Dado** un color que no es hexadecimal, **cuando** se intenta guardar, **entonces** la base de datos lo rechaza y la interfaz usa el azul por defecto.

Pruebas: UI-W01 a W04, FLU-T01 a T03, SEG-I22, UNI-T01, UNI-T02

### HU-35 · Revisar el reporte de reservas
**Como** administración **quiero** ver la ocupación y la recaudación por áreas **para** rendir cuentas en la asamblea.
Prioridad: Debe

1. **Dado** reservas del periodo, **cuando** abro el reporte, **entonces** veo el total de solicitudes, lo recaudado (solo confirmadas) y las pendientes.

Pruebas: UI-E01, UNI-F01

### HU-36 · Proteger la plataforma (historia técnica)
**Como** responsable del sistema **quiero** que la seguridad no dependa de la interfaz **para** que nadie la evite llamando a la API.
Prioridad: Debe

1. Todas las tablas tienen RLS, ninguna queda sin políticas y ninguna política de escritura está abierta a usuarios anónimos.
2. Las funciones privilegiadas fijan `search_path` y no son ejecutables sin sesión.
3. Los archivos limitan tamaño y tipo; los comprobantes solo los ven su dueño y la administración.
4. La función de correo exige sesión de administrador y escapa todo el contenido.
5. La migración de endurecimiento se puede ejecutar varias veces.

Pruebas: SEG-E01 a E07, SEG-A04, SEG-A05, SEG-A07, EDGE-01 a EDGE-10

---

## Matriz de trazabilidad

| Historia | Módulo | Prioridad | Resultado |
|---|---|---|---|
| HU-01 | Acceso | Debe | ✅ |
| HU-02 | Acceso | Debe | ✅ |
| HU-03 | Acceso | Debe | ✅ |
| HU-04 | Acceso | Debe | ✅ |
| HU-05 | Alícuotas | Debe | ✅ |
| HU-06 | Alícuotas | Debe | ✅ |
| HU-07 | Pagos | Debe | ✅ |
| HU-08 | Alícuotas | Debe | ✅ |
| HU-09 | Alícuotas | Debería | ✅ |
| HU-10 | Reservas | Debe | ✅ |
| HU-11 | Reservas | Debe | ✅ |
| HU-12 | Reservas | Debería | ✅ |
| HU-13 | Solicitudes | Debe | ✅ |
| HU-14 | Solicitudes | Debe | ✅ |
| HU-15 | Comunicados | Debe | ✅ |
| HU-16 | Chat | Debería | ✅ |
| HU-17 | Notificaciones | Debería | ✅ |
| HU-18 | Acceso QR | Debería | ✅ |
| HU-19 | Acceso QR | Podría | ✅ |
| HU-20 | Perfil | Debería | ✅ |
| HU-21 | Administración | Debe | ✅ |
| HU-22 | Alícuotas | Debe | ✅ |
| HU-23 | Alícuotas | Debe | ✅ |
| HU-24 | Alícuotas | Debe | ✅ |
| HU-25 | Pagos | Debe | ✅ |
| HU-26 | Reservas | Debe | ✅ |
| HU-27 | Reservas | Debe | ✅ |
| HU-28 | Solicitudes | Debe | ✅ |
| HU-29 | Comunicados | Debe | ✅ |
| HU-30 | Residentes | Debe | ✅ |
| HU-31 | Roles | Debe | ✅ |
| HU-32 | Acceso QR | Debería | ✅ |
| HU-33 | Acceso QR | Debería | ✅ |
| HU-34 | Marca | Podría | ✅ |
| HU-35 | Reportes | Debe | ✅ |
| HU-36 | Seguridad | Debe | ✅ |
