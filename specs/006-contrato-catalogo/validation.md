# Validación CAT-01 y consolidación local

2026-11-05. Entrada 9c6fdeb, Node v20.19.2 host. Sin Node22, dependencias Backend, PostgreSQL18 ni acceso Docker (socket: operation not permitted). Descarga Node22 imposible: curl nodejs.org falla DNS. No se sustituyó el runtime global ni se usó el runtime de SonarQube. Sin consultas Neon, migraciones, publicación o servicios reales.

## Resultados ejecutados

- Rojo antes de implementación: `node scripts/test/test-catalog.test.cjs`, 0/8 aprobados, validateGroups inexistente (salida1). Informe temporal /tmp/hidro-cat-red-direct.tap. Primera invocación --test solo mostró fallo del archivo; se usó ejecución directa para evidenciar cada caso.
- Verde: ejecución directa con entorno limpio y `--require ./scripts/test-network-guard.cjs`, 9/9 CAT, 9/9 client-packaging.test.cjs y 5/5 public-api-config.test.js. Total23/23, cero omisiones. Informes temporales /tmp/hidro-cat-green.tap, /tmp/hidro-pkg.tap, /tmp/hidro-api.tap. Comando: `env -i PATH=/usr/bin:/bin HOME=/tmp NODE_ENV=test API_BASE_URL=https://api.example.invalid node --require ./scripts/test-network-guard.cjs <archivo>`. Pruebas Node nativas; ejecución directa no equivale al runner Node22.
- CAT-T09 comprueba que inventory() llama al validador antes de clasificar. CAT-T01..08 cubren FR-CAT-001..003; catálogo real conserva grupos previos y exclusión live. Inventario102 archivos, unit23 + contract3.
- `node scripts/test-catalog.cjs --check`: aprobado; `node scripts/check-ci.cjs --self-test`: YAML/políticas aprobadas y ocho negativos rechazados. `git diff --check`: aprobado.
- `npm test`: salida2 por prerrequisito Node22, no ejecutó suite. Se conserva guardia sin bypass.
- Suplementaria `test-runner.test.cjs` directa en Node20: 3 aprobados, 2 fallidos (TEST-T03/T04: salida stderr/stdout vacía del subproceso, no cumple regex esperada). Diagnóstico acotado spawnSync: error EPERM; no se atribuye a CAT ni se alteran expectativas. Runner, guard y prueba existente idénticos a 7b2c773 por diff. Repetir en entorno Node22 con subprocesos habilitados antes de cierre completo.

## Contratos, permisos y límites

PKG-01: nueve regresiones de artefactos/verificador y cinco de configuración API aprobadas. Docker HTTP/MIME/Firefox no repetidos por bloqueo; evidencia anterior enlazada en specs/001-empaquetado-cliente/validation.md sigue siendo histórica.

DB-01: `git diff --exit-code 7b2c773 -- Backend/receipt-transactions.js Backend/test/receipt-profile-compat.cjs Base-de-Datos Backend/package.json Backend/package-lock.json package.json package-lock.json .github/workflows/ci.yml` aprobado. Contratos, migraciones, rutas API y dependencias sin cambios. No es prueba SQL: regresión PG18 pendiente de entorno, no se declara ejecutada. Evidencia previa en specs/002-compatibilidad-recibos/validation.md.

Revisión de diff: sin dependencias, cambios de permisos, workflows, secretos o archivos privados nuevos. Solo rutas sintéticas en pruebas. Inventario conserva hashes de todos los101 archivos previos; una prueba añadida. PR26 sin coincidencia de archivos de código nuevos; CHANGELOG compartido requiere integración futura y regenerar inventario con sus pruebas. No analizado ni modificado SonarQube.

CAT implementado y contrato específico validado localmente. Consolidación completa pendiente por Node22/PG18/daemon y dos fallos suplementarios de subprocesos; no declarar CI ni suite completa verdes. Próximo paso: revalidar este SHA en entorno local Node22/PG18 aislado antes de elegir otro incremento; no implica autorizar push.
