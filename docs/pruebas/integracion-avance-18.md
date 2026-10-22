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

## Resultado

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
servidor, validación OpenAPI, prueba de Pods/PVC/red/recuperación o envío real.
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
