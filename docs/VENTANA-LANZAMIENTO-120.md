# Ventana propuesta de lanzamiento 1.2.0 — PR #23

**Preparación para revisión; no autorización de merge, DDL, despliegue ni release.**
Base funcional6010e6d, sobre mainaba629f/#21. Esta actualización es documental;
no cambia backend, Android ni migraciones. [Alcance y evidencias](LANZAMIENTO-OFICIAL-120.md).

## Puertas antes de ejecutar

| Puerta | Estado comprobado / cierre necesario |
| --- | --- |
| Compatibilidad pagos014 | Resuelta localmente:20/20 regresiones,5 grupos REST y4 UI; reutilizar evidencia de6010e6d |
| Revisión independiente | Pendiente APPROVED del SHA final en #23; revisor disponible:saul123bidfo. Cerrar expresamente condiciones aplicables #12–#20 y014; no considerar los Draft aprobados |
| Alcance desactivado | Propuesto para aprobación: alta2FA cliente/Admin, cobros reales/manual, pilotoYape, FCM y recuperación de contraseña cerrados; conservar OTP y notificaciones internas |
| Downgrade2FA | Cero factores productivos observados; control externo todavía no impuesto. Recontar antes de cambiar servicios; cualquier factor activo detiene esta ventana. Nunca volver al backend antiguo ni desactivar un factor para continuar |
| Respaldo | Nuevo backup28/10 y restore13 tablas verificados; renovar dentro de la ventana o reconciliar escrituras posteriores. Custodia externa cifrada y roles/ACL de recuperación aún no certificados |
| Escrituras durante la ventana | Propietario debe aprobar procedimiento efectivo de pausa/drenaje y reapertura de API, workers y demás escritores, sin reabrir código antiguo. No se ha ensayado ni aplicado un mecanismo remoto |
| APK/instalaciones | Firma permanente, hash y upgrade AVD aprobados. Adjuntar acta física existente que cubra el mismo hash y actualización de una instalación oficial; no consta en las evidencias versionadas |
| Autorización operativa | Pendiente del propietario para merge, migración exacta, configuración, despliegues coordinados y posterior release. Ready/review no la sustituyen |

Main carece de protección/rulesets y #23 no registra checks CI; la revisión y
la comprobación del SHA deben ser explícitas, sin `--admin` ni aprobaciones propias.
Si cambia HEAD/main, revisar solo el delta y renovar las aprobaciones afectadas.

## Orden de ejecución condicionado

1. **Fijar identidad y aprobación.** Registrar SHA completo aprobado, base actual,
   actas, operador y ventana. Verificar que #21 permanece íntegro, #22 no entra,
   y que no se fusionan por separado los Draft ya incorporados ni OTP equivalente.
   Mantener Render autodeploy/previews off y ambas exclusiones Vercel para rama/main.
   Solo después de cerrar las puertas y recibir autorización, el merge previsto es:

   ```bash
   gh pr merge 23 --repo NicolasAG-pe/Sedapal --merge --match-head-commit "$HM_APPROVED_HEAD"
   ```

   Obtener el SHA real del merge, comprobar que su árbol de ejecución coincide con
   el candidato aprobado y fijarlo como `HM_RELEASE_COMMIT`; nunca desplegar latest.

2. **Cerrar escritores y asegurar recuperación.** Registrar configuración/deploys
   anteriores en privado, cuotas disponibles sin gasto, identidad migradora y rol
   de ejecución. Validar permisos efectivos de las tablas/funciones nuevas y los
   owner/ACL necesarios para recuperación: el restore local omite estos últimos.
   Aplicar únicamente el mecanismo de pausa/drenaje autorizado y comprobar que no
   quedan escrituras/transacciones activas; capturar backup fresco consistente,
   verificar hash, restaurar en copia aislada y cotejar filas/columnas/secuencias.
   Conservar copia cifrada fuera del equipo y comprobar acceso de recuperación.

   Render actual es free/una instancia. Su maintenance mode requiere plan de pago:
   **no contratarlo**. Suspender/reanudar tiene endpoints oficiales, pero no se ha
   comprobado aquí cómo instalar el SHA nuevo suspendido sin reabrir el anterior;
   no usar esa secuencia a ciegas. Resolver este punto antes de DDL. Una ruta con
   escrituras concurrentes exigiría justificación y ensayo específico aprobado;
   los tests de014 no certifican coexistencia de todos los escritores productivos.

3. **Aplicar solo la ruta aprobada.** Contrastar de nuevo el destino privado con
   Neon/Render; cero factores activos y ausencia de control de piloto. Conexión
   directa TLS verify-full, credenciales privadas del migrador, sin volcarlas en
   argumentos/logs ni reutilizar un perfil read-only para DDL. Comando previsto,
   desde el checkout del SHA aprobado y solo con el servicio privado configurado:

   ```bash
   psql 'service=hidro_release_migrator' -X -v ON_ERROR_STOP=1 \
     -f Base-de-Datos/migrations/007_usuario_2fa.sql \
     -f Base-de-Datos/migrations/008_operaciones_pago.sql \
     -f Base-de-Datos/migrations/011_recuperacion_clave.sql \
     -f Base-de-Datos/migrations/012_notificaciones_push.sql \
     -f Base-de-Datos/migrations/013_seguimiento_incidencias.sql \
     -f Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql
   ```

   No comodines, init.sql,009/010 ni tablas de piloto. Cada archivo contiene su
   propia transacción y timeouts; **no es una transacción global de seis archivos**.
   Al primer fallo, parar y registrar qué se confirmó; no continuar, revertir DDL
   ni restaurar automáticamente. Cotejar datos/contratos y restricción014 antes
   de abrir tráfico. No exigir que coincidan secuencias que escritores autorizados
   hayan avanzado; reconciliar cualquier diferencia sin ocultarla.

4. **Render primero, backend único.** Mantener explícitos en0 los diez flags del
   [alcance](LANZAMIENTO-OFICIAL-120.md#funciones-cerradas-y-downgrade). Preservar
   secretos/OTP existentes y no crear credenciales Firebase. Usar el servicio
   existente, raízBackend, Dockerfile corregido, una instancia y mismo destino.
   La petición futura a `POST /v1/services/{serviceId}/deploys` debe incluir:

   ```json
   { "commitId": "SHA_COMPLETO_DEL_MERGE_APROBADO", "clearCache": "do_not_clear" }
   ```

   Autenticación privada; no usar una herramienta que omita commitId. Esperar
   estado live y comprobar SHA/deploy reales:201/202 solo significa creado/en cola.
   Antes de reabrir, verificar PostgreSQL/health, todas las instancias y:

   ```bash
   node scripts/check-auth-candidate.cjs "$HM_API_HTTPS_ORIGIN"
   ```

   Debe aceptar hidro-auth-2fa-v2 en health/capabilities. Este script no impone por
   sí solo un veto remoto a rollbacks; permisos manuales siguen siendo relevantes.
   No activar factores hasta imponer el control externo completo.

5. **Admin Vercel del mismo SHA.** Proyecto existente hidro-mehora-admin, raízrepo,
   build `node scripts/build-web.js admin`, salida `artifacts/web/admin`.
   API_BASE_URL productiva ya coincide con Render HTTPS; su origen estable está
   permitido en CORS. Revalidar antes de usarlo. Usar una copia limpia de los
   archivos versionados del SHA exacto y revisar qué se enviará, sin respaldos,
   artefactos históricos ni secretos locales. Con CLI
   autenticada y enlazada al proyecto correcto (si no está disponible, detener):

   ```bash
   vercel deploy --prod --skip-domain
   ```

   Esperar READY, guardar URL/ID/SHA y probar ese destino, respetando su protección.
   Después del smoke y autorización de promoción, `vercel promote URL_VERIFICADA`;
   resolver y comprobar el alias estable. No promover un preview viejo ni desplegar
   el proyecto alternativo Backend como segunda API. Autodeploy sigue apagado.

6. **Smoke acotado y reapertura.** Solo cuentas de prueba previamente autorizadas:
   login cliente/Admin y roles, revocación/sesión, historial de pagos/recibos/PDF,
   seguimiento, Socket.IO y notificaciones internas contra los destinos efectivos.
   Confirmar restricciones de acceso ajeno y flags cerrados. No crear cuentas,
   enviar OTP/correos/FCM, acreditar fondos o lanzar auditorías masivas sin alcance
   aprobado; si login exige OTP, usar la sesión válida autorizada o cerrar ese gate.
   Reabrir escritores solo con backend compatible confirmado y observar errores.

7. **Release posterior.** Reutilizar APK firmada1.2.0/código6, sin reconstruir por
   estos documentos/014. Exigir acta física del mismo hash y todos los gates verdes.
   Verificar nuevamente firma/hash, máximo código oficial distribuido y ausencia
   del tag/release antes de crear v1.2.0 sobre `HM_RELEASE_COMMIT`. Adjuntar solo APK,
   SHA-256 y notas revisadas; nada de dumps, claves o evidencias con datos. Comprobar
   enlace público, descarga, hash y firma. Hasta entonces no hay APK oficial pública.

## Parada y recuperación compatible

Ante SQL, contrato, autenticación, flags, firma, datos o estado de deploy ambiguos,
parar sin reintentos automáticos de operaciones productivas. Conservar registros
privados y el servicio cerrado mediante el procedimiento previamente autorizado.
No restaurar una instantánea sobre Neon ni deshacer migraciones por iniciativa propia.

Conservar deploys previos como referencia, **no como backend elegible para volver**:
d6a6b83 ignora factores/versiones. Recuperar con corrección hacia delante del código
compatible aprobado, mismas claves/lectores y esquema; si no existe ese candidato,
mantener la parada y pedir una decisión. Un Admin anterior requiere comprobar su
contrato con la API vigente antes de promoverlo. Android correctivo: misma firma y
versionCode superior a6, sin downgrade/desinstalación. Kubernetes21 y laboratorio22
quedan fuera de toda acción de esta ventana; no borrar sus recursos ni respaldos.

Fuentes operativas consultadas28/10: [Render deploy por commit](https://api-docs.render.com/reference/create-deploy),
[maintenance mode y plan](https://render.com/docs/maintenance-mode),
[suspensión](https://api-docs.render.com/reference/suspend-service-1),
[reanudación](https://api-docs.render.com/reference/resume-service-1),
[Vercel sin promover dominio](https://vercel.com/docs/cli/deploy#skip-domain),
[promoción](https://vercel.com/docs/cli/promote).
