# Contrato de runtime — PKG-01

## Entradas y salida

Entrada: Frontend/index.html, hm-api-config.js público, assets/ y dependencias compartidas. Destinos: imagen Frontend local y salida cliente build-web consumida por Android. Salida Docker: /var/www/html; recursos compartidos bajo shared/.

Lista mínima de módulos compartidos: api.js, ui.js, styles.css, icons.js, two-factor-ui.js, password-recovery-ui.js, incident-timeline.js; conservar Shared/assets/ y dependencias locales del cliente.

Para cada recurso requerido: origen existente y permitido por contexto → copia al destino correcto → contenido esperado → carga con tipo adecuado. Las comprobaciones sobre Dockerfile no sustituyen revisar el artefacto. Excluir URL externas y referencias que no sean recursos locales; normalizar query/fragmentos sin permitir rutas fuera del artefacto. Incluir dependencias locales de CSS/JS y carga dinámica identificadas en el inventario; no prometer cobertura de casos no inventariados.

## Invariantes

No publicar código administrativo, .env, credenciales, respaldos ni fuentes privadas. Conservar verify-client-runtime y sus controles funcionales actuales. No cambiar API_BASE_URL ni la configuración de despliegue. No ampliar el alcance a Admin o Kubernetes sin nueva decisión.

## Pruebas propuestas (no creadas)

- PKG-T01: build BuildKit aislado con contexto real; reproduce PKG-01a y luego pasa.
- PKG-T02: scripts/test/client-packaging.test.cjs, inspección de recursos del artefacto y dependencias inventariadas; detecta omisiones.
- PKG-T03: mismo archivo, runtime válido y copias sintéticas sin cada uno de los tres módulos; conservar rechazo de Admin.
- PKG-T04: build-web en directorio temporal; comprobar recursos y contrato de separación; no recompilar Android.
- PKG-T05: navegador/servidor temporales autorizados para carga y flujos afectados con API sintética.

Nombres propuestos; acordar su incorporación al inventario antes de ejecutarlos. IDs estables para trazabilidad.
