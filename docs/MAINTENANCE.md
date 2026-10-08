# Mantenimiento, respaldo y diagnóstico

Procedimientos para v1.0.0. Operar siempre sobre un destino identificado, con revisión del estado y respaldo previo cuando corresponda. Esta guía no ejecuta cambios ni restaura datos.

## PostgreSQL local: protección

El volumen lógico es `postgres_data`; la instalación Compose `sedapal` utiliza `sedapal_postgres_data`. Mantener la identidad Compose y no borrar/reinicializar el volumen. **No ejecutar `docker compose down -v`, limpiezas de volúmenes ni init.sql sobre la base existente.** `docker compose stop` detiene servicios conservando datos.

Producción Neon es independiente. No restaurar automáticamente un respaldo local sobre Neon ni viceversa. No usar la base original para tests con writes.

## Respaldo y verificación

Con Docker local en marcha, desde la raíz:

```bash
bash scripts/backup-db.sh
```

El script toma las credenciales dentro del contenedor, ejecuta pg_dump custom y crea un archivo nuevo en `backups/` con fecha/hora y sufijo único. Comprueba que no esté vacío, que pg_restore reconozca el listado y genera `.list` y `.sha256`. Usa permisos privados; no publica valores de conexión.

Para revisar un respaldo seleccionado, configurar `HIDRO_BACKUP_FILE` con su ruta local y verificar:

```bash
test -s "$HIDRO_BACKUP_FILE"
sha256sum -c "$HIDRO_BACKUP_FILE.sha256"
docker compose exec -T db pg_restore --list < "$HIDRO_BACKUP_FILE" > /dev/null
```

Un checksum y un listado válidos prueban integridad/reconocimiento, **no una restauración completa**. Verificar periódicamente una copia en una base vacía aislada. Conservar al menos un respaldo reciente verificado y cualquier respaldo único; guardar copia cifrada en medio independiente y probar recuperación. Los dumps contienen datos personales y credenciales derivadas: nunca adjuntarlos a GitHub o informes públicos.

El script respalda la base local. Un respaldo Neon exige conexión de mantenimiento autorizada y herramientas compatibles, sin incluir la URL/credenciales en argumentos o documentos compartidos. No asumir que el script local apunta a Neon.

## Restauración controlada de copia

1. Identificar archivo/formato, checksum, versión PostgreSQL origen y destino.
2. Seleccionar una instancia/base **vacía e independiente**, con credenciales de mantenimiento proporcionadas por un entorno privado. No utilizar la base original ni producción como destino de prueba.
3. Verificar explícitamente host, puerto y nombre de destino, ausencia de tablas de aplicación y permisos. Proporcionar las variables libpq `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE` mediante un canal privado; no imprimirlas ni cargarlas desde un entorno ambiguo.
4. Para custom, usando pg_restore compatible y después de verificar ese destino vacío:

```bash
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname "$PGDATABASE" "$HIDRO_BACKUP_FILE"
```

5. Revisar estado de salida y errores, y volver a conectarse de forma independiente.
6. Comparar tablas, columnas/tipos/defaults, PK/FK/UNIQUE/CHECK, índices, secuencias y su estado, cantidades y huellas agregadas de registros, incluidas fotografías BYTEA/MIME. La omisión de owner/ACL requiere mapear permisos del entorno destino; no afirmar igualdad de propietarios cuando se omiten.
7. No aceptar solo un exit code correcto como validación de datos. Registrar diferencias sin volcar datos privados.

No usar `--clean` ni restauraciones destructivas como procedimiento rutinario. Una restauración que sustituya producción necesita un plan separado, aprobación explícita del propietario, respaldo del destino y ventana de operación. SQL plano exige psql, no pg_restore; inspeccionar el formato antes de elegir herramienta.

## Dependencias y salidas reconstruibles

- npm raíz y Backend: conservar manifiestos/lockfiles; reconstruir con `npm ci` y `npm ci --prefix Backend`, sin actualizar versiones accidentalmente.
- Docker: reconstruir interfaces/backend con `docker compose up -d --build web admin backend`, sin reinicializar PostgreSQL.
- Runtimes: `npm run build:web`, `npm run build:admin`, `npm run cap:sync`; configurar la base pública del destino antes de generar.
- PDF de pruebas: `npm run test:documents`, con Poppler; salidas en artifacts.
- Android: caches/builds bajo artifacts; antes de limpiar conservar APK distribuidos, checksums y evidencia relevante. La identidad release no es un archivo reconstruible.
- Javadoc: comandos académicos en el [README Java](../Backend/documentacion/java-docs/README.md); no versionar HTML generado.

Una coincidencia de hash no autoriza eliminar un recurso necesario por ruta/densidad. Revisar referencias y distinguir fuentes, copias de runtime, respaldo único y cache. No ejecutar git clean/reset ni limpiar carpetas privadas como mantenimiento normal. [LIMPIEZA-SEDAPAL](LIMPIEZA-SEDAPAL.md) es antecedente fechado, no una autorización de nuevas eliminaciones.

## Actualizaciones

Mantener revisión de diff, pruebas proporcionales y notas en [CHANGELOG](../CHANGELOG.md). No confundir la versión del paquete npm con el versionado instalable Android.

Toda actualización APK debe conservar applicationId e identidad permanente, aumentar versionCode y ajustar versionName. Publicación, checksum, fingerprint, respaldo privado y transición debug/release se documentan exclusivamente en [ANDROID-RELEASE](ANDROID-RELEASE.md). No generar una nueva clave para resolver un error de compilación.

## Diagnóstico básico

| Síntoma | Revisión segura |
|---|---|
| Interfaces no cargan | `docker compose ps`; logs de web/admin; puertos configurados y disponibilidad de assets. |
| Health devuelve 500 | Salud db, variables inyectadas, resolución/red interna; en producción conexión Neon/TLS. No reinicializar datos como solución. |
| Login 401 | Suministro y contraseña verificados por el propietario; firma/expiración si es ruta protegida. No adivinar ni cambiar contraseñas automáticamente. |
| Ruta protegida 403 | Rol vigente, activo y propiedad; no resolver quitando requiereAdmin. |
| API funciona en curl pero falla en navegador | Origin exacto, preflight y CORS; nunca ampliar a comodín. |
| Tiempo real no conecta | JWT del handshake, Origin, `/socket.io/`, proxy upgrade, polling y estado Render; reconsultar REST al reconectar. |
| Perfil vacío | `/api/me/perfil`, estado HTTP, contrato plano y navegación común; no imprimir valores personales en reportes. |
| PDF no se abre | Verificar guardado/cancelación y visor instalado; en web, librería/assets; en Android, versión con HidroDocuments. |
| Android no compila | Java 21, SDK, wrapper, dependencias npm y sync. Para firma, seguir la guía release sin exponer secretos. |
| APK no actualiza | applicationId, versionCode mayor y certificado permanente; no cambiar fingerprint para aceptar otra clave. |

Revisar logs localmente y redactarlos antes de compartir; la aplicación no garantiza que todos los errores internos sean libres de datos sensibles. Más cobertura en [TESTING](TESTING.md).
