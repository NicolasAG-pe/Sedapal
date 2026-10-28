# Candidata física de laboratorio 1.2.0 — preparación

Base exacta: PR #20, `772e5e63d011b052598afeb93d1a27e4047cadee`.
Rama dependiente `feature/candidata-android-lab-120`; ningún merge.

## Identidad y alcance

Variante **lab**, paquete `pe.edu.hidromejora.app.lab120`, nombre
**Hidro-Mejora LAB**, versión `1.2.0-lab.1`, versionCode 5 (secuencia independiente
de la oficial). Capacitor 7, recursos originales y todos los módulos conservados.
Franja visible «LAB · 1.2.0 · Datos sintéticos». Firma RSA de desarrollo propia,
privada fuera del repositorio; ni firma permanente ni APK oficiales modificadas.

FCM nativo desactivado, sin `google-services.json`. Sin credenciales Firebase,
Gmail o Resend en el backend, sin workers automáticos y sin operaciones reales.
No se registró una aplicación Firebase para el paquete LAB ni se modificó IAM.

## Entorno comprobado

Al iniciar: 8,2 GB disponibles. Se conservaron archivos, evidencias, imágenes,
contenedores y volúmenes anteriores. Se copiaron dependencias y caché a un
worktree persistente para no modificar los de otras sesiones.

Kind `hidro-avance19`: nodo Ready y pods Running. El contexto existente
`kubernetes-admin@hidro-avance19` usa un hostname interno que el host no resuelve;
las lecturas usan `--server=https://127.0.0.1:39855`
`--tls-server-name=hidro-avance19-control-plane`. Kubeconfig/contexto global
intactos; ninguna escritura, recreación o despliegue Kubernetes.

API Node auténtica en **127.0.0.1:45679**, PostgreSQL 18 en un nuevo contenedor
`hm-physical-120-pg`, publicado exclusivamente en **127.0.0.1:45680**, con volumen
nuevo. Base nueva `hm_physical_<aleatorio>`, esquema inicial y migraciones
007–013 solo allí. Aplicación con rol `hm_lab_app`, DML/secuencias: sin superuser,
CREATEDB, CREATEROLE, replicación, BYPASSRLS ni CREATE en public. El propietario
administrativo se limita al bootstrap/backup; no es la identidad del backend.

Transporte previsto: **USB con `adb reverse tcp:45679 tcp:45679`**. Android
consume `http://127.0.0.1:45679`; no IP LAN, túnel público, cuenta cloud ni TLS
inseguro. HTTP solo se permite en localhost/127.0.0.1 por la política nativa LAB;
no se desactiva la validación de certificados HTTPS. La privacidad depende del
cable y de autorizar exclusivamente esta computadora en ADB: no se presenta
como una conexión TLS de extremo a extremo ni como acceso móvil inalámbrico.
La autenticación sigue siendo obligatoria; CORS no la sustituye.

## Pruebas actuales

- Gradle: assembleLab, assembleLabAndroidTest, testLabUnitTest y lintLab aprobados.
- Regresión unitarias/backend/PG: **213 casos, 212 aprobados, 1 omisión de legado,
  0 fallidos**. OTP, 2FA, sesiones, recuperación, Keystore, PDF, recibos/pagos,
  Yape, incidencias, push cifrado, identidad y configuración de Firebase sin envío.
- Seguridad específica: **4/4**. Configuración cerrada, firma privada, rol PG
  restringido, REST cliente/Admin, propietario200/otra cuenta404/anónimo401,
  CORS ajeno sin autorización y cero pagos/operaciones/dispositivos/entregas push.
- Android 15/API35, AVD propio `hm_physical_api35`: **8 comprobaciones nativas**;
  **3 instrumentales**, incluida clave Keystore no exportable, alteración GCM,
  backup desactivado e identidad/transporte LAB. Sin operar teléfonos físicos.
- Tutorial: una prueba inicial y cinco ciclos voluntarios de replay/Omitir y
  force-stop/reapertura conservaron la preferencia. **No se reprodujo B-03** en
  este entorno; no se cambió ese código. Sigue pendiente observarlo físicamente.
- Navegador: **12/12** (pagos/PDF, auditoría, recuperación, push sin envío,
  seguimiento y tiempo real/Socket.IO).
- OTP/recuperación en el backend LAB: adapter privado simulado aprobado; ningún
  correo real. Su primera prueba omitía el UUID obligatorio de recuperación,
  fue corregida sin alterar el contrato y conserva el log fallido.
- Respaldo/restauración en otra base nueva: tres usuarios, una incidencia y un
  evento conservados; estado del backend original intacto.
- Navegación real de recibos, incidencias, notificaciones, perfil y atención;
  logout/cambio de cuenta, FCM no configurado y ninguna solicitud externa del WebView.

Los primeros intentos de compilación detectaron caché no seleccionada y variante
instrumental debug; logs conservados y selección LAB corregida. No son pruebas
aprobadas. La creación por avdmanager rechazó devices.xml ausente; se preservó
su configuración y se creó un AVD separado con la configuración conocida y
userdata base inicial, sin copiar overlays ni borrar datos anteriores.

Guía de instalación física, hashes y cierre: [guía LAB](../ANDROID-LABORATORIO-120.md).
No se declara validación física, Android 13/14, TalkBack ni publicación oficial.
