# Riesgos y reversión

Estado: plan pendiente de ensayo. El único backend ejecutable de producto
continúa siendo el monolito. No se modificaron migraciones ni datos.

| Riesgo | Condición para avanzar |
|---|---|
| Pérdida de atomicidad incidencia/aviso | Contrato transaccional demostrado, o cambio de consistencia explícitamente revisado |
| Revocación ignorada durante escritura | Carrera reproducible probada, protocolo fail-closed |
| Roles aislados rompen triggers | Pruebas SQL positivas y negativas con perfil completo |
| Dos escritores del mismo dominio | Exclusión de escritor, corte controlado y reconciliación por IDs |
| Reintento de pago tras timeout | solicitud_id conservada; consulta de resultado; no replay ciego |
| Eventos duplicados/perdidos | Outbox/inbox durable y reconexión con REST |
| Nueva URL rompe APK existente | Conservar hostname/rutas/TLS públicos; modificar upstream detrás de URL estable |
| Push/PR activa despliegue | Completar inventario de automatizaciones y exclusiones antes de publicar |

Rollback futuro: detener admisión de nuevas escrituras del dominio, esperar
transacciones en curso, comprobar que el esquema aditivo sigue siendo legible
por la versión anterior, desactivar escritor nuevo y cambiar únicamente su
upstream en gateway. Conservar outbox/inbox y claves; drenar entregas con
deduplicación. Verificar login, permisos, recibos e historial antes de reabrir.

No hacer dual-write HTTP ni devolver tráfico automáticamente al monolito tras
un timeout de escritura. Podría haber ocurrido COMMIT. Nunca revertir borrando
tablas, volúmenes o registros. Si hay divergencia, cerrar escrituras afectadas
y reconciliar bajo un procedimiento revisado.

El esquema debe evolucionar expand/contract: adiciones compatibles primero,
retirada solo tras autorización y ventana de reversión. Ninguna migración
aplicada se edita. Restauración de respaldo y activación de rollback productivo
requieren autorización independiente del propietario.
