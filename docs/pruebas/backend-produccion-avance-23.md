# Avance 23 — preparación del backend para Android 1.1.0

Fecha: 22 de octubre de 2026, hora de Lima. **Validación local; no es una autorización ni una ejecución productiva.**

## Dictamen

El backend candidato funciona en Docker con Node.js 22 y PostgreSQL 18 aislado. Las migraciones 003–006 preservaron los datos históricos sintéticos; se restauraron respaldos anteriores y posteriores en bases nuevas. Admin, contratos Android, pagos, incidencias, Socket.IO, chatbot y documentos superaron las comprobaciones descritas abajo.

Se corrigió una apertura involuntaria del registro cuando faltaba su bandera. La candidata requiere ahora `EMAIL_REGISTRATION_ENABLED=1` expresamente. El entorno principal de prueba permaneció cerrado y funcionó sin worker. El OTP habilitado se probó exclusivamente en otra base, sin exposición al host y con proveedor simulado.

**Podemos solicitar autorización para una actualización por etapas. No corresponde desplegar todavía:** falta identificar privadamente la base productiva, verificar un respaldo real restaurable, auditar sus anomalías/esquema y aprobar configuración, recuperación y ventana de mantenimiento. Esta prueba no certifica los datos ni las credenciales de Neon.

## Origen y límites de la auditoría

- `origin/main` descargado: `691209c030c862affa3c6683eadc45c843dafc3d`, commit de integración. Sigue siendo ancestro de la candidata.
- Worktree independiente `Sedapal-backend23`, rama **local** `preparation/backend-avance-23`. Las ramas originales y Kubernetes se conservaron. No se ejecutaron push, merge, PR ni despliegues.
- Primer incremento local: `e2d413327128b8e8a50d6bd13c7b1f2114371faf`, activación explícita de altas. Segundo: `6933760a52b7f3caa61852a475fec7ee64a99192`, parche de dependencia transitiva. Android, migraciones y el resto del código de negocio integrado permanecen sin cambios.
- `AGENTS.md`, documentación Android/release, informes 18–22, autenticación, esquemas, scripts y Dockerfile revisados. La instrucción específica del avance 23 de no hacer push prevalece sobre el flujo general de publicación.
- Render consultado **solo en lectura**, en el workspace previamente autorizado. No se solicitaron valores de variables privadas. Neon y Vercel no se modificaron ni se consultó la base productiva.

### Estado observado en Render

| Campo | Resultado |
| --- | --- |
| Servicio | `hidro-mejora-api`, `srv-db3f89qj9qps73fcvfbg` |
| Repositorio / rama / raíz | `NicolasAG-pe/Sedapal` / `main` / `Backend` |
| Runtime / Dockerfile | Docker, `./Dockerfile`, contexto `.` dentro de la raíz |
| Deploy live | `dep-db3fu2aj9qps73ffmbb0`, creado el 8 de octubre de 2026 |
| Commit realmente live | `864e0e1818ac9a61dd8305411deb63b5b944bfe2` |
| Autodespliegue | `autoDeploy=no`, `autoDeployTrigger=off` |
| Previews | `generation=off`, `pullRequestPreviewsEnabled=no` |
| Salud configurada | `/api/health` |

La comprobación de cierre mantuvo el mismo deploy live. El despliegue anterior no contiene los endpoints nuevos de capacidades/sesión; no se declara que los flujos Android 1.1.0 estén operativos contra ese servidor. La consulta de Render acredita su estado de despliegue, **no** la integridad de su base ni su configuración secreta.

## Entorno local y compilación

Docker 29; imágenes oficiales `node:22-alpine` y `postgres:18`. Runtime comprobado Node.js **22.23.4**, PostgreSQL **18.6**. Dockerfile oficial con `npm ci --omit=dev`; no se añadieron dependencias ni frameworks.

Imágenes locales construidas sin publicar:

- `hidro-avance23-backend:691209c`, base integrada antes de la corrección.
- `hidro-avance23-backend:e2d4133`, candidata intermedia con altas explícitas.
- **Candidata final** `hidro-avance23-backend:6933760`: `sha256:1e02c7cfbe1ab711aa2156379e70b15e1b917718a0f0ed2d1733c3135cc00eda`, etiquetada con la revisión completa `6933760a52b7f3caa61852a475fec7ee64a99192`.
- `hidro-avance23-web:691209c` y `hidro-avance23-admin:691209c`.

Red `hm23-isolated` interna, PostgreSQL sin puerto publicado, volumen nuevo `hm23-pgdata`. API y worker sin salida a Internet. Nginx Web/Admin expuestos solamente en loopback, puertos 18024/18025, mediante una segunda red del laboratorio. No se tocaron Compose, volúmenes ni el clúster kind del avance 19. El intento inicial de publicar un puerto desde una red exclusivamente interna no proporcionaba acceso; se ajustó únicamente la topología de este laboratorio, sin abrir la base ni habilitar salida del backend.

Para la CLI de correo se creó otro PostgreSQL nuevo, `hidro-compat-test-20261022`, con volumen propio y puerto dinámico ligado a loopback. La primera ejecución rechazó correctamente un entorno que no cumplía sus guardias de nombre/binding; la simulación posterior pasó sin debilitar esas guardias.

Las evidencias privadas están en `artifacts/avance-23/`, ignoradas por Git: logs, JSON de fixtures, env, dumps, capturas y PDF sintéticos. No se incorporan al repositorio. No se reconstruyó ni publicó APK.

Al cierre permanecen disponibles los cuatro contenedores principales del laboratorio (base/API/Web/Admin). Workers, APIs OTP temporales y PostgreSQL auxiliar están detenidos; se conservaron sus contenedores, volúmenes y datos sintéticos. Los recursos originales mantienen sus IDs, estado y montajes.

### Dependencia corregida durante la auditoría

`npm audit --omit=dev` detectó un aviso moderado en `ip-address` 10.7.3, transitiva de `express-rate-limit`: [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5). Se actualizó **solo esa entrada del lockfile a 10.7.4**, dentro del rango existente, sin modificar `package.json` ni añadir dependencias. No se afirma haber demostrado explotación remota en esta aplicación.

Después: `npm ci`, auditoría npm con **cero avisos conocidos**, suite completa Node 22 repetida y reconstrucción de la imagen. Un ensayo aislado sin red confirmó IPv6 válido aceptado y cadena malformada del aviso rechazada en aproximadamente 3 ms. Las comprobaciones HTTP, Admin/Socket.IO, Chromium y API/worker OTP separados también se repitieron sobre la imagen final. Cero avisos de npm no equivale a una auditoría exhaustiva de seguridad.

## PostgreSQL: conservación, migraciones y restauración

Se extrajo el esquema del commit realmente desplegado para crear una **base vacía nueva** `hm23_history`. Se sembraron tres usuarios sintéticos (incluido Admin), tres suministros, tres recibos en estados Emitido/Pagado/Anulado, un pago coherente y una incidencia. Se inventariaron las diez tablas originales, todas sus filas, FKs y valores de secuencias. No se usó un dump productivo.

`scripts/test/backend-history23.cjs` comparó las filas completas anteriores, excluyendo únicamente la nueva columna de verificación al comparar con el esquema viejo. Las tres cuentas conservaron su hash y acceso, y `correo_verificado_en` quedó `NULL`: no se inventó una verificación histórica. Después de las escrituras nuevas de API/UI se comprobó nuevamente que **todas las filas originales seguían presentes sin cambios**, con tres usuarios y cero eventos outbox en la base principal.

| Migración | Dependencia / efecto | Resultado local |
| --- | --- | --- |
| 003 | Esquema de negocio existente; columna nullable y tablas de solicitud/historial de envíos OTP | Aplicada dos veces, sin modificar cuentas previas |
| 004 | Tablas 003; índice de vencimiento para retención | Aplicada dos veces |
| 005 | FKs de negocio compatibles y datos coherentes; UNIQUE suministro/período y pago/recibo | Aplicada dos veces; constraints validadas, filas/FKs/secuencias preservadas |
| 006 | Historial 003; outbox cifrada, estados, leases e índices | Aplicada dos veces; API y worker separados funcionan |

El orden es **003 → 004 → 005 → 006**. Debe comprobarse previamente que los cambios de base anteriores, incluidos 001/002 cuando correspondan, estén representados; no se propone reejecutar todo `init.sql` ni migraciones antiguas a ciegas sobre producción. `IF NOT EXISTS` no repara definiciones incompatibles: la repetibilidad comprobada corresponde al esquema esperado, no a cualquier deriva posible.

### Integridad 005

`Base-de-Datos/checks/005_integridad_recibos.sql` devolvió cero en sus siete controles para el fixture coherente. Debe ejecutarse en el destino autorizado antes de decidir una migración. Cualquier conteo distinto de cero, incluidos espacios externos del período, exige revisión privada; no autoriza normalizar, borrar ni reconciliar automáticamente.

Las pruebas independientes construyeron bases nuevas inconsistentes: recibos duplicados, pagos duplicados, importe distinto, anulado con pago y pagado sin pago. **005 rechazó cada caso sin alterar filas ni agregar parcialmente sus constraints.** También se comprobaron deriva de FK, colisión de índice y bloqueo concurrente. La migración usa transacción, `lock_timeout=2s`, `statement_timeout=30s` y bloqueo de tablas para evitar carreras entre su comprobación y las restricciones. No debe forzarse su ejecución cuando haya escrituras o bloqueos.

### Respaldo y restauración local realizados

Se usó `pg_dump` 18 en formato custom antes y después de las migraciones; ambos archivos se restauraron con `pg_restore --exit-on-error --no-owner` en **otras bases nuevas**, `hm23_restore_before` y `hm23_restore_after`. Se verificaron filas originales, FKs y secuencias; después también tablas OTP/outbox y las dos restricciones nuevas. Los dumps permanecen privados y conservados.

Esto acredita el mecanismo con datos sintéticos. **No acredita respaldo productivo, propietarios, ACL/RLS, extensiones ni roles reales**: la restauración con `--no-owner` exige una validación adicional de permisos en el procedimiento autorizado.

## Contratos y pruebas funcionales

El harness `scripts/test/backend-docker23.cjs` accede únicamente a los proxies loopback y utiliza fixtures privados sintéticos; el servidor ejecuta realmente la imagen candidata en Node 22. La validación de navegador es Chromium, no Android nativo.

| Área | Comprobación ejecutada | Resultado |
| --- | --- | --- |
| Salud / DB | Web y Admin 200, `/api/health` con PostgreSQL migrado | Aprobada |
| Capacidades | `/api/auth/capabilities`, contrato `otp-outbox-v1`, `Cache-Control: no-store` | Aprobada |
| Sesión | `/api/auth/session`: token válido, sin token, inválido, vencido; estado/rol reales en suite | Aprobada, sin renovar token |
| JWT | Ocho horas; Admin no entra a sesión cliente; usuario no accede a Admin | Aprobada |
| Cuentas anteriores | Login por suministro/contraseña y perfil con verificación histórica NULL | Aprobada |
| Android 1.0.0 | Payload de login anterior contrastado con código de v1.0.0; registro antiguo 426 controlado | Aprobada a nivel HTTP, no instalación nativa nueva |
| Android 1.1.0 | Endpoints nuevos, CORS `https://localhost`, cabecera de contrato, preflight y rechazo de origen ajeno | Aprobada a nivel HTTP |
| Recibos y pagos | Admin emite recibo nuevo; cliente propietario consulta/paga; otra cuenta 404; duplicado 409, un solo pago | Aprobada |
| Incidencias | Alta y consulta sintéticas sin cambiar la incidencia histórica | Aprobada |
| Admin | Login, rechazo de rol cliente, 19 rutas protegidas y siete módulos en UI | Aprobada |
| Socket.IO | Autenticación cliente/Admin por ambos proxies, un socket cliente, recepción de recibo nuevo | Aprobada |
| HidroBot | DOM real, orientación/fuente oficial, prioridad del recibo personal y contenido tratado como texto | Aprobada |
| PDF | Descarga desde UI de recibo y constancia generados con datos de API; texto/suministro/importe comprobados con Poppler | Aprobada |
| Navegación / logout | Cinco secciones cliente, cierre de socket y limpieza de sesión web | Aprobada |
| Logs | Sin contraseñas, secretos ni JWT empleados por el harness en logs de la API | Aprobada para los valores y flujos probados |

La suite de sesión también comprueba cuenta deshabilitada. La persistencia Android Keystore no se reimplementó: no cambió el cliente ni ese contrato. Las pruebas nativas y actualización 1.0.0 → 1.1.0 del avance 22 siguen siendo evidencia previa, **no una ejecución nativa de este avance**. La APK firmada mantiene su URL HTTPS de Render; no se redirigió al Docker local ni se probaron escrituras contra producción.

### OTP, outbox y worker

Se reprodujo un problema real de configuración: con secretos sintéticos válidos y bandera ausente, la imagen integrada respondía **202** y encolaba una solicitud. La corrección sustituye la condición permisiva por `EMAIL_REGISTRATION_ENABLED === '1'`. Con la candidata, el mismo escenario devuelve **503**, sin agregar filas; la solicitud sintética anterior se conserva. Las plantillas explicitan altas/worker cerrados y la conservación del secreto JWT al actualizar. Los fixtures que necesitan OTP lo habilitan expresamente.

En otra base nueva `hm23_otp_security`, API interna y worker independiente de la **misma imagen candidata final** (repetición del ensayo previo en `hm23_otp_candidate`):

1. Con worker detenido, la API respondió 202/en cola. Repetir UUID conservó un único evento cifrado y no creó usuario ni suministro; no hubo llamada al proveedor.
2. Worker `--once` en otro contenedor procesó el evento con `fetch` sustituido por un proveedor local sin HTTP. La red interna impedía contactar Resend. Hubo una única aceptación **simulada**.
3. OTP incorrecto devolvió 400; correcto 201, un usuario y un suministro. Login y sesión posteriores 200; payload outbox eliminado.
4. El registro principal siguió devolviendo 503. La API OTP de prueba se detuvo al terminar.

Las suites con PostgreSQL cubren respuesta perdida, concurrencia/idempotencia, intentos/reenvíos/vencimiento, cancelación, leases y recuperación, backoff, ambigüedad y eliminación del payload. El código OTP conserva cinco minutos de vigencia; en outbox se establece al iniciar el procesamiento, no se declara enviado mientras permanezca en cola. **Aceptado por proveedor no equivale a entregado al buzón.** No se usó una clave Resend real ni se envió correo.

Worker listo (`estado=vacio`) + SIGTERM: salida 0 en 1,12 s, sin OOM. Un ensayo de parada inmediata durante el arranque terminó 137 tras diez segundos; se conserva como incidencia de operación, no como aprobación. No se certifica drenaje de todo envío en curso ni parada durante cualquier fase de arranque. Las pruebas de leases prueban recuperación del trabajo, no entrega exactamente una vez ante cualquier fallo externo.

### Inventario de ejecuciones

| Ejecución | Resultado comprobado |
| --- | --- |
| Suite final Node 22 sobre candidata, repetida después del parche de dependencia: configuración, fechas, OTP, Resend simulado, limpieza, CLI, outbox, sesión, contrato, PostgreSQL, concurrencia e integridad, bandera ausente | **76 pruebas: 75 aprobadas, 0 fallidas, 1 omisión condicional** |
| Concurrencia con esquema histórico, modo separado | 13: 12 aprobadas, 0 fallidas, 1 omisión inversa; cubre el modo omitido arriba |
| Regresión focalizada después de la corrección | 24 aprobadas, 0 fallidas |
| Scripts directos de esquema/API/limpieza/CLI de limpieza | Cuatro scripts con salida 0; API repetida sobre candidata |
| CLI correo `--simulate` con guardias originales | Aprobada; ejecutor host Node 20, PostgreSQL 18 nuevo; sin modo live |
| Harness HTTP sobre imagen candidata | Seis grupos aprobados |
| Admin y Socket.IO reutilizando verificador existente contra Docker candidato | Aprobado, 19 rutas y ambos proxies |
| Chromium contra candidata | Cinco grupos aprobados; errores de página/recursos: cero |
| Migraciones, dos restauraciones y conservación después de API/UI | Aprobadas |
| API y worker OTP separados sobre candidata, proveedor simulado | Aprobados; altas principales cerradas |
| Auditoría npm de dependencias de producción después de instalación limpia | Cero avisos conocidos; antes uno moderado corregido |

No se suman suites solapadas como pruebas únicas. Los logs conservan también ensayos anteriores: el harness pidió inicialmente una ruta Admin inexistente; se corrigió el test a la ruta real de perfil compartida, sin cambiar la aplicación. Los rechazos iniciales de configuración de herramientas se distinguen de los fallos de producto. La suite final no tiene fallos; el ensayo operativo de parada temprana 137 conserva la limitación indicada.

### Comandos relevantes del ensayo

Ejecutados desde el worktree de preparación, con recursos **nuevos** del avance. Los archivos privados del fixture no se distribuyen; estos comandos no autorizan usar una conexión productiva ni reemplazan la preparación aislada descrita arriba.

```sh
git fetch origin
git merge-base --is-ancestor 691209c030c862affa3c6683eadc45c843dafc3d HEAD
docker build -f Backend/Dockerfile -t hidro-avance23-backend:6933760 Backend
HIDRO_BACKEND23_API_CONTAINER=hm23-api-candidate node scripts/test/backend-docker23.cjs
# Únicamente en el namespace de red del PostgreSQL sintético dedicado:
docker run --rm --network container:hm23-db -e HIDRO_EMAIL_TEST_DB_PORT=5432 \
  -v "$PWD:/workspace" -w /workspace node:22-alpine \
  node scripts/test/backend-history23.cjs preserved-subset
# Ejecuciones completas y sus salidas: node22-security-final.log,
# docker-verification-security.log, admin-socket-security.log,
# browser-security.log y security-otp/{before,worker,after}.log.
```

Los harnesses agregados verifican nombres/base esperada y, para HTTP, etiquetas/red de los contenedores antes de escribir. Requieren fixtures sintéticos preparados privadamente; no son un instalador que descubra o importe datos reales.

## Procedimiento productivo preparado, NO ejecutado

### 1. Revisión, destino y respaldo: primera autorización

1. Revisar los commits locales de preparación y autorizar su publicación/integración por separado. La imagen productiva debe corresponder a un **commit exacto aprobado que incluya la corrección**, no a un `main` flotante. Esta rama nueva no está protegida automáticamente frente a previews Vercel: revisar/proteger las automatizaciones antes de publicarla, sin cambiar servicios en este avance.
2. Confirmar con el propietario la correspondencia **Render → secreto de conexión → proyecto, rama, endpoint, base y rol de Neon**. Hacerlo en un canal privado, sin imprimir URL ni contraseña. No asumir que una base llamada por defecto es la correcta.
3. Inventariar privadamente versión PostgreSQL, extensiones, roles/propiedad, permisos/RLS, tablas, índices, FKs, migraciones y conteos. Contrastar el esquema real con el esperado. Verificar capacidad de conexión/SSL y espacio de respaldo.
4. Autorizar un `pg_dump` completo en formato custom con cliente compatible; capturar y revisar su salida de error/código, calcular SHA-256 y conservarlo cifrado fuera del repositorio. Guardar credenciales en mecanismo privado de conexión, nunca argumentos, historial o logs. Inventariar por separado roles/globales y permisos: `pg_dump` respalda una base, no todos los objetos globales del clúster. No suponer privilegios de superusuario en Neon.
5. Confirmar la retención efectiva de recuperación/PITR del proyecto y sus límites con el proveedor, sin asumir días ni crear/sustituir ramas sin autorización.
6. Restaurar **ese respaldo real** en un destino nuevo, autorizado y aislado. Validar filas, hashes/conteos pertinentes, secuencias, FKs, restricciones, propiedad, ACL/RLS, extensiones y acceso de los roles de API/worker. Ensayar 003–006 allí y guardar resultados. El ensayo sintético de este informe no sustituye este punto.

**Punto de parada:** no autorizar migraciones si el respaldo no restaura, hay deriva no explicada o anomalías sin reconciliación aprobada.

### 2. Ventana de migración: autorización separada

1. Acordar ventana y bloquear **todas** las escrituras: API, Admin, scripts y worker; no basta pausar nuevas altas. Obtener respaldo final y registrar el instante de corte. Conservar estado anterior y procedimiento de restablecimiento.
2. Ejecutar el SQL de comprobación 005 y revisar sus siete controles. Ante cualquier anomalía: detenerse y presentar diagnóstico; no borrar, normalizar, cambiar estados ni consolidar pagos automáticamente.
3. Ejecutar los archivos 003, 004, 005 y 006 en ese orden, individualmente, con `psql -X -v ON_ERROR_STOP=1 -f <archivo>` usando conexión privada previamente verificada. Son archivos con transacciones propias: no envolverlos ciegamente con otra transacción global ni ejecutar `init.sql`.
4. Detenerse ante el primer error. El archivo fallido revierte su transacción, pero los anteriores ya confirmados pueden permanecer. No borrar tablas nuevas para "dejar todo como antes". No desactivar límites de bloqueo ni matar sesiones ajenas para hacer pasar 005.
5. Comparar filas históricas, cuentas, hashes, suministros, recibos, pagos e incidencias; verificar FKs, secuencias, índices y constraints validadas, más permisos del rol de aplicación. Los usuarios previos deben conservar `correo_verificado_en=NULL` y su login.

### 3. Configuración y despliegue manual: autorización separada

Preparar nombres y comprobar valores **privadamente**, sin copiarlos a este documento:

| Proceso | Configuración que revisar |
| --- | --- |
| API | `NODE_ENV=production`, `PORT` provisto por Render, `DATABASE_URL` correcta con TLS verificado, `AUTH_TOKEN_SECRET` **vigente**, `CORS_ALLOWED_ORIGINS` exactos (Admin/cliente autorizados y `https://localhost`) |
| Pausa de altas | `EMAIL_REGISTRATION_ENABLED=0`; no habilitar por el hecho de desplegar |
| API OTP | `EMAIL_OTP_SECRET`, `EMAIL_OUTBOX_KEY`, `RESEND_FROM` verificado cuando se prepare correo; API sin necesidad de `RESEND_API_KEY` |
| Worker, fase posterior | `EMAIL_WORKER_ENABLED=1`, `EMAIL_WORKER_DATABASE_URL`, `EMAIL_WORKER_EXPECTED_DATABASE` coincidente, `EMAIL_OUTBOX_KEY` compartida correcta, `RESEND_API_KEY` privada solo en worker |

`DATABASE_URL` tiene prioridad sobre variables Docker; para destinos externos `config.js` fuerza `sslmode=verify-full`. No se permite recurrir a conexión sin TLS para eludir errores. Conservar el secreto JWT evita invalidar innecesariamente sesiones existentes; no extender las ocho horas ni agregar renovación indefinida. OTP y outbox requieren claves independientes; no rotarlas sin un plan para solicitudes/payloads pendientes. El secreto OTP requiere al menos 32 bytes y la clave outbox 32 bytes decodificados en base64.

1. Mantener autodespliegue/previews deshabilitados. Desplegar manualmente el commit aprobado con altas cerradas y worker detenido. No ejecutar migraciones desde el arranque del servidor ni del contenedor.
2. Verificar progresivamente salud, capacidades, sesión sin token 401, login de canario autorizado, restauración, logout, rechazo por rol, Admin, recibos, documentos y Socket.IO. Usar únicamente registros de prueba **nuevos y autorizados**; no registrar pagos ni alterar recibos de usuarios reales para validar.
3. Observar errores, latencia, conexiones y conteos agregados sin datos personales. Esta API validada usa una instancia; múltiples réplicas requieren revisar rate limits en memoria y distribución de Socket.IO antes de escalarlas.
4. Preparar un **background worker independiente**, comando `node workers/email-outbox.cjs --run`, no un proceso secundario dentro de la API. Verificar previamente soporte/coste del servicio y operación; no crearlo en este avance. Las guardias exigen base esperada y habilitación explícitas.
5. Solo con autorización adicional, remitente/dominio verificados, proveedor real validado, observabilidad de fallos y canarios permitidos: habilitar worker, verificar cola/reintentos/aceptación y entrega real por separado. Después considerar `EMAIL_REGISTRATION_ENABLED=1`. Con worker apagado no simular entrega ni abrir registros públicos.
6. Programar retención con ejecución controlada y revisión en modo simulación antes de borrar temporales. El Dockerfile actual **no empaqueta** `email-cleanup.js` ni `maintenance/email-cleanup.cjs`; no asumir que esa tarea está disponible dentro de la imagen de API/worker. Preparar su entorno operativo autorizado por separado.
7. Validar la APK 1.1.0 existente contra el backend actualizado por fases (login/sesión/reapertura/logout, OTP autorizado, navegación y PDF) antes de distribuirla. La prueba local de contrato no reemplaza esa validación ni la del dispositivo físico/proveedores de ubicación.

### 4. Recuperación: decidir según el fallo

| Escenario | Respuesta preparada, pendiente de autorización |
| --- | --- |
| Falla respaldo/restauración/preflight | No migrar ni desplegar; conservar servicio y datos; investigar |
| Falla un archivo SQL | Su transacción revierte; inventariar los anteriores ya confirmados; conservar esquema aditivo y corregir causa |
| Error de configuración | Mantener altas/worker cerrados; corregir únicamente la configuración validada, preservando claves/destino |
| Código falla después de migrar | Ventana de mantenimiento o corrección hacia adelante / versión compatible previamente ensayada; no borrar esquema ni restaurar datos automáticamente |
| Corrupción o pérdida comprobada | Detener escrituras, preservar estado actual, respaldos y evidencia; recuperar en **otro destino** y reconciliar lo creado desde el respaldo antes de autorizar un cambio de destino |

**No usar como rollback automático el live antiguo `864e0e1`:** su registro anterior crea cuentas sin OTP y no conoce `EMAIL_REGISTRATION_ENABLED`. Volver a él podría reabrir altas y además perder capacidades/sesión. Si se necesita fallback, aprobar y probar una versión compatible con registro cerrado y esquema nuevo, o mantener mantenimiento hasta la corrección.

El rollback de código de Render no revierte PostgreSQL. Además, la documentación vigente indica que reutiliza configuración del deploy objetivo, incluidas variables del servicio, comando y parte de los grupos de entorno: **no asumir que conserva las variables actuales**. Auditar privadamente todo el destino antes de aprobarlo. El rollback vía API tampoco deshabilita por sí mismo el autodespliegue. No ejecutar restauración sobre la base activa, `--clean`, drops ni reversión genérica que pueda eliminar cuentas/pagos nuevos.

Referencias operativas: [workers independientes de Render](https://render.com/docs/background-workers), [comportamiento de rollbacks](https://render.com/docs/rollbacks), [pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore 18](https://www.postgresql.org/docs/18/app-pgrestore.html). Su consulta no equivale a certificar la configuración del proyecto productivo.

## Respuestas para la decisión del siguiente avance

1. **¿Backend en Docker?** Sí, imagen candidata Node 22 compilada y probada.
2. **¿Migraciones aisladas?** Sí, 003–006 en orden y repetidas; 005 rechaza anomalías sin repararlas.
3. **¿Históricos conservados?** Sí en fixtures completos, antes/después/restauración/UI; producción no inspeccionada.
4. **¿Android 1.1 puede comunicarse?** Contratos y CORS sí contra candidata local; Render antiguo sigue sin endpoints. No se repitió Android nativo.
5. **¿Admin?** Sí, API/roles y Chromium real con backend candidato.
6. **¿1.0.0 conserva login?** Sí por su contrato HTTP y cuentas sin verificación histórica; registro antiguo devuelve 426 intencionalmente.
7. **¿OTP pendiente?** Configuración privada, proveedor/remitente real, worker independiente, retención y validación autorizada antes de abrir altas. Solo simulación aprobada aquí.
8. **¿Riesgos?** Datos/esquema reales aún desconocidos, claves/roles sin auditar, backup real pendiente, arranque/parada temprana de worker y fallback antiguo inseguro; escalado no certificado.
9. **¿Respaldo/recuperación?** Backup íntegro privado, restauración real ensayada y recuperación por escenario; nunca sobrescribir datos nuevos con un respaldo anterior sin reconciliación y autorización.
10. **¿Solicitar despliegue?** Sí, por etapas con puntos de parada. El siguiente avance puede ejecutar primero inventario/respaldo/restauración autorizados y solicitar el GO de migración/despliegue cuando esas comprobaciones sean satisfactorias. **No hay GO productivo emitido por este informe.**
