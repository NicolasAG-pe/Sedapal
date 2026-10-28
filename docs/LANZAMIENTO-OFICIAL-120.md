# Preparación del lanzamiento oficial 1.2.0

**Estado: candidato firmado local, no publicado ni desplegado.**
Rama `preparation/lanzamiento-oficial-120`, independiente y persistente.
Main de partida `aba629f` (PR #21); cadena integrada hasta PR #20 `772e5e6`.
Los PR #12–#20 siguen Draft: esta integración técnica no aprueba sus condiciones
ni los fusiona en GitHub. #22 y su identidad/firma/backend LAB quedan excluidos.

## Integración y revisiones

Se conserva la ascendencia completa #12–#20 y todo #21. Los conflictos reales
fueron CHANGELOG y ambos vercel.json: se conservaron ambas historias y la unión
de exclusiones de despliegue. El parche OTP de #11 y su incorporación `afac774`
tienen el mismo patch-id; no se aplica de nuevo.

Backend/cliente/Admin conservan el código auditado de #20. El cambio adicional
necesario es el Dockerfile: faltaban los módulos requeridos de recuperación,
push y seguimiento; se añaden a COPY y se verifica la imagen sin red/puertos.
Android solo cambia a 1.2.0/código6 y habilita instrumentación opt-in de upgrade.
No se reconstruyen módulos ni se repiten las auditorías visuales/físicas.

GitHub no registra reviews ni comentarios inline de revisión en #12–#20. Se
solicitó la referencia de actas/aprobaciones externas para reutilizarlas; no se
inventan aprobaciones ni se convierte ningún Draft en Ready. El historial local
mantiene las comprobaciones anteriores y las nuevas específicas de lanzamiento.

## Funciones cerradas y downgrade

Neon fue consultado en una transacción READ ONLY: PostgreSQL18, migraciones
007–013 ausentes y cero factores MFA activos. Render conserva los flags de MFA,
push y recuperación sin configurar: el candidato los interpreta como cerrados.
La configuración prevista debe establecer explícitamente:

```dotenv
TOTP_ENROLLMENT_ENABLED=0
TOTP_ADMIN_ENROLLMENT_ENABLED=0
PASSWORD_RECOVERY_ENABLED=0
PASSWORD_RECOVERY_WORKER_ENABLED=0
PUSH_ENABLED=0
PUSH_WORKER_ENABLED=0
PUSH_REMINDERS_ENABLED=0
PUSH_REAL_DELIVERY_ALLOWED=0
PAYMENTS_MANUAL_ENABLED=0
YAPE_PILOT_ENABLED=0
```

La inscripción 2FA permanece cerrada para cliente y Admin. **El control externo
contra downgrade no está instalado**: ni el flag ni el contrato HTTP impiden que
un operador despliegue código antiguo con acceso a las mismas credenciales.
No afirmar que MFA está protegido frente a todos los rollbacks. Antes de activar
factores: revisar y hacer obligatorio el control de commits/digests, todos los
caminos manuales, credenciales, lectores de claves y recuperación. Ver
[análisis existente](seguridad-despliegue-2fa.md).

Los factores ya activos nunca deben eludirse por apagar inscripción; actualmente
la inspección productiva encontró cero. Si cambia esa condición, detener el plan
y revisar de nuevo las claves/lectores y la elegibilidad de recuperación.
La función de recuperación también sigue cerrada mientras faltan sus condiciones
de producción; no se activan workers ni se generan claves nuevas por defecto.
El OTP productivo existente y su worker no se modificaron ni enviaron canarios.

## Respaldo previo a migraciones

Destino Neon contrastado con DATABASE_URL del servicio Render, sin mostrarlo.
Respaldo custom PostgreSQL18 mediante conexión directa, TLS verify-full, CA
actualizada del host montada en solo lectura, transacciones READ ONLY e
instantánea exportada consistente. Credenciales por stdin; sin argumentos
secretos ni logs Docker que almacenen el dump.

Archivo privado local:
`/home/nico/.local/share/hidromejora/release-120/private/production-backup-K7VguX/production.dump`.
Directorio700 y archivos600. No subirlo, mostrar registros ni copiarlo a Git.
Se restauró en un contenedor sin red ni puertos publicados y con volumen nuevo.
Coinciden las 13 tablas, hashes de todas sus filas, columnas y secuencias.

Otra base nueva de ese contenedor recibió 007–013, dos veces cada una. Las filas
anteriores permanecen iguales al proyectarlas sobre sus columnas originales.
**Ninguna migración fue ejecutada en Neon.** No se usó init.sql en producción.
La comprobación local omite propietarios/ACL al restaurar; el dump original los
conserva. No sustituye la validación de roles/privilegios de una recuperación
productiva ni una copia externa cifrada con custodia separada.

Se conservaron los fallos iniciales de CA/arranque temporal PostgreSQL y la
comparación que detectó representación bigint texto/número. Se normalizó la
consulta de secuencias a texto en ambos lectores, sin omitirlas ni cambiar datos.
Un respaldo es de un instante: antes de la ventana final se requiere otro respaldo
fresco y verificado, o reconciliar explícitamente las escrituras posteriores.

## Secuencia coordinada pendiente

1. Cerrar las condiciones de revisión de los Draft y registrar actas externas,
   alcance realmente aprobado y commit exacto. No fusionar Draft para adelantar.
2. Congelar el candidato revisado: SHA de Git, imagen/digest, APK/hash y flags.
   Mantener autodeploy/previews apagados y excluir esta rama en ambas raíces.
3. Registrar ventana, criterio de parada y copia reciente del estado/configuración;
   actualizar el respaldo verificado antes de la migración efectiva.
4. Aplicar las migraciones revisadas, en orden y con lock/statement timeout,
   exclusivamente al destino verificado. Evitar tráfico durante incompatibilidades
   y comprobar todas las instancias. 009/010 son de laboratorio: revisar su necesidad
   y política antes de cualquier aplicación productiva, aunque el ensayo sea correcto.
5. Desplegar en Render el commit/digest exacto, no «latest». Mantener MFA/push/
   recuperación/pagos reales cerrados. Render actual tiene una instancia, plan
   free, autodeploy off y previews off: no crear servicios ni usar pre-deploy de pago.
   Verificar health con PostgreSQL, contrato auth, roles, sesiones y Socket.IO;
   no basta con que la API de despliegue acepte la solicitud.
6. Preparar el Admin Vercel del mismo SHA con API_BASE_URL HTTPS de Render,
   producción sin promoción automática. Esa variable ya coincide y su origen
   estable está permitido en CORS Render. Verificar el build y luego el alias.
   El proyecto Vercel alternativo de raíz Backend no es el backend autoritativo:
   no desplegarlo como segunda API ni reactivar versiones viejas paralelas.
7. Comprobar URLs efectivas y contratos, sin correos/FCM/cobros reales. Conservar
   las pruebas previamente aprobadas y ejecutar solo los smoke críticos del cambio.
8. Solo después de cerrar todos los bloqueos: tag/release v1.2.0 del SHA exacto,
   APK permanente aprobada y archivo SHA-256. Verificar la descarga y hash públicos.
   Actualmente no hay tag, release, asset ni enlace de descarga oficial 1.2.0.

## Recuperación y versiones anteriores

Render actual: commit `d6a6b83`, deploy `dep-dbdqlg2fngtc739qafag`.
Admin estable `hidro-mehora-admin.vercel.app`: deploy
`dpl_2GMFjNse9ykAs1jTe7eTQ2zkQpc2`, commit `049ca5f`.
Los últimos previews READY no sustituyen esa referencia de producción.
Se conservan la configuración privada anterior y las APK 1.0.0–1.1.2.

Estos son **puntos de referencia, no rollbacks automáticamente seguros**. El
backend anterior ignora MFA/versiones y una reversión no deshace migraciones ni
revocaciones. Preferir corrección hacia delante en un candidato compatible;
antes de una reversión, revisar datos, secretos, sesiones, código y permisos.
Restaurar datos puede perder escrituras: requiere una decisión separada y no se
hace automáticamente. Conservar todas las imágenes, contenedores y respaldos.
Android requiere actualización correctiva con código superior a6, misma firma y
esquema compatible; no usar downgrade ni desinstalación para volver atrás.

## APK firmada de preparación

- `pe.edu.hidromejora.app`, versionName1.2.0, versionCode6. Máximo oficial localizado:5.
- Misma firma permanente, comparada con el fingerprint fijado y la APK1.1.2.
- Ruta privada: `/home/nico/.local/share/hidromejora/release-120/worktree/artifacts/android/hidro-mejora-v1.2.0-release.apk`.
- SHA-256: `4ba571a64e4449d997bba9e1b67e09886a6730dbcddc4386b88418176e163a0d`.
- AVD Android15 independiente/offline: instalación sobre1.1.2 con install-r,
  sin uninstall, mismo UID/firstInstallTime y localStorage/tutorial conservados;
  dos fases instrumentales con el mismo certificado permanente.
- FCM nativo desactivado y sin SDK JSON. La candidata no es el APK LAB del #22.
- No se instaló en teléfonos ni se modificó una APK anterior.

Resultados específicos: [informe](pruebas/preparacion-release-120.md).
Referencias: [Neon pg_dump](https://neon.com/docs/manage/backup-pg-dump),
[Render despliegues](https://render.com/docs/deploys),
[rollback Render](https://render.com/docs/rollbacks),
[despliegues Vercel](https://vercel.com/docs/deployments).
