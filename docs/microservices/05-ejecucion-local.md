# Laboratorio local — requisitos de construcción

MS-02 ya tiene [Dockerfile y ejecución de Notifications](../../Backend/services/notifications/README.md)
probados sin red externa. El laboratorio Compose completo descrito abajo sigue
pendiente. Las pruebas PostgreSQL usan una instancia nueva sin puertos publicados,
network none y tmpfs; el runner comparte exclusivamente su namespace de red.

Estado: **compose.microservices.yaml todavía no implementado**. No ejecutar
comandos de arranque suponiendo que esta propuesta constituye un laboratorio.
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
