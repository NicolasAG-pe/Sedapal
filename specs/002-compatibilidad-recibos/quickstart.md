# Validación futura — DB-01

No ejecutada. No iniciar servicios, SQL ni pruebas durante PLAN-01.

## Preparación tras autorización

Comprobar herramientas disponibles y aprobación del entorno aislado. Instancia PostgreSQL nueva y dedicada, puerto exclusivo, fixtures sintéticos y sin volúmenes existentes ni configuración .env heredada. Usar guardas de email-schema.cjs y revisar permisos de creación de bases. Un nombre de base padre esperado no demuestra por sí solo aislamiento: verificar origen de la instancia.

## Ejecución prevista

1. Registrar esquema exacto y fingerprint de catálogo sin datos personales para P-PROD-MIN y P-LAB. Si se necesita integración completa, documentar capacidades adicionales del harness.
2. Una vez creado el archivo, ejecutar `node --test Backend/test/receipt-profile-compat.cjs` con variables de test aisladas. Reproducir fallo inicial y éxito posterior; hoy ese archivo no existe.
3. Ejecutar por separado `node --test Backend/test/payment-production-compat.cjs`, `node --test Backend/test/quality-migrations.cjs` y `node --test Backend/test/receipt-concurrency.cjs` con sus prerrequisitos revisados. No asumir que npm run test:receipts incluye compatibilidad productiva.
4. Verificar DB-T01..DB-T07 y AC-DB-01..07. Registrar timeout, rollback, conexiones liberadas, permisos y cambios esperados de filas sintéticas.
5. Retirar únicamente recursos temporales cuya creación esté identificada y autorizada; no borrar datos, bases o volúmenes existentes. PLAN-01 no autoriza ninguna limpieza.

## Evidencia requerida

SHA, fecha, Node/PostgreSQL, comando, variables no sensibles, perfil/orden de SQL, resultados individuales y código de salida. Nunca credenciales o filas reales. Estado actual: todos pendientes. Registrar cobertura pertinente si la herramienta está disponible y aprobada; no inventar porcentajes ni instalarla automáticamente.

## Prerrequisitos pendientes al cierre documental

DB-01 no está autorizado. Siguen pendientes: instancia PostgreSQL nueva y dedicada, versión registrada (18 de referencia), base padre y rol de fixtures, permisos de creación, variables de prueba sin .env y adaptación exacta del harness HTTP para cada perfil. Verificar las guardas de identidad/vacío y el marcador del esquema previo; fallar si faltan. No reutilizar bases existentes. Ninguna prueba de DB-01 se ha ejecutado en esta fase.
