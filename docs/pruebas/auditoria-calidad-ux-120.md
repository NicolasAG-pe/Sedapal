# Auditoría integral 1.2.0 — incremento A

Estado: auditoría en laboratorio; **no publicación ni aprobación física**.
Base verificada: PR #19, `b13ebb04a64ee546fa4276d1f1fd42fed0f1d288`.
Worktree independiente, rama `feature/auditoria-calidad-ux-120`.

Incremento A ejecutado el 27 de octubre de 2026 (America/Lima). Las secciones
iniciales conservan el inventario y las hipótesis previas; el cierre distingue
qué se comprobó, qué se corrigió y qué continúa pendiente.

## Inventario previo a las correcciones

Se leyeron AGENTS.md, IDENTIDAD-VISUAL-120.md, roadmap, scripts de pruebas,
contratos HTTP, adaptadores Android y migraciones. El checkout original estaba
limpio. Hay otros procesos Codex y servicios Docker/Kubernetes activos; un PID
no acredita que una sesión haya terminado. No se operan sus worktrees, procesos,
bases ni contenedores. La auditoría usa un contenedor PostgreSQL nuevo y bases
nuevas con fixtures sintéticos; las herramientas existentes se consultan sin
reinstalar ni modificar sus dependencias.

### Dependencias Git

| PR | Cabeza verificada | Base | Incorporación en #19 |
| --- | --- | --- | --- |
| #11 | `6cd433c` | main | Equivalente a `afac774`; patch-id idéntico `3d3d6d7350bc53e53aee97fedb5992bcfeb76c21` |
| #12 | `e01c9a2` | main | Ancestro |
| #13 | `a921365` | #12 | Ancestro |
| #14 | `fae9aa7` | #13 | Ancestro |
| #15 | `4a198b7` | #14 | Ancestro |
| #16 | `6a83dc5` | #15 | Ancestro |
| #17 | `5e3ea8f` | #16 | Ancestro |
| #18 | `1fbaffa` | #17 | Ancestro |
| #19 | `b13ebb0` | #18 | Base exacta de esta auditoría |

Los nueve PR permanecen abiertos en Draft. No fusionar #11 por separado ni
reaplicar su parche. No hay conflicto de integración entre #12–#19 en esta base:
forman una cadena de ascendencia, no nueve conjuntos independientes por fusionar.
La revisión de un eventual merge a main continúa pendiente y no se autoriza aquí.

### Funciones y evidencia disponible

El inventario distingue existencia de código/cobertura de ejecución aprobada.
Los resultados de esta corrida se consignan por separado al cerrar el incremento.

| Módulo | Implementación y pruebas existentes | Riesgo o comprobación requerida |
| --- | --- | --- |
| Login/registro/correo | email-api, email-outbox, otp-auto-session, cliente/Admin E2E | OTP de un uso, límites, no alta ni JWT prematuros; correo simulado |
| Sesión automática | client-session, secure-session, android-session-native | Keystore real, logout, usuario distinto, ausencia de JWT en Web Storage Android |
| Recuperación | password-recovery y flujo navegador/nativo | Permiso de un uso, no enumeración, no bypass de TOTP, entrega real desactivada |
| 2FA cliente/Admin | two-factor, auditoría de carreras y rotación de claves | Roles/versiones, replay, códigos de recuperación y revocación |
| Inicio/dashboard | client-home, client-checks, identidad visual | Carga inicial, vacío, error, correspondencia con REST y accesibilidad |
| Consumos/gráficos | renderBarChart/renderSpendChart existentes | Sin inventar lecturas; gráficos derivados de recibos, estados vacíos |
| Recibos/historial | receipt-schema/concurrency y cliente/Admin E2E | Propiedad, duplicados, edición/anulación frente a operaciones concurrentes |
| PDF/constancias | documents, PDF viewer nativo y ejemplos | PDF real/paginación, datos íntegros, descarga; no certificación PDF/UA |
| Pagos/operaciones | payment-operations, payment-flow/audit/realtime | Declaración y simulación no acreditan deuda ni fondos |
| Yape manual | yape-pilot y flujo de laboratorio | Solo ensayo sintético; no QR real, cobros ni recepción bancaria |
| Incidencias/fotos | incident-tracking-fixture y Admin/client E2E | Propietario, MIME/tamaño, foto autenticada, estado y error |
| Seguimiento | incident-tracking/flow y Shared/incident-timeline | Append-only, cursor, REST por propietario, reconexión Socket.IO |
| Cortes | cliente/Admin E2E y contratos REST existentes | Ámbito del suministro; no difusión general de avisos locales |
| Atención | cliente/Admin E2E | Creación/respuesta, estados, roles y actualización en vivo |
| Centro de avisos | push, push-flow, client-checks | Lectura por usuario, marcado, carga/vacío/error y logout |
| Firebase/Android | PR #19 y push-credentials/firebase-lab | Revisar identidad en lectura; ningún envío ni OAuth de remitente en esta etapa |
| HidroBot | hidrobot.test, chatbot-ui-checks y payment-flow | Esperar carga inicial, no decisiones financieras ni datos de otra cuenta |
| Perfil/seguridad | profile-navigation, 2FA y recuperación | Una carga por entrada, respuestas tardías, sesión y foco |
| Tutorial/ayuda/logout | client-checks, admin-e2e y native | Teclado, Atrás, limpiar datos y conexiones |
| Admin/acceso/resumen | admin-e2e, two-factor-admin y /api/admin/resumen | 401/403, estadísticas operativas; no inferir acreditación bancaria |
| Admin/usuarios/suministros | admin-e2e y controles backend | Rol/activo revocan versiones; ubicación y aislamiento |
| Admin/recibos | receipt-concurrency/schema y admin-e2e | Formularios, estados, filtros y paginación existentes |
| Admin/pagos/revisión | payment-management, admin-table y audit-flow | Tabla paginada de operaciones existente; separar estados financieros |
| Admin/cortes | admin-e2e | Crear/editar/cancelar solo fixtures, reconexión y alcance |
| Admin/incidencias/reportes | incident-review y tracking-flow | Historial, comentario, conflicto y autorización |
| Admin/atención | admin-e2e | Respuesta, filtro, estado y errores |
| Admin/cuenta/seguridad | two-factor-admin y recuperación E2E | Solo factor propio, sesión invalidada, login posterior |

### Hallazgos iniciales comprobados

- **Importante A-01:** el control `android-upgrade.test.cjs` compara todo el
  manifiesto con v1.0.0; falla ante las únicas adiciones FCM ya incorporadas.
  No demuestra un cambio de firma. Revisar con lista explícita de adiciones
  permitidas, conservando comparación estricta del resto, identidad y certificado.
- **Importante A-02:** el roadmap aún describe entrega FCM remota como pendiente
  y no incorpora el resultado del único envío autorizado documentado en #19.
- **Importante A-03, por medir:** el resumen Admin muestra importes históricos
  acumulados; comprobar que su presentación no sugiera fondos acreditados.
  No asumir que registros heredados contienen evidencia bancaria.
- **Importante A-04:** herramientas de navegador/SDK y puertos son prerrequisitos
  locales; un worktree nuevo no es reproducible solo con npm ci. Documentar
  preparación y conservar errores de entorno, sin ocultarlos como aprobaciones.
- **Pendiente:** matriz visual exacta, estados de error/vacío, rendimiento,
  Android 15 actual y revisión Firebase de solo lectura. Una prueba histórica
  no se presenta como ejecución de esta auditoría.

No se ha demostrado un nuevo fallo crítico con la inspección inicial. Esto no
equivale a certificar ausencia de vulnerabilidades. Las comprobaciones incompletas
mantienen estado pendiente; no se activan funciones productivas para completarlas.

## Migraciones y operación

007 incorpora TOTP/versionado; 008 exige 007 y separa operaciones de pagos;
009/010 son exclusivas del piloto Yape y 010 exige 009; 011 prepara recuperación;
012 prepara dispositivos/cola push; 013 prepara seguimiento. `init.sql` contiene
estructura de instalación nueva; no prueba qué está aplicado en producción.
No se ejecuta ni consulta Neon. Las comprobaciones de repetibilidad/constraints
se ejecutan solo en bases nuevas aisladas. El inventario exacto de dependencias
y resultados queda pendiente de la corrida de migraciones del incremento.

La estrategia de respaldo/restauración y rollback debe validarse con datos
sintéticos en destinos nuevos, nunca restaurando encima de bases existentes.
La revocación distribuida y el control externo contra backend antiguo descritos
en las guías 2FA siguen siendo puertas de producción independientes.

## Organización de los siguientes incrementos

- A: cerrar inventario, evidencia reproducible, seguridad, regresiones y hallazgos.
- B: corregir únicamente defectos medidos de cliente/Admin y comparar capturas
  auténticas antes/después, conservando la identidad aprobada.
- C: mejorar estadísticas/filtros si el contrato existente lo permite; separar
  importes históricos, operaciones sintéticas y fondos acreditados demostrables.
- D: regresión de la candidata, documentos, rendimiento y preparación física.

No se considera 1.2.0 publicada ni completamente aprobada. La autorización de un
único envío FCM anterior ya se consumió; esta auditoría prohíbe nuevos envíos reales.

## Cierre comprobado del incremento A

### Pruebas ejecutadas de nuevo

| Grupo | Resultado | Evidencia local |
| --- | --- | --- |
| Unitarias/configuración, correo, PDF, sesión, UI, HidroBot, paleta y firma | 130/130 | `unit-final.log` |
| Backend PostgreSQL: OTP, 2FA/carreras/rotación, recuperación, recibos/concurrencia, pagos/Yape, push/cifrado/aislamiento y seguimiento | 118 aprobadas, 1 omitida condicional | `backend-baseline.log` |
| Correo outbox/contrato/procesos y transición/sesión Android | 51/51 | `email-session-regression.log` |
| Navegador: pagos/revisión/reconexión, recuperación, push sin envío, incidencias y validador Firebase | 11/11 | `browser-regression.log` |
| Recorrido completo cliente/Admin con API y PostgreSQL reales | 30 comprobaciones, cero errores JS/recursos fallidos | `admin-e2e-contracts/run_*/admin-e2e.json` |
| Migraciones 007–013 | 1/1: cada migración dos veces; guardas 008/012 y conservación de historia | `migrations.json` |
| Respaldo custom y restauración real en otra base nueva | 1 usuario, 2 incidencias, 1 evento conservados; original intacto | `restore.json`, dump privado y SHA-256 |
| Matriz visual exacta | 63 capturas, cero findings geométricos/campos sin nombre/recursos rotos | `baseline-tIAJjU/result.json` y `gallery.html` |
| Android 15: seguimiento, Socket.IO, red, foto, Atrás y reapertura | 6 comprobaciones; WebView 360×800 y 390×844 | `android-session-native-qQ7z3Q` |
| Android 15: sesión cifrada, reinicios, JWT expirado/alterado, cuenta deshabilitada, logout/cambio de cuenta y offline | 13 comprobaciones | `android-session-native-XScN1s` |
| Gradle debug/instrumental/unitarias/lint | Build aprobado; JUnit 4/4, instrumentación Keystore 1/1 por ejecución; lint 0 errores/16 advertencias existentes | Informes Gradle y `instrumentation.txt` |

Los conteos son grupos de evidencia, **no se suman como casos únicos**: hay
comprobaciones compartidas (incluido Keystore) y aserciones dentro de cada test.
La omisión del backend es el escenario de histórico duplicado sin migración,
condicionado a `HIDRO_RECEIPT_TEST_LEGACY`; no se cuenta como aprobado. No hubo
correo, cobro, OAuth del remitente ni FCM real en esta auditoría.

### Correcciones de los verificadores

Los fallos iniciales se conservan en los logs; no se presentan como corridas verdes:

1. El control de actualización Android admite solo cuatro líneas FCM exactas y
   únicas del PR #17, compara estrictamente el resto del manifiesto con v1.0.0 y
   conserva controles de identidad, certificado y versiones. No permite otros
   permisos ni componentes exportados por esa excepción.
2. El histórico sintético de Admin se carga con su recibo pagado explícitamente.
   La demostración posterior exige exactamente una operación, **cero pagos
   financieros**, estado Emitido y deuda conservada: no se debilita el negocio
   para satisfacer la antigua expectativa de cancelar deuda.
3. El recorrido vuelve a autenticarse tras cambiar contraseña y comprueba rechazo
   de la anterior, revocación de la sesión y una sola conexión nueva. Tras OTP
   verifica la sesión automática, sin introducir un login manual duplicado.
4. El verificador nativo espera/omite el tutorial por su control real después de
   cada reinicio antes de navegar. La primera ejecución encontró una sección
   oculta mientras el tutorial estaba abierto; su captura y error se conservan.
   No se ocultan controles, se fuerzan clicks ni se cambian aserciones de historial.

Se añadió una guarda de AVD para `hm_quality_api35`, manteniendo la exigencia de
serial emulador y nombre dedicado. No se conectó un teléfono físico. Los únicos
cambios de esta fase están en QA, documentación y exclusiones de publicación;
no se modificaron pantallas, logo, backend de negocio, dependencias ni firma.

### Seguridad y datos

- JWT/roles, OTP/2FA/recuperación, revocación/versiones y carreras están cubiertos
  por las suites ejecutadas; otra cuenta no obtiene fotos, eventos ni operaciones
  ajenos. Errores y logs se comprueban sin revelar SQL/secretos en respuestas públicas.
- Seguimiento y operaciones conservan auditoría, idempotencia y constraints;
  la migración no atribuye eventos a incidencias antiguas. El restore se hizo
  sobre una base nueva, sin `--clean`, sin restaurar encima de otra ni borrar bases.
- Lectura remota Firebase: `hm-fcm-pilot-120` activa, solo rol
  `hmFcmPilotSender`/`cloudmessaging.messages.create` en proyecto; emisor temporal
  limitado a esa cuenta por `hmFcmPilotTokenMinter`/
  `iam.serviceAccounts.getAccessToken`, con condición hasta 2026-11-03 UTC.
  Cero claves USER_MANAGED; facturación desactivada. FCM/IAM/IAM Credentials
  habilitadas. **Cero cambios remotos y ningún OAuth de envío obtenido** en A.
  `getIamPolicy` se consultó con POST de lectura según el
  [contrato oficial de IAM](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/getIamPolicy).
- `google-services.json` sigue ignorado y ausente del nuevo worktree. La candidata
  A usa `HM_PUSH_ANDROID_ENABLED=0`, auto-init FCM desactivado y proveedor mock.
  Registro y entrega reales históricos del #19 no se repitieron.
- Revocación distribuida/control antirollback, retención operativa, custodia y
  restauración de claves 2FA siguen sujetos a las guías de seguridad y validación
  productiva independiente. Un restore de fixtures no acredita un plan de DR real.

### Rendimiento, accesibilidad y experiencia

Chromium local, sin throttling y con movimiento reducido: DOMContentLoaded
198–240 ms, carga 198–241 ms y 618 550 bytes transferidos en las cuatro cargas
cliente nuevas. Son medidas locales de referencia, no percentiles, rendimiento
de red móvil ni una comparación antes/después. No se justifica modificar
arquitectura ni quitar validaciones a partir de estas cifras.

El recorrido general comprobó un Socket.IO por sesión, cancelación de respuestas
tardías y limpieza tras logout; seguimiento comprobó recuperación sin duplicar
eventos. La matriz verificó movimiento reducido, nombres accesibles y geometría;
la paleta conserva los contrastes de tokens probados. No certifica contraste de
todo texto, lector de pantalla, PDF/UA ni WCAG completa.

### Clasificación y prioridades siguientes

| ID | Gravedad | Evidencia / decisión |
| --- | --- | --- |
| A-01/A-02 | Importante, resuelto | Verificador de manifiesto y roadmap desactualizados corregidos |
| A-05 | Importante, resuelto | Expectativas antiguas de pago, cambio de contraseña y OTP corregidas con controles más fuertes |
| A-04 | Importante, documentado | Herramientas QA/SDK/puertos requieren preparación explícita fuera del runtime |
| B-01 | Menor, abierto | A 360 px «Documentos» y «Reportar» se parten dentro de palabras en accesos rápidos de Inicio |
| B-02 | Importante UX, abierto | Botones cerrar/minimizar/limpiar HidroBot de 30×30 px y chips de 36 px frente al objetivo de identidad de 44 px |
| B-03 | Menor, por reproducir | Tutorial visible tras reinicio rápido; el flujo debe respetar la preferencia voluntaria y no competir con navegación |
| C-01 | Importante, abierto | `monto_total` de resumen sale solo de pagos históricos, no de operaciones; «acumulados» no aporta evidencia bancaria. Aclarar presentación, nunca atribuir fondos acreditados |
| C-02 | Importante, abierto | Operaciones ya tienen página/filtros; usuarios/recibos/incidencias heredados cargan listas completas y pagos/atención limitan a 500. Medir volumen y contrato antes de ampliar paginación |
| D-01 | Puerta de salida | Teléfono físico, TalkBack, carga real, visor PDF/cámara y revisión de despliegue pendientes |

No se encontró un nuevo fallo crítico en el alcance ejecutado. No se declara
ausencia de vulnerabilidades ni aprobación integral de todos los estados de error:
faltan inyecciones 500/timeout por cada módulo Admin, zoom/teclado/lector completos,
cargas grandes y Android 13/14. Se priorizan antes de decidir la candidata física.

Las capturas son **baseline**, no comparaciones ficticias antes/después. Los
incrementos B/C deben conservarlas y generar otra galería desde el producto
modificado. No se rediseñan pantallas ni se añaden gráficos decorativos en A.

Android 15 tuvo AVD nuevo; `/tmp` no ofrecía el espacio mínimo de userdata y se
usó un directorio privado nuevo en disco, sin borrar recursos existentes. Con
aproximadamente 6,7 GB libres y una reserva requerida de unos 7,3 GB por el
emulador, no se prepararon AVD 13/14 adicionales. Las imágenes previas se conservaron.

### Reproducción y demostración

El laboratorio usa PostgreSQL 18 nuevo, loopback, padre `hm_email_test` y fixture
`hm_fixture`, sin cargar `.env`. Proporcionar `HIDRO_EMAIL_TEST_DB_PORT` y las
rutas QA indicadas en [TESTING](../TESTING.md). Nuevos comandos:

```bash
node --test Backend/test/quality-migrations.cjs
PUSH_REAL_DELIVERY_ALLOWED=0 node scripts/test/quality-audit-flow.cjs baseline
```

Guía/recorrido y lista específica para celular:
[DEMO-LABORATORIO-120](../DEMO-LABORATORIO-120.md). Las evidencias y APK debug
son locales y privadas, fuera de Git; la galería se abre desde `gallery.html`.
El recurso FCM original, APK oficiales, main y ramas anteriores se conservan.
