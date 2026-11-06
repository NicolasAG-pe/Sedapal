# Validación DB-01 — completada localmente

Fecha de sesión: 2026-11-04. Rama: chore/adopcion-sdd-rpi. Inicio de etapa B: 4931f2f, cierre comprobado de PKG-01. Base funcional anterior: d3d27d0. El commit de corrección DB-01 es el siguiente avance local después de 4931f2f; su hash se verifica al cierre sin autorreferencia en el documento.

## Cambio y aislamiento

Único cambio funcional: Backend/receipt-transactions.js añade una consulta to_regclass('public.control_piloto_yape') con el client transaccional antes del acceso opcional. Si no existe, ese bloqueo es falso; pagos, operaciones y estado Pagado siguen siendo obligatorios. Si existe pero no hay permiso, el error se propaga. No catch de SQL para ocultar incompatibilidades, sin caché global ni cambios de locks, timeouts, COMMIT/ROLLBACK, rutas, configuración o migraciones.

Node 22.23.4 de imagen local sedapal-backend:latest (737f3d96f4b8), dependencias existentes /app/node_modules. PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2), imagen postgres:18 local. Sin descargas/instalaciones. Contenedor PG creado exclusivamente para esta sesión: hidro-db01-7c479d8157b4, ID 96f1c911c27daa3eb93f0298fd4398810b3cd5d43332083c1573c9e8d764713b, label hidro.sdd.test igual al nombre. NetworkMode=none, cero puertos publicados, ningún bind/volume; HostConfig.Tmpfs monta /var/lib/postgresql con límite 512 MB. Docker no enumera ese tmpfs en Mounts; se comprobó su ubicación real en HostConfig antes de retirar el recurso.

Cada ejecución Node utiliza --network container:<ID-PG>, compartiendo solo el loopback del PG temporal sin interfaz de red externa; raíz de solo lectura, UID 1000, capacidades eliminadas, no-new-privileges y /tmp tmpfs. Código copiado desde archivos versionados Backend/Base-de-Datos y el test nuevo a una carpeta nueva de /tmp; ningún .env privado o respaldo. Copia montada read-only, con artifacts tmpfs propiedad de UID 1000 para informes existentes. Base padre hm_email_test y credenciales exclusivamente sintéticas del harness existente; bases hijas nuevas de nombre aleatorio. No se usan datos/restauraciones personales. La API real de prueba escucha un puerto efímero en el mismo loopback aislado. Correo simulado por helper, registro cerrado en el nuevo caso HTTP y flags de workers/push/recuperación deshabilitados; salida externa imposible por la red none.

## Perfiles ejecutados

- P-PROD-MIN: prefijo de init.sql anterior al marcador único de 007 (se exige existencia y unicidad) + 007/008/014; sin 009/010 ni tabla piloto. Comprobado catálogo y servidor 18 antes de fixtures.
- P-LAB: init.sql completo, incluye piloto y restricciones de 009/010; NO 014. Nombre hm_email_yape_pilot_<aleatorio> permite fixtures bajo su CHECK real. No se alteran constraints para insertar estados inválidos.
- API sin piloto: prefijo base + 007/008/011/012/013/014, registrationEnabled=0, autoDrain=false. Se reutilizó schemaSql de email-api.cjs sin modificar el helper.
- Regresiones existentes: compatibilidad 014 y guardas 007–013, API/concurrencia de laboratorio y caso histórico en otra base sintética sin UNIQUE, seleccionado con su flag existente.

## Reproducción antes de corregir

Nuevo Backend/test/receipt-profile-compat.cjs contra servicio original: salida 1, 35 casos según node:test, 25 aprobados y 10 fallidos (incluye padre de subtests fallidos). Error 42P01 en perfil sin piloto al editar recibo sin operación, Pagado sin respaldo y operaciones no bloqueantes; API 500 donde debe responder 200. Laboratorio, bloqueos con retornos tempranos, tablas obligatorias ausentes y permisos denegados se comportaban como se esperaba. El código funcional se corrigió solo después de esa reproducción.

Incidencias del entorno resueltas antes del cierre: Node no podía atravesar la copia temporal 0700 al ejecutarse como root sin capacidades; se usó el UID 1000 propietario (las rutas absolutas por sí solas no resolvían permisos). El primer agregado posterior falló al escribir informes por permisos del tmpfs artifacts; se fijaron uid/gid/modo en ese tmpfs, sin modificar la prueba existente. Un error de sintaxis del lanzador temporal se corrigió antes de volver a ejecutar. Ninguna de estas incidencias se cuenta como prueba aprobada ni como defecto del producto.

## Comandos y resultados finales

Dentro del contenedor Node, con NODE_PATH=/app/node_modules, HIDRO_EMAIL_TEST_DB_PORT=5432 y el aislamiento anterior:

```sh
node --test /workspace/Backend/test/receipt-profile-compat.cjs /workspace/Backend/test/payment-production-compat.cjs /workspace/Backend/test/quality-migrations.cjs /workspace/Backend/test/receipt-concurrency.cjs
```

Resultado: salida 0; 54 casos, 53 aprobados, 0 fallidos, 1 omitido por ser exclusivo del perfil histórico alternativo. Los conteos incluyen subtests y sus padres según node:test; no confundir con número de escenarios únicos de negocio.

Ese caso se ejecutó por separado en nueva base mediante HIDRO_RECEIPT_TEST_LEGACY=1:

```sh
node --test --test-name-pattern='histórico duplicado' /workspace/Backend/test/receipt-concurrency.cjs
```

Resultado: salida 0; 1 caso aprobado, 0 fallidos/omitidos. No queda escenario necesario sin verificar por la omisión condicional del agregado. Las pruebas existentes no se editaron ni relajaron. No se repitieron otros módulos ni suites live.

## Aceptación y trazabilidad

| Criterio | Prueba / evidencia | Resultado |
|---|---|---|
| AC-DB-01 | DB-T01/DB-T07: editar/anular sin pagos ni piloto, servicio/API reales | Aprobado, API 200 |
| AC-DB-02 | DB-T02/DB-T07: pago legacy, Pagado sin fila y cuatro estados bloqueantes; comparar snapshot | Aprobado, 409 y sin cambios |
| AC-DB-03 | DB-T02: demostrativa, rechazada, cancelada y reembolsada con constraints reales | Aprobado, no bloquean por sí solas |
| AC-DB-04 | DB-T03: piloto vigente, deshabilitado y vencido para ambas acciones | Aprobado, vigente bloquea; resto permite |
| AC-DB-05 | DB-T04: pagos/operaciones ausentes en bases distintas, permiso piloto denegado, error de conexión inyectado | Aprobado: 42P01/42501/08006 no se ocultan; HTTP 500 saneado en ausencia obligatoria |
| AC-DB-06 | DB-T05 y matriz nueva: carrera de unicidad, fallos tras UPDATE y trigger SQL P0001, rollback/snapshot/reutilización; regresiones locks/timeout/multiproceso/permisos | Aprobado, 401/403/404 conservados, sin transacciones abandonadas |
| AC-DB-07 | DB-T06: payment-production-compat.cjs y quality-migrations.cjs originales | Aprobado, guardas/datos/repetición/historial/restricciones conservados |

El fallo de conexión se inyecta antes de adquirir client; no se simula una caída real del servidor. La ausencia obligatoria se prueba renombrando únicamente tablas de bases sintéticas independientes, sin DROP/CASCADE ni datos reales. El error de escritura SQL se fuerza con un trigger exclusivo del fixture y se comprueba rollback; además se inyecta error después de UPDATE real. Pilotos se crean con CHECK originales, ensayo sintético y usuarios distintos; no se habilita ningún piloto real.

SC-DB-001/002/003 cumplidos en el alcance local. DB-01 COMPLETADO. Una consulta adicional de catálogo solo en el camino sin bloqueo previo; no se publica una promesa de rendimiento. Sin DDL concurrente: su operación requiere ventana separada. No se midió cobertura porcentual, caída de red real, otros PostgreSQL ni producción; no son afirmaciones de este cierre.

## Retirada y siguientes fases

Se comprobó cero conexiones cliente restantes; stop y rm exclusivamente del ID/label PG creado, sin -v y sin tocar volúmenes. Verificado después: ningún contenedor ni red con label hidro.sdd.test. Los contenedores Node se retiraron con --rm; no se crearon redes DB ni puertos host. No se accedió a Neon, servicios reales ni copia original; no hay cambios SQL versionados ni de infraestructura. Evidencia de seguridad basada en identidad/red/montajes y fuentes sintéticas, no en consultas a datos reales.

TEST-01: inventariar los dos nuevos tests y sus prerrequisitos junto con los existentes. CI-01: reproducir Node 22 y PG18 aislados, perfiles explícitos y lifecycle de recursos. SonarQube sigue sin ejecutar; requiere SHA/configuración/export y cobertura atribuibles. No push, PR, merge, deploy ni APK.
