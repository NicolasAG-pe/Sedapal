# Kubernetes local integrado — avance 19

Entorno **exclusivo**: kind `hidro-avance19`, namespace `hidro-avance19`.
Deriva de los manifiestos `k8s/local` del equipo; no los sustituye. Usa puertos
loopback **8084** (cliente) y **8085** (Admin), sin tocar Compose 8080/8081 ni
el clúster del compañero `sedapal-test`. No es una configuración productiva.

Este flujo es la **opción local mantenida para `main`** a partir de la
integración del [PR #21](https://github.com/NicolasAG-pe/Sedapal/pull/21).
Compose, Render, Vercel y Neon siguen siendo independientes: Kubernetes local no
lee `.env`, no usa Neon ni publica en esos servicios.

## Preparación en otra laptop

Mientras el PR #21 está en revisión, usar su rama; una vez integrado, clonar
`main`. Descargar un checkout independiente y comprobar su hash; conservar
cualquier copia previa:

```sh
# Tras el merge del PR #21:
git clone --branch main --single-branch https://github.com/NicolasAG-pe/Sedapal.git Sedapal-integracion
# Mientras el PR está abierto:
# git clone --branch feature/k8s-local-actualizado --single-branch https://github.com/NicolasAG-pe/Sedapal.git Sedapal-integracion
cd Sedapal-integracion
git status --short --branch
git log -1 --oneline
```

Para reproducir una validación histórica, usar el commit de su informe. No
copiar `.env`, secretos, kubeconfig, bases ni directorios `artifacts` de otra
laptop. Cada entorno genera sus propias credenciales y datos sintéticos.

Requisitos comprobados en esta PC: Linux amd64/Debian, Docker 29.9.1, kind 0.33.0,
kubectl 1.37.1 y Node 20.19.2 (contenedor backend Node 22.23.4). El nodo está
fijado a Kubernetes 1.37.0 con digest en `kind.yaml`.

Antes de arrancar, comprobar en la máquina del compañero:

- Docker activo y usuario con permiso para crear contenedores.
- Node 20.19 o superior en PATH (los tests usan `fetch` y `AbortSignal.timeout`).
- Al menos 8 GiB de RAM recomendados; **4 GiB es el mínimo** y solo si Compose
  está detenido. En esta PC (3.7 GiB) el nodo kind fue detenido por el sistema
  (`Exited 137`) al convivir con otros contenedores; tras liberar memoria y
  arrancar solo el nodo, las pruebas pasaron. No ejecutar Compose durante la
  validación.
- Unos 15 GiB libres: imágenes locales (≈500 MiB), nodo kind (≈1.3 GiB) y PVC
  declarado de 10 GiB.
- Puertos **8084** y **8085** libres y sin otro proceso escuchando.
- Virtualización habilitada si Docker la requiere.
- Si ya existe un clúster ajeno llamado `hidro-avance19`, no reutilizar estos
  scripts allí: usar una máquina o entorno independiente. No hay que modificar
  el kubeconfig global ni instalar un JDK.

Usar herramientas existentes en PATH, o indicar ejecutables privados en cada
terminal donde se ejecuten los scripts y tests:

```sh
export HIDRO_KIND_BIN=/ruta/kind
export HIDRO_KUBECTL_BIN=/ruta/kubectl
```

`env.sh` también reconoce `.local/k8s/bin/` del propio checkout, pero esa carpeta
está ignorada por Git y no se comparte. Obtener kind y kubectl de los proveedores
y comprobar sus SHA256:
[kind](https://kind.sigs.k8s.io/docs/user/quick-start/),
[kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/).
Si no se definen las variables, el arranque falla con un mensaje explícito y no
usa otro contexto.

Las tres imágenes deben corresponder al código integrado. Si ya existen y se
verificaron sus fuentes, reutilizarlas. Si faltan o cambió el código, construir
solo las necesarias desde la raíz del checkout:

```sh
docker build -f Backend/Dockerfile -t hidro-avance18-backend:local Backend
docker build -f Frontend/Dockerfile -t hidro-avance18-web:local .
docker build -f Admin/Dockerfile -t hidro-avance18-admin:local .
```

La validación del 24 de octubre reutilizó las tres imágenes del avance 18 y
contrastó hashes de fuentes; la repetición del 28 de octubre reconstruyó las
imágenes desde el código actual. No basta con que coincida el nombre de una
etiqueta. `start.sh` **no construye** imágenes: si falta alguna, se detiene con
las instrucciones de build. PostgreSQL `postgres:18` debe existir localmente:

```sh
docker pull postgres:18
docker image ls 'hidro-avance18-*' postgres:18
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

`browser.cjs` carga Playwright desde `HIDRO_PLAYWRIGHT_MODULE`. El módulo y su
navegador deben corresponderse; si están en otra ruta:

```sh
export HIDRO_PLAYWRIGHT_MODULE=/ruta/node_modules/playwright
export PLAYWRIGHT_BROWSERS_PATH=/ruta/cache-de-browsers
```

En esta PC se usó Playwright 1.64.1 con Chromium Headless Shell desde
`.local/k8s/browser/node_modules/playwright` y `.local/k8s/browser-cache`
(carpetas ignoradas por Git). El compañero puede reutilizar su instalación
privada; si no dispone de ninguna, instalación **local de herramienta de
pruebas**, fuera del código:

```sh
npm install --prefix artifacts/kubernetes-avance-19/browser --no-save --package-lock=false playwright@1.56.1
export HIDRO_PLAYWRIGHT_MODULE="$PWD/artifacts/kubernetes-avance-19/browser/node_modules/playwright"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/kubernetes-avance-19/browsers"
node "$HIDRO_PLAYWRIGHT_MODULE/cli.js" install chromium
```

Ajustar la versión a la del navegador descargado; no se añade Playwright como
dependencia de la aplicación. `verify.cjs` y `persistence.cjs` solo necesitan
Node y `fetch`; no requieren `npm install` en el host.

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

## Compatibilidad con Compose, Render, Vercel y Neon

| Entorno | Puerto / acceso | Datos y secretos | Efecto de Kubernetes |
| --- | --- | --- | --- |
| Docker Compose | 8080/8081 | `.env` y volumen `postgres_data` | Ninguno; no comparte red ni volumen |
| Kubernetes local | 8084/8085 | Secretos aleatorios y PVC `db-data` del clúster kind | Es este flujo |
| Render / Vercel | Dominios públicos | Variables y secretos de cada plataforma | No se modifican ni se leen |
| Neon | PostgreSQL gestionado | Cadena `DATABASE_URL` de producción | No se usa en el clúster local |

Los manifiestos base usan `POSTGRES_*` y Services internos; no contienen cadenas
de Neon ni credenciales de Render/Vercel. Levantar o detener el clúster local no
reinicia contenedores de Compose ni cambia despliegues. En equipos con poca
memoria, ejecutar Compose y kind a la vez puede provocar que Docker detenga el
nodo; usar un solo entorno durante la validación.

## Detener, reiniciar y recuperar

Para **detener sin perder datos**, parar el nodo. Esto no borra el clúster, el
PVC, las cuentas sintéticas ni los Secretos; al arrancarlo se reutilizan:

```sh
docker stop hidro-avance19-control-plane
```

El nodo kind no arranca solo. Tras reiniciar la PC, o si Docker lo detuvo por
falta de memoria, arrancarlo y esperar a que esté Ready antes de repetir las
pruebas:

```sh
docker start hidro-avance19-control-plane
export KUBECONFIG="$PWD/artifacts/kubernetes-avance-19/state/kubeconfig"
kubectl --context kind-hidro-avance19 wait --for=condition=Ready \
  node/hidro-avance19-control-plane --timeout=180s
bash k8s/avance19/start.sh   # reutiliza sin reiniciar si no hay cambios
```

No borrar el clúster para liberar memoria: el PVC y las cuentas viven en su
volumen. Durante el arranque los Pods pueden mostrar `Error` o reinicios
transitorios y la API puede fallar readiness hasta recuperar PostgreSQL. Si el
estado final no es cuatro Deployments disponibles, revisar `kubectl get events`
y la memoria disponible antes de repetir. En esta PC el nodo apareció como
`Exited 137` (coincide con falta de memoria) y se recuperó al arrancarlo sin
Compose activo.

## Publicación posterior

El [PR #21](https://github.com/NicolasAG-pe/Sedapal/pull/21) integra este flujo
en `main`. Ambos `vercel.json` excluyen explícitamente su rama
(`feature/k8s-local-actualizado`) además de `integration/avance-18`,
`feature/verificacion-correo` y `main`, para que el push no dispare despliegues
Git Vercel. Antes del merge hay que comprobar las conexiones Git/raíces de Vercel
y las ramas/autodespliegues/vistas previas de Render: una exclusión Vercel no
protege otros proveedores. El merge no se ejecutó; requiere autorización y
confirmar que Render no desplegará automáticamente `main` como consecuencia.
