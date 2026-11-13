# Laboratorio local — requisitos de construcción

## Laboratorio Compose de los servicios extraídos (MS-02 y MS-03)

`compose.microservices.yaml` ejecuta únicamente los procesos ya implementados:
db (PostgreSQL 18 sintético exclusivo), db-init (aplica `init.sql` y las
migraciones repetibles 003/006/007/011 y termina), auth, notifications y el
worker existente `Backend/workers/email-outbox.cjs` empaquetado en la imagen de
Auth. El proyecto Compose tiene identidad propia `hidro-ms120-lab`: levantar
este archivo no crea, modifica ni detiene la pila del monolito (`compose.yaml`).
No hay gateway, Billing, Operations ni clientes: no están extraídos todavía.

Solo procesos internos: ningún servicio publica puertos; todo el tráfico queda
en la red `interna` con `internal: true` (sin salida a Internet). Los secretos
no se versionan: se generan en `.env.microservicios` (ignorado por Git) siguiendo
`.env.microservicios.example`; compose falla de forma explícita si falta alguno.
La base es sintética y aislada (`hm_email_lab`, usuario `hm_fixture`, valores
etiquetados como fixture al igual que en CI). En este laboratorio el rol es
superusuario de su instancia: la separación de roles SQL queda para la etapa de
independencia de almacenes.

```sh
cp .env.microservicios.example .env.microservicios
# Completar las seis claves con openssl rand (ver la plantilla) y chmod 600.
docker compose --env-file .env.microservicios -f compose.microservices.yaml up -d --build
docker compose --env-file .env.microservicios -f compose.microservices.yaml ps
```

Comprobación de comunicación entre procesos independientes: registrar una
cuenta contra Auth (contenedor `auth`), ver la fila `pendiente` de
`correo_outbox` en `db`, arrancar el worker y comprobar la transición a
`aceptado` con `proveedor_id` `stub-…` — un id que solo Notifications puede
devolver. Control negativo: con `notifications` detenida el trabajo nunca pasa
a `aceptado` (queda en reintento con ambigüedad, sin `proveedor_id`) y al
reanudar Notifications la entrega continúa sin reiniciar Auth ni el monolito.

Para detener el laboratorio: `docker compose --env-file .env.microservicios
-f compose.microservices.yaml stop`. No usar `down -v` ni `prune` sin
autorización: el volumen `hidro-ms120-lab_datos_lab` solo contiene datos
sintéticos del laboratorio, pero la limpieza de volúmenes no es decisión
automática.

## Estado general

MS-02 y MS-03 tienen ejecución Compose local probada sin red externa. El
laboratorio completo (web, admin, gateway, billing, operations, realtime)
descrito abajo sigue pendiente. Las pruebas PostgreSQL usan una instancia nueva
sin puertos publicados, network none y tmpfs; el runner comparte exclusivamente
su namespace de red.

Estado: **compose.microservices.yaml implementado para los servicios extraídos**;
el laboratorio completo con clientes y gateway no existe todavía. No ejecutar
`compose.yaml` suponiendo que incluye microservicios, ni los archivos de este
laboratorio suponiendo arquitectura completa.
`compose.yaml` original permanece intacto.

El futuro laboratorio tendrá identidad exclusiva `hidro-ms120-<identificador>`,
sin container_name fijo, redes/volúmenes externos ni referencias a instalaciones
previas. Solo web y Admin publicarán puertos loopback disponibles; PostgreSQL,
gateway y dominios serán internos. Variables nuevas generadas localmente y
guardadas con modo 0600 fuera de Git; ningún .env privado existente se cargará.

Servicios previstos: web, admin, gateway, auth, billing, operations,
notifications, realtime, postgres. Cada proceso tendrá healthcheck y cierre
SIGTERM propio. Proveedores externos simulados; sin credenciales reales.
No usar el supervisor común que detenga API cuando falle un worker.

El inicializador deberá rechazar un destino existente, preparar un esquema
sintético identificado y aplicar solo migraciones del perfil elegido. Probar
perfil con piloto y perfil sin piloto separadamente. Roles de ejecución sin
SUPERUSER, CREATEDB, CREATEROLE ni propiedad de tablas ajenas; migrador separado.

La detención usará `docker compose -p IDENTIDAD -f ARCHIVO stop`, después de
verificar etiquetas del proyecto. No usar down -v, prune ni borrar volúmenes.
La guía definitiva incluirá comandos reales solo cuando esos archivos existan
y se hayan probado.

## Referencia ejecutada

Se creó `/tmp/hidro-ms-audit-120` desde `git archive` del SHA auditado, sin
archivos privados. Se ejecutaron npm ci Backend, inventario y suite segura en
un contenedor temporal de una imagen local con Node 22.23.4. El historial Git
se montó en solo lectura para la prueba de actualización Android. Dependencias
instaladas desde el lock con scripts de instalación deshabilitados.

Esta ejecución no levantó la aplicación ni PostgreSQL y no envió correo,
push ni pagos. No acredita independencia de servicios.
