# Avance 21 — revisión del PR definitivo hacia main

Fecha: 22 de octubre de 2026. Origen `integration/avance-18`, base `main`.
Punto de partida publicado: `c6c0cfecba83c76642c6e2480f3579b917cd5588`.
No se ejecuta la fusión, despliegues ni migraciones productivas.

## Historial y revisión compartida

Después de `git fetch origin`, main remoto permanece en
`049ca5f5d0979221ec2ed64b1f7f2779681ff116` y es ancestro de la integración.
Los 22 commits del PR #1, hasta `68d7696`, son ancestros comprobados individualmente.
El PR definitivo contiene sus cambios; **no fusionar PR #1 por separado**.
No se cierra ni modifica ese PR desde este avance.

Antes del nuevo incremento hay 29 commits sobre main, conservando el merge
`f64f7b2`, los avances 18/19 y la publicación del avance 20. La futura fusión debe
usar **Create a merge commit**, sin squash ni rebase. El repositorio permite
merge commits. El nuevo PR queda Draft, sin auto-merge ni fusión ejecutada.

| Archivo compartido | Revisión |
| --- | --- |
| Backend/server.js | 40 rutas explícitas de main conservadas y nueva `/api/auth/session`; registro delegado a `email-registration.js`, con contrato OTP y rechazo legacy 426; recibos/pagos delegados al servicio transaccional. El merge combina ese servicio con el manejador de desconexión SQL del equipo. |
| Frontend/index.html | Idéntico al HTML del merge integrado ya probado en avance 18. Intenciones/respuestas/acciones del chatbot iguales byte a byte a main; filtros y fuentes Sedapal conservados. Sesión cifrada, recuperación OTP y ubicación siguen presentes. |
| package.json | Todos los scripts originales de main y sus dependencias conservados; comandos de correo, Android y Kubernetes añadidos. Sin cambios de dependencias en este avance. |

No cambia código de aplicación, SQL, Android, Docker ni manifiestos/scripts
Kubernetes frente a `c6c0cfe`. Se añaden protección de despliegue y documentación.

## Funcionalidades y evidencia previa conservada

| Área | Evidencia existente |
| --- | --- |
| Android 1.1.0 / código 3 | `pe.edu.hidromejora.app`, Java 21/Capacitor 7, identidad/certificado conservados. Avance 17 verificó actualización firmada 1.0.0→1.1.0; la release integrada con chatbot aún requiere compilación/firma/prueba autorizadas. |
| Sesión y OTP | Keystore/AES-GCM, validación backend antes de datos privados, JWT ocho horas, logout y estado OTP separados. Avance 18: sesión nativa 13/13 y OTP nativo 7/7. |
| Ubicación y funciones móviles | Avance 18: 9/9 en AVD; ubicación/permisos, fotos, recibos/pagos, PDF en visor Android, navegación. Teléfono físico pendiente. |
| Cliente/Admin/chatbot/filtros | Avance 18: Chromium transición/perfil 17/17 y E2E integrado 28 comprobaciones. Conocimiento Sedapal conservado; roles y navegación sin duplicar sockets. |
| Backend/PostgreSQL/recibos/pagos | Avance 18: Node 114 aprobadas y una omisión condicional; escenario legacy separado 12 aprobadas y omisión inversa; tests de esquema/contrato/concurrencia con bases nuevas. |
| Kubernetes local | Avance 19: cuatro servicios Ready, DNS/API/SQL, sesión, roles/Admin, recibos/pagos/incidencias, chatbot y Socket.IO por NodePort y Chromium. PVC/filas conservados al recrear Pod DB. |
| Outbox en Kubernetes | Avance 19: base nueva, migraciones 003–006, API interna y worker separado; proveedor simulado sin HTTP real, UUID idempotente, OTP incorrecto/correcto y login. Altas principales cerradas y workers de fixture detenidos. |

Fuentes: [avance 17](android-sesion-persistente.md),
[avance 18](integracion-avance-18.md),
[avance 19](kubernetes-integracion-avance-19.md),
[publicación 20](publicacion-integracion-avance-20.md).
Son resultados históricos de esos avances, no nuevas ejecuciones nativas aquí.

## Verificación ejecutada en avance 21

- Ancestros, referencias y revisión de archivos compartidos: aprobados.
- Node 20.19.2: 69 pruebas en primer intento, 66 aprobadas y tres fallidas en
  el hook de Perfil por no encontrar Chromium en la caché global.
- Se indicó `PLAYWRIGHT_BROWSERS_PATH` de las herramientas existentes y se
  repitieron exclusivamente esas tres: **3/3 aprobadas**, sin cambios de código.
  En conjunto, los 69 escenarios completados quedan aprobados. No son pruebas
  Android nativas ni usan PostgreSQL productivo.
- Cobertura de esta regresión: configuración, correo unitario con mocks,
  sesiones, estado OTP, firma/runtime Android estáticos, documentos PDF,
  chatbot y navegación Perfil con API interceptada en Chromium.
- JSON: mapa exacto de tres exclusiones false en ambas raíces; retirando solo
  `main`, cada objeto coincide con el del avance 20. `git diff --check` aprobado.
- No se repiten builds, suites SQL, Kubernetes ni Android nativo. Sin correo real.
  Logs locales ignorados: `artifacts/integracion-21/`.

## Auditoría de archivos e historial

Se revisaron HEAD y los 29 commits sobre main: 472 blobs únicos, 442 de texto.
No se encontraron rutas de APK, keystore, base, dump, archivo .env privado,
dependencias ni artifacts incluidos. La búsqueda dirigida de claves privadas,
JWT literales, tokens GitHub/proveedores y URLs SQL con contraseña produjo solo
coincidencias de fixtures sintéticos en distintas versiones. Se revisan también
los nuevos archivos preparados antes del commit. No es una garantía universal
ni una auditoría completa de vulnerabilidades de terceros.

Los recursos cliente generados por los tests conservan la separación del Admin
y no incluyen secretos de servidor. No se leen ni versionan claves de firma,
variables de servicios, kubeconfig, cuentas sintéticas ni evidencias privadas.

## Automatizaciones y futura fusión

- Vercel mantiene dos proyectos Git conectados al mismo repositorio. Los últimos
  builds acreditan ejecuciones en raíz y Backend; la vista del conector omite el
  campo `rootDirectory`. Admin sigue READY y `sedapal` conserva su ERROR histórico
  por buscar un script bajo Backend; no se toca ese servicio ni se lanza un build.
- Main actual no excluye despliegues Git. En **la rama integrada**, ambos JSON
  añaden `git.deploymentEnabled.main=false`, manteniendo false para
  `integration/avance-18` y `feature/verificacion-correo`. Esa configuración
  quedará en el commit resultante de una futura fusión autorizada y bloqueará
  su despliegue Git Vercel. Main remoto todavía no cambia en este avance.
- No se desactivan otras ramas globalmente ni se modifican ajustes externos.
  La exclusión no impide despliegues manuales o pipelines independientes.
  [Contrato oficial Vercel](https://vercel.com/docs/project-configuration/git-configuration).
- Render, consultado en el workspace ya autorizado: `hidro-mejora-api`, rama
  `main`, raíz `Backend`, `autoDeploy=no`, `autoDeployTrigger=off`,
  `previews.generation=off`, `pullRequestPreviewsEnabled=no`.
- GitHub devuelve cero workflows Actions y cero webhooks de repositorio.
  Se comprueban despliegues después del push y de abrir el Draft PR; un Draft
  por sí mismo no bloquea previews.

## Base de datos y riesgos antes de producción

- 003 añade verificación nullable a cuentas previas y tablas de solicitud/envíos;
  004 añade índice de retención; 005 incorpora unicidad de recibos/pagos tras
  preflight de integridad y bloqueo acotado; 006 añade outbox cifrada/leases/estados.
- No ejecutar init sobre un PVC existente. Las migraciones no se disparan al
  arrancar la API y no se ejecutan aquí. Producción requiere backup, restauración
  ensayada, revisión de anomalías 005, ventana de escrituras y autorización SQL.
- Altas Kubernetes siguen cerradas y worker base con cero réplicas. Antes de
  habilitarlos: secretos externos, dominio/proveedor verificado, worker supervisado,
  retención y canario autorizado. No se envían correos desde esta revisión.
- Validar TLS/Ingress/CORS, imágenes inmutables, permisos SQL mínimos, PVC/backup,
  NetworkPolicy y observabilidad. La prueba de recreación de Pod no acredita HA
  o recuperación tras pérdida del nodo/volumen; Socket.IO/limitadores tienen
  límites de escalado documentados.
- JWT conserva ocho horas y no añade refresh ni revocación central de tokens;
  backend consulta rol/activo actual. Dispositivo físico y release integrada
  firmada/actualización sobre 1.0.0 pendientes antes de distribuir Android.

## Autorización pendiente

El PR se presenta como Draft para revisión. No se ejecuta merge ni se programa
auto-merge. Al autorizarlo el propietario, volver a comprobar SHA, main ancestro,
exclusiones en el árbol final y automatizaciones; usar merge commit y conservar
las ramas del equipo. Fusionar código no autoriza desplegar, migrar ni publicar APK.
