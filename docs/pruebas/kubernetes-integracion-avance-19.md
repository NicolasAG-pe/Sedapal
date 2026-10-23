# Kubernetes integrado — avance 19

Fecha: 22 de octubre de 2026. Inicio 17:04:16 UTC (12:04:16 Lima).
Base: `ae4eda0da7e22b620757d0ebe1dec54fc784efe4`, rama local
`integration/avance-18`, worktree hermano `Sedapal-integracion18`.
Límite del trabajo: 60 minutos; se priorizó arranque y pruebas dirigidas.
Último control funcional 17:22:34 UTC, 18 minutos y 18 segundos desde el inicio;
revisión documental/commit local a continuación, dentro de la hora disponible.

## Dictamen

**Kubernetes local inició y los cuatro componentes integrados funcionan.**
Las verificaciones siguientes son ejecuciones contra Pods/Services/PostgreSQL
reales del clúster propio, además de Chromium real contra sus NodePorts.
No son únicamente renderizados de YAML. Esto no acredita producción, un clúster
remoto ni la instalación en otra laptop todavía.

Main y feature/verificacion-correo se mantienen intactas; los 22 commits propios
y main integrado se conservan. No hubo push, merge a main, PR nuevo ni cambios
en plataformas productivas. No se compiló Android ni se conectaron dispositivos.

## Entorno y arranque

- Docker 29.9.1, kind 0.33.0 (binario proveedor/SHA256 comprobado), kubectl 1.37.1.
- Nodo `hidro-avance19-control-plane`, Kubernetes 1.37.0, containerd 2.3.4,
  Debian 13/amd64; un nodo Ready. Digest de imagen fijado en la configuración.
- Namespace `hidro-avance19`; kubeconfig exclusivamente en
  `artifacts/kubernetes-avance-19/state/kubeconfig`. No cambia contextos globales.
- Imágenes existentes `hidro-avance18-web:local`, `hidro-avance18-admin:local`,
  `hidro-avance18-backend:local` y `postgres:18`, sin reconstrucción.
- Se contrastaron hashes de cinco archivos backend/worker y HTML/conocimiento
  Sedapal del contenedor con el checkout. Coincidencia exacta.
- PostgreSQL 18.6, DB nueva `hm_avance19`, PVC propio `db-data` 10 GiB/standard/RWO.
  No se monta ni consulta ningún volumen/base de Compose o Neon.

El script anterior del compañero usa `sedapal-test` y reconstruye imágenes;
se leyó pero **no se ejecutó**. El nuevo wrapper deriva de ese overlay y fija
otro destino, puertos y kubeconfig. No rehace la configuración base del equipo.

### Componentes y Services comprobados

| Componente | Estado final | Service / acceso |
| --- | --- | --- |
| Web | 1/1 Running, 0 reinicios | NodePort 30080 → 127.0.0.1:8084 |
| Admin | 1/1 Running, 0 reinicios | NodePort 30081 → 127.0.0.1:8085 |
| Backend | 1/1 Running, 0 reinicios | ClusterIP backend:3000 |
| PostgreSQL | 1/1 Running, 0 reinicios del Pod vigente | ClusterIP db:5432; PVC Bound |

EndpointSlices enlazados a sus Pods: admin 10.244.0.5, backend 10.244.0.6,
web 10.244.0.7 en esta ejecución; las IP son efímeras, no se configuran a mano.
DNS `db`, `web`, `admin` y servicio interno OTP usados desde Pods, no solo resueltos
estáticamente. Las readiness comprobaron HTTP/SQL/pg_isready y se ejecutó
`apply --dry-run=server` antes del apply local. Los cuatro servicios Compose
originales siguen activos y saludables en 8080/8081 y su red existente.

## Comandos principales ejecutados

Desde la raíz del worktree:

```sh
git status --short
git branch --show-current
git log -5 --oneline
docker ps -a
docker image ls
kind get clusters
bash k8s/avance19/start.sh
node k8s/avance19/verify.cjs
node k8s/avance19/browser.cjs
node k8s/avance19/persistence.cjs
node k8s/avance19/otp-fixture.cjs --simulated-only
bash k8s/avance19/kube.sh get pods,deployments,services,pvc
bash k8s/avance19/kube.sh get endpointslices
bash k8s/avance19/kube.sh get events --field-selector type=Warning
bash k8s/avance19/start.sh # reutilización comprobada, sin rebuild/restart
```

Se usaron ejecutables privados en artifacts para kind/kubectl, con los mismos
argumentos descritos; los scripts permiten PATH o HIDRO_KIND_BIN/HIDRO_KUBECTL_BIN.
Se ejecutaron también `bash -n`, `node --check`, revisión de diff y control de
contenido preparado. La [guía reproducible](../../k8s/avance19/README.md) incluye
preparación de herramientas, imágenes y navegador para otra laptop.

## Pruebas realmente aprobadas

| Área | Evidencia |
| --- | --- |
| Infraestructura | Nodo Ready; 4 Pods/Deployments disponibles; Services/EndpointSlices/DNS; PVC Bound; arranque repetido reutiliza estado. |
| Web/Admin/API/DB | GET / de ambos paneles 200; /api/health 200 por ambos proxies y consulta SQL desde backend. |
| Autenticación | Login sintético de admin y dos usuarios; /api/auth/session 200 con suministro correcto y 401 sin token. |
| Roles | Las 19 rutas administrativas devuelven 401 sin JWT y 403 a usuario; lecturas admin permitidas. Admin UI rechaza cuenta normal. |
| Recibos/pagos | Admin crea; dueño consulta; otra cuenta no ve/no paga; pago 201; duplicado 409; una fila de pago. Pago adicional de S/42 mediante UI. |
| Incidencias | POST 201 y consulta persistida con JWT del suministro. |
| Socket.IO | Autenticación por ambos proxies; evento recibo:nuevo observado en navegador y UI actualizada; una conexión; logout desconecta. |
| Chatbot | Orientación/fuente oficial, prioridad de recibo personal y HTML tratado como texto, con el helper del avance 18 en DOM real. |
| Navegación | Siete módulos Admin; Perfil/incidencias/cortes/notificaciones/pagos de cliente; capturas escritorio/móvil y logout sin JWT en Web Storage. |
| CORS OTP | OPTIONS 204, origen exacto autorizado y X-Hidro-Auth-Contract permitido por proxy/backend. |
| Altas cerradas | Registro legacy 426; ruta OTP con contrato devuelve 503; backend principal mantiene EMAIL_REGISTRATION_ENABLED=0 antes/después de fixture. |
| Logs | Cuatro componentes sin valores conocidos de contraseñas/secretos sintéticos ni patrones JWT. API/worker de OTP inspeccionados antes de detenerlos. |

El recorrido HTTP contiene nueve comprobaciones agrupadas (incluido preflight
adicional), navegador cuatro; no representan una suite exhaustiva nueva.
Navegador: cero errores JavaScript y cero assets fallidos. Las escrituras fueron
exclusivamente sintéticas en PostgreSQL propio; pagos sin proveedor bancario.

### Persistencia y recuperación

`persistence.cjs` reinició solo el Deployment DB propio (estrategia Recreate).
Pod UID anterior `967d088b-8887-4f37-bfbb-d3fb3cb965fd`, nuevo
`30885738-60e5-4649-b797-1d11cb1b2cf8`; PVC UID
`a9edcac0-e1e2-4b32-b499-4d5d3d07684a` conservado.
Login, recibo, un pago y la incidencia previa siguieron disponibles.
El Pod/contenedor backend mantuvo UID y cero reinicios: recuperó la conexión.
Esto acredita recreación de Pod, no pérdida del nodo/volumen, backup o HA.

### OTP y worker independiente, sin correo real

Con opt-in `--simulated-only` se creó `hm_avance19_otp_7aa96ec3`, una **base nueva**;
init y migraciones 003–006 aplicadas allí, nunca sobre datos existentes.
La API `otp-api19-7aa96ec3` solo tuvo Service ClusterIP, sin NodePort ni proxy
público. El worker `otp-worker19-7aa96ec3` reutilizó el Deployment del avance 18,
misma imagen backend, en otro Pod. Claves aleatorias exclusivas, remitente .invalid
y clave de proveedor de fixture, ninguna credencial real Resend.

Se comprobó: 202/en cola con cero usuarios, replay del mismo UUID con un único
evento cifrado, worker inicialmente a cero; al escalarlo a uno, evento aceptado
por stub, OTP incorrecto 400 y correcto 201, un usuario/un suministro, payload
retirado, login y /api/auth/session válidos. El proveedor preload intercepta
Resend y **nunca invoca una petición HTTP real**; rechaza otras salidas HTTP.
No es una prueba de entrega real, dominio, TLS Resend o recepción en buzón.

Al terminar se escalaron API/worker a cero, incluso en el intento fallido.
Se conservan ambas bases/pares de recursos sintéticos de los dos intentos,
actualmente sin Pods activos. El backend principal siguió devolviendo 503 al
registro OTP; no se abrió registro público. El rol SQL es de fixtures, no una
acreditación de privilegios mínimos productivos.

## Errores encontrados y correcciones

1. **Importación de imagen**, no aplicación: kind/ctr importaba todas las
   plataformas de un índice con blobs locales incompletos (`content digest ...
   not found`). Fallback a import de la plataforma local desde docker image save
   en el nodo exclusivo. Las cuatro imágenes quedaron disponibles y los Pods
   arrancaron; no se reconstruyeron ni alteraron imágenes originales.
2. **Fixture de pago:** faltaba `metodo`; API devolvió correctamente 400 antes
   de comprobar propiedad. Se añadió el campo al test; después 404 para otra
   cuenta, 201 para dueño y 409 duplicado. No cambió el contrato ni la app.
3. **Sincronización de navegador:** el test abrió chatbot antes de terminar la
   carga y luego antes del tutorial. Se espera carga completa y se cierra el
   tutorial mediante su botón. Recorrido final completo aprobado, sin cambiar UI.
4. **Contrato del test OTP:** el primer harness esperaba `correo_estado`; el
   contrato vigente usa `estado_envio`. Se corrigió solo el test y se repitió en
   otra base nueva; pasó todo el flujo. El intento previo se conserva y no cuenta
   como aprobado.

Hubo warnings de readiness durante arranque o la interrupción SQL deliberada:
ECONNREFUSED, timeout/500 de health, y un probe inicial antes de escuchar la API
OTP. Se recuperaron al quedar disponible la dependencia. No se desactivaron
probes ni se ocultaron errores; estado final de los cuatro componentes: listo,
cero reinicios. No se identificó un defecto nuevo de código productivo.

## Evidencias locales y archivos

Reportes privados ignorados en `artifacts/kubernetes-avance-19/`: start/retry/reuse,
verify, browser, persistence y otp logs; en state/, JSON de verificación/navegador/
persistencia/OTP/auditoría de logs e inventario, capturas y cuentas sintéticas.
No se versionan kubeconfig, secretos, contraseñas, JWT, reportes o capturas.

Archivos nuevos: `k8s/avance19/{kind.yaml,kustomization.yaml,env.sh,kube.sh,start.sh,
seed.cjs,verify.cjs,browser.cjs,persistence.cjs,otp-fixture.cjs,README.md}` y este
informe. Se actualizan CHANGELOG, el índice Kubernetes y enlace de seguimiento
del informe 18. No cambia código de negocio ni los scripts del clúster del compañero.

## Pendientes y preparación para GitHub

- Reproducir en la laptop del compañero con el checkout integrado y herramientas
  indicadas. La guía se ejecutó en esta PC; no se declara su laptop validada.
- No se repiten Android, PDF, pruebas extensas de OTP/reenvío/caducidad, estrés,
  concurrencia general o las suites completas del avance 18. Se conserva su
  evidencia anterior, sin atribuirla a Kubernetes de este avance.
- Pendientes productivos: TLS/Ingress, imágenes inmutables publicadas, permisos SQL
  mínimos, secretos operativos, observabilidad, NetworkPolicy, escalado Socket.IO,
  migración de históricos con backup/ensayo y recuperación de desastre. Nada se
  ejecutó en servicios productivos ni se envió correo real.
- La integración es apta para **revisión de código y publicación autorizada**.
  Antes de push, verificar/desactivar automatismos de despliegue para esta rama
  nueva; el guardia false de feature/verificacion-correo no basta. No se modificó
  Vercel/Render/Neon para ello en este avance. Falta autorización del propietario.
- Se conserva PR #1 sin cambios remotos y no se crea otro PR. Main local sigue
  7930b26 y feature/verificacion-correo 68d7696. Solo se añadirá el commit local
  del avance en integration/avance-18, sobre ae4eda0.

El clúster exclusivo queda activo para revisar cliente/Admin; los componentes
OTP de fixture quedan detenidos. No se borró ningún contenedor, volumen, base o
clúster original ni se ejecutaron comandos destructivos de Git.
