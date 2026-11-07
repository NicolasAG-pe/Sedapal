# Inventario TEST-01

Generado por `node scripts/test-catalog.cjs --write`. Clasificación revisada para listas explícitas; señales estáticas fuera de ellas no acreditan ejecución.

112 archivos (incluye helpers). Duplicados exactos: 0. Sin entrada npm histórica directa: 60. Ver JSON para imports, variables, referencias y scripts. Los hashes detectan deriva de contenido.

| Archivo | Tipo | Grupo nuevo | Requisitos | Riesgo |
|---|---|---|---|---|
| `Backend/test/android-session.cjs` | integracion | fuera por defecto | Node22, jsonwebtoken, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/config.test.js` | unitaria | unit | Node22, pg | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-api.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-cleanup-cli.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-cleanup.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-cleanup.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-contract.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-gmail-worker.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-gmail.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-h03-baseline.cjs` | manual/historica | fuera por defecto | Node22, PostgreSQL sintetico/fixture, historial Git y tags | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-live.cjs` | live | fuera por defecto | Node22, PostgreSQL sintetico/fixture, herramientas opt-in indicadas en fuente | ALTO: puede enviar correo real; fuera de runner |
| `Backend/test/email-live.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-otp.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-outbox-api.cjs` | integracion | fuera por defecto | Node22, pg, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-outbox-postgres.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-outbox.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-registration-gate.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/email-resend.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/email-schema.cjs` | integracion | fuera por defecto | Node22, pg, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/gmail-fixture.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/gmail-roles-local.cjs` | integracion | integration | Node22, pg, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/incident-tracking-fixture.cjs` | helper | fuera por defecto | Node22, pngjs, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/incident-tracking.cjs` | integracion | integration | Node22, ws | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/otp-auto-session.cjs` | integracion | fuera por defecto | Node22, jsonwebtoken, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/pagos-sin-piloto.cjs` | integracion | integration | Node22, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/password-recovery-fixture.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/password-recovery-schema.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/password-recovery.cjs` | integracion | fuera por defecto | Node22, jsonwebtoken, otpauth, ws, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/payment-operations.cjs` | integracion | fuera por defecto | Node22, pngjs, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/payment-production-compat.cjs` | integracion | integration | Node22, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/push-credentials.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/push-fixture.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/push-schema.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/push-start-postgres.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/push.cjs` | integracion | fuera por defecto | Node22, jsonwebtoken, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/quality-migrations.cjs` | integracion | integration | Node22, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/receipt-concurrency.cjs` | integracion | integration | Node22, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/receipt-date.test.js` | unitaria | unit | Node22, pg/lib/utils | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/receipt-profile-compat.cjs` | integracion | integration | Node22, pg, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/receipt-schema.cjs` | integracion | integration | Node22, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/resend-fixture.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/safe-log.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/start-postgres.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/start.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/totp-crypto.test.js` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `Backend/test/totp-key-rotation.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/two-factor-admin.cjs` | integracion | fuera por defecto | Node22, otpauth, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/two-factor-audit.cjs` | integracion | fuera por defecto | Node22, otpauth, ws, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `Backend/test/two-factor.cjs` | integracion | integration | Node22, otpauth, jsonwebtoken, ws, PostgreSQL sintetico/fixture | opt-in: crea bases hijas y modifica exclusivamente fixtures PG18 |
| `Backend/test/yape-pilot.cjs` | integracion | fuera por defecto | Node22, qrcode, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/admin-date-validation.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/admin-e2e.cjs` | E2E/navegador | fuera por defecto | Node22, PostgreSQL sintetico/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-fcm-registration-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-incident-tracking-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-location-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-otp-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-password-recovery-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-payments-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture, Poppler | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-pdf-viewer.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-push-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-release-signing.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/android-session-native.cjs` | Android/dispositivo | fuera por defecto | Node22, PostgreSQL sintetico/fixture, Playwright/Chromium externo al lockfile, Android SDK/dispositivo/fixture, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-transition.cjs` | E2E/navegador | fuera por defecto | Node22, PostgreSQL sintetico/fixture, Playwright/Chromium externo al lockfile, dependencias Backend instaladas (rutas literales), historial Git y tags | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-two-factor-native.cjs` | Android/dispositivo | fuera por defecto | Node22, Android SDK/dispositivo/fixture, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/android-upgrade.test.cjs` | contrato | contract | Node22, historial Git y tags | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/backend-docker23.cjs` | manual/historica | fuera por defecto | Node22, dependencias Backend instaladas (rutas literales), herramientas opt-in indicadas en fuente | ALTO opt-in: verificar backups/contenedores/destino antes de ejecutar; fuera de runner |
| `scripts/test/backend-history23.cjs` | manual/historica | fuera por defecto | Node22, PostgreSQL sintetico/fixture, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/browser-coverage.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/chatbot-ui-checks.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/client-checks.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/client-packaging-browser.cjs` | E2E/navegador | e2e | Node22, Firefox y origen Nginx aislado | opt-in: HTTP local/Firefox con API sintetica |
| `scripts/test/client-packaging.test.cjs` | contrato | contract | Node22, herramientas opt-in indicadas en fuente | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/client-session.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/close-native-fixture.cjs` | helper | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/close-native-fixture.test.cjs` | integracion/loopback | fuera por defecto | Node22, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/docker-context.test.cjs` | unitaria | unit | Node22, herramientas opt-in indicadas en fuente | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/documents.test.cjs` | unitaria/suplementaria | fuera por defecto | Node22, Poppler | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/downgrade-lab.cjs` | manual/historica | fuera por defecto | Node22, PostgreSQL sintetico/fixture, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/firebase-lab.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/firebase-release.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/hidrobot.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/identity-palette.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/identity-visual.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile, herramientas opt-in indicadas en fuente | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/incident-tracking-flow.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/k8s-integration.test.cjs` | integracion | fuera por defecto | Node22, PostgreSQL sintetico/fixture, herramientas opt-in indicadas en fuente | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/local-check-transport.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/password-recovery-flow.cjs` | E2E/navegador | fuera por defecto | Node22, PostgreSQL sintetico/fixture, Playwright/Chromium externo al lockfile, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/payment-audit-flow.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile, dependencias Backend instaladas (rutas literales), Poppler, herramientas opt-in indicadas en fuente | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/payment-flow.cjs` | E2E/navegador | fuera por defecto | Node22, PostgreSQL sintetico/fixture, Playwright/Chromium externo al lockfile, dependencias Backend instaladas (rutas literales) | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/payment-production-browser.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/payment-production-restore.cjs` | manual/historica | fuera por defecto | Node22, herramientas opt-in indicadas en fuente | ALTO opt-in: verificar backups/contenedores/destino antes de ejecutar; fuera de runner |
| `scripts/test/payment-production-runtime.cjs` | manual/revision | fuera por defecto | Node22 | ALTO opt-in: verificar backups/contenedores/destino antes de ejecutar; fuera de runner |
| `scripts/test/payment-realtime-flow.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile, herramientas opt-in indicadas en fuente | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/pdf-example-runtime.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/preproduccion24.cjs` | manual/historica | fuera por defecto | Node22, historial Git y tags, herramientas opt-in indicadas en fuente | ALTO opt-in: verificar backups/contenedores/destino antes de ejecutar; fuera de runner |
| `scripts/test/profile-navigation.test.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/public-api-config.test.js` | contrato | contract | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/push-event-errors.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/push-flow.cjs` | E2E/navegador | fuera por defecto | Node22, PostgreSQL sintetico/fixture, Playwright/Chromium externo al lockfile | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/quality-audit-flow.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/realtime.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/registration-state.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/release-image.test.cjs` | manual/historica | fuera por defecto | Node22, herramientas opt-in indicadas en fuente | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/secure-session.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/security-headers.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/test-catalog.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/test-runner.test.cjs` | unitaria | unit | Node22, PostgreSQL sintetico/fixture | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/totp-restore-lab.cjs` | manual/historica | fuera por defecto | Node22, PostgreSQL sintetico/fixture, dependencias Backend instaladas (rutas literales), herramientas opt-in indicadas en fuente | ALTO opt-in: verificar backups/contenedores/destino antes de ejecutar; fuera de runner |
| `scripts/test/two-factor-ui.test.cjs` | E2E/navegador | fuera por defecto | Node22, Playwright/Chromium externo al lockfile | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/ui-money.test.cjs` | unitaria | unit | Node22 | revisada: mocks/archivos temporales/loopback; guard de red |
| `scripts/test/visual-checks.cjs` | E2E/navegador | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |
| `scripts/test/yape-pilot-flow.cjs` | E2E/navegador | fuera por defecto | Node22 | NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso |

Alias conservado: yape-pilot-flow → payment-audit-flow. Solapamientos de scripts y referencias sin entrada directa se detallan en JSON; no se consideran helpers huérfanos automáticamente. Las pruebas manuales/dispositivo y live no se incluyen en npm test ni CI mínimo. No se eliminó ni reescribió ninguna prueba previa.
