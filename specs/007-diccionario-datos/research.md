# Research DD-01

Fuentes: init.sql, migraciones001–014 completas; perfiles y harness en DB-01, receipt-profile-compat.cjs/payment-production-compat.cjs/email-api.cjs. Reutilizados hallazgos de DB-01: init no equivale a migraciones aplicadas secuencialmente; 014 rechaza tabla piloto.

init incluye correo/outbox/2FA/operaciones/piloto009–010 y seguimiento013, omite011/012/014. 011 añade recuperación y fecha de seguridad; 012 push requiere011. Producción mínima de fixtures: prefijo base antes de007 +007/008/014. Extendida: ese prefijo +007/008/011/012/013/014. No se infiere esquema productivo desplegado. 001/002/003/004/005/006 ya están incorporadas en el prefijo; 005 usa DDL dinámico para unicidades que init ya declara. 009/010 y014 son rutas excluyentes.

Backend usa control_piloto_yape opcional (receipt-transactions.js:77), pagos/operaciones obligatorios; email-cleanup valida FK/outbox; contratos de API conservados. Backend módulos email, two-factor, password-recovery, push, incident-tracking y payment-operations contienen usos directos de sus tablas. cortes_suministros y columnas legacy no se eliminan. Recuperacion_clave_limites.activa_id y solicitud_id de eventos son vínculos lógicos sin FK, no deben aparecer como FK inventadas.

Entorno: Python3 estándar disponible, sin openpyxl/xlsxwriter/parser SQL externo; Node20, sin PG18/Docker utilizable. Solución mínima: extractor acotado a DDL del repositorio con escáner de literales/paréntesis, modelo JSON verificable y XLSX OOXML con stdlib. No pretende interpretar PL/pgSQL ni reemplazar pg_catalog. Revisar manualmente DDL dinámico/guardas; guardar rutinas completas y manifiesto de todas las fuentes.
