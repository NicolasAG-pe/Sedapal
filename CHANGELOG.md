# Historial de versiones

Este archivo registra cambios publicados y comprobados. Para futuras versiones, añadir una entrada nueva arriba con su fecha y cambios relevantes, sin repetir los manuales.

## En desarrollo — verificación de correo

### 21 de octubre de 2026 — avance 17: sesión Android cifrada y validada

- Reproducida pérdida de sesión y UUID OTP al terminar el proceso Android.
  JWT ahora solo en memoria web y cifrado con AES-GCM/Android Keystore en
  Android, fuera de backups; sin contraseña persistida ni dependencias nuevas.
- Restauración única mediante ruta aditiva `/api/auth/session`, antes de mostrar
  datos privados o conectar Socket.IO. Conserva TTL de ocho horas y cuentas
  históricas; 401/403 retiran credencial, errores temporales permiten reintentar.
  Logout espera borrado seguro y cancela datos/peticiones de la identidad anterior.
- Bridge sin logging también en debug; pruebas de carreras de sesión, API/SQL,
  cifrado instrumental y ciclo de vida de WebView real. Informe de resultados y
  límites en `docs/pruebas/android-sesion-persistente.md`. OTP durable y ubicación
  continúan en incrementos separados; sin despliegue ni distribución.

### 21 de octubre de 2026 — avance 16: compilar y validar Android 1.1.0 nativo

- APK release 1.1.0/código 3 compilada localmente con runtime recién generado,
  Java 21 y firma permanente verificada contra la APK oficial 1.0.0/código 2.
  ApplicationId, certificado, diseño, permisos y API HTTPS conservados; sin publicar.
- AVD Android 15 independiente: actualización mediante install -r sin desinstalar,
  dos fases instrumentales aprobadas, localStorage del tutorial/marcador conservado,
  misma identidad interna y primera instalación. Nueva prueba instrumental opt-in.
- Segundo AVD y APK debug con API/PostgreSQL aislados y Resend simulado: registro,
  cola/OTP/reenvío/vencimiento, desconexión, login, perfil, teclado, Atrás, rotación,
  Socket.IO, recibos/pago, cortes/notificaciones y PDF guardado y abierto en visor real.
  Photo Picker y denegación de ubicación probados; obtención de posición con
  permiso concedido quedó sin aprobar por timeout del AVD, documentada para seguimiento.
  Reapertura de proceso conserva tutorial y exige login; el UUID OTP en
  sessionStorage se pierde, con solicitud SQL intacta. Persistencia durable pendiente.
- Corregido CRC del PNG sintético del E2E; sin cambios de lógica de negocio.
  Regresión Node: 113 aprobadas/una omisión condicional, sin fallos. E2E Chromium
  repetido: 25 comprobaciones, cero errores JS/recursos fallidos. Java: cuatro
  pruebas por variante; lint sin errores, con avisos previos. Prueba instrumental
  existente de paquete ejecutada en Android, además de las dos fases de actualización.
- Informe `docs/pruebas/android-1.1.0-nativo.md` y guías Android actualizados con
  checksums, evidencia, resultados nativos separados de Chromium y requisitos
  pendientes. Sin APK versionada, Release, correo real, despliegue, merge,
  cambios de Neon/Kubernetes ni cambios de servicios Docker existentes.

### 21 de octubre de 2026 — avance 15: preparar candidato Android 1.1.0

- Gradle propone versionName 1.1.0 / versionCode 3 frente a la release 1.0.0/2;
  conserva applicationId, namespace y certificado público permanente. Sin cambiar
  SDK, permisos, Capacitor, claves privadas ni artefactos ya publicados.
- Tres pruebas estáticas/de empaquetado comprueban incremento, identidad, firma
  pública, configuración Capacitor HTTPS y runtime OTP limpio sin código Admin.
  No equivalen a compilar, firmar, instalar ni ejecutar Android nativo.
- Documentación Android/release y plan coordinado actualizados; sin APK generada,
  tag, distribución, despliegue, correo real ni cambio en main/servicios/datos.

### 21 de octubre de 2026 — avance 15: transición del contrato Android y recuperación

- H01 reproducido con HTML/JS v1.0.0, PostgreSQL aislado y proveedor simulado:
  202 mostrado como error, solicitud sin pantalla OTP; login previo conservado.
- Rutas OTP específicas y cabecera de contrato; APK antigua recibe 426 legible
  antes de escribir. Preflight y ausencia de fallback impiden registrar sin OTP
  contra API antigua, incluso si cambia entre la consulta y el POST. Login intacto.
- UUID criptográfico persistido antes de enviar y registro idempotente con locks;
  respuesta perdida se recupera por estado, sin duplicar evento, hash o cuota.
  Recuperación de reenvío/confirmación, caducidad, intentos y desconexiones.
- CORS admite la nueva cabecera solo en orígenes autorizados. Timeout y limpieza
  de peticiones públicas, sin logout por errores OTP/red ni reintentos automáticos.
- Backend Node 20/22: TAP 66, 65 OK, una omisión condicional H02; tres contenedores
  de subpruebas incluidos. Transición/sesión: 18 pruebas; cinco perfiles emulados.
  Chromium cliente/admin: 25 comprobaciones; configuración/PDF/firma/Perfil OK.
- Plan Android/API/trabajador y límites documentados. Sin migración nueva,
  cambios de negocio, servicios, Neon, correos reales, APK ni merge. Candidato
  1.1.0/código 3 propuesto; preparación nativa en el siguiente incremento.

### 18 de octubre de 2026 — avance 14: integrar correo mediante Transactional Outbox

- H03 corregido en desarrollo: registro/reenvío confirman solicitud, reserva y
  evento cifrado en una transacción; la API ya no envía correos. El trabajador
  independiente solo procesa eventos confirmados, sin activación automática.
- OTP de seis dígitos, cinco minutos desde el primer claim confirmado, plazos
  obtenidos de PostgreSQL y presupuesto monótono; cola demorada no agota vigencia.
  Cancelación al sustituir/consumir, clave AES exclusiva y eliminación de payload
  terminal. Reintentos conservan cuerpo/identidad/vencimiento y máximo cinco intentos.
- HTTP 202 significa encolado; consulta privada de estado y cliente actualizado
  distinguen en cola/aceptado/errores sin prometer entrega. Retención protege
  trabajos activos y admite las FKs esperadas de 006; sin cambios en pagos/recibos.
- Node 20.19.2 y Node 22.23.3: TAP 61, 60 OK y una omisión condicional H02;
  incluye dos contenedores de subpruebas. Outbox: 19 escenarios PostgreSQL/API
  independientes; variante H02 legacy: 12 OK y una omisión del esquema alternativo.
  Casos de COMMIT fallido, dos procesos, SIGKILL/reinicio, SIGTERM durante HTTP,
  ambigüedad, reenvío intercalado, privacidad y rol sin acceso a negocio aprobados.
- Esquema/API/retención/CLI y simulación terminal aprobados. Configuración 13,
  documentos 4, firma 7 y Perfil 3 pruebas OK. Chromium: 25 comprobaciones, sin
  errores JS ni recursos fallidos. Runtimes web/Android temporales: 15 archivos
  cada uno, sin secretos ni código administrativo; no APK compilada.
- Migración 006 preparada y validada solo en bases nuevas: conserva datos previos,
  es repetible y revierte por timeout sin estado parcial. Guías de registro,
  auditoría, outbox, retención, permisos, habilitación y recuperación actualizadas.
- Pendientes: autorización/configuración productiva, dominio, monitoreo y H01
  (APK v1.0.0). No se promete entrega exactamente una vez ni recepción SMTP.
  Sin correos reales, Neon, despliegues, workers/cron productivos, APK ni merge.

### 18 de octubre de 2026 — avance 14, base transaccional de correo

- H03 reproducido antes de cambiar el registro: aceptación simulada seguida de
  fallo previo al commit deja cero solicitudes y el reintento usa otra identidad.
- Migración 006 aditiva y manual; cola cifrada AES-256-GCM con clave exclusiva,
  trabajador independiente desactivado por defecto, leases recuperables,
  idempotencia estable, backoff, cinco intentos y plazos de envío acotados.
- Fundación comprobada: 26 pruebas de correo/outbox aprobadas en Node 20;
  16 pruebas focalizadas de outbox/adaptador aprobadas en Node 22, con ocho
  escenarios PostgreSQL en bases nuevas y proveedor simulado. No correos reales.
- Este primer incremento prepara los componentes; la integración del registro,
  cliente y retención se completa en el siguiente incremento del avance 14.
  H03 todavía no se declara corregido en el flujo HTTP en este punto.

### 18 de octubre de 2026 — avance 13: corregir integridad concurrente de recibos y pagos

- H02 reproducido antes de corregir: dos altas 201/201, edición que deja recibo
  de S/ 20 con pago de S/ 10 y anulación/edición aceptadas después de pagar.
- Servicio transaccional para las cuatro escrituras: suministro y después recibo,
  relectura de pagos tras el lock, monto del servidor y verificación de propiedad.
  Conflictos 409 sanitizados, tiempos acotados, rollback y liberación de conexión.
- UNIQUE suministro/periodo y pago/recibo en bases nuevas. Migración 005 manual
  con preflight, rechazo de históricos inconsistentes y validación de drift;
  sin reconciliación automática ni cambios en bases existentes.
- H02: 21 pruebas aprobadas y una condicional omitida en Node 20 y Node 22;
  variante de esquema anterior: 12 aprobadas y una condicional omitida. Incluyen
  dos procesos, permisos, carga mixta, timeout, rollback, pool liberado, cero
  deadlocks observados y conservación de tablas/FKs/secuencias en migración.
- Regresiones de configuración, correo, esquema/API, retención/CLI, documentos,
  firma y Perfil aprobadas; Chromium cliente/admin: 25 comprobaciones sin
  errores JS ni recursos fallidos. Guías y seguimiento de auditoría actualizados.
- Sin Neon, despliegues, correos reales, cambios APK, borrado de históricos o merge.

### 18 de octubre de 2026 — avance 12: auditoría de preparación para producción

- Informe `docs/auditoria-produccion.md` con alcance, evidencias, 7 hallazgos altos,
  9 medios y 2 bajos, plan correctivo, transición Android/backend, checklist de
  despliegue y recuperación. Dictamen: nueva versión no lista para producción.
- Reproducidos en bases sintéticas nuevas: recibos duplicados concurrentes,
  anulación intercalada con pago y envío simulado aceptado sin commit persistido.
  Comprobados rechazo del contrato 202 por cliente v1.0.0, cabeceras CORS,
  bloqueo controlado de 003 y conservación de tablas previas con 003/004 repetidas.
- Regresiones aprobadas: configuración, correo, esquema/API, retención/CLI,
  documentos, firma y Perfil; harness Chromium con 25 comprobaciones, cero
  errores JS y recursos fallidos; runtimes cliente de 15 archivos por destino.
  Consultas npm sin avisos conocidos; límites de la evidencia detallados.
- Solo documentación: sin correcciones funcionales, correos reales, migraciones
  Neon, limpieza de bases existentes, programación, despliegues, APK ni merge.

### 18 de octubre de 2026 — comando de mantenimiento preparado

- Comando de un solo lote con simulación predeterminada y aplicación explícita;
  exige conexión privada exclusiva y nombre de base esperado, sin reutilizar
  `DATABASE_URL`, leer `.env` ni cargar la API o las credenciales de correo.
- Opciones estrictas, TLS verificado en conexiones externas, tiempos de espera
  acotados y salida de conteos sin datos personales ni errores SQL privados.
- Unitarias de correo/configuración y tres grupos CLI en PostgreSQL aislado
  aprobados: simulación, destino erróneo, cascada, idempotencia, dos procesos
  simultáneos, manejo de errores y privacidad de stdout/stderr.
- Procedimiento y contrato de salida listos para un planificador futuro; ninguno
  activado. Sin limpiezas de bases existentes ni cambios en infraestructura/APK.

### 18 de octubre de 2026 — retención segura de solicitudes de correo

- Núcleo de mantenimiento con simulación de solo lectura por defecto y retención
  mínima de 24 horas después de vencer la solicitud; conserva OTP vigentes y
  cualquier historial necesario para límites de envío.
- Lotes acotados, exclusión entre tareas, filas bloqueadas omitidas y revalidación
  antes del borrado. Solo elimina pendientes antiguos y su historial por cascada;
  dependencias inesperadas cancelan la tarea y los errores revierten el lote.
- Índice de vencimiento en bases nuevas y migración 004 aditiva preparada, sin
  aplicarla a bases existentes. Política y pruebas documentadas; sin programación.
- Unitarias de correo/configuración, esquema/API y seis grupos de retención en
  PostgreSQL aislado aprobados: concurrencia, idempotencia, rollback, límites,
  registros en curso y conservación de tablas de negocio con fixtures sintéticos.

### 18 de octubre de 2026 — prueba real OTP con Resend aprobada

- Verificado el último informe privado: modo `live`, resultado
  `prueba_real_aprobada`, dos envíos aceptados y nueve comprobaciones aprobadas.
- Caducidad de 300 segundos comprobada mediante espera real; códigos incorrecto
  y vencido rechazados sin crear cuenta. Reenvío con nuevo código sin reiniciar
  intentos; confirmación concurrente de consumo único y registro íntegro de
  usuario verificado y suministro, sin duplicados ni huérfanos.
- Login y perfil protegido de la cuenta nueva aprobados; contraseña incorrecta
  rechazada y compatibilidad de login con cuenta previa sintética conservada.
- Informe de pruebas actualizado con resultados y referencia verificable a la
  evidencia local. Validación documental: campos y nueve comprobaciones cotejados
  con el ejecutor, revisión del diff y exclusión de secretos/datos personales.
  No se repitieron correos ni se publicaron archivos de `artifacts/`.

### 18 de octubre de 2026 — preparación de prueba real privada

- Ejecutor de terminal para Resend real con confirmación previa de dos envíos,
  API Key por variable privada y OTP con entrada oculta. Base nueva por ejecución,
  servidor en loopback e informes sin credenciales, códigos ni datos personales.
- Procedimiento de caducidad tras cinco minutos reales, código incorrecto,
  confirmación concurrente, integridad PostgreSQL, login/perfil y cuenta previa.
- Ensayo con proveedor simulado y preparación aislada aprobados; envío real
  pendiente de autorización y credenciales. No se atribuye entrega real al ensayo.
- Unitarias de correo/configuración, esquema/API PostgreSQL, 25 comprobaciones
  Chromium, tres de Perfil, cuatro de documentos y firma Android aprobadas.
  Perfil usa la caché de Chromium ya instalada; restricciones del sandbox resueltas
  ejecutando las pruebas autorizadas fuera de él. Detalle en
  `docs/pruebas/2026-10-18-resend-otp.md`.

### 18 de octubre de 2026 — OTP vigente cinco minutos

- Vigencia del OTP reducida de 600 a 300 segundos; textos del correo y del cliente
  actualizados a cinco minutos, junto con las pruebas y documentación afectadas.
- Validación: `npm run test:email` y `git diff --check`.

### 18 de octubre de 2026 — impedir previews automáticas

- La auditoría remota detectó que la integración Vercel existente creaba previews
  automáticamente al hacer push, pese a que no se ejecutaron comandos de despliegue.
  En `a7ebcae`, la preview Admin terminó y la del proyecto `sedapal` falló por
  buscar `Backend/scripts/build-web.js` desde una raíz de proyecto incompatible.
- Despliegues Git deshabilitados para `feature/verificacion-correo` en la raíz
  y en `Backend/vercel.json`; regla persistente para revisar automatizaciones
  antes del primer push de futuras ramas. No se reintenta el build de la preview.
- Configuración JSON y diff revisados; auditoría final registrada en el PR.

### 18 de octubre de 2026 — cliente web/Android y validación completa

- Pantalla de verificación con entrada OTP, errores accesibles, reenvío con
  cuenta regresiva y protección contra doble envío. Confirmar retorna al login.
- Recuperación temporal del registro tras recargar con `sessionStorage`, sin
  guardar contraseñas ni códigos; limpieza al confirmar, reiniciar o iniciar sesión.
- Harness de cliente/admin adaptado al nuevo contrato, con proveedor simulado
  exclusivamente en pruebas y bases sintéticas nuevas por ejecución.
- Chromium: 25 comprobaciones aprobadas; sin errores JavaScript ni recursos
  fallidos. Pantalla OTP validada a 360, 390, 412, 768 y 1366 píxeles, incluyendo
  accesibilidad de campos y controles sin desbordamiento horizontal.
- Runtimes web y Android generados y verificados sin código administrativo ni
  secretos del servidor; pruebas de configuración, OTP/Resend y firma aprobadas.
- Configuración, límites, compatibilidad con APK previa y pasos pendientes de
  autorización documentados. Sin merge ni cambios en Neon; previews automáticas
  detectadas posteriormente y registradas en la entrada de auditoría.

### 18 de octubre de 2026 — API de registro y confirmación

- Registro devuelve una solicitud pendiente (202); solo la confirmación válida
  crea usuario y suministro juntos (201). No se emite JWT antes de confirmar.
- Rutas de confirmación y reenvío; vencimiento, intentos persistentes, límites por
  IP/correo/suministro y bloqueos PostgreSQL para solicitudes concurrentes.
- Reenvío invalida el código anterior sin reiniciar intentos; consumo único y
  limpieza del hash de contraseña pendiente tras confirmar o sustituir solicitud.
- Fallos de envío revierten la transacción. Configuración ausente devuelve 503,
  sin permitir registros sin verificación. Cuentas previas conservan su acceso.
- API HTTP real probada con Resend simulado y PostgreSQL nuevo: caducidad,
  concurrencia, reintentos de código, límites, conflictos, login y bloqueo admin.
  Pruebas unitarias y regresión de configuración aprobadas.

### 18 de octubre de 2026 — proveedor Resend

- Adaptador HTTPS de Resend con correo de verificación en texto y HTML accesible,
  timeout de 10 segundos por intento y un reintento para fallos transitorios.
- Cuerpo y clave de idempotencia conservados durante el reintento; errores
  permanentes sin reintento y mensajes sin datos sensibles del proveedor.
- Variables privadas exclusivamente en el backend; ejemplos vacíos y paso de
  configuración en Docker Compose. No se envían correos reales en las pruebas.
- Pruebas simuladas de envío, idempotencia, configuración, cuota, red y timeout.

### 18 de octubre de 2026 — esquema y códigos OTP

- Esquema inicial y migración aditiva `003_verificacion_correo.sql` para registros
  pendientes, historial de envíos y fecha de verificación. Sin ejecución en Neon.
- Códigos criptográficos de seis dígitos, HMAC SHA-256 ligado a la solicitud,
  comparación de tiempo constante y rechazo de formatos o secretos inválidos.
- Política: vigencia de 10 minutos, 5 intentos, 60 segundos entre envíos y hasta
  3 envíos por hora. El registro pendiente vence en una hora.
- Pruebas unitarias de generación, aislamiento por solicitud/secreto y entradas
  inválidas; regresión de configuración. Pruebas PostgreSQL en bases nuevas:
  migración repetible, conservación de cuenta previa y restricciones del esquema.

### 18 de octubre de 2026 — flujo de revisión

- Reglas persistentes de Git, seguridad y revisión incremental en `AGENTS.md`.
- Plan de verificación de correo con Resend y decisiones de seguridad documentados
  en `docs/verificacion-correo.md`.
- Validación: estado inicial limpio, rama existente comprobada y pruebas de
  configuración ejecutadas antes del commit. Sin cambios en producción.

## v1.0.0

Publicada el 8 de octubre de 2026. Referencia: [Release v1.0.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0), commit `135cb54173ee60e2f528738805564773e3c32e8b`.

- Primera APK release firmada permanentemente, versión Android `1.0.0`, `versionCode 2`.
- Aplicación Android exclusiva para clientes, con recibos, consumo, registros de pago, PDF, incidencias y atención.
- Panel administrativo independiente publicado en Vercel.
- Backend Node.js/Express publicado en Render y PostgreSQL de producción en Neon.
- API REST compartida con 41 rutas, incluidas 19 administrativas.
- Actualización en tiempo real mediante Socket.IO, con polling y WebSocket.
- Autenticación JWT, cuentas activas y autorización por roles `usuario`/`admin`.
- Distribución directa de la APK mediante GitHub Releases; sin publicación en Google Play.

La instalación y los flujos principales de la APK release fueron validados en un teléfono físico por el propietario. La infraestructura local Docker permanece independiente de producción.
