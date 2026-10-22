# Integración aislada — avance 18

## Auditoría previa a modificar código (22 de octubre de 2026)

Origen limpio y publicado: `feature/verificacion-correo` en
`68d76964887ec5d4604bb331b4e74727a6f7b6c5` (22 commits propios).
`git fetch origin` obtuvo main `049ca5f5d0979221ec2ed64b1f7f2779681ff116`
(seis commits propios). Main local permanece en `7930b26`.
PR [#1](https://github.com/NicolasAG-pe/Sedapal/pull/1): abierto, Draft,
CONFLICTING al comenzar. No se modifica su base, cabeza ni estado.

Se crea `integration/avance-18` en un worktree independiente, partiendo del
commit verificado. No se modifica ninguna de las dos ramas originales.
Por instrucción del propietario, los commits de integración quedan locales:
no se hace push, aunque el flujo general de AGENTS.md normalmente lo requiera.

### Cambios de main y riesgos detectados

- Kubernetes: manifiestos PostgreSQL 18/PVC, backend, Web/Admin, overlay y
  herramientas locales; handler de errores de conexiones SQL inactivas.
- Chatbot: conocimiento estático Sedapal con fuentes oficiales; conserva
  prioridades de consultas personales/emergencias. No usa IA remota ni secretos.
- Filtros: selectores `[data-filter]` sustituyen `.chip-filter`.
- `git merge-tree --write-tree` detectó conflictos de contenido únicamente en
  `Backend/server.js` y `package.json`. `Frontend/index.html` se combina sin
  conflicto textual; necesita pruebas de integración y revisión específica.
- El ConfigMap SQL de Kubernetes es anterior a 003–006: faltan solicitudes OTP,
  retención, integridad de recibos y outbox. Inicializarlo así rompe la API nueva.
  Una copia de init.sql no migra PVC existentes; no se deben aplicar migraciones
  automáticamente al arrancar cada réplica ni restaurar sobre datos históricos.
- Kubernetes no configura secretos OTP/outbox ni worker independiente. Las altas
  deben permanecer cerradas hasta acreditar correo/worker; nunca usar la ruta
  antigua como alternativa ni habilitar Resend durante estas pruebas.
- CORS de producción omite `https://localhost`, necesario para Android. Revisar
  además proxies API/Socket.IO y mantener una réplica hasta diseñar escalado.
- Las etiquetas locales reutilizadas y scripts `up.sh` crean/aplican recursos.
  No se ejecutarán: solo renderizado/validación local de archivos, sin clúster.
- Imágenes, secretos externos, TLS/Ingress, privilegios SQL mínimos, migración de
  históricos y recuperación requieren preparación operativa y autorización.
- La combinación de HTML no puede perder el arranque seguro, contrato OTP,
  generación de sesión, ubicación, navegación ni aislamiento del código Admin.

### Plan de comprobación

Revisar cada conflicto, conservar ambos aportes y probar con bases nuevas en un
contenedor PostgreSQL exclusivo y Resend simulado. Ejecutar regresión Node,
Chromium y Android WebView real por separado. Conservar servicios Docker
existentes y todos sus datos. Verificar ancestros Git y refs originales al final.
Las pruebas previas de avance 17 son antecedentes, no resultados de esta rama.

## Dictamen al cerrar la auditoría inicial

Pendiente de integración y ejecución; no se declara Kubernetes operativo ni
Android integrado aprobado por esta auditoría.

## Integración de historiales

Conflictos resueltos por unión de aportes: `Backend/server.js` conserva el
servicio transaccional de recibos y añade el handler SQL de main; `package.json`
conserva todos los comandos y añade `test:chatbot`. La revisión del diff HTML
confirma que solo se añaden conocimiento/fuentes/prioridades del chatbot y
selectores de filtros, conservando sesión/OTP/ubicación.

Primer control: Node 115 pruebas (114 aprobadas, una omisión condicional H02),
Chromium 17/17 (transición OTP y perfil/navegación), chatbot incluido 4/4.
PostgreSQL 18 nuevo exclusivo, puerto loopback 32769, Resend simulado.
Los manifiestos heredados aún requieren la corrección indicada abajo.

## Preparación Kubernetes comprobada

Se elimina la copia SQL antigua del ConfigMap: `k8s/base/kustomization.yaml`
genera el init desde la fuente vigente. Overlay local y correo usan esta base.
CORS incluye Android; se prepara worker separado con cero réplicas y referencias
a secretos externos. `EMAIL_REGISTRATION_ENABLED=0` cierra altas/reenvíos de forma
explícita incluso con claves configuradas. No cambia login ni JWT de ocho horas.
El verificador local ya no intenta crear usuarios con el contrato antiguo ni
promueve roles: requiere cuentas sintéticas provisionadas por separado.

kubectl v1.37.1/Kustomize v5.8.1, binario descargado del proveedor y SHA256
comprobado, solo como herramienta local ignorada; parser Node yaml del sistema.
Tres pruebas aprobadas: render base/local/mail y controles estructurales; SQL
renderizado ejecutado en base nueva, 003–006 aplicadas dos veces allí; registro
cerrado responde 503 sin filas ni eventos aun con configuración sintética válida.
No se aplicaron recursos, no se consultó ningún clúster, no hubo dry-run de
servidor, prueba de Pods/PVC/red/recuperación o envío real.
PVC existentes requieren migración manual autorizada; readiness solo consulta BD.
La guía Kubernetes conserva los aportes e identifica estas condiciones pendientes.

Regresión tras el cierre operativo: 45/45 pruebas backend, sesión, contrato y outbox aprobadas, sin proveedor real. La pausa también conserva consulta/confirmación de una solicitud ya enviada (comprobado).

## Imágenes y contexto Docker

Construidas localmente las tres imágenes `hidro-avance18-{backend,web,admin}:local`
con sus Dockerfiles/contextos originales (sin publicar ni iniciar servicios).
Se amplían `.dockerignore` raíz y Backend para excluir env privados, claves,
artefactos, dependencias, respaldos y herramientas locales del contexto. Rebuild
con las reglas finales: tres correctos. Inspección por comandos sin red y con
filesystem de solo lectura: Node 22.23.4, backend/worker presentes, web con
conocimiento Sedapal/estado nativo, sin módulo Admin en cliente ni env privado.
No se probaron estos contenedores conectados entre sí ni en Kubernetes.
No se sustituyeron imágenes/servicios Compose existentes.

## Recorrido integrado Chromium

E2E con API real/PostgreSQL nuevo y Resend simulado: 28/28 comprobaciones,
cero errores JavaScript y cero assets fallidos. Incluye ambos roles/panel Admin,
recibos/pagos/PDF, incidencias/foto/posición simulada, cortes, notificaciones,
perfil, contraseña, navegación, OTP/reenvío/cooldown y Socket.IO sin duplicación.
Se amplía el recorrido con orientación Sedapal/fuente oficial, prioridad de recibo
personal y contenido `<script>` tratado como texto; filtros Pagado/Pendiente/
Emitido/Todos. No se abren fuentes externas ni se consulta un modelo remoto.

Fallos del harness corregidos: la burbuja «está escribiendo» contaba como respuesta
antes de completarse; ahora se espera su retirada. El nuevo fixture se crea como
Emitido, no Pendiente (comprobado en SQL); se corrige la expectativa sin cambiar
el comportamiento del recibo. Las dos ejecuciones iniciales fallidas quedan como
evidencia local; el recorrido final completo está aprobado. Pruebas unitarias de
UI/estado/documentos/chatbot: 16/16. Transición OTP y perfil Chromium: 17/17.

Evidencia privada ignorada en `artifacts/integracion-18/`; E2E final
`e2e/run_1792687320997/admin-e2e.json`. Capturas y PDF solo sintéticos/locales.

### Validación estricta de esquema Kubernetes

Se agregó comprobación independiente con kubeconform v0.8.0 (release del proyecto,
archivo SHA256 comprobado), `-strict -kubernetes-version 1.37.0 -summary` sobre
los tres renderizados: **31 válidos, 0 inválidos, 0 errores, 0 omitidos**.
Consulta esquemas públicos; no envía manifiestos a un clúster. No valida admisión,
políticas, DNS, conectividad, secretos existentes, PVC o entrega de correo.
Herramientas y salida quedan locales. Fuente de la herramienta:
[kubeconform](https://github.com/yannh/kubeconform).

## Android nativo integrado

AVD independiente `hm_110_debug_api35` / emulator-5582, Android 15/API 35,
WebView 124.0.6367.219, SDK existente, Capacitor 7.6.9/App 7.1.2.
Java 21.0.12.1 seleccionado por `scripts/android-gradle.sh`, Gradle 8.11.1,
AGP 8.7.2. No se requiere Java en PATH global ni se cambia Debian.
Cada suite ejecutó el sync oficial desde estas fuentes y compiló/instaló su APK
debug con API local, base nueva y Resend simulado. Sin desinstalar ni borrar datos.

| Suite | Resultado realmente ejecutado |
| --- | --- |
| Sesión + chatbot | 13/13: Keystore/GCM, cuenta histórica, login, finish/force-stop/muerte de PID propio, JWT expirado/alterado, cuenta deshabilitada, logout, otra identidad, offline/reconexión, un socket y logcat sin las credenciales del flujo. Chatbot general/personal y texto seguro mediante DOM real. |
| Recuperación OTP | 7/7: UUID durable, force-stop, respuestas POST/confirmación perdidas, concurrencia/idempotencia, estados SQL/outbox, código incorrecto/vencido, fallo simulado, reenvío, limpieza, caducidad y abandono. |
| Ubicación y regresión | 9/9: Keystore, Photo Picker real, GPS con coordenadas inyectadas, proveedor desactivado sin coordenadas antiguas, denegación mediante diálogo OS, sesión/Perfil/Atrás/rotación/socket, filtros Pagado/Emitido/Todos, recibo/pago/PDF SAF, cortes/notificaciones/leída. |

Cada suite repite instrumentación Keystore: no sumar estas comprobaciones como
29 casos independientes. La muerte de PID no reproduce una decisión LMKD real;
las respuestas perdidas se descartan tras el commit desde el harness, no desde
una operadora móvil. Las coordenadas pertenecen al emulador y no a una persona.

Resultados JSON locales: `artifacts/android-session-native-OZmV8m/`,
`android-session-native-7mW2Bg/`, `android-session-native-PRmUFx/`.
El ensayo inicial `android-session-native-mj36di/` se interrumpió sin resultado:
no avanzó entre instrumentación y login, aunque la UI mostraba el formulario y
una conexión diagnóstica leyó un DOM válido. No se confirmó una causa en código
de aplicación. Se añadió progreso de conexión al harness y la repetición completa
pasó; no se cuenta el ensayo interrumpido como aprobado. Queda pendiente precisar
la causa del bloqueo de automatización en el arranque frío si vuelve a ocurrir.

El último PDF se guardó completo (10050 bytes, cabecera/EOF) y abrió la actividad
Docs. La captura inmediata mostraba un fotograma negro: eso no acredita contenido.
Se cerró únicamente el visor y se abrió el archivo terminado desde Descargas;
la inspección de la nueva captura muestra recibo, importe S/45 y una página
completa. Evidencia visual local `artifacts/integracion-18/pdf-reopened.png`;
GPS/denegación/rotación y selector en el directorio de la última suite. Sin datos
reales y sin incluir PDF/capturas en Git.

### Artefacto debug y candidata release previa

Último APK local de prueba:
`artifacts/android-session-native-PRmUFx/app/outputs/apk/debug/app-debug.apk`,
4352074 bytes, SHA256
`a578e9b3a5c35b98693e844f03f6272133e1a2ea986f2ca3cc1f16e4b522adfe`.
AAPT confirma paquete `pe.edu.hidromejora.app`, 1.1.0/código 3, minSdk 23 y target 35.
apksigner verifica firma **Android Debug**, certificado SHA256
`63360b58745e3b688b9b358a4e53bab6bcbbdfcb7eb43a63f635e776cd298a65`.
Esta APK apunta al fixture local y no sustituye una candidata release.

El HTML y cuatro módulos sesión/OTP/chatbot del APK coinciden byte a byte con
las fuentes; 18 recursos de texto inspeccionados sin patrones de JWT, API key
Resend o clave privada; no se empaqueta módulo Admin. Config Capacitor logging
none. Es un control dirigido, no una prueba de ausencia universal de secretos.
No se modifica código Java, Gradle, permisos ni configuración de firma de release.

La candidata firmada del avance 17 se conserva intacta, SHA256
`d8632a4ae4a39e3d7a501bd05ed72e63717e32e63269389ba71a9a29d0fd8f71`.
Su actualización 1.0.0→1.1.0 sigue siendo evidencia histórica del avance 17;
**no se repitió con una release integrada** y no incluye este chatbot. Antes de
distribuir, compilar una nueva release con recursos integrados/HTTPS y la misma
clave permanente, comprobar firma y repetir instalación sobre 1.0.0 sin borrar
datos. No se leyó ni recreó el keystore release original y no se publicó ninguna APK.

## Resumen de regresión final

- Node 20.19.2: 115 pruebas, 114 aprobadas, cero fallos, una omisión condicional
  del escenario sin 005. Modo separado `HIDRO_RECEIPT_TEST_LEGACY=1`: 12 aprobadas,
  cero fallos, una omisión inversa (UNIQUE no existe en ese escenario). Así se
  ejecutan ambos escenarios H02 en bases nuevas sin alterar históricos.
- Imagen backend Node 22.23.4: 57 pruebas de configuración/sesión/contrato/outbox/
  recibos, 56 aprobadas y la misma omisión condicional; correo unitario aparte
  18/18. No es ejecución en Pods.
- Después del cambio operativo: 45/45 backend/sesión/contrato/outbox. CLI/API/
  esquema/retención de correo también ejecutados: sus cuatro scripts terminaron
  en cero, solo con datos nuevos sintéticos y proveedor simulado.
- Chromium: transición/perfil 17/17, E2E integrado 28 comprobaciones, UI/estado/
  documentos/chatbot unitarios 16/16. Estos resultados no son Android.
- Android real en emulador: suites 13/13, 7/7, 9/9 y PDF inspeccionado en visor.
- Kubernetes: tres pruebas de render/SQL/cierre y 31 esquemas estrictos correctos.
  Tres Dockerfiles construidos localmente, imágenes comprobadas sin red.

No hay fallo final registrado en las suites completadas. Permanecen omisiones
condicionales explícitas y el intento nativo interrumpido anterior. No se ejecutó
correo real, test live de Resend, clúster, despliegue o validación en teléfono.

## Dictamen y pasos para integrar el trabajo del equipo

La integración de código está preparada técnicamente para revisión del equipo,
con ambos historiales conservados y regresión local/nativa aprobada. Esto no
habilita publicación Android ni operación Kubernetes/productiva.

1. Revisar el diff de `integration/avance-18`, en el worktree hermano
   `Sedapal-integracion18`. Verificar que incluye como ancestros tanto el tip
   original `68d7696` (sus 22 commits) como main remoto `049ca5f` (sus seis).
2. Antes de autorizar push de la integración, cerrar despliegues automáticos de
   esa nueva rama en todos los servicios conectados. Los guardias Vercel false
   de `feature/verificacion-correo` se conservan; no cubren por sí solos otra rama.
3. Acordar con el propietario cómo incorporar la integración revisada a la rama
   del PR o publicar otro PR. No hacer force-push, reemplazar historiales, merge
   a main ni modificar PR #1 desde este avance local. Si main avanza, revisar
   esos cambios por separado antes de publicar.
4. Para Kubernetes: imágenes inmutables coherentes (incluido worker), secretos
   externos y roles mínimos, esquema existente/migraciones con backup/ensayo,
   StorageClass/PVC, TLS/Ingress/CORS reales, límites distribuidos/Socket.IO,
   supervisión y restauración. Validar admisión y funcionamiento en entorno
   autorizado antes de afirmar que el clúster funciona. Altas siguen cerradas y
   worker detenido hasta acreditar su configuración y canario autorizado.
5. Para Android: release integrada firmada, actualización oficial 1.0.0, dispositivo
   físico/GPS/proveedores, ciclo de vida y conectividad reales; entregar solo tras
   resolver requisitos de la auditoría productiva y obtener autorización.

Los contenedores Compose existentes no se modificaron. La base exclusiva de este
avance y todos sus fixtures se conservan en volumen nombrado; ese contenedor
quedó detenido (exited). El AVD también se detuvo sin borrarlo. Los cuatro
servicios Compose continúan activos y saludables. Se conservan artefactos previos.

## Estado Git final de la revisión local

Original `feature/verificacion-correo` limpio y remoto en `68d7696`; main local
`7930b26`, remoto `049ca5f`, sin cambios por esta integración. Ambas puntas de
entrada son ancestros comprobados de la integración; los 22 commits propios
quedan intactos. PR #1 sigue abierto/Draft/CONFLICTING, porque esta rama local
no se publicó ni se trasladó a su cabeza. Sin push ni cambios remotos de PR.

Commits locales de preparación: `82b2de2` auditoría, `f64f7b2` merge de historiales,
`206020c` compatibilidad Kubernetes/altas, `57d0420` contexto/imágenes; se añade
el incremento de pruebas/documentación de este informe. Consultar `git log`
en el worktree de integración para el hash de su commit final.

Archivos de la integración respecto de la rama original (incluye aportes de main):

```text
.dockerignore
.gitignore
Backend/.dockerignore
Backend/email-registration.js
Backend/server.js
CHANGELOG.md
Frontend/assets/js/sedapal-knowledge.js
Frontend/index.html
docs/ANDROID.md
docs/android-transicion.md
docs/auditoria-produccion.md
docs/chatbot-sedapal.md
docs/pruebas/integracion-avance-18.md
k8s/README.md
k8s/admin-deployment.yaml
k8s/backend-deployment.yaml
k8s/base/kustomization.yaml
k8s/db-deployment.yaml
k8s/local/README.md
k8s/local/VALIDACION.md
k8s/local/browser.cjs
k8s/local/kind.yaml
k8s/local/kubectl.sh
k8s/local/kustomization.yaml
k8s/local/persistence.cjs
k8s/local/up.sh
k8s/local/verify.cjs
k8s/mail/kustomization.yaml
k8s/mail/worker-deployment.yaml
k8s/web-deployment.yaml
package.json
scripts/check-admin-local.cjs
scripts/test/android-location-native.cjs
scripts/test/android-session-native.cjs
scripts/test/chatbot-ui-checks.cjs
scripts/test/client-checks.cjs
scripts/test/hidrobot.test.cjs
scripts/test/k8s-integration.test.cjs
```
