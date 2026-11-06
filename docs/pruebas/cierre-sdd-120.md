# Cierre técnico SDD + RPI — Hidro-Mejora 1.2.0

2026-11-05. Entrada402990c, rama chore/adopcion-sdd-rpi, árbol inicial limpio. origin: NicolasAG-pe/Sedapal. Autoriza consolidación local, sin push/PR/merge/despliegues ni cambios remotos. No inicia incrementos ni cambia constitución/SQL/producto.

**Decisión: BLOQUEADO para publicación/integración.** Hay validaciones locales críticas sin poder ejecutarse y controles de despliegue efectivos no acreditados. No equivale a un defecto demostrado del producto ni a CI verde.

## Research → Plan → Implement → Validate

Se reutilizaron las evidencias CAT-01/DD-01/DB-01 y prepublicación; solo se comprobó disponibilidad actual, se repitieron validaciones seguras pertinentes y se contrastó el solapamiento pendiente de PR26. Plan: recuperar herramientas aisladas si disponibles; no corregir código sin defecto reproducible; registrar únicamente bloqueos afectados y continuar. Implementación: actualización documental de evidencia, estados y procedimiento; sin código funcional nuevo. Constitution Check antes/después: conserva una constitución, contratos, migraciones y separación de entornos; autorización explícita actual prevalece sobre push inmediato de AGENTS.md.

## Entorno y restricciones

- Debian GNU/Linux13.7 trixie, UID1000, Node20.19.2, npm9.2.0; Docker CLI26.1.5, sin versión del daemon acreditada. No psql/postgres en PATH ni paquetes locales encontrados en /usr/lib/postgresql/cache apt. Búsqueda acotada de Node/psql/postgres en /opt, /usr/local, cache npm y /tmp no localiza Node22/PG18 aislados.
- Docker version: operation not permitted contra socket660 nobody:nogroup; Seccomp2 y NoNewPrivs1. curl nodejs.org: resolución DNS fallida. No se cambiaron grupos, socket, daemon, runtimes globales ni controles. El perfil administrado actual no permite solicitudes sandbox_approval; no existe elevación utilizable desde esta sesión y no se intenta eludirla.
- Misma limitación observable que CAT-01 reciente; no hay evidencia de una nueva identidad de sandbox. DB-01 previo sí disponía de imágenes sedapal-backend Node22.23.4 y postgres18.6, red none/tmpfs y dependencias Backend. Aquí no se pueden consultar/usar esas imágenes. No se infiere que hayan desaparecido del host.
- Spawn trivial console.log: status0, error.code EPERM, stdout vacío. Con net.connect externo: status1, EPERM y TEST_NETWORK_BLOCKED presente. La captura está restringida incluso sin código de aplicación; no hay defecto CAT demostrado. No eliminar pruebas ni relajar el guard.

## Resultados reales sobre402990c

| Comando / alcance | Resultado actual |
|---|---|
| npm test | Bloqueado: salida2 por requerir Node22; ninguna suite ejecutada |
| npm run test:unit | Bloqueado: salida2 por requerir Node22 |
| npm run test:contract | Bloqueado: salida2 por requerir Node22 |
| npm run test:inventory | Aprobado en Node20;102 archivos |
| test-catalog.test.cjs directo, env limpio + guard |9/9 aprobadas |
| client-packaging.test.cjs directo, env limpio + guard |9/9 aprobadas |
| public-api-config.test.js directo, env limpio + guard |5/5 aprobadas |
| test-runner.test.cjs directo Node20 |3 aprobadas,2 fallidas: TEST-T03/T04, captura de subprocesos vacía/EPERM |
| python3 scripts/test-data-dictionary.py |9/9 aprobadas |
| python3 scripts/data-dictionary.py --check | Cinco artefactos reproducibles byte a byte |
| node scripts/check-ci.cjs --self-test | YAML/políticas y ocho negativos aprobados |
| git diff --check d3d27d0 HEAD | Aprobado, sin errores de whitespace |

Las ejecuciones directas Node usan env -i PATH=/usr/bin:/bin HOME=/tmp NODE_ENV=test API_BASE_URL=https://api.example.invalid node --require ./scripts/test-network-guard.cjs <archivo>. Total actual de casos aprobados:35 (23 específicos Node +3 del runner +9 Python);2 fallidos del runner. Los controles del checker son adicionales. Cero omisiones dentro de esas pruebas; las suites Node22/SQL bloqueadas no se cuentan como omitidas por el test runner. No se midió cobertura nueva ni se reutilizan porcentajes históricos como resultado actual.

Integración PG18 y repetición HTTP/MIME/Firefox de PKG-01 no ejecutadas por falta de entorno. PKG-01/DB-01/TEST-01 conservan sus cierres históricos y evidencias originales, sin atribuirles ejecuciones nuevas. CAT-01 queda BLOQUEADO POR ENTORNO en CAT-TASK-06.

## DD-01

Documentación estática vigente; DD-TASK-06 sigue bloqueada para los cuatro perfiles. Cero perfiles reconstruidos/consultados en PostgreSQL en esta sesión. No se afirma verificación contra pg_catalog, information_schema ni Neon.

| Perfil | Tablas | Columnas | FK | Índices totales (PK/UNIQUE incluidos) |
|---|---|---|---|---|
| laboratorio-init |22|186|29|50|
| laboratorio-ampliado |27|254|38|64|
| produccion-minima |19|159|21|42|
| produccion-extendida |26|243|34|62|

Están comprobados estáticamente referencias/cardinalidades, serial/identity, defaults/constraints, diferencias de perfiles y coherencia de nueve hojas del Excel. Los índices PK/UNIQUE y sus nombres son inferencias pendientes de catálogo. Artefactos completos en docs/base-de-datos; sin cambios porque no hay discrepancia SQL demostrada. Reutilizada evidencia anterior de LibreOffice bloqueado por dconf read-only y ausencia de renderizador Mermaid; no repetir arranque sin cambio de entorno. Pendiente apertura/render visual, además de comparación SQL.

Para completar DD-TASK-06: crear instancia PG18 NUEVA sin acceso externo ni datos persistentes (como DB-01), con nombre/label/ID propios verificados; crear bases hijas nuevas. Perfil piloto exige nombre hm_(email_)?yape_pilot_<hex12..32>. Reconstruir exactamente las composiciones de perfiles-esquema.md, nunca aplicar014 al laboratorio. Comparar pg_attribute/pg_attrdef (tipos, typmod, nulabilidad, defaults/identity), pg_constraint (PK/UNIQUE/FK/CHECK, acciones/diferibilidad), pg_index/pg_get_indexdef (incluidos parciales y respaldos PK/UNIQUE), pg_sequence/dependencias de propietario, pg_trigger y pg_proc/pg_get_functiondef; contrastar también information_schema. Conservar resultados saneados por perfil y ajustar artefactos solo ante diferencias demostradas. No basta comparar cantidades. Retirar únicamente recursos propios con identidad verificada; no tocar contenedores/volúmenes preexistentes.

## GitHub, conflictos y despliegues

Consulta compare_commits en lectura: main remoto sigue d3d27d068a53dff8e536d690e615f858722157bb, sin avance respecto a la base. La rama tenía12 commits locales acumulados al inicio. PR26 abierto, head34b5ca901208e07d6f440022bb9eeceb37557e55,18 archivos. No se le hicieron cambios, comentarios, revisiones ni solicitudes remotas.

Lista actual de PR y patches exactos de los tres archivos comunes consultados; reconstrucción contra la base y git merge-file -p en archivos temporales fuera del repositorio:

| Archivo común | Evidencia de integración |
|---|---|
| Frontend/Dockerfile | Versiones finales idénticas; salida0 sin conflicto |
| Frontend/Dockerfile.dockerignore | Versiones finales idénticas; salida0 sin conflicto |
| CHANGELOG.md | Salida1, un bloque de conflicto por inserciones iniciales |

Esto es simulación por archivo, no un merge completo ni validación conjunta de ambos cambios. No se modifica ni analiza la configuración Sonar. El mergeable=true de PR26 solo compara ese PR con main; no resuelve nuestra integración. Nuevas/modificadas pruebas del compañero exigirán regenerar el inventario revisado; revalidar Backend, sesiones Android, recursos del cliente y contratos después de integrar.

Orden recomendado, sujeto a revisión de responsables: completar bloqueos locales y controles de publicación; integrar primero PR26 por su responsable; después actualizar esta rama contra main actualizado mediante operación autorizada, resolver CHANGELOG conservando ambas entradas y conservar las correcciones Docker idénticas. Revisar tests nuevos del compañero, regenerar inventario y ejecutar Node22/PG18 otra vez antes de presentar nuestro PR. No se ejecutó merge/rebase ni se incorpora Sonar al alcance de esta rama.

Vercel: ambos vercel.json contienen chore/adopcion-sdd-rpi:false. Comparación JSON con main demuestra que esa es la única diferencia, sin alterar otras ramas. get_git_deployment_context confirma los mismos dos proyectos vinculados, pero no acredita raíces efectivas/hooks/otras cuentas. Render get_selected_workspace sigue devolviendo INVALID_ARGUMENT sin contexto confirmado; no se selecciona implícitamente. Las comprobaciones anteriores de roots/hooks/Apps siguen pendientes, no se repite auditoría general ni se consultan valores de secretos. No declarar publicación segura.

Workflow CI revisado: push de chore/** habilita safe→integration; PR hacia main también; workflow_dispatch sujeto a disponibilidad remota. Node22, PG18 efímero, acciones fijadas por SHA, contents:read, checkout sin persistir credenciales, sin secrets/OIDC/deploy. Reportes limitados JUnit/run.json. CI-TASK-006 sigue pendiente: cero ejecuciones nuevas en GitHub; no se dispara workflow ni se publica rama.

## Procedimiento restante, condicionado a autorización futura

1. Restaurar entorno local autorizado Node22 aislado/PG18 nuevo/subprocesos; ejecutar npm test, test:unit, test:contract, test:inventory e integración según TEST-01. Registrar códigos de salida, reportes, SHA, versiones y aislamiento; resolver TEST-T03/T04 sin rebajar expectativas; comparar los cuatro perfiles DD.
2. Confirmar workspace Render y comprobar en lectura servicios/rama/auto-deploy/previews/hooks, raíces/reglas efectivas Vercel y Apps/webhooks. Resolver riesgos con autorización remota específica si hace falta. Las exclusiones locales ya están aplicadas: no volver a pedir permiso para ellas.
3. Revalidar main/PR26 al integrar según el orden recomendado; resolver conflicto e inventario. Preparar el SHA final y descripción del PR con resultados reales y límites, sin afirmar éxito conjunto antes de probarlo.
4. Solo con controles satisfechos y permiso explícito posterior: push normal de esta rama, observar Actions safe/integration y ausencia de previews/deploys en todos los proveedores. Registrar URL/run/SHA y artifacts saneados; un fallo mantiene CI-01 pendiente. Crear PR únicamente con autorización posterior, no en esta ejecución.

Descripción futura sugerida: «Moderniza empaquetado del cliente y compatibilidad de recibos con esquema sin piloto, incorpora suites/CI seguros y documenta datos por perfil. Conserva API, migraciones y clientes. Validación: incluir runs Node22/PG18/DD realmente aprobados y URL Actions; describir resolución editorial con PR26. Sin cambios Sonar ni despliegues autorizados». No es un PR creado ni un resultado listo para publicar.

## Revisión y cierre local

Revisadas tareas de las siete especificaciones; cierres previos se conservan como históricos. Hay una sola constitución en .specify/memory/constitution.md. Revisión de diff acumulado de87 archivos frente a main: sin archivos privados incorporados ni patrones de credenciales detectados; inspección funcional acotada confirma cambio de tres líneas en recibos y contratos/lockfiles/migraciones preservados. Manifiesto raíz solo añade scripts de pruebas; sin dependencias nuevas. No se leen .env, dumps, datos personales ni secretos remotos. La búsqueda de patrones no sustituye revisión de contenido.

Esta consolidación solo modifica CHANGELOG, índices/documentación CI/SDD y validaciones/tareas CAT/DD/CI, más este informe. Sin cambios funcionales ni nuevos incrementos. Commit local documental; sin push/PR/merge/despliegues. Estado final de Git se comprueba después del commit; hash se informa desde git log, sin autorreferencia dentro de este archivo.
