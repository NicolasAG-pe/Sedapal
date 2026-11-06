# DD-01 — diccionario y modelo relacional

Autorización: continuación prioritaria HIDRO-MEJORA 1.2.0. Entrada e457d6c, rama chore/adopcion-sdd-rpi. Alcance documental y generador local, sin alterar SQL ni producto.

- FR-DD-001 / AC-DD-01: documentar todas las tablas/columnas de init y las14 migraciones, con tipo, nulabilidad, default, PK/FK/UNIQUE/CHECK, índices, secuencias, funciones y triggers; cada definición remite a fuente/línea.
- FR-DD-002 / AC-DD-02: separar perfiles init laboratorio, laboratorio ampliado, producción mínima y extendida sintéticas. Distinguir relación SQL, cardinalidad y asociación lógica; no inventar estado Neon.
- FR-DD-003 / AC-DD-03: Markdown, DER Mermaid y XLSX con hojas Tablas/Columnas/Relaciones/Restricciones/Indices más secuencias y rutinas; totales coherentes y regeneración verificable.
- FR-DD-004 / AC-DD-04: verificación estática reproducible del modelo, fuentes y XLSX; validación PG18 condicional a disponibilidad. Si no disponible, cierre documental estático con comprobación SQL pendiente explícita.
- NFR-DD-001: sin datos, secretos, conexión de red, dependencias nuevas, cambios a migraciones ni PR26/Sonar. Solo metadatos versionados; no ejecutar init en instalaciones existentes.
