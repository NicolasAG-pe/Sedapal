# Kubernetes local integrado — avance 19

Entorno **exclusivo**: kind `hidro-avance19`, namespace `hidro-avance19`.
Deriva de los manifiestos `k8s/local` del equipo; no los sustituye. Usa puertos
loopback **8084** (cliente) y **8085** (Admin), sin tocar Compose 8080/8081 ni
el clúster del compañero `sedapal-test`. No es una configuración productiva.

## Preparación en otra laptop

Una vez confirmada la publicación de `integration/avance-18`, descargar un
checkout independiente y comparar su hash con el comunicado por el equipo:

```sh
git clone --branch integration/avance-18 --single-branch https://github.com/NicolasAG-pe/Sedapal.git Sedapal-integracion
cd Sedapal-integracion
git status --short --branch
git log -1 --oneline
```

No fusionar main para reproducir esta validación. No copiar `.env`, secretos,
kubeconfig, bases ni directorios `artifacts` de otra laptop. Cada entorno genera
sus propias credenciales y datos sintéticos.

Herramientas comprobadas: Linux amd64/Debian, Docker 29.9.1, kind 0.33.0,
kubectl 1.37.1 y Node 20.19.2 (contenedor backend Node 22.23.4).
El nodo está fijado a Kubernetes 1.37.0 con digest en `kind.yaml`.
La máquina de validación tenía 15 GiB RAM y unos 30 GiB libres antes de arrancar;
comprobar recursos/virtualización y espacio propios. Los puertos 8084/8085 deben
estar libres. Si ya existe un clúster ajeno llamado `hidro-avance19`, no reutilizar
estos scripts allí: usar una máquina o entorno independiente. No hay que modificar
el kubeconfig global ni instalar un JDK.

Usar herramientas existentes en PATH, o indicar ejecutables privados:

```sh
export HIDRO_KIND_BIN=/ruta/kind
export HIDRO_KUBECTL_BIN=/ruta/kubectl
```

Los fallbacks de esta máquina están en `artifacts/kubernetes-avance-19/tools/kind`
y `artifacts/integracion-18/tools/kubectl`; no se versionan. Para otra laptop,
obtener herramientas de los proveedores y comprobar sus SHA256:
[kind](https://kind.sigs.k8s.io/docs/user/quick-start/),
[kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/).

Las tres imágenes deben corresponder al código integrado. Si ya existen y se
verificaron sus fuentes, reutilizarlas. Si faltan o cambió el código, construir
solo las necesarias desde la raíz del checkout:

```sh
docker build -f Backend/Dockerfile -t hidro-avance18-backend:local Backend
docker build -f Frontend/Dockerfile -t hidro-avance18-web:local .
docker build -f Admin/Dockerfile -t hidro-avance18-admin:local .
```

En esta validación se reutilizaron las tres imágenes del avance 18: **no se
reconstruyeron**. Se contrastaron hashes del backend/worker, HTML y conocimiento
Sedapal con las fuentes. No basta con que coincida el nombre de una etiqueta.
PostgreSQL `postgres:18` debe existir localmente. Si falta, obtener la imagen
oficial antes del arranque:

```sh
docker pull postgres:18
```

No se cargan datos o volúmenes de Compose.

## Arranque y pruebas

```sh
bash k8s/avance19/start.sh
node k8s/avance19/verify.cjs
bash k8s/avance19/kube.sh get pods,deployments,services,pvc
curl --fail http://localhost:8084/api/health
curl --fail http://localhost:8085/api/health
```

Los cuatro servicios (`web`, `admin`, `backend`, `db`) deben quedar Ready y ambos
endpoints health deben devolver estado `ok`. Abrir cliente en
http://localhost:8084 y Admin en http://localhost:8085. `verify.cjs` crea y comprueba
cuentas sintéticas, sesión, permisos, recibos/pagos/incidencias y Socket.IO.
No necesita `npm install` en el host; las dependencias backend están en su imagen.

Las siguientes pruebas adicionales son opcionales y van después del verificador:

```sh
node k8s/avance19/browser.cjs
node k8s/avance19/persistence.cjs
node k8s/avance19/otp-fixture.cjs --simulated-only
bash k8s/avance19/kube.sh get pods,deployments,services,pvc
```

Ejecutar en ese orden y en serie. Las pruebas conservan sus datos sintéticos y
pueden agregar recibos/usuarios de fixture en su entorno dedicado. No ejecutar
contra una base o contexto distinto. La provisión inicial comprueba DB
`hm_avance19`, usa contraseñas aleatorias y correo `@fixture.invalid`; no activa
registro antiguo ni promueve cuentas existentes.

`browser.cjs` reutiliza Playwright del proyecto. Si está en otra ruta:

```sh
export HIDRO_PLAYWRIGHT_MODULE=/ruta/node_modules/playwright
export PLAYWRIGHT_BROWSERS_PATH=/ruta/cache-de-browsers
```

En esta PC: `artifacts/vercel-validation/tools/node_modules/playwright` y
`artifacts/vercel-validation/browsers`. El compañero puede reutilizar su instalación
`.local/k8s/browser`; el módulo y su navegador deben corresponderse. Si no dispone
de ninguno, instalación **local de herramienta de pruebas**, fuera del código:

```sh
npm install --prefix artifacts/kubernetes-avance-19/browser --no-save --package-lock=false playwright@1.56.1
export HIDRO_PLAYWRIGHT_MODULE="$PWD/artifacts/kubernetes-avance-19/browser/node_modules/playwright"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/kubernetes-avance-19/browsers"
node "$HIDRO_PLAYWRIGHT_MODULE/cli.js" install chromium
```

No se instaló Playwright de nuevo en esta sesión ni se añadió dependencia a la app.

## Qué modifica cada comando

- `start.sh`: crea/reutiliza solo `hidro-avance19`, escribe únicamente su kubeconfig
  privado, carga imágenes locales, crea secretos aleatorios si es un volumen nuevo,
  renderiza el overlay y ejecuta dry-run de servidor/apply solo en su namespace.
  Si encuentra PVC sin Secret, se detiene: no regenera credenciales sobre datos.
  No construye imágenes, aplica migraciones a volúmenes existentes ni reinicia
  despliegues al reutilizar una configuración sin cambios.
- `verify.cjs`: provisiona/verifica cuentas sintéticas por operador; prueba HTTP,
  roles, recibos/pagos/incidencias, contrato y Socket.IO. Las credenciales viajan
  por stdin, no por argumentos o logs; JWT solo en memoria.
- `browser.cjs`: Chromium real contra los NodePorts, Admin/cliente, chatbot,
  notificación Socket.IO de nuevo recibo, pago desde UI, navegación y logout.
- `persistence.cjs`: recrea exclusivamente el Pod DB de este namespace; conserva
  PVC y verifica filas y recuperación del backend sin reiniciar su contenedor.
- `otp-fixture.cjs`: opt-in explícito; crea una **base nueva** y API ClusterIP
  independiente, sin NodePort. Reutiliza el Deployment worker del avance 18 con
  proveedor preload que intercepta Resend y nunca delega en una petición HTTP.
  Comprueba cola/idempotencia, worker separado, OTP incorrecto/correcto y sesión.
  El backend principal mantiene `EMAIL_REGISTRATION_ENABLED=0`. Al terminar,
  escala API/worker de fixture a cero y conserva sus bases/recursos de prueba.

### Importación Docker/containerd

Si `kind load docker-image` falla con `content digest ... not found`, el wrapper
importa desde `docker image save` únicamente la plataforma local con `ctr` en
**su nodo**. Resuelve índices multiarch con blobs ausentes de otras plataformas;
no reconstruye/retaggea ni altera imágenes o contenedores originales.

## Datos y seguridad

Estado privado: `artifacts/kubernetes-avance-19/state/` (ignorado, permisos
restrictivos). Contiene kubeconfig, cuentas sintéticas, reportes, logs y capturas.
No subirlo a Git ni compartir sus secretos. Cada laptop genera sus propias claves.
No se usan `.env`, Neon, Render, Vercel ni API keys reales de Resend.

El init vigente se ejecuta **solo en PVC vacío**; un PVC antiguo requiere un plan
manual autorizado de migración, no volver a aplicar init. La comprobación 003–006
se ejecuta únicamente en una base OTP nueva. La persistencia acreditada es frente
a recreación del Pod, no eliminación del clúster/nodo, desastre, HA o backup.
El usuario SQL es exclusivo de fixtures; esta prueba no acredita privilegios
mínimos de producción. Los pagos son simulados, sin dinero ni tarjetas reales.

No hay limpieza automática: no borrar clústeres, PVC, volúmenes, Secrets ni bases.
El clúster se deja activo para revisión; los componentes OTP temporales quedan
con cero réplicas. No iniciar Android ni conectar dispositivos reales.

## Publicación posterior

Ambos `vercel.json` excluyen explícitamente `integration/avance-18` y conservan la
exclusión de `feature/verificacion-correo`. El avance 21 también excluye `main`
para que una futura fusión autorizada no dispare despliegues Git Vercel.
La publicación requiere comprobar además las conexiones Git/raíces de Vercel y
las ramas/autodespliegues/vistas previas de Render. Una exclusión Vercel no protege
otros proveedores. No ejecutar push, merge o PR como parte de esta guía local.
