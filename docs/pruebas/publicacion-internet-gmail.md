# Publicación por Internet — 23 de octubre de 2026

## Infraestructura y GitHub

Se revisó AGENTS.md, se ejecutó fetch y se comprobó `origin/main=c5301c6`. El PR #8
contiene Gmail opcional y mantiene OTP/outbox, sesiones, recibos y permisos. Sigue
Draft: sin conflictos, checks obligatorios ni reglas/revisiones requeridas en GitHub.
No se fusionó main: la autorización explícita de merge está solicitada al propietario.
No se reescribió ninguna rama ni se modificaron Kubernetes o Vercel.

Render `hidro-mejora-api` sigue en plan free, una instancia, autodespliegue y previews
apagados. Se desplegó manualmente el SHA completo
`4b0781e996dc92c356a70b3e78c2b4de371ae4a1`, ya publicado y probado, sin cambiar main.
Deploy `dep-dbdprdcipgvc739nfs4g`: estado live real confirmado.
Se cargaron las credenciales Gmail en un secret file del servicio. Se verificó su
contenido privadamente, sin incluirlo en el repositorio, imagen, frontend o APK.
Solo se creó una clave outbox nueva porque no existía y la cola estaba vacía.
DATABASE_URL, AUTH_TOKEN_SECRET, EMAIL_OTP_SECRET y demás claves previas se conservaron.
Registro y worker permanecen expresamente en 0; no se han enviado correos.

## Neon y recuperación

El destino actual de Render coincide con el Neon previamente validado. La auditoría
READ ONLY mostró 003–006 presentes y preflight 005 sin anomalías; el PR no agrega SQL.
No se ejecutaron migraciones ni se modificaron filas para esta publicación.

Se creó un respaldo completo AES-256 sin dump plano en disco, con conexión verify-full,
CA confiable y validación de hostname. Descifrado/SHA verificados y restauración en
PostgreSQL 18 nuevo, red interna y volumen independiente. Comparación aprobada:
13 tablas, 117 filas, 4 fotografías/413.596 bytes, relaciones y 8 valores de secuencia.
Catálogo actual: 122 restricciones y 28 índices. Se preservaron permisos/propietarios
en la restauración, según el procedimiento ensayado. Material privado y evidencia
solo en artifacts ignorados y claves de recuperación fuera del repositorio.

Después del despliegue se volvieron a comparar las huellas de las 13 tablas contra
el snapshot del respaldo, incluidas fotografías: sin diferencias. No se usó una
restauración para sobrescribir producción ni se avanzaron secuencias productivas.

## Verificaciones ejecutadas

- 48 comprobaciones Gmail/Resend/outbox/HTTP/contratos: Node22, PostgreSQL aislado,
  datos sintéticos y proveedor simulado; cero fallos finales.
- 24 comprobaciones de firma/configuración/actualización e interfaz Chromium con
  API y PostgreSQL sintéticos: cero fallos finales. No son Android nativo.
- El primer comando de esa suite omitió el puerto PostgreSQL y fallaron 14 casos
  por preparación del fixture; se configuró el relay loopback exclusivo del laboratorio
  y se repitió el comando completo, sin tocar producción.
- `npm ci` y `npm run android:release`: Gradle assembleRelease, testReleaseUnitTest,
  lintRelease y compilación de instrumentación aprobados con Java21. No implica
  ejecución de los tests instrumentales en un teléfono.
- Firma verificada con apksigner y Java21. La ausencia de Java global se resolvió
  seleccionando el JDK existente; no se instaló ni cambió Java global.
- APK: applicationId pe.edu.hidromejora.app, versión 1.1.1/4, minSDK23,
  debuggable=false; certificado idéntico a la APK 1.0.0 distribuida. Sin coincidencias
  con secretos privados actuales y sin recursos administrativos; API pública HTTPS.
- Producción: health 200, capabilities 200, sesión anónima 401; login demo y Admin,
  sesión válida/JWT8h, permisos por rol, perfil/suministro, consultas de recibos,
  pagos, incidencias, cortes, notificaciones y seis consultas Admin aprobados.
- Socket.IO WSS: demo/Admin aceptados y anónimo rechazado. CORS Capacitor/Admin
  autorizado, origen ajeno rechazado. Registro antiguo 426 y OTP cerrado 503.
- La cuenta demo permanece sin recibos, pagos o incidencias ficticios. Los JWT solo
  vivieron en memoria; no se registraron credenciales ni respuestas privadas.
- Panel https://hidro-mehora-admin.vercel.app: HTTP200. El PR no cambia su interfaz;
  no se requiere redeploy del Admin. No se repitió PDF productivo ya comprobado en
  el avance26: este PR no cambia documentos; la APK contiene su generador existente.
- Logs posteriores revisados sin errores críticos observados.

## APK y límites pendientes

APK firmada: `artifacts/android/hidro-mejora-v1.1.1-release.apk`.
Tamaño 3.405.385 bytes. SHA-256:
`541b4c9d70a52396266358d786032db47c85e99aa2ae4d7ae1bcf5eb28c3bb4b`.
Se prepara como prerelease para que el propietario pueda instalarla y completar
la validación física. Los APK anteriores y la firma permanente se conservan.
No había dispositivos adb conectados. Instalación/actualización real de esta APK,
registro, recepción OTP, confirmación y login desde datos móviles siguen pendientes;
no se sustituyen por las comprobaciones de Chromium o por el deploy live.

Render no ofrece un Background Worker free y el propietario prohíbe contratar
servicios. Se solicitó elegir un servidor gratuito disponible o autorizar evaluar
el worker existente como proceso separado dentro del contenedor de la API free.
Eso compartiría reinicios/suspensión por inactividad y cambia la propuesta anterior
que exigía servicios independientes. No se implementó esa alternativa sin respuesta.
No hay worker productivo ejecutándose ni se abrió el registro público.

Gmail conserva únicamente gmail.send, con renovación real ya comprobada y estado
separado de identidad automática no disponible. No se amplían permisos para leer el
buzón. La recepción real requiere la confirmación del propietario. Todos los correos
de prueba deben dirigirse exclusivamente al remitente autorizado por el propietario.
La operación sin supervisión también debe resolver la caducidad aplicable a una
aplicación OAuth que permanezca en Testing; no se asume autorización permanente.

## Continuación necesaria

1. Recibir la decisión de alojamiento gratuito del worker y la autorización de merge.
2. Probar la alternativa aprobada, desplegar el worker sin coste y comprobar readiness.
3. Revisar nuevamente la cola y limitar el canario a la dirección autorizada antes
   de abrir altas; no procesar destinatarios ajenos durante las pruebas.
4. Probar registro, correo recibido, OTP correcto y login desde el teléfono con datos
   móviles; distinguir aceptación Gmail de entrega e identidad realmente observadas.
5. Solo tras ese resultado, decidir la apertura general y publicación definitiva.

Fuentes de las limitaciones de alojamiento: [Render Free](https://render.com/docs/free)
y [Background Workers](https://render.com/docs/background-workers).
