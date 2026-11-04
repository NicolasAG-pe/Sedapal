# Implementation Plan — DB-01

Branch: chore/adopcion-sdd-rpi | Date: 2026-11-04 | [Spec](spec.md)
Estado: plan; ejecución bloqueada hasta aprobación explícita.

## Summary

Ampliar pruebas existentes de compatibilidad para cubrir editar/anular y hacer condicional exclusivamente la dependencia piloto. Conservar esquema y transacciones.

## Technical Context

Node 22, CommonJS, pg, Express; PostgreSQL 18 como entorno de referencia documentado. Pruebas node:test más harness API existente. Persistencia sintética nueva, nunca Neon ni base Compose existente. Objetivo de rendimiento: no alterar timeouts, registrar consultas adicionales; no se fija SLA sin medición.

## Constitution Check

Antes del diseño: evidencia estática, separación de perfiles, cambio localizado: conforme. Después: sin DDL/migraciones, sin modificación de API ni habilitación de servicios, pruebas aisladas: conforme documentalmente. Pendientes autorización y verificación ejecutada. No hay excepción constitucional adicional.

## Project Structure

Esta carpeta: spec, research, data-model, plan, tasks, quickstart y contracts/receipts.md. Cambio previsto: Backend/receipt-transactions.js. Nuevo test propuesto: Backend/test/receipt-profile-compat.cjs. Reutilizar Backend/test/payment-production-compat.cjs, receipt-concurrency.cjs, quality-migrations.cjs y helpers existentes; adaptar harness solo con justificación y pruebas de sus guardas. No reorganizar Backend/.

## Secuencia de diseño

1. Tras autorización, verificar herramientas y nueva instancia de pruebas con base padre dedicada. No cargar .env ni apuntar harness a una instalación existente por tener puerto local.
2. Reutilizar patrón de esquema productivo y guardas del fixture existente; verificar precondiciones. Construir base distinta por perfil y caso destructivo sintético; no mezclar 014 y piloto.
3. Reproducir DB-T01 en servicio y DB-T07 en HTTP; si el harness API agrega capacidades, documentar su ruta concreta. No presentar P-PROD-MIN como arranque completo.
4. Añadir matriz DB-T02/DB-T03/DB-T04 y controles de rollback; observar fallo pertinente sin depender de mocks como única evidencia.
5. Comprobar presencia de tabla opcional con catálogo en el mismo client; conservar consulta de piloto si existe. No tocar errores de obligaciones ni transacción.
6. Ejecutar DB-T01..DB-T07 y regresiones pertinentes; ampliar cobertura de ramas del cambio sin umbral global arbitrario. Registrar fallos/omitidos y resolver antes del cierre.

## Riesgos y decisiones pendientes de ejecución

Validar que el rol puede consultar catálogo sin confundir permiso denegado con ausencia. Evitar estado global entre bases. Conservar invariantes temporales de piloto. No DDL concurrente; no añadir migración. El mecanismo propuesto está definido en research; si la evidencia exige cambiarlo, actualizar plan antes de implementar alternativa.

## Cierre

Todos los AC comprobados; diff sin SQL ni infraestructura; datos e historial sintéticos conservados. Actualizar trazabilidad y CHANGELOG al cierre autorizado. Antes de publicar cumplir automatizaciones/secretos de AGENTS.md. No implementar health ni campo tiene_pago del listado en este avance.
