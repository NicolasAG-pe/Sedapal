# Plan DD-01

Constitution Check antes/después: evolución mínima documental, evidencia estática diferenciada de P-SQL; implementación local expresamente autorizada, sin producción ni publicación, no cambia contratos/clientes/migraciones. Sin dependencias nuevas.

1. Extraer CREATE TABLE/ALTER ADD COLUMN/ADD-DROP CONSTRAINT e índices; conservar cuerpo y fuente de rutinas. Componer cuatro perfiles sin ejecutar SQL.
2. Inferir índices PK/UNIQUE y secuencias serial/identity, marcándolos como derivados estáticos. Resolver FK y cardinalidad con unicidad real (índices parciales no implican 1:1 global).
3. Generar diccionario, perfiles, DER por perfil y libro XLSX; modelo JSON y manifiesto de hashes para trazabilidad.
4. Validar referencias, comparación de columnas con fuentes, invariantes perfil piloto/producción, relaciones opcionales/1:1, constraints complejas, XLSX XML/filas y regeneración exacta. Mantener pruebas de generador fuera del catálogo Node porque es Python independiente y documentarlo.
5. Actualizar índices y trazabilidad, revisar diff/secretos, commit local. Validación pg_catalog pendiente si PG18 sigue indisponible.
