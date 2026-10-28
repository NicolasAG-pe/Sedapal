# Compatibilidad productiva de pagos — PR #23

**Bloqueo SQL resuelto localmente; listo para revisión, sin migrar/desplegar/publicar.**
Continuación de `1350258` en `preparation/lanzamiento-oficial-120`.
Main `aba629f` y todos los cambios Kubernetes del #21 conservados; #22 excluido.

## Decisión y límites

008 define operaciones simuladas e historial inmutable. 009/010 añaden controles
exclusivos del laboratorio, pero el backend común también lee tres de sus campos
y escribe seis, incluso con NULL y piloto deshabilitado. El error42703 no se
resolvía apagando Yape. No se cambian las consultas ni el contrato de la API.

La migración **014_compatibilidad_operaciones_produccion.sql** añade únicamente:
`piloto_id UUID`, `piloto_ensayo BOOLEAN`, `receptor_huella TEXT`,
`recibido_en TIMESTAMPTZ`, `monto_recibido NUMERIC(10,2)` y
`receptor_comprobado BOOLEAN`. Son campos de compatibilidad, **siempre NULL**,
sin valores por defecto, FK a pilotos, tabla de control ni recepción bancaria.

`chk_operacion_produccion_sin_piloto` exige entorno simulado y los seis NULL en
todas las filas. No abre Yape ni relaja las restricciones de008. Es aditiva,
transaccional, repetible y valida filas existentes; lock_timeout2s y
statement_timeout30s. Falla antes de alterar nada si falta008 o existe
`control_piloto_yape`: no se concatena con009/010 ni se aplica al laboratorio.
Un propietario de la base sigue pudiendo cambiar DDL; el CHECK no sustituye
separación de privilegios ni el control externo de publicación.

La ruta productiva exacta es:

```text
007_usuario_2fa.sql
008_operaciones_pago.sql
011_recuperacion_clave.sql
012_notificaciones_push.sql
013_seguimiento_incidencias.sql
014_compatibilidad_operaciones_produccion.sql
```

**009/010 se excluyen. No ejecutar init.sql sobre Neon ni una base existente.**
El laboratorio mantiene su ruta009/010 y sus controles sin modificaciones.
`payment-operations.js`, `yape-pilot.js` y008/009/010 conservan sus hashes.

## Validación relacionada

| Comprobación | Resultado |
| --- | --- |
| Migración014, operaciones y piloto existentes | **20/20**, cero omisiones/fallos |
| Guardas014 | Sin008 falla; esquema de piloto rechazado sin alterar columnas; repetición conserva operación/historial008 |
| Restricción productiva | Intentar rellenar cualquiera de los seis campos falla con23514; historial/operaciones siguen protegidos contra borrado |
| Restauración exacta | Respaldo ya verificado, SHA-256 cotejado antes de usarlo; base nueva y datos previos conservados |
| Ruta productiva | Las seis migraciones anteriores, dos aplicaciones de cada una; sin009/010 ni tabla de control |
| API real cliente/Admin | **5 grupos aprobados**: login, demostración/idempotencia concurrente, consulta/historial/paginación/filtros,401/403/404 y métodos cerrados |
| Navegador real | **4 grupos aprobados**: cliente390×844, Admin1366×768, historial/filtros y recorrido UI→REST→PG→UI; cero500/erroresJS/salidas externas |
| Cotejo posterior al navegador | Todas las filas previas siguen presentes; ninguna demostración inserta pagos; recibo Pendiente, monto conservado y control de piloto ausente |
| Android | APK1.2.0/código6 anterior reutilizada; hash idéntico, sin Gradle ni emulador nuevo |

Los grupos se superponen; no se suman como casos únicos. Las regresiones usan
bases sintéticas nuevas y la restauración real usa otra base exclusiva. Se
probaron las pantallas originales, sin maquetas. Se mantuvo Socket.IO simulado
solo en este harness UI para concentrar la prueba en pagos/014; no se repiten ni
se atribuyen nuevas aprobaciones de tiempo real, Android o auditoría general.

La API del ensayo usa NODE_ENV=production, inscritos2FA/recuperación/push/manual/
Yape cerrados y ningún worker o credencial externa. Node y PostgreSQL comparten
un namespace Docker sin red externa ni puertos. Chromium llega por socket Unix
privado; ninguna petición va a Neon, Render o Vercel. Se usan cuentas y recibos
sintéticos para las operaciones y capturas acotadas. El propietario de la copia
se usa solo en el ensayo; esto no certifica permisos de ejecución productivos.

Los primeros fallos del harness fueron una etiqueta de fixture mayor a20
caracteres y la longitud del path Unix del host. Se respetó el contrato y se
usó un descriptor de directorio para el socket, sin cambiar producto/aserciones.
Los logs/resultados iniciales se conservan privados junto a la ejecución final.

## Reproducción local sin producción

Reutilizar el PostgreSQL privado marcado `hm-release120-restore` y la imagen local
ya existente `hidro-mejora-api:release-120-preparation`. El harness verifica label,
namespace sin red/puertos, espacio libre, permisos privados, hash del dump y
restoreVerified. Nunca lee DATABASE_URL productiva. Crea una base nueva, no
sobrescribe ni elimina otras; conserva API/copia para el paso UI.

```bash
HIDRO_COMPAT_BACKUP_DIR=/ruta/privada/respaldo-verificado \
HIDRO_COMPAT_PG_ENV=/ruta/privada/restore-container.env \
node scripts/test/payment-production-restore.cjs

# Usar el directorio de evidencia que imprimió el paso anterior:
HIDRO_PLAYWRIGHT_MODULE=/ruta/herramientas/playwright \
PLAYWRIGHT_BROWSERS_PATH=/ruta/navegadores-existentes \
node scripts/test/payment-production-browser.cjs /ruta/evidencia
```

Las regresiones concretas son `Backend/test/payment-production-compat.cjs`,
`payment-operations.cjs` y `yape-pilot.cjs`: ejecutar con el fixture PostgreSQL
sintético habitual, nunca con una URL productiva. En esta ejecución se montó
el repositorio de solo lectura en un contenedor sin red externa, con una salida
nueva para artefactos; 20 aprobadas y ninguna limpieza de archivos anteriores.

Evidencia final privada: `artifacts/production-payments-compat-gbcVur/`.
Regresiones: `production-payments-compat-rdzs1p/regressions/tests.log`.
Conservar los JSON/capturas y contenedores. Detener solo la API indicada en
`restore-result.json.apiContainer` y el PostgreSQL si el mismo informe indica
que estaba detenido antes; no borrar contenedores, bases, volúmenes ni evidencia.

## Aprobaciones y condiciones que siguen pendientes

1. Revisión del SQL014, sus seis metadatos NULL, CHECK, ruta exacta y pruebas;
   aceptar el SHA final del PR23 y la integración #12–#20 conservando#21.
2. Registrar revisiones/actas externas de las condiciones originales. Al cerrar
   esta corrección6010e6d, PR12–20 y23 seguían Draft sin reviews formales ni
   comentarios inline; no equivale a aprobación tácita. La preparación posterior
   de23 para revisión se documenta en la [ventana](../VENTANA-LANZAMIENTO-120.md).
3. El riesgo de downgrade2FA **no cambia**. No está impuesto el control externo:
   inscripción cliente/Admin cerrada. Aprobar explícitamente ese alcance
   desactivado; para activar2FA después, imponer controles de deploy/rollback,
   credenciales, lectores y recuperación antes del primer factor real.
4. Autorizar una ventana productiva con respaldo fresco verificado y plan de
   parada/recuperación compatible, aplicar solo la ruta aprobada y validar los
   servicios efectivos. El respaldo del ensayo no cubre escrituras posteriores.
5. Autorizar posteriormente merge, despliegues coordinados y release del SHA
   aprobado. No se ejecutaron en6010e6d. Preparar23 para revisión en el avance
   posterior no aprueba producción ni cambia el estado de los Draft12–20.

**014 no se aplicó en Neon.** No hay merge, despliegue, tag/release ni APK pública
1.2.0 nueva. Cobros/FCM/correos reales desactivados en las pruebas. El bloqueo
concreto de pagos queda resuelto para revisión; no se declara aprobado el lanzamiento.
