# Kubernetes local — Hidro-Mejora1.2.0

Fecha:29/10/2026. Entorno ejecutado: Kind y namespace `hidro-avance19` existentes.
Aplicación oficial: `6894b3e3fde8c6600a87816ad8675c0446b676d5`, cotejado con
`origin/main` al finalizar. Rama de preparación local `feature/k8s-local-120`;
[Draft PR25](https://github.com/NicolasAG-pe/Sedapal/pull/25), sin merge.

## Cambios y procedencia

Las tres imágenes anteriores tenían contenido distinto de la aplicación oficial.
Web omitía `password-recovery-ui.js` e `incident-timeline.js`. Se construyó una
sola vez cada target de `k8s/avance19/Dockerfile.120`, sin RUN, red ni descargas,
reutilizando bases locales. Los dos archivos de dependencias del backend coinciden
con su base; no se reinstalaron paquetes. Los Dockerfiles de Compose no cambiaron.

Se importaron las imágenes por streaming al containerd del nodo existente, sin
crear archivos tar. `imagePullPolicy: Never`; revisión oficial en etiqueta OCI y
anotación de los pods. Tras el reinicio se cotejaron por SHA-256 todos los archivos
copiados:27web,21Admin y31backend, **79 coincidencias**. Los digests siguientes
son los IDs devueltos por CRI del nodo, no el ID del índice del almacén Docker host.

| Deployment | Tag local | ID CRI SHA-256 |
| --- | --- | --- |
| web | `hidro-avance19-web:1.2.0-6894b3e` | `9913d703281a2e9dab141957d079be952a73d82bf036bf76112eb823f58f5406` |
| admin | `hidro-avance19-admin:1.2.0-6894b3e` | `36344a3e42d956f05110ae17010e93e61af82c1c1216a73289cbb0907e2dfe40` |
| backend | `hidro-avance19-backend:1.2.0-6894b3e` | `45792ab0e7f73ae6420acf3459b234438afddfba67b62134939c10349178b3bc` |
| db | `postgres:18` existente | PostgreSQL18.6; imagen sin sustituir |

No se aplicó el kustomization completo ni `init.sql`. Se parchearon los tres
deployments de aplicación conservando servicios, Secretos locales y almacenamiento.
Los cuatro deployments de aplicación están1/1, sin reinicios de sus nuevos pods.
Los cuatro deployments históricos OTP de fixtures permanecen0/0.

## PostgreSQL y respaldo

Destino comprobado:`hm_avance19`, servicio interno `db:5432`. Se detuvieron
web/Admin/API y se verificó ausencia de clientes, Jobs y CronJobs escritores antes
del dump. PostgreSQL permaneció disponible para respaldo/migración.

- Respaldo custom `hm-avance19-pre120-20261029T203445Z.dump`,42132bytes, modo0600.
- SHA-256:`b031ee66a6590f62dbeadcba0a2df567d20b5894ab2890b47c2de238b5799181`.
- Ubicación privada local:`/home/nico/.local/share/hidromejora/k8s-120/private-20261029T200933Z/`.
- Listado de archivo comprobado y restauración con `pg_restore --exit-on-error`
  en un contenedor PostgreSQL18 independiente, sin red ni puertos,512MiB de límite.
  Ese contenedor y su volumen quedaron conservados y detenidos tras verificar.
- Coincidieron filas, hashes de todas las columnas originales y valores/estado de
  ocho secuencias en las13tablas anteriores, tanto tras restaurar como tras ensayar
  las migraciones. Incluye binarios y documentos almacenados en esas columnas.
- Antes de aplicar al PVC se comprobó que no hubo escrituras posteriores al dump.
  Se aplicaron los mismos archivos SQL, cotejados por SHA-256, en este orden:
  **007,008,011,012,013,014**. Se repitió la comparación de datos originales.
- No se ejecutaron009/010 ni se creó `control_piloto_yape`.
- PVC `db-data` conservado, Bound10Gi; UID cotejado antes y después. No se
  eliminaron archivos, bases, contenedores Docker, volúmenes ni respaldos.

## Seguridad y alcance local

`DATABASE_URL` vacío explícito, DB_HOST=db, DB_PORT=5432. Solo se conservan las
referencias a POSTGRES_DB/USER/PASSWORD y AUTH_TOKEN_SECRET del Secret local existente.
No se copiaron secretos de Render ni se accedió a Neon.

Registro/correo, recuperación, inscripción2FA, manual/Yape y worker/entrega/reminders
FCM están deshabilitados por variables explícitas. Comprobaciones finales: cero
factores activos, dispositivos push, entregas push y mensajes en correo_outbox.
El backend conserva el contrato de autenticación2FA actual; no se sustituyó por un
backend antiguo. Se mantienen interfaces, centro de notificaciones, historial,
operaciones demostrativas y restricciones financieras. Una demostración conserva
la deuda y no inserta un pago acreditado.

Los puertos del nodo están enlazados exclusivamente a127.0.0.1:8084/8085 y39855
(API Kubernetes). PostgreSQL y backend no tienen puertos publicados en el host.
El navegador usó el mismo origen local para REST y Socket.IO y no hizo solicitudes
a servicios externos. HTTP aquí está limitado a la laptop; no es una exposición LAN.

Se usa una copia0600 del kubeconfig con CA/TLS y endpoint loopback. No se modificó
la configuración global, cuyo hostname anterior no resolvía desde Debian.
Compose, LAB, Render y Vercel no se modificaron. Exclusión de la rama en ambos
vercel.json antes del push; Render con autoDeploy=no/previews=off según consulta de
preparación. GitHub no registró despliegues ni workflows de la rama tras su primer push.

## Pruebas ejecutadas

| Prueba | Resultado real |
| --- | --- |
| Manifiestos existentes | Caso estático de `k8s-integration.test.cjs` aprobado; dos casos SQL históricos excluidos por filtro |
| Sintaxis | Bash del controlador y Node de ambos nuevos harnesses aprobados |
| API dirigida | `verify-120.cjs`:43peticiones, seis comprobaciones agrupadas aprobadas |
| Autenticación/roles | Login real, contrato `hidro-auth-2fa-v2`, sesión401 y usuario→Admin403 |
| Consultas | Ocho rutas Admin y ocho cliente, incluyendo estadísticas y operaciones paginadas |
| Pagos | Demostración201, repetición200 con mismo ID, ajeno404, legacy sin clave409; historial visible, deuda intacta y sin nuevo registro en pagos |
| Incidencias | Alta con PNG, bytes recuperados idénticos, dueño/Admin200 y ajeno404; seguimiento/repetición idempotentes y REST protegido |
| Tiempo real | WebSocket por ambos proxies con JWT real; anónimo rechazado; recibo nuevo y cambio de incidencia recibidos |
| Atención y notificaciones | Solicitud sintética, aviso de incidencia, corte sintético Admin→cliente, lectura y cancelación lógica aprobadas |
| Navegador real | `browser-120.cjs`: login/roles y ocho módulos Admin; cliente, HidroBot, pagos, notificaciones, perfil, incidencias, cortes y logout |
| PDF | Descarga auténtica de recibo15384bytes y constancia15450bytes; firma de archivo PDF y tamaño comprobados |
| Aislamiento navegador | Sin errores JavaScript, assets fallidos ni peticiones externas; un Socket.IO conectado y cero tras logout |
| Persistencia | Apagado/encendido del contenedor Kind existente; hashes de26tablas y diez secuencias idénticos; mismo PVC y cuatro deployments1/1 |
| Después del reinicio | Health por ambos proxies, login/sesión,2FA cerrada, corte/aviso/lectura/cancelación aprobados |

Los harnesses históricos esperaban el contrato antiguo de pagos que acreditaba
directamente y no se usaron como criterio de esta versión. Los nuevos verifican
operaciones demostrativas sin alterar esa seguridad. Durante su preparación se
corrigió el formato data-URL de la foto sintética y la espera del tutorial
asíncrono; los recorridos finales pasaron sin cambiar código de la aplicación.

Evidencias privadas, fuera de Git: `artifacts/kubernetes-avance-19/state/` en el
worktree persistente:verification-120.json, browser-120.json, post-restart-120.json,
capturas Admin/cliente390px y escritorio, recibo y constancia sintéticos.
El directorio privado del respaldo conserva restauración, huellas previas/posteriores,
importaciones y correspondencia imagen/fuentes. Nunca publicar su kubeconfig,
accounts.json, dumps ni contenido de Secretos.

## Operación y límites

Instrucciones de encendido/apagado:[ACTUALIZACION-120.md](../../k8s/avance19/ACTUALIZACION-120.md).
El controlador se probó realmente en ambos sentidos; comprueba identidad del nodo,
PVC y recursos, cierra escritores y hace CHECKPOINT antes de detener PostgreSQL.
No crea clústeres, recompila ni aplica migraciones al encender. El inicio exige al
menos768MiB libres y1.5GiB de memoria disponible y se detiene si no alcanza.

Se reutilizaron compilaciones y navegadores locales; se mantuvo más de1GiB de reserva
durante importación/restauración. La laptop sigue cerca del98% de disco; no se hizo
ninguna limpieza y no conviene iniciar compilaciones adicionales sin revisar recursos.

FCM nativo, correos reales, inscripción2FA y cobros/Yape requieren credenciales y
autorizaciones específicas y **no se probaron ni habilitaron aquí**. Las pruebas
Android/producción anteriores no se repitieron. La actualización Kubernetes no
publica una nueva versión de la aplicación ni cambia la APK oficial.
