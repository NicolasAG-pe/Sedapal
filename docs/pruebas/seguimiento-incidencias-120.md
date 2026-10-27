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
La omisión corresponde a la variante histórica separada de recibos, pendiente aquí.

## Interfaz y evidencias en curso

Se conservan tarjetas, código de seguimiento, foto, filtros/contadores y formulario.
El cliente agrega «Ver seguimiento»; Admin agrega «Ver historial» y comentario público
opcional, conservando la tabla y el selector existentes. La línea de tiempo compartida
es de solo lectura: los controles administrativos se distribuyen exclusivamente en
Admin, fuera del runtime Android. Fechas, estado actual e historial son distintos.

Chromium con API/PostgreSQL y Socket.IO reales: cinco resoluciones, respuesta HTTP
perdida, reintento UUID, cambios sin recargar, desconexión/reconexión, legado, foto y
teclado/Escape aprobados. Capturas locales en
`artifacts/seguimiento-incidencias-120/before/` y `after/`.
El estado final de Android/Gradle/lint se completará en el siguiente incremento.

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

## Límites y seguridad de publicación

Sin Neon, migraciones productivas, correos, FCM remoto, datos reales, pagos reales,
modificación de APK oficiales, despliegues, merges ni gastos. La prueba física/TalkBack,
la revisión de políticas de comentarios públicos y el despliegue de 013 con respaldo
son pasos posteriores, no aprobados aquí. Si falta 013, el seguimiento devuelve error
seguro y no inventa un historial ni ejecuta DDL automáticamente.

Antes del primer push se comprobó Render en lectura: main, autoDeploy off, previews
off; ambos proyectos Vercel tienen exclusión de esta rama en sus respectivos JSON.
No hay workflows GitHub activos. No se modifican configuraciones remotas.
