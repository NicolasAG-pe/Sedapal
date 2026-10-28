# Custodia, respaldo y rotación de claves TOTP

Procedimiento preparado y ensayado **solo en laboratorio**. No autoriza su
ejecución en Render/Neon; 007 continúa pendiente en producción.

## Formatos y custodia

La clave actual sigue siendo `TOTP_ENCRYPTION_KEY`: 32 bytes aleatorios, base64
canónico. `TOTP_PREVIOUS_ENCRYPTION_KEYS` es un JSON de hasta tres claves anteriores,
sin duplicados, exclusivamente en el almacén privado del servidor. Nunca poner
valores en argumentos de CLI, frontend, APK, Git, logs ni ejemplos públicos.

El lector acepta ciphertext histórico v1 y nuevo v2. v2 identifica la clave con
un fingerprint no secreto de 64 bits y autentica formato, identificador y usuario como AAD.
AES-256-GCM conserva IV aleatorio de 96 bits y tag de 128 bits. Un cambio de usuario,
clave, header, IV, tag, encoding o contenido se rechaza. No se cambia el secreto
TOTP del usuario al recifrar; su autenticador sigue siendo válido.

No sustituir una clave por otra sin un anillo de lectura compatible. Perder todas
las copias de la clave hace irrecuperable el secreto, aunque exista el dump SQL.
Las claves de cifrado, JWT y respaldo deben ser independientes.

## Respaldo y recuperación

`Backend/maintenance/totp-keys.cjs` no conecta a bases ni servicios. Recibe el anillo
desde un entorno privado ya preparado; sella un respaldo autenticado con una clave
de recuperación independiente de 32 bytes. Esa clave se proporciona en un archivo
privado 0600 y se custodia en **otro medio/lugar**, no junto al respaldo.

Ejemplo de invocación futura con rutas privadas previamente preparadas:

```sh
node Backend/maintenance/totp-keys.cjs backup \
  --recovery-key-file "$KEY_RECOVERY_FILE" --output "$KEY_BACKUP_FILE"
node Backend/maintenance/totp-keys.cjs restore \
  --recovery-key-file "$KEY_RECOVERY_FILE" --backup-file "$KEY_BACKUP_FILE" \
  --output "$RESTORED_KEYRING_FILE"
```

No imprimir el entorno ni el JSON restaurado. El resultado de recuperación es
material **en claro**, pero solo en archivo privado 0600; su directorio debe ser
0700, del propietario. El CLI rechaza symlinks de entrada, permisos amplios,
claves incorrectas y sobrescrituras; únicamente muestra el estado de la operación.
Identificar y registrar fecha/fingerprint/checksum del respaldo sin registrar claves.
Probar la restauración junto a una copia aislada de la base, no contra Neon.

## Rotación en cuatro pasos, pendiente de autorización

1. Inventariar lectores, escritores, formatos y respaldos; ensayar recuperación
   del anillo y de la base. Conservar la clave anterior fuera de línea mientras
   existan respaldos que la necesiten. No retirar claves solo porque ya no estén
   presentes en la base actual.
2. Distribuir lectura compatible en **todas** las instancias antes de escribir
   con una clave nueva. Durante la transición se conservan ambas claves; si aún
   hay lectores que solo admiten v1, no se permite escribir v2.
3. Elegir la nueva clave de escritura, conservar anteriores para lectura y ensayar
   `rotarClaveTotp({pool,env,expectedDatabase,dryRun:true})`. La biblioteca exige
   destino explícito y tiene límites de volumen/timeouts y lock de mantenimiento.
   Revisar los conteos; no imprime secretos. No se ejecuta al arrancar la API.
4. Solo con autorización y ventana controlada: `dryRun:false`. Recifra activos y
   vinculaciones pendientes dentro de una transacción: cualquier fallo revierte
   **todo**. Conserva versiones, intentos, pasos consumidos y recuperación.
   Repetir dry-run debe indicar cero campos pendientes. Probar login/MFA y retirar
   las claves anteriores del runtime solo cuando no queden ciphertext dependientes.

No volver al formato/servidor anterior para recuperarse de un fallo. En un fallo
anterior al COMMIT se conserva el estado previo; después del COMMIT se usa un lector
compatible y el anillo respaldado. Restaurar una base antigua podría perder datos,
factores o consumos recientes y requiere un análisis distinto, nunca automático.
La biblioteca limita filas por defecto a 1.000; no se certificó una rotación masiva.

## Evidencia local

- Pruebas unitarias: clave incorrecta, tampering, AAD por usuario, IV distinto,
  lectura v1, v2 identificado y recuperación cifrada con clave independiente.
- PostgreSQL 18: dry-run sin cambios, destino equivocado rechazado, rollback
  atómico ante ciphertext dañado, recifrado idempotente y metadatos conservados.
- `scripts/test/totp-restore-lab.cjs`: base nueva con usuarios, suministro, recibo,
  pago, fotografía y MFA; dump custom con `pg_dump` 18 y `pg_restore` en otra base.
  Coinciden los hashes de **16 tablas**, restricciones, **8 secuencias**, fotografía
  y secreto descifrado con el anillo recuperado. Ninguna base productiva participa.
- La comparación DDL normaliza únicamente la distribución equivalente de casts
  de literales `varchar[] → text[]` que PostgreSQL cambia al serializar/releer el
  dump. No omite constraints ni sus propiedades de validación/deferrabilidad.

Las claves de ese laboratorio son sintéticas. Sus archivos privados, dump, KEK y
respaldo cifrado viven bajo `artifacts/totp-hardening/`, ignorados por Git. La
ubicación conjunta del KEK se utiliza **solo para ese test**, no como modelo de custodia.

Referencia: [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
