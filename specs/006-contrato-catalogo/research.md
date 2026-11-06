# Research CAT-01

2026-11-05, entrada 9c6fdeb. Reutilizados inventario TEST-01, baseline y lista PR26 head34b5ca9. Alcance: scripts/test-catalog.cjs y prueba nueva; sin archivos de producto ni archivos del PR.

E: inventory() asigna grupo por find; una ruta repetida entre grupos queda atribuida solo al primero. check() compara serialización, pero regenerar puede legitimar una ruta inexistente o duplicada. El runner consume directamente groups: esta inconsistencia reduce confianza al ampliar suites. Incremento de capacidad de pruebas del backlog TEST-01/CI-01, sin elegir HEALTH-01 porque cambia contratos operativos ni DB-02 porque defecto no establecido.

Decisión: validar estructura y pertenencia antes de generar/comprobar inventario. Sin framework, dependencia ni ejecución de archivos. Node20 local; Node22, PG18 y Docker no disponibles en esta sesión (daemon denegado y DNS externo bloqueado). No utilizar runtime de herramientas ajenas al alcance ni datos reales.
