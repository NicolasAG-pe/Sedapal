# Validación DD-01 — cierre documental estático

2026-11-05. Entrada e457d6c, rama chore/adopcion-sdd-rpi. Python3.13 estándar y Node20.19.2; no se instaló dependencia ni se ejecutó SQL. Research/Spec/Plan/Implement/Validate/Document completos para el alcance estático autorizado.

## Entregables y cantidades

| Perfil | Tablas | Columnas | FK | Índices explícitos | Índices PK/UNIQUE derivados | Total índices | Secuencias | Funciones | Triggers |
|---|---|---|---|---|---|---|---|---|---|
| laboratorio-init |22|186|29|19|31|50|10|8|10|
| laboratorio-ampliado |27|254|38|25|39|64|10|15|17|
| produccion-minima |19|159|21|17|25|42|9|3|3|
| produccion-extendida |26|243|34|25|37|62|10|13|15|

No sumar perfiles como entidades distintas. La unión documentada contiene27 nombres de tablas y254 pares tabla/columna, cubiertos por laboratorio ampliado. FK son relaciones físicas, no todas las asociaciones lógicas posibles. Índices incluyen los respaldos PK/UNIQUE; no se inventan índices automáticos para FK.

En docs/base-de-datos: diccionario-de-datos.md (columnas, restricciones, índices/secuencias y cuerpos de funciones/triggers por perfil), diagrama-entidad-relacion.md (cuatro bloques Mermaid con cardinalidad), perfiles-esquema.md (composición y diferencias), diccionario-de-datos.xlsx (nueve hojas) y modelo-esquema.json (fuentes/DDL/metadatos verificables). Todas las fuentes incluyen SHA256 de init y14 migraciones, con referencias por archivo/línea. Generador y pruebas en scripts/data-dictionary.py y scripts/test-data-dictionary.py.

## Pruebas ejecutadas

- `python3 scripts/test-data-dictionary.py`:9/9 aprobadas. Escáner con literales/comas/paréntesis anidados, fixture independiente serial/identity/PK/UNIQUE/FK/default/índice parcial, conteos, perfiles/overrides009–010/014, reconstrucción por migraciones001–013, integridad/cardinalidad FK, secuencias/constraints críticos, XML/ZIP del libro, reproducibilidad y aristas Mermaid. Se corrigieron durante desarrollo un patrón regex inválido y lectura multilínea; todos los casos finales verdes.
- `python3 scripts/data-dictionary.py --check`: cinco artefactos idénticos byte a byte tras regenerar; XLSX con ZIP timestamps fijos.
- XLSX: ZIP sin errores, XML parseable, nueve hojas Tablas/Columnas/Relaciones/Restricciones/Indices/Secuencias/Funciones/Triggers/Fuentes; filas de las nueve hojas coinciden con el modelo y sin fórmulas ejecutables. Validación estructural, no certificación de Excel desktop.
- `node scripts/test-catalog.cjs --check`: aprobado,102 archivos Node sin cambios de inventario. Pruebas Python son comando separado explícito, no se clasifican falsamente como Node.
- `node scripts/check-ci.cjs --self-test`: políticas/YAML y ocho negativos aprobados.
- Ejecución directa con env limpio y guard de scripts/test/test-catalog.test.cjs, client-packaging.test.cjs y public-api-config.test.js:9+9+5=23 aprobadas en Node20; no son suite Node22 completa. Comando común documentado en CAT validation.md.
- `git diff --check`: aprobado. No hay cambios a Base-de-Datos, Backend, Frontend, Admin, Shared, Android, manifiestos, locks ni workflows frente a e404499; contratos y migraciones conservados. Inspección de archivos/ZIP/diff sin secretos ni datos personales nuevos.

## Pendientes explícitos

- CAT-01 continúa pendiente de Node22/PG18 y de acreditar TEST-T03/T04 con subprocesos habilitados. EPERM/captura vacía reproducidos incluso con console.log; no se cambian controles ni expectativas.
- No Node22 aislado disponible ni descarga por DNS; no psql/postgres local y Docker socket denegado. No se aplicaron perfiles, migraciones ni fixtures SQL en esta sesión. Nombres implícitos/expresiones/ACL requieren comparación futura con pg_catalog PG18, no con producción.
- LibreOffice --headless con perfil temporal independiente y salida /tmp intentado dos veces: salida1, dconf /run/user/1000/dconf/user de solo lectura (incluso con HOME/XDG_CONFIG_HOME temporales y DCONF_BACKEND=memory). No pudo acreditarse apertura/conversión de escritorio, no se modifica configuración existente. Mermaid sin renderizador disponible: aristas/campos verificados estáticamente, render visual pendiente.

AC-DD-01..04 satisfechos en modalidad estática explícitamente permitida; DD-01 documental completo. DD-TASK-06 condicional sigue abierto para pg_catalog. No cerrar CAT/CI por este resultado. PR26/Sonar sin cambios; solo conflicto editorial futuro posible en README/CHANGELOG. Sin push/merge/despliegue/conexiones Neon.

## Consolidación final sobre402990c

[Informe unificado](../../docs/pruebas/cierre-sdd-120.md): limitaciones persisten. No nueva validación Node22/PG18. CAT9/9, PKG9/9 y configuración API5/5 en Node20; runner3/5 con dos fallos de captura. DD9/9 estáticas y artefactos reproducibles. DD conserva cierre estático, comparación SQL pendiente; CAT permanece bloqueado para cierre ampliado. Sin cambios de código ni relajación de pruebas.
