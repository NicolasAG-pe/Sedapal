# Seguimiento cronológico de incidencias — Hidro-Mejora 1.2.0

Base comprobada: `feature/notificaciones-push-120`, `5e3ea8fdbd5a56d92c3c0dc04c3f802a3994f89e`.
Rama de desarrollo: `feature/seguimiento-incidencias-120`. Sin publicación de 1.2.0.

## Arquitectura y datos

La incidencia sigue siendo la fuente del estado actual. 013 agrega `incidencia_eventos`
y `incidencia_cambios`, sin modificar estados, fotografías, incidencias anteriores ni
el esquema de pagos. `init.sql` incorpora 013 solo para instalaciones nuevas; no se
usa para actualizar una base existente. La API no ejecuta migraciones al arrancar.
La numeración 013 estaba libre después de 012. El despliegue futuro debe revisar
la cadena de PR y aplicar las migraciones pendientes en orden, con autorización.

Un trigger de origen registra la creación y cada cambio real de estado en la misma
transacción. Los tres estados siguen siendo Registrada, En revisión y Resuelta.
Se conserva la posibilidad existente de volver a otro de estos estados; no se
introduce una restricción funcional nueva ni estados artificiales.

El cambio administrativo bloquea la fila, vuelve a comprobar el actor activo y su
versión de seguridad, registra responsable/comentario público y crea el aviso interno.
El trigger push 012 genera una entrega por dispositivo autorizado, sin otro productor
paralelo. Socket.IO se emite después del COMMIT, con identificador/estado, nunca
fotografía ni comentario. Si falla el aviso, se revierten estado y evento.

`solicitud_id` UUID es opcional para compatibilidad con clientes anteriores. La interfaz
nueva conserva el UUID de un cambio de resultado incierto. Repetirlo no revierte
estados posteriores ni duplica eventos/avisos; cambiar su intención devuelve 409.
La tabla de decisiones guarda una huella y un resultado mínimo; no duplica datos
privados de la incidencia. Reenviar el mismo estado no crea un comentario/evento.

Los eventos incluyen UUID, orden interno, fecha real TIMESTAMPTZ del servidor, tipo,
estado anterior/nuevo, responsable cuando consta y comentario público opcional de
hasta 300 caracteres. No incluyen BYTEA ni notas privadas. Triggers y permisos bloquean
INSERT directo, UPDATE, DELETE y TRUNCATE del historial desde el rol normal. Esto no
impide que el propietario del esquema/superusuario desactive triggers: la separación
de privilegios y auditoría externa requieren revisión antes de producción.

No se rellenan eventos retrospectivos: una incidencia anterior devuelve su fecha/hora
original literal (columna sin zona), estado actual y `historial_completo=false`.
No se atribuye una zona horaria desconocida al registro antiguo. Los eventos nuevos
se muestran en America/Lima con segundos. Una modificación SQL sin actor no inventa
un administrador. La identidad administrativa solo se muestra en Admin mediante ID;
no se exponen nombres/correos al cliente.

## Contratos y permisos

- GET `/api/me/incidencias/:id/seguimiento`: solo usuario propietario del suministro
  autenticado; no toma suministro del navegador. Incidencia ajena o inexistente: 404.
- GET `/api/admin/incidencias/:id/seguimiento`: exige rol Admin vigente.
- PATCH `/api/admin/incidencias/:id/estado`: conserva la ruta y respuesta anterior;
  admite `solicitud_id` y `comentario_publico` opcionales. Añade `cambiada`/`repetida`.
- Paginación: `limite` 1–50 (30 por defecto), `despues` UUID del último evento de esa
  incidencia; `siguiente` permite continuar. Orden ascendente estable, sin exponer el
  contador global. Cursor ajeno: 400. Lectura en snapshot consistente, sin caché.
- JWT, roles y versión 2FA siguen pasando por los middleware existentes. No hay rutas
  de escritura de eventos accesibles al cliente. Errores internos no incluyen SQL.

## Pruebas verificadas del backend

`Backend/test/incident-tracking.cjs`: **10 aprobadas**, Node.js 22 y PostgreSQL 18.
Migración repetida, foto anterior preservada, fecha real, acceso propietario/Admin y
404 ajeno, rechazo de JWT revocado, entradas inválidas, paginación, concurrencia,
UUID repetido, rollback ante fallo del aviso, protección append-only y ausencia de
BYTEA. Un socket real recibe el cambio después del COMMIT; un único aviso y una
entrega al proveedor push simulado, sin envíos FCM reales.

Regresión inicial: 132 aprobadas, 1 omisión condicional y 18 fallos de inicialización
por no configurar `PLAYWRIGHT_BROWSERS_PATH`. Repetido solamente ese grupo con la
ruta del proyecto: 18/18 aprobadas. No se cambió la aplicación para resolver ese error.
La omisión corresponde a la variante histórica separada de recibos: se ejecutó después
en su modo específico, con 12 aprobadas y 1 omisión inversa esperada. Así se comprobaron
ambas variantes sin desactivar controles de integridad.

## Interfaz y evidencia Chromium

Se conservan tarjetas, código de seguimiento, foto, filtros/contadores y formulario.
El cliente agrega «Ver seguimiento»; Admin agrega «Ver historial» y comentario público
opcional, conservando la tabla y el selector existentes. La línea de tiempo compartida
es de solo lectura: los controles administrativos se distribuyen exclusivamente en
Admin, fuera del runtime Android. Fechas, estado actual e historial son distintos.

Chromium con API/PostgreSQL y Socket.IO reales: cinco resoluciones, respuesta HTTP
perdida, reintento UUID, cambios sin recargar, desconexión/reconexión, legado, foto y
teclado/Escape aprobados. Capturas locales en
`artifacts/seguimiento-incidencias-120/before/` y `after/`.
Se comprobaron las resoluciones 360×800, 390×844, 768×1024, 1366×768 y 1920×1080,
con cliente y Admin simultáneos. Nueve comprobaciones del flujo final (una suite E2E),
sin errores JavaScript: el formulario original registra foto y un solo evento inicial,
Admin recibe la incidencia nueva sin recargar, controles de teclado permanecen dentro
del diálogo y Escape lo cierra. La prueba E2E existente de push también pasó con API/
Socket.IO reales y proveedor simulado; no prueba una entrega FCM remota.

La revisión visual corrigió una colisión de `workspace.css`: el nuevo encabezado celeste
heredaba un párrafo blanco de los diálogos antiguos. Se fijó un selector específico del
seguimiento; el test comprueba `rgb(36,55,70)` y conserva los otros módulos.
El formulario de cambio permanece únicamente en Admin. Los controles de seguimiento
se cierran y limpian al salir/cambiar de sesión; las solicitudes en curso se cancelan.


## Laboratorio reproducible

No se leen .env productivos. Cada suite crea una base nueva sintética y la conserva.
PostgreSQL de esta tarea: contenedor exclusivo `hm-incidencias-120-pg`, loopback 32768,
PG18; no se modifican ni eliminan contenedores o volúmenes anteriores.

Para preparar otro laboratorio, elegir un nombre/puerto libres; no reutilizar una
base con datos existentes:

```sh
docker run -d --name hm-incidencias-120-pg-replica --label hidro.task=seguimiento-incidencias-120 \
  -p 127.0.0.1:55439:5432 -e POSTGRES_DB=hm_email_test -e POSTGRES_USER=hm_fixture \
  -e POSTGRES_PASSWORD=fixture-only-not-production postgres:18
export HIDRO_EMAIL_TEST_DB_PORT=55439
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
node --test Backend/test/incident-tracking.cjs
node --test scripts/test/incident-tracking-flow.cjs
# Solo con AVD dedicado hm_110_debug_api35 disponible:
node scripts/test/android-session-native.cjs --incidents
```

Requiere Node 22, dependencias `npm ci` raíz/Backend y las herramientas Playwright/
Android de las guías existentes. La contraseña mostrada es solo fixture sintético.
La prueba nativa usa el wrapper Java 21 y recursos recién sincronizados, compila debug
en un directorio independiente y solo instala en el AVD dedicado. No genera release.

## Android nativo y resultados finales

Entorno: Node 22.23.4, PostgreSQL 18.6 en Docker, Java 21 y Gradle 8.11.1 mediante
`scripts/android-gradle.sh`. AVD exclusivo `hm_110_debug_api35`, Android 15/API 35,
serial `emulator-5582`; ningún teléfono físico. No se crearon dispositivos externos.

Comparación nativa anterior: `artifacts/android-session-native-J4KLjv/`, recursos web
preservados de 5e3ea8f antes de editar, con API exclusivamente del laboratorio.
No se usa ese build histórico para aprobar la funcionalidad nueva. Comparación final:
`artifacts/android-session-native-YuqMQL/`, sincronización oficial desde los recursos
actuales. Ambos midieron viewports reales 360×800 y 390×844; no se redimensionan las
imágenes para aparentarlo. Las capturas adb incluyen además las barras del sistema.

Resultado final: **6 comprobaciones nativas registradas, sin errores**, más aserciones
de logout/borrado de credencial y ausencia de JWT en Web Storage. Se comprobaron evento
inicial, actualización por Socket.IO sin recarga, desconexión/reconexión, foto original,
Atrás, cierre/reapertura, sesión validada restaurada desde Keystore e historial guardado
en PostgreSQL. No se guardan copias del historial en almacenamiento persistente Android.

La última repetición esperó el cierre real del transporte anterior al reiniciar:
espera máxima observada **904 ms**; no desconectó sockets artificialmente ni alteró
heartbeat del backend. Se mantiene la aserción de una única conexión nueva.

`assembleDebug`, `assembleDebugAndroidTest`, `testDebugUnitTest`, `lintDebug` aprobados:
**4 JUnit**, **1 prueba instrumental Keystore**, **0 errores lint / 16 advertencias**
preexistentes sobre recursos, manifest e iconos. Advertencia de herramientas SDK XML
v3/v4 documentada en el build, sin fallar la compilación. No se compila release.

| Grupo | Resultado final |
| --- | --- |
| Seguimiento Node/PG18 | 10 aprobadas |
| Regresión Node/Chromium de auth, OTP, 2FA, recuperación, push, pagos, recibos, PDF, HidroBot y sesión | 150 aprobadas; 1 omisión condicional cubierta por la variante histórica |
| Recibos históricos en modo separado | 12 aprobadas; 1 omisión inversa esperada |
| E2E seguimiento cliente/Admin con API y Socket.IO reales | 1 suite aprobada, 9 comprobaciones funcionales; 5 resoluciones |
| E2E push existente, entrega simulada | 1 suite aprobada |
| Verificación adicional runtime/sesión | 9 aprobadas, se superponen a la regresión |
| Android 15 | 6 comprobaciones registradas; JUnit 4/4, Keystore instrumental 1/1, lint sin errores |
| Android físico / TalkBack / FCM remoto | No ejecutados; requieren dispositivo/credenciales y autorización posteriores |

Los conteos de grupos no se suman como pruebas únicas: hay regresiones superpuestas.
Los fallos de preparación y automatización se conservan en los logs iniciales; las
repeticiones finales indicadas están aprobadas y no queda un fallo crítico conocido.

Abrir la galería local `artifacts/seguimiento-incidencias-120/index.html`: antes/después
Chromium/Android y detalles de seguimiento. Copias nativas seleccionadas en
`native-before/` y `native-after/`; fotos, capturas y logs permanecen locales, fuera de Git.
Logs principales: `backend-final.log`, `regression.log`, `transition-final.log`,
`receipts-legacy.log`, `flow-complete.log`, `push-ui-regression.log`, `runtime-final.log`
y `native-drain-final.log`. Resultados máquina: `after/result.json` y
`native-after/{result,incident-tracking}.json`.

Archivos funcionales: `Backend/incident-tracking.js`, rutas acotadas de `server.js`,
SQL 013/instalaciones nuevas, `Shared/incident-timeline.js`, estilos compartidos solo
del seguimiento, `Admin/assets/js/incident-review.js`, integración en ambos HTML/Admin,
allowlist/guardia de empaquetado y scripts de pruebas. No se modifica código de OTP,
2FA, recuperación, pagos, PDF ni HidroBot.

## Errores de prueba investigados

- Fixture PNG con CRC inválido: reemplazado por PNG sintético válido de `pngjs`; no se
  modificaron las fotografías originales ni la aplicación para tolerar archivos dañados.
- La aserción del socket esperaba `id_incidencia`, pero el contrato existente usa `id`:
  se corrigió la prueba y se conservó el evento público.
- Selector nativo estricto esperaba un evento cuando la segunda resolución ya tenía dos:
  espera el primer evento y comprueba por separado el número/estado correspondiente.
- Resolución solicitada al AVD no equivalía al viewport WebView por barras del sistema:
  calibración exclusivamente del AVD y medición de `innerWidth/innerHeight`, sin escalar
  ni manipular capturas para aparentar otra resolución.
- Una repetición final encontró transporte anterior todavía abierto tras force-stop al
  redimensionar el AVD. Se detiene la app antes de cambiar tamaño y se espera la desaparición
  real de sus transportes anteriores antes de arrancar. La aserción de un único Socket.IO
  nuevo permanece; el fixture no desconecta sockets para hacerla pasar. Resultado final
  y duración observada constan en la sección Android anterior.

## Dependencias y revisión

PR #18 con base #17; PR #12–17 son ancestros de la base comprobada. PR #11 no es ancestro
literal, pero `git cherry HEAD origin/feature/verificacion-correo` marca su commit como
parche equivalente ya incorporado; el inicio automático tras OTP se comprueba en las
regresiones. No fusionar #11 por separado ni cambiar las ramas anteriores.

## Límites y seguridad de publicación

Sin Neon, migraciones productivas, correos, FCM remoto, datos reales, pagos reales,
modificación de APK oficiales, despliegues, merges ni gastos. La prueba física/TalkBack,
la revisión de políticas de comentarios públicos y el despliegue de 013 con respaldo
son pasos posteriores, no aprobados aquí. Si falta 013, el seguimiento devuelve error
seguro y no inventa un historial ni ejecuta DDL automáticamente.

Antes del primer push se comprobó Render en lectura: main, autoDeploy off, previews
off; ambos proyectos Vercel tienen exclusión de esta rama en sus respectivos JSON.
No hay workflows GitHub activos. No se modifican configuraciones remotas.

APK oficiales conservadas: 1.1.1 SHA-256 `541b4c9d70a52396266358d786032db47c85e99aa2ae4d7ae1bcf5eb28c3bb4b`
y 1.1.2 `a6b81541a210e79ffb6ec8a38c79b8b1260758ab45c246b81fca45ee4439ed93`,
comprobadas por checksum en esta tarea. El entorno AVD es debug y no sustituye una APK
release ni una validación en teléfono real. Se deja pendiente revisión física, despliegue
autorizado de la cadena de PR y migración 013, sin activar FCM.
