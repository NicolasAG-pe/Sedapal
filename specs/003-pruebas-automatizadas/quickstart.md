# Comandos TEST-01

Requiere Node22 y dependencias Backend: `npm ci --prefix Backend --ignore-scripts`. No instala herramientas Android ni dependencias raíz que estas suites no necesitan. Conservados ambos lockfiles y todos los scripts antiguos; los antiguos no reciben automáticamente el guard nuevo.

- `npm test`: 22 archivos unitarios y 3 de contrato, sin base ni proveedor real.
- `npm run test:unit` / `npm run test:contract`: subconjuntos explícitos. `-- --list` solo lista.
- `npm run test:inventory`: comprueba todos los archivos y hashes; regenerar después de revisar cambios con `node scripts/test-catalog.cjs --write`.
- `npm run test:coverage`: suite segura con cobertura V8; no umbral, no cobertura global.
- `npm test -- --report` o `-- --coverage --report`: JUnit y run.json en un directorio nuevo artifacts/tests/safe-*. V8 crudo solo en cobertura. No publicar fixtures ni reportes crudos sin revisión.
- `npm run test:integration -- --report`: exige HIDRO_TEST_ISOLATED_DB=1 y HIDRO_EMAIL_TEST_DB_PORT. Instancia PG18 NUEVA, local, dedicada con padre hm_email_test/rol hm_fixture y credencial sintética del helper. Comprobar identidad, red, tmpfs y cero datos reales ANTES de poner el flag. Un nombre/flag no demuestra aislamiento. No apuntar a un servidor real aunque su puerto sea local.
- `npm run test:e2e`: opt-in PKG-T05, HIDRO_PKG01_STATIC_ORIGIN loopback de Nginx temporal previamente verificado y Firefox instalado; nunca entra en npm test. No produce cobertura de navegador con flags V8.

Los comandos nuevos limpian entorno heredado y limitan red de suites Node a loopback. No ejecutan rutas arbitrarias de CLI. Esto no sustituye el aislamiento OS/Docker ni protege frente a código malicioso; ejecutar PR sin secretos y con permisos mínimos. Native, restore, live y otras integraciones suplementarias quedan en inventario, no se ejecutan por defecto.
