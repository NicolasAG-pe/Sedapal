# PostgreSQL: esquema y perfiles

Fuente: [init.sql](../Base-de-Datos/init.sql), [migraciones](../Base-de-Datos/migrations/) y fixtures de DB-01/TEST-01. Referencia de código: `main` en `4f15173` (2026-11-11), PostgreSQL 18; esta revisión documental no consulta Neon ni ejecuta SQL. Ninguna receta de esta página autoriza cambios sobre una base existente.

## Dos rutas diferentes

| Perfil | Composición documentada | Exclusiones / límites |
|---|---|---|
| Laboratorio Compose nuevo | init.sql compuesto: base más capacidades007,008,009,010,013 y cambios anteriores incorporados | Tiene control_piloto_yape; omite011/012/014. No aplicar014 |
| Compatible sin piloto mínimo (fixture DB-01) | Base histórica previa a007 +007→008→014 | No009/010 ni control_piloto_yape; valida operaciones de recibos, no todas las funcionalidades |
| Compatible sin piloto ampliado (fixture existente) | Misma base +007→008→011→012→013→014 | No009/010; capacidades según flags/configuración |

Los tests obtienen su base sintética desde el prefijo de init.sql anterior al bloque007. Es un mecanismo de fixture, **no una técnica de corte/instalación para producción**. [Prueba de compatibilidad productiva](../Backend/test/payment-production-compat.cjs) y [receipt-profile-compat](../Backend/test/receipt-profile-compat.cjs) definen los escenarios. No afirmar que una base real tiene ese historial sin inventario propio.

Las migraciones incrementales requieren tablas base: `pagos`, por ejemplo, está en init.sql. No son un instalador desde cero. No ejecutar todas001–014 encima del init compuesto ni copiar init.sql a una base existente.

## Orden y propósito de los cambios

| Migración | Propósito / condición |
|---|---|
| 001 | Lecturas de notificaciones sobre esquema base |
| 002 | Suministro de nueve dígitos |
| 003 | Verificación de correo |
| 004 | Retención de correo |
| 005 | Integridad de recibos |
| 006 | Outbox de correo |
| 007 | 2FA, previo a008 |
| 008 | Operaciones e historial de pagos |
| 009 | Piloto Yape **solo laboratorio**, requiere008 |
| 010 | Revisión sintética del piloto, requiere009 |
| 011 | Recuperación de clave; capacidades/flags propios |
| 012 | Dispositivos y entregas push; capacidades/configuración propias |
| 013 | Seguimiento de incidencias |
| 014 | Compatibilidad de operaciones sin piloto; requiere008 y rechaza tabla piloto |

En un laboratorio **nuevo y dedicado** que necesite recuperación/push, partir de init.sql y evaluar011→012, sin repetir los bloques ya incorporados ni aplicar014. Habilitar flags no sustituye aplicar el esquema correspondiente, y aplicar SQL no habilita proveedores.

Para una instalación existente: primero inventario de tablas/columnas/restricciones e historial aplicado, identificación del perfil, revisión de dependencias reales, respaldo controlado y autorización del propietario. Después preparar un plan específico de cambios faltantes. El repositorio incluye un [ejecutor local controlado](../scripts/migrar-postgresql-local.cjs) para 003, 004, 005, 006, 007, 008 y 013, con confirmación explícita, destino loopback, transacciones y registro SHA-256. Rechaza objetos previos sin registro y cambios de checksum; no reconcilia automáticamente esquemas existentes ni instala todos los perfiles. No es una receta genérica de migración productiva.

## Invariantes y validación

Editar/anular recibos conserva transacción, locks y comprobaciones de pagos/estado. En el perfil sin piloto, solo control_piloto_yape es opcional; no ignorar pagos, operaciones_pago ni errores SQL. No capturar 42P01 para permitir escrituras. [Contrato DB-01](../specs/002-compatibilidad-recibos/contracts/receipts.md).

`GET /api/health` comprueba conectividad, no compatibilidad integral. Ejecutar regresiones únicamente con PostgreSQL18 temporal, sintético y verificado como nuevo. [Comandos y restricciones](TESTING.md), [evidencia DB-01](../specs/002-compatibilidad-recibos/validation.md). Preservar migraciones ya aplicadas, datos y volúmenes; no mezclar laboratorio y producción.

## Diccionario y DER — DD-01

[Diccionario](base-de-datos/diccionario-de-datos.md), [DER](base-de-datos/diagrama-entidad-relacion.md), [perfiles](base-de-datos/perfiles-esquema.md) y [Excel](base-de-datos/diccionario-de-datos.xlsx). Cuatro perfiles documentados separadamente; no describen el esquema real desplegado de Neon. Regeneración: `python3 scripts/data-dictionary.py`; comprobación: `python3 scripts/data-dictionary.py --check` y `python3 scripts/test-data-dictionary.py`. Extracción estática de init y14 migraciones; nombres implícitos derivados pendientes de pg_catalog. [Evidencia y pendientes](../specs/007-diccionario-datos/validation.md).
