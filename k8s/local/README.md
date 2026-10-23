> Avance 18: esta guía describe operaciones futuras que requieren autorización.
> No se ejecutó up.sh ni se aplicaron manifiestos durante la integración. Altas
> cerradas por defecto; PVC anterior requiere migraciones manuales 003–006.
> La validación histórica del compañero no acredita el código integrado.

# Prueba local de Sedapal en Kubernetes

Clúster Kind `sedapal-test`, namespace `sedapal`. Las herramientas y el kubeconfig
están en `.local/k8s/` dentro del proyecto, excluidos de Git. Kubernetes ejecuta
sus nodos en Docker; los datos de PostgreSQL viven en el volumen del nodo Kind.
No se usa ni modifica el kubeconfig global ni la base de Docker Compose.

Los puertos 8080/8081 permanecen disponibles para Compose. Kubernetes publica
solo en loopback:

| Panel | URL |
| --- | --- |
| Usuario | http://localhost:8082 |
| Administración | http://localhost:8083 |

## Levantar o actualizar

Desde la raíz de Sedapal, con Docker activo:

```bash
bash k8s/local/up.sh
node k8s/local/verify.cjs
```

`up.sh` construye y carga imágenes locales, genera los secretos de infraestructura
si no existen, valida los manifiestos contra el servidor y espera los despliegues.
Reutiliza el volumen existente y no necesita publicar imágenes en un registro.
El overlay adapta imágenes, puertos y CORS; no modifica los YAML de producción.

**Actualización avance 18:** `verify.cjs` ya no crea ni promueve cuentas por
el registro antiguo: su contrato ahora devuelve 426 y el nuevo requiere OTP.
Requiere cuentas sintéticas previamente provisionadas por un operador en el
clúster exclusivo y archivo privado `.local/k8s/state/accounts.json` (600),
objetos `admin`/`user` con `correo`, `numero_suministro` y `password`. No ejecutar
contra cuentas reales. La provisión/verificación Kubernetes de estas cuentas
queda pendiente; el harness local del avance 18 usa bases nuevas y Resend simulado.
No activar correo real para conseguir fixtures.

La verificación prueba login por ambos proxies, roles, recursos del panel,
rechazo 401/403 de las 19 rutas administrativas, CORS, Socket.IO autenticado,
contrato legacy 426 y validación de sesión. No crea solicitudes ni modifica roles.

## Navegador y persistencia

El navegador de pruebas ya está instalado en `.local/k8s/`. Para repetir:

```bash
node k8s/local/browser.cjs
node k8s/local/persistence.cjs
```

La prueba de navegador comprueba que el panel rechaza usuarios normales, permite
al administrador iniciar sesión, carga sus siete módulos y permite al usuario
acceder a su dashboard. Guarda capturas de escritorio/móvil y errores detectados.
La prueba de persistencia recrea el Pod de PostgreSQL y comprueba el login de
ambas cuentas y la respuesta guardada por `verify.cjs`, sin que cambie el Pod,
contenedor o contador de reinicios del backend.

Los reportes y capturas están en `.local/k8s/state/`. Ejecutar las pruebas sin
navegar o crear datos al mismo tiempo para evitar interferencias.

## Diagnóstico y consumo

```bash
k8s/local/kubectl.sh get pods,services,pvc
k8s/local/kubectl.sh logs deployment/backend --tail=100
k8s/local/kubectl.sh get events --sort-by=.metadata.creationTimestamp
docker stats --no-stream sedapal-test-control-plane
```

El equipo tiene aproximadamente 4 GiB de RAM y también ejecuta Compose; mantener
un solo nodo y una réplica de cada servicio. El navegador de pruebas se cierra
al terminar. Para liberar memoria sin borrar datos, detener solo el nodo local:

```bash
docker stop sedapal-test-control-plane
# Para volver a usarlo:
docker start sedapal-test-control-plane
k8s/local/kubectl.sh wait --for=condition=Ready node/sedapal-test-control-plane --timeout=180s
```

Eliminar el clúster Kind elimina también su base de pruebas. Esta persistencia
local no reemplaza respaldos de producción.

## Herramientas instaladas

- Kind v0.33.0, nodo `kindest/node:v1.37.0`.
- kubectl v1.37.1, descarga verificada con SHA256 oficial.
- Playwright 1.64.1 y Chromium Headless Shell en `.local/k8s/`.

Fuentes oficiales de instalación:
[Kind](https://kind.sigs.k8s.io/docs/user/quick-start/),
[kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/) y
[Playwright](https://playwright.dev/docs/browsers).

## Antes del merge

```bash
npm run test:config
npm run test:documents
git diff --check
git status --short
```

Revisar los cambios de `.gitignore`, `Backend/server.js`, `k8s/` y
`scripts/check-admin-local.cjs`. El backend maneja ahora errores de conexiones
inactivas de PostgreSQL para soportar reinicios de la base sin terminar Node.
`.local/` no debe entrar al commit. La prueba local no configura publicación:
producción sigue requiriendo imágenes de registro, credenciales propias,
Ingress/TLS, CORS público, estrategia de backup y migración de datos.
