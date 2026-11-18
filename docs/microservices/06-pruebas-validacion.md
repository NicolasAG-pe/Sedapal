# Validación de microservicios

## MS-04 — Cliente, panel y sesiones, 2026-11-17

Punto de partida `1c1b042` en `feature/arquitectura-microservicios-120`
con árbol limpio. Se arrancó el laboratorio `hidro-ms120-integration` desde
sus imágenes locales. Había siete servicios en ejecución al finalizar
el arranque y `db-init` salió con código 0. PostgreSQL 18 (`hm_email_lab`)
usa tmpfs y red interna, sin puerto publicado. Los logs se revisaron mediante
conteos y estados de servicio. Las pruebas desde los clientes usaron cuentas
sintéticas `.invalid`, sin procesar pagos ni envíos FCM.

| Verificación | Resultado |
|---|---|
| Unitarias y contratos, Node 22.23.5 | 164 aprobadas, sin fallos ni omisiones. Incluye la prueba de fecha civil de recibo. Inventario vigente. |
| Integración PostgreSQL 18 aislada | 92 aprobadas, cero fallos y una omisión condicional del caso de histórico duplicado sin migración. Incluye roles, permisos, concurrencia de recibos y desconexión Socket.IO por contraseña, 2FA y desactivación. |
| Firefox, cliente y panel en 8180/8181 | Alta, confirmación OTP, login, perfil y rechazo de usuario en el panel. El recibo publicado y el cambio de estado de una incidencia aparecieron en el cliente sin recargar. Emisión y vencimiento coincidieron con los días guardados. La edición de ubicación disparó una reconsulta de perfil, cuyos campos visibles son correo, suministro y fecha. |
| Sesiones en Firefox | El cambio de contraseña cerró dos sesiones conectadas. Al activar 2FA, la sesión iniciadora mostró los diez códigos de recuperación y reconectó con el JWT nuevo. La otra sesión se cerró. El siguiente ingreso exigió TOTP. La desactivación desde el panel cerró la sesión del cliente. |
| Correo simulado | Worker → Notifications stub → outbox `aceptado` con id `stub-…` y carga cifrada descartada. El OTP real del fixture se tomó en memoria antes de activar el worker y se introdujo en Firefox. |
| Android nativo | Pendiente. El fuente declara 1.2.0/código 6. Los constructores de release configuran la API y Socket.IO HTTPS de Render y Capacitor usa el origen WebView `https://localhost`. El teléfono, ADB y el APK de referencia no estaban disponibles para comprobar instalación o el destino del binario. |

Se corrigió la lista de orígenes del laboratorio: los clientes se publican por
`127.0.0.1`, que antes recibía 403 al negociar Socket.IO. Tras el ajuste,
`localhost` y `127.0.0.1` respondieron 200 en ambos puertos y el origen ajeno
continuó en 403. Se ajustó también la rotación de sesión 2FA para esperar el
JWT renovado en la interfaz que inició la operación. El backend sigue
desconectando los sockets del JWT anterior. Recibos conserva el día civil de
PostgreSQL aun cuando la API lo serializa como ISO con hora.

Firefox se automatizó por WebDriver BiDi con el cliente a 390 y 1160 px y el
panel a 1366 px. Las correcciones estáticas se sirvieron mediante montajes
temporales de solo lectura sobre Nginx, conservando las imágenes locales y la
base del laboratorio. La activación de 2FA se probó con el rol usuario.

Para repetir la comprobación nativa hace falta identificar el APK y su hash,
disponer de ADB y un dispositivo autorizado, y usar un build de laboratorio
con origen y destino controlados (ADB reverse y variante debug en teléfono,
o AVD con `10.0.2.2:8180`). La configuración de release apunta a producción
y no se usó para este ensayo. Véase [Android](../ANDROID.md) y la
[evidencia histórica del APK 1.2.0](../pruebas/fcm-oficial-120.md).

La [preparación de Billing](09-preparacion-billing.md) registra las condiciones
transaccionales y de compatibilidad pendientes.

## Etapa MS-03 — Auth independiente, 2026-11-13

- Suite segura completa con Node 22.23.5: **158 aprobadas, 0 fallidas,
  0 omitidas** (147 previas + 11 nuevas de `auth-service.test.cjs`).
- Integración del servicio Auth en proceso separado sobre PostgreSQL 18
  aislada (network none, tmpfs, sin puertos publicados): **1 aprobada, 0
  fallidas**. Recorre registro OTP con outbox, entrega simulada por el worker,
  verificación, login, sesión, perfil, 2FA completa, introspección interna
  firmada, cambio de contraseña con reautenticación forzada, revocación
  administrativa y reinicio del proceso conservando la revocación.
- Inventario de rutas regenerado (`node scripts/test-catalog.cjs --write`):
  catálogo vigente con las 27 rutas del servicio enumeradas por la prueba.
- Imagen `hidro-ms120-auth:local` construida y ejecutada como usuario node,
  filesystem de solo lectura, sin red externa ni credenciales SQL: `/live`
  devolvió 200 y `/ready` 503 `degraded` sin base de datos, comportamiento
  esperado.

Estos resultados no acreditan todavía Billing/Operations independientes,
gateway, laboratorio completo, Realtime con cierre de sockets, frontend E2E ni
Android nativo.

## Etapa MS-02 — Notifications, 2026-11-13

- Suite segura con código nuevo, Node 22.23.4: **147 aprobadas, 0 fallidas,
  0 omitidas** (`safe-hkihFH`). Incluye seis contratos nuevos.
- Integración completa PostgreSQL 18: **90 aprobadas, 0 fallidas, 1 omisión
  condicional: histórico duplicado sin migración** (`integration-godGnK`). Incluye proceso
  Notifications separado, OTP, caída/reinicio y respuesta Gmail perdida.
- Regresiones OTP/outbox adicionales: **26 aprobadas**, sin fallos ni omisiones
  en la ejecución anterior a ampliar el caso Gmail de Notifications.
- Imagen independiente construida y ejecutada como usuario node, filesystem
  de solo lectura, sin red ni credenciales SQL: `/ready` devolvió 200.
- Un ensayo seguro detectó prueba TOTP intermitente: la mutación por `X` podía
  coincidir con el carácter original. Se garantiza alteración real y se conserva
  el rechazo obligatorio; no cambió el cifrado del producto.

Estos resultados no acreditan todavía Billing/Auth/Operations independientes,
gateway, laboratorio completo, frontend E2E ni Android nativo.

## Referencia anterior MS-01

Base: `1be9c28891272567f63b79f19838800431c09e91`; fecha 2026-11-13.

| Verificación | Resultado comprobado |
|---|---|
| Git inicial, rama base y remoto | Limpio; origin/main coincide con HEAD inicial |
| npm ci Backend desde lock | 151 paquetes; scripts deshabilitados, contenedor temporal |
| npm run test:inventory | Inventario completo y vigente |
| npm test -- --report, Node 22.23.4 | 141 aprobadas, 0 fallidas, 0 omitidas; safe-CKGDJl |
| Enumeración runtime Express sin red | 75 combinaciones método/ruta |
| Primeros ensayos de suite | 140/141; Git ausente y luego safe.directory; entorno corregido |
| Integración PostgreSQL 18 | Pendiente; no se creó base en este avance |
| Microservicios, gateway y permisos SQL | Pendientes; no implementados |
| Navegador Web/Admin | Pendiente; contratos estáticos no equivalen a E2E |
| Android nativo/APK | Pendiente; no compilado, instalado ni publicado |
| GitHub Actions para esta rama | Pendiente de publicación segura |

## Matriz de aceptación obligatoria de implementación

| Área | Casos que deberán ejecutarse |
|---|---|
| Contrato HTTP | Comparar 75 rutas frente al backend original con fixtures iguales: status, JSON, headers e imágenes; aliases OTP, rutas legacy, 404 y 426 |
| Autorización | Sin JWT, JWT inválido/expirado, rol cambiado, cuenta desactivada, MFA cambiado, suministro ajeno; repetir directamente contra cada servicio |
| SQL | Roles reales; SELECT/INSERT/UPDATE sobre tablas ajenas denegados; triggers/FK y esquemas opcionales comprobados |
| Billing | Carreras crear/editar/anular/declarar/revisar; reintento UUID; mismo recibo/periodo; rollback y timeouts |
| Auth | Alta/reenvío concurrentes, OTP vencido, lease perdido, MFA/recuperación de un solo uso; revocación concurrente |
| Notifications | Proveedor simulado; caída antes/después de entrega; ambigüedad; deduplicación; cancelación; reinicio sin detener Billing |
| Operations | Estado/historial/aviso/idempotencia atómicos; cambios concurrentes y administrador revocado |
| Gateway | Routing completo, orden de rutas específicas, streaming PNG, límite 3 MB, CORS, IP confiable, headers falsificados, timeout sin doble escritura |
| Realtime | Polling y WebSocket, origen rechazado, salas aisladas, revocación durante conexión, reconexión y reconsulta REST |
| Procesos | PID/entrypoint distintos; matar/reiniciar cada servicio y verificar que otros siguen atendiendo |
| Cliente/Admin | Login, recibos, pagos simulados, PDF, incidencia/foto/historial, atención, cortes, avisos y controles admin; comparación visual |
| Android | Runtime estático, URL única, Capacitor origen, sesión Keystore, 2FA/OTP, push simulado y reconexión; prueba nativa separada |
| Infraestructura | BD sin ports host; redes exclusivas; credenciales por servicio; stop/restart sin pérdida de datos |

No marcar la migración completa hasta ejecutar esta matriz con evidencia por
SHA. No reutilizar resultados históricos como pruebas del código nuevo.
