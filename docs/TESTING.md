# Pruebas reproducibles

TEST-01 conserva pruebas anteriores y añade selección explícita segura. Referencia de ejecución: [validation.md](../specs/003-pruebas-automatizadas/validation.md); precisión de inventario en6399d44. DOC-01 no vuelve a ejecutar pruebas de producto ni atribuye a GitHub resultados locales.

## Prerrequisitos y comandos

Node22 y dependencias Backend desde su lock: `npm ci --prefix Backend --ignore-scripts --no-audit --no-fund`. No cargar `.env` productivo, tokens ni credenciales de proveedores. Capacitor/Android SDK no son necesarios para la suite predeterminada.

| Comando | Alcance / requisitos |
|---|---|
| npm test | 22 archivos unitarios +3 contratos seleccionados, sin BD/proveedor real |
| npm run test:unit | Subconjunto unitario seguro |
| npm run test:contract | Contratos; incluye PKG-01 |
| npm run test:inventory | Comprueba catálogo y hashes, no ejecuta toda la colección |
| npm test -- --report | JUnit y metadatos en artifacts/tests/safe-* |
| npm run test:coverage | Suite segura instrumentada V8; no cobertura global |
| npm run test:integration -- --report | Cinco archivos, PostgreSQL18 nuevo con fixtures sintéticos; incluye DB-01 |
| npm run test:e2e | Opt-in navegador PKG-01, Firefox y origen estático Nginx temporal verificado |

`-- --list` en las suites muestra selección sin ejecutarla. [Quickstart detallado](../specs/003-pruebas-automatizadas/quickstart.md). Para integrar cambios en pruebas, revisar el catálogo y luego regenerar mediante `node scripts/test-catalog.cjs --write`; no actualizar hashes para ocultar una regresión.

Integración exige `HIDRO_TEST_ISOLATED_DB=1` y `HIDRO_EMAIL_TEST_DB_PORT`, padre hm_email_test y rol hm_fixture con credencial sintética del helper. **Antes** del flag, comprobar identidad, ausencia de datos reales, red y almacenamiento temporal de la instancia. No basta un nombre/puerto loopback; no apuntar al Postgres de Compose en uso ni a Neon. Los tests crean bases hijas; son escrituras deliberadas sobre entorno sintético.

E2E requiere `HIDRO_PKG01_STATIC_ORIGIN` loopback de un Nginx fixture identificado, Firefox disponible y API interceptada/aislada. No conectar clientes de prueba a producción. No instala navegador ni genera cobertura web con flags V8.

## Inventario y resultados ya acreditados

[Inventario de101 entradas](../specs/003-pruebas-automatizadas/test-inventory.md):23 unitarias (22 predeterminadas y una suplementaria Poppler),3 contratos,31 integración (incluye loopback),16 E2E,10 Android,8 helpers,9 manuales/históricas y1 live. No equivalen a101 pruebas seguras ejecutables. Se conservan scripts antiguos; sus comandos no heredan automáticamente el guard del runner nuevo.

Evidencia TEST-01: Node22.23.4,128 aprobadas/0 fallidas/0 omitidas en suite segura; integración PG18.6,62 aprobadas/0 fallidas/1 omisión condicional acreditada previamente en DB-01. No significa que todo el inventario, dispositivos o pruebas live se hayan ejecutado. PKG-01 añadió validación HTTP/MIME y Firefox aislada en su [informe](../specs/001-empaquetado-cliente/validation.md).

Baseline medida con suite segura:47,72% líneas,82,66% ramas,62,92% funciones, **solo fuentes cargadas por esa suite**. Excluye dependencias/tests y no representa todo Backend, JS inline, navegador, integración ni Android. No se impusieron umbrales ni se modifica el análisis de calidad de otro compañero.

El runner limpia entorno y limita conexiones Node a loopback; no es sandbox de código malicioso ni protección para scripts históricos. No ejecutar por defecto correo live, workers reales, push, restauraciones, pruebas nativas o comandos manuales. Los reportes deben revisarse antes de compartir; no publicar fixtures privados ni volcados de entorno.

## CI

[Workflow](../.github/workflows/ci.yml): safe→integration en Node22, PostgreSQL18 efímero, sin secrets ni deploy. Validación local aprobada, ejecución remota pendiente. [Controles antes de publicar](../specs/004-integracion-continua/prepublication.md). No se exige repetir128/62 pruebas por un cambio exclusivamente documental.
