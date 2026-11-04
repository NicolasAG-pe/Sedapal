# Baseline técnica — d3d27d0

Fecha de revisión: 2026-11-04. SHA completo: d3d27d068a53dff8e536d690e615f858722157bb.
Rama: chore/adopcion-sdd-rpi. Remoto: https://github.com/NicolasAG-pe/Sedapal.git.
Árbol limpio al inicio de PLAN-01. Esta baseline describe el código de ese SHA; la documentación nueva aún no tiene commit.

## Método y clasificación

Lectura de código/configuración y comandos Git de inspección, sin pruebas, builds, SQL ni servicios. E = evidencia estática; P = ejecución comprobada; H = hipótesis; N = destino no verificado. No hay nuevos resultados P en esta fase. Los informes OpenCode 1 y 2 se recibieron en conversación; no son archivos versionados ni una ejecución independiente. Sus conteos no se adoptan como métricas auditadas.

| ID | Evidencia E en el árbol base | Consecuencia pendiente de ejecución |
|---|---|---|
| PKG-01a | Frontend/Dockerfile pide two-factor-ui.js; Frontend/Dockerfile.dockerignore lo excluye con ** sin negación específica; Compose usa contexto raíz | BuildKit no dispone del archivo solicitado; reproducir build |
| PKG-01b | Frontend/index.html referencia password-recovery-ui.js e incident-timeline.js; Dockerfile no los copia | Recursos ausentes del artefacto; verificar carga y flujos |
| PKG-01c | scripts/verify-client-runtime.js no exige password-recovery-ui.js | Verificador puede aceptar ese runtime incompleto |
| DB-01 | Backend/receipt-transactions.js consulta control_piloto_yape tras pagos/operaciones; 014 rechaza esa tabla | Recibos sin bloqueos previos alcanzan relación inexistente en perfil sin piloto; reproducir HTTP/SQL |
| HEALTH-01 | Backend/server.js /api/health ejecuta SELECT NOW() | No garantiza compatibilidad de esquema; readiness queda fuera del cambio |

## Arquitectura y pruebas existentes

Clientes Frontend/Admin HTML-CSS-JS y Android Capacitor; Shared; API Express/Socket.IO y módulos funcionales/workers; PostgreSQL con init.sql y migraciones 001–014. Los manifiestos raíz y Backend declaran 1.0.0; la denominación de producto 1.2.0 no demuestra uniformidad de versión ni despliegue actual. No se cambia versionado aquí.

Backend/test/payment-production-compat.cjs ya construye un esquema sin piloto con base anterior a 007 + 007/008/014; comprueba guardas y conservación. Backend/test/quality-migrations.cjs verifica otra cadena. Backend/test/receipt-concurrency.cjs cubre recibos mediante harness existente. No se ejecutaron: se confirma su contenido, no su éxito. Falta conectar comportamiento editar/anular con perfil sin piloto; es incorrecto afirmar que ninguna prueba materializa ese perfil.

init.sql contiene esquema de laboratorio y no equivale al perfil productivo. La ausencia de pagos en las migraciones no prueba defecto: el contrato puede requerir una base previa. No intentar una instalación solo con migraciones hasta especificar si está soportada. No aplicar 014 encima del laboratorio. La cadena productiva completa necesita también recuperar su esquema base y capacidades habilitadas; no basta llamar 008+014 a una instalación desde cero.

## Spec Kit y automatizaciones

No se encontraron archivos de Spec Kit en .specify/, specs/ o integraciones versionadas durante la inspección inicial; .agents/ y .codex/ están vacíos. specify no está en PATH: no descarta instalación global fuera del PATH. No existe .github/ en esta copia. No se consultaron GitHub settings, Render, Vercel ni Docker. Ambos vercel.json contienen bloqueos para otras ramas, pero no para chore/adopcion-sdd-rpi. No publicar hasta comprobar automatizaciones y bloquear previews según AGENTS.md.

## SonarQube histórico — pendiente de atribución

Valores recibidos de OpenCode, no verificados: 141 abiertos, 85 seguridad, 56 fiabilidad, 18 mantenibilidad, duplicación 1,3 %, cobertura 0,0 %. No asociarlos a este SHA ni interpretarlos como deuda confirmada. 85+56+18=159; las categorías pueden solaparse o proceder de filtros distintos: hace falta conocer versión/modo de clasificación. No se atribuye causa ni severidad por conteos. Cobertura 0 % no demuestra falta de pruebas ni falta de LCOV.

Faltan exportaciones saneadas de issues y hotspots, reglas, ubicación, estado, filtros, alcance overall/new code, fecha, SHA/rama, versión de servidor/scanner/analizadores, perfiles/gate, período de código nuevo, exclusiones e informes de cobertura importados. Recuperar API/export compatible con la versión instalada y paginación completa. Conservar el histórico separado de un nuevo análisis sobre SHA congelado. No incluir tokens, payloads privados ni logs sensibles.

## Pendiente y límites

Reproducción PKG y DB, inventario ejecutable de pruebas, disponibilidad de herramientas, cobertura por archivo, comportamiento HTTP, comparación de perfiles, calidad Sonar y automatizaciones remotas. Neon, contenedores, instalaciones reales y la otra copia no se inspeccionaron ni modificaron. No afirmar incidentes productivos a partir de incompatibilidades estáticas.
