# MS-05 — Servicios integrados en el laboratorio

El proyecto `hidro-ms120-services` ejecuta seis procesos HTTP independientes.
Cliente, panel y configuración Android de laboratorio utilizan el mismo
contrato `/api` y `/socket.io/`. Los dos Nginx locales encaminan esas rutas
al mismo gateway. El compose anterior conserva su propia base y puertos.

| Responsable | Rutas y tareas | Datos que controla | Comprobación |
|---|---|---|---|
| Gateway | Salud pública, reverse proxy HTTP/PNG, polling y upgrade WebSocket. | Sin datos ni credenciales PostgreSQL. | Paridad con las 75 rutas públicas, ambos orígenes, rutas internas bloqueadas y propagación de estado al caer un servicio. |
| Auth | Registro y OTP, login, recuperación, perfil, suministro, 2FA, estado de cuenta y reportes administrativos. | `usuarios`, `suministros`, `usuario_2fa`, `usuario_2fa_recuperacion`, `desafios_2fa`, `registros_correo_pendientes`, `registros_correo_envios`, `correo_outbox`, `recuperacion_clave_limites`, `recuperaciones_clave`, `recuperacion_clave_outbox`. | Navegador, worker simulado, roles y JWT invalidado tras cambio. Los reportes consultan proyecciones. |
| Billing | Recibos, consumo, movimientos históricos, operaciones, revisión, cancelación y comprobante de pago. | `recibos`, `pagos`, `operaciones_pago`, `operaciones_pago_historial`, `eventos_pago_proveedor`, `control_piloto_yape` cuando existe. | Paridad, integridad, locks, concurrencia y reintento UUID tras COMMIT. Los PDF se generan en el cliente. |
| Operations | Incidencias, fotos, seguimiento, cortes por zona o generales y atención. | `incidencias`, `incidencia_eventos`, `incidencia_cambios`, `cortes_servicio`, `cortes_suministros`, `solicitudes_atencion`. | Foto binaria, cambio idempotente con aviso, permisos, cambio reflejado en cliente, cortes y atención. |
| Notifications | Bandeja, lecturas, dispositivos push, resolución de eventos, Gmail o Resend según perfil de código y stub de laboratorio. | `notificaciones`, `notificaciones_lecturas`, `push_dispositivos`, `push_entregas`. El transporte recibe jobs y confirma resultado, sin credenciales de Auth. | Stub de correo, registro de dispositivo y worker push mock, elegibilidad tras cambios de seguridad. |
| Realtime | Sesión Socket.IO, salas por suministro/rol, revisión y eventos de cambio. | `hm_contract.events` es un buzón transaccional compartido. Realtime consume y marca entrega. | WebSocket, polling, revocación, restart y drenaje de eventos. |
| Cliente web / Android / Admin | Interfaz, HidroBot local, PDF con jsPDF y bridge de archivos/Keystore en Android. | Estado de vista y datos de sesión conforme al cliente. | Firefox, pruebas JS de documentos y asistente, runtime de laboratorio Android. La prueba nativa sigue pendiente. |

La [matriz por ruta](03-matriz-endpoints.md) describe método, autorización y
eventos. `Backend/test/services-routing.test.cjs` compara el inventario
ejecutable del modo anterior y los procesos nuevos.

## Contratos y propiedad de datos

- La migración 015 se aplica con un rol migrador distinto de los cinco roles
  de ejecución. Los roles de servicios carecen de permisos sobre las tablas
  privadas de otros dominios. `hm_identity` expone solo identidad y ubicación.
  `hm_projection` contiene campos de elegibilidad push. `hm_reporting` expone
  los campos de los reportes administrativos. El resumen se compone en Auth.
- Introspección HMAC por consumidor, con credenciales separadas, verifica cada
  acceso protegido. Una indisponibilidad de Auth cierra el acceso. Las
  funciones SQL `lock_supply` y `lock_actor` conservan los bloqueos de las
  transacciones existentes. El orden de Billing sigue siendo suministro →
  recibo → operación. La edición de incidencia valida al admin bajo lock.
- `operations_notice` permite insertar el aviso de una incidencia dentro de
  su transacción y los avisos opcionales de cortes y atención. La publicación
  de recibo en el perfil 015 incluye el aviso con su referencia al recibo.
- PostgreSQL conserva las FK de identidad, recibo y push. El proceso de datos
  compartido mantiene integridad y permite un corte sin dual-write. La
  disponibilidad de la instancia sigue siendo una dependencia compartida.
- El trigger `publish_change` escribe un evento junto con la operación. Realtime
  toma lotes con `FOR UPDATE SKIP LOCKED` y marca después de emitir. Una caída
  entre emisión y confirmación puede duplicar el aviso. El cliente reconsulta
  REST y deduplica cambios de vista. Hay un solo consumidor Socket.IO en este
  laboratorio. Para réplicas hacen falta distribución entre instancias y
  checkpoints por consumidor.

## Workers, tareas, funciones SQL y eventos

| Propietario | Proceso o tarea | Funciones y triggers de su flujo |
|---|---|---|
| Auth | `workers/email-outbox.cjs` y `workers/password-recovery.cjs` reclaman leases y registran resultados. `maintenance/email-cleanup.cjs` aplica retención cuando se invoca contra un destino autorizado. | `limpiar_verificacion_al_cambiar_correo`, `revocar_2fa_al_cambiar_cuenta`, `revocar_al_cambiar_credenciales`, `fechar_version_seguridad`. |
| Billing | Operaciones HTTP. Herramienta Yape de laboratorio para configurar/revisar el perfil piloto. | `controlar_operacion_pago`, `conservar_auditoria_pago`, `controlar_piloto_yape` y `validar_revision_sintetica` si aplica. Eventos `recibo:nuevo`, `recibo:actualizado`, `pago:nuevo`, `pago:registrado`. |
| Operations | Operaciones HTTP. Cortes activos/programados se calculan desde la ventana temporal. | `registrar_evento_incidencia`, `proteger_evento_incidencia`, `proteger_cambio_incidencia` con protección también de TRUNCATE. Eventos `incidencia:nueva`, `incidencia:actualizada`, `atencion:nueva`, `atencion:actualizada`, `corte:actualizado`. |
| Notifications | `workers/push.cjs --run`, retiro de entregas y opción `--reminders` si se habilita la tarea. Transporte de correo interno autenticado. | `encolar_notificacion_push`, `revocar_push_por_seguridad`, `notificar_corte_local_push`, `notificar_corte_asociado_push`. Evento `notificacion:nueva`. |
| Realtime / SQL | Drenaje periódico y revalidación activa. | `ms_event` en usuarios, usuario_2fa, suministros, recibos, operaciones_pago, incidencias, solicitudes_atencion, cortes_servicio y notificaciones. `auth:revalidar` es interno, `sesion:invalidada` es público y `perfil:actualizado` activa reconsulta de suministro. |

## Arranque y validación

Se requiere Git, Node.js 22 con npm y Docker con el complemento Compose.
El laboratorio se verificó con Node 22.23.5, Docker Compose 2.26.1 y
PostgreSQL 18. Los comandos usan una terminal POSIX en Linux, macOS o WSL2.

Para una copia nueva:

```sh
git clone --branch main https://github.com/NicolasAG-pe/Sedapal.git
cd Sedapal
```

En un clon existente, desde un árbol de trabajo limpio:

```sh
git switch main
git pull --ff-only origin main
```

Desde la raíz, instala las dependencias de Backend y prepara las imágenes
locales. Las descargas de imágenes solo hacen falta si faltan en Docker.

```sh
npm ci --prefix Backend --ignore-scripts --no-audit --no-fund
docker pull node:22-alpine
docker pull nginx:stable-alpine
docker pull postgres:18
```

Ejecuta este bloque una vez para generar claves distintas desde
[la plantilla](../../.env.services.example). La escritura exclusiva conserva
cualquier configuración existente. `.env.services` está ignorado por Git y
solo se usa para el laboratorio.

```sh
node -e '
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const config = fs.readFileSync(".env.services.example", "utf8");
const local = config.replace(/^(LAB_[A-Z_]+)=$/gm, (_, key) =>
  key + "=" + randomBytes(32).toString(key.endsWith("_KEY") ? "base64" : "hex")
);
fs.writeFileSync(".env.services", local, { flag: "wx", mode: 0o600 });
'
```

Genera ambos runtimes con API relativa e inicia el laboratorio:

```sh
node -e "const {buildWeb}=require('./scripts/build-web'); for(const name of ['web','admin']) buildWeb(name,{API_BASE_URL:''},require('node:path').resolve('artifacts/microservices',name))"
docker compose --env-file .env.services -f compose.services.yaml config --quiet
docker compose --env-file .env.services -f compose.services.yaml up -d --no-build --wait
```

Abre el cliente en `http://127.0.0.1:8280` y el panel en `http://127.0.0.1:8281`.
Consulta el estado y los logs recientes de los servicios:

```sh
docker compose --env-file .env.services -f compose.services.yaml ps -a
docker compose --env-file .env.services -f compose.services.yaml logs --tail 40 gateway auth billing operations notifications realtime
```

La prueba opcional `node Backend/test/services-smoke.cjs` desde la raíz
crea cuentas sintéticas, comprueba OTP y push simulados y ensaya reinicios
de servicios. Puede ejecutarse con los clientes abiertos. El correo exige
destinatarios `.invalid`.

Para pausar el cliente, el panel y los servicios sin perder los datos
sintéticos, deja `db` en ejecución:

```sh
docker compose --env-file .env.services -f compose.services.yaml stop web admin gateway auth billing operations notifications realtime email-worker recovery-worker push-worker
```

Para reanudar usa el mismo comando `up -d --no-build --wait`. PostgreSQL
usa tmpfs y conserva los fixtures mientras `db` y el motor Docker sigan
en ejecución. Detener `db` o apagar Docker descarta esa base temporal.

Para consultar la rama de referencia sin cambiar de rama:

```sh
git fetch origin feature/arquitectura-microservicios-120
git log --oneline origin/feature/arquitectura-microservicios-120
```

## Corte oficial y reversión

Antes de un corte, validar el perfil real en una copia aislada. Aprovisionar
los roles sin contraseñas de fixture, comprobar 015 con el perfil compatible
008/014, probar restauración/retención, métricas, TLS de ingress, capacidades
y versión real de Android, y guardar un respaldo verificado. El destino
oficial mantiene la URL pública para las APK ya distribuidas. La rama y
`main` tienen auto-deploy Git desactivado en ambas raíces Vercel. El servicio
Render conectado tiene auto-deploy y previews desactivados. GitHub Actions
puede ejecutar pruebas para un futuro push o PR actualizado.

El rollback requiere cerrar nuevas escrituras y drenar las transacciones,
reconciliar recibos, operaciones y eventos pendientes, y cambiar la entrada a
un solo conjunto de escritores. Si se vuelve a handlers anteriores sobre una
base con 015, desactivar los triggers `ms_event` tras drenar para evitar avisos
duplicados de recibo y conservar las filas de eventos para reconciliación.
Las proyecciones y funciones aditivas pueden conservarse. Cualquier ajuste de
roles, triggers o routing del entorno oficial requiere revisión y autorización.
