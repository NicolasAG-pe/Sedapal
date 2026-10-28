# Historial de versiones

## Revisión y ventana oficial1.2.0 — aún sin aprobar/publicar

- PR23 preparado para revisión independiente; alcance cerrado de inscripción2FA, cobros/manual, Yape, FCM y recuperación. Se conserva la exigencia de factores ya activos; el backend antiguo se excluye de recuperación y el control externo sigue pendiente antes de activar2FA.
- Respaldo fresco Neon de solo lectura y restauración nueva cotejados:13 tablas y cero MFA activos. Firma/metadatos/hash de la APK existente verificados sin recompilar; pruebas anteriores reutilizadas y acta física específica pendiente de referencia.
- Ventana condicionada documentada: ruta007,008,011,012,013,014 sin009/010, pausa de escritores por resolver, Render por SHA, Admin Vercel sin promoción automática y recuperación compatible. Kubernetes21 íntegro,22 excluido y datos/laboratorio conservados; sin merge, DDL productivo, despliegue ni release.

## Compatibilidad productiva de pagos1.2.0 — PR23 para revisión

- Nueva014 aditiva: seis metadatos de compatibilidad obligatoriamenteNULL y entorno simulado; sin tabla de piloto, sin009/010 ni cambios en consultas, historial, recibos o Admin. Rechaza la ruta de laboratorio y conserva restricciones de008.
- Ruta007,008,011,012,013,014 verificada dos veces en una nueva restauración aislada.20 regresiones de pagos/migración/piloto,5 grupos REST y4 grupos cliente/Admin aprobados; datos previos conservados y ninguna acreditación de deuda.
- APK firmada/Android, Kubernetes21, cadena anterior, laboratorio y respaldos intactos. Sin nuevas compilaciones/emuladores, migraciones Neon, merges, despliegues o release; pendientes revisión y autorizaciones.

## Preparación oficial 1.2.0 — aún sin publicar

- Integración técnica de #12–#20 sobre main con #21 conservado; OTP equivalente sin duplicar y #22 excluido. Drafts y revisiones originales siguen abiertos.
- Android1.2.0/código6 compilado con firma permanente; actualización sobre1.1.2 comprobada en AVD offline sin desinstalar ni perder identidad/preferencias.
- Respaldo Neon de solo lectura restaurado y cotejado; ensayo007–013 repetido en otra copia, sin migraciones productivas. Inscripción2FA, FCM y cobros reales cerrados.
- Bloqueo productivo reproducido en copia restaurada: consultas normales de pagos dependen de columnas de009/010, exclusivas de laboratorio. Se documenta la separación de esquema pendiente; no se ejecutan esas migraciones en Neon ni se publica release.
- Corregida omisión Docker de módulos recuperación/push/seguimiento; imagen local y smoke de arranque/importación aprobados. Plan coordinado Render/Vercel y referencias previas conservadas; sin despliegues, tag o release.

## Validación de laboratorio y preparación física — incremento D

- Candidata debug final en Android 15: 13 comprobaciones de sesión y seis de seguimiento, Keystore instrumental, JUnit 4/4 y lint sin errores (16 advertencias existentes).
- Evidencias regeneradas en disco persistente: 63 pares comparativos y 153 capturas del recorrido completo; estados Admin con datos/vacío/carga/error/recuperación, 300 pruebas aprobadas y una omisión condicional.
- AVD anterior conservado tras rechazo por firma debug temporal perdida; la prueba final usó otra instancia sin la aplicación instalada. APK oficiales y firma permanente intactas.
- Backend, emulador y PostgreSQL de laboratorio detenidos conservando datos; sin FCM/correos/cobros reales ni cambios productivos. Informe `docs/pruebas/validacion-final-120.md`.
- Teléfono físico, TalkBack, Android 13/14, carga grande y validación de despliegue siguen pendientes. La APK de emulador necesita preparar destino privado/modalidad de instalación antes de su uso físico; no publicación 1.2.0.

## Resumen operativo 1.2.0 — incremento C

- Admin muestra los siete estados existentes de incidencias/atención y distingue importes históricos sin atribuir acreditación bancaria; mismo contrato y una consulta por navegación.
- Estados con datos, vacío, carga, 503 y recuperación comprobados; una demostración no incrementa pagos financieros. Sin endpoints ni migraciones nuevas.
- Worktree y evidencias recuperados en disco persistente tras reinicio; 300 pruebas aprobadas y una omisión condicional, recorrido cliente/Admin con matriz visual aprobado y selector de recibo de prueba corregido sin debilitar su aserción.
- Informe `docs/pruebas/reportes-operacion-120.md`; paginación de listados heredados y carga grande quedan como incremento de contrato separado.

## Pulido UX 1.2.0 — incremento B

- Accesos rápidos del teléfono en tres columnas: cinco acciones conservadas, etiquetas legibles sin partir palabras y botón de tutorial de 44 px.
- HidroBot con controles táctiles de 44 px, encabezado y sugerencias redistribuidos y espacio de conversación comprobado; sin ocultar funciones ni cambiar la identidad.
- 63 capturas posteriores en seis resoluciones, geometría y saludo real verificados; diez pruebas dirigidas aprobadas. Comparación local con el runtime anterior preservado.
- Informe en `docs/pruebas/pulido-ux-120.md`; Android de la candidata final, teclado virtual y validación física siguen en D. No publicación ni entregas reales.

## Auditoría integral 1.2.0 — incremento A

- Base del PR #19 comprobada y cadena #11–#19 inventariada: #11 ya tiene parche equivalente, sin merges ni reconstrucción.
- Auditoría por módulo, 63 capturas reales en seis resoluciones, referencias de rendimiento, revisión IAM en lectura y roadmap actualizado con #18/#19.
- Verificadores alineados con FCM aprobado, demostraciones sin fondos, revocación tras cambio de contraseña y autologin OTP; tutorial nativo esperado mediante su control real.
- 130 pruebas generales, 118 backend (una omisión condicional), 51 correo/sesión, 11 navegador, 30 comprobaciones E2E, migraciones repetidas y restore sintético aprobados; Android 15 con Keystore, sesión y seguimiento reales. Cero envíos reales.
- Galería y guía de demostración locales, hallazgos B/C y puertas físicas/de seguridad documentados; rama excluida de despliegues automáticos en ambas raíces Vercel. No publica 1.2.0.

## Firebase FCM — único envío real autorizado en Android 15

- Una sola llamada HTTP v1 con el código del PR #19 y OAuth dedicado de 15 minutos: Firebase respondió 200; Android mostró el aviso genérico en la bandeja y el toque real abrió Incidencias mediante REST autorizado.
- Propietario con historial 200, otra cuenta válida con evento/historial 404 y petición anónima 401. Se corrigió una URL auxiliar del verificador sin modificar el producto ni repetir el envío.
- Entrega/worker/recordatorios apagados al terminar, dispositivo revocado, token OAuth retirado y recursos locales detenidos conservando las evidencias. APK oficiales intactas.
- Informe en `docs/pruebas/firebase-fcm-envio-unico-120.md`. No autoriza otro mensaje, merge, despliegue ni prueba física.

## Firebase FCM — preparación de piloto Android aislado

- Compilación debug en worktree independiente con JSON privado validado y temporal; flag Firebase solo durante el build, sin cambiar dependencias, diseño ni APK oficiales.
- El adaptador del PR #17 admite tokens OAuth temporales externos: valida identidad/scope/caducidad/permisos y falla cerrado; conserva el modo anterior y las entregas desactivadas por defecto.
- Identidad dedicada de envío: roles personalizados `hmFcmPilotSender` y `hmFcmPilotTokenMinter`, con un permiso cada uno y obtención temporal de tokens sobre esa cuenta. APIs IAM/IAM Credentials habilitadas; sin claves privadas permanentes ni facturación. Cambios remotos inventariados en el informe.
- 32 pruebas específicas y 101 regresiones aprobadas; Gradle/JUnit/lint y ocho comprobaciones Android 15 con registro FCM real, cifrado, consentimiento, cambio de cuenta y revocación, sin enviar mensajes.
- Android 13/14 pendientes por espacio para imágenes; primer mensaje remoto sujeto a aprobación. Informe en `docs/pruebas/firebase-fcm-piloto-120.md` y operación en `docs/firebase-fcm-piloto.md`.

## Seguimiento de incidencias — cliente, Admin y Android

- Botones «Ver seguimiento»/«Ver historial» y diálogo acuático con eventos reales, fecha/estado, comentarios públicos y aviso explícito para incidencias anteriores; tarjetas, formularios, fotos, filtros y tablas conservados.
- Vista compartida de consulta y controles exclusivos de Admin; cierre/limpieza por sesión, foco accesible, bloqueo de doble envío y recuperación de respuesta incierta sin duplicar cambios.
- Socket.IO y reconexión recargan el historial autorizado. Corrige contraste heredado en el nuevo encabezado sin cambiar los diseños aprobados de otros módulos.
- Chromium en cinco resoluciones y Android 15 real en AVD (360×800 y 390×844), foto/Atrás/red/reapertura/Keystore aprobados; Gradle, 4 JUnit, prueba instrumental y lint sin errores. Informe y galería locales referenciados en `docs/pruebas/seguimiento-incidencias-120.md`.
- Producción y APK oficiales intactas; 013 solo en PostgreSQL 18 aislado, FCM remoto y prueba física pendientes.

## Seguimiento de incidencias — backend y PostgreSQL de laboratorio

- Migración aditiva y repetible 013: eventos UUID append-only del registro y cambios reales, sin reconstruir el historial anterior ni copiar fotografías.
- Cambio administrativo, evento, aviso interno y cola push se confirman juntos; UUID de solicitud y bloqueo por fila evitan duplicados y registran el estado anterior real ante concurrencia.
- Consulta paginada por cursor opaco para propietario/Admin, 404 para incidencias ajenas, responsables solo en Admin y comentarios públicos validados. Conserva los tres estados y rutas anteriores.
- Diez pruebas específicas Node 22/PostgreSQL 18 aprobadas; regresiones de seguridad, pagos y documentos comprobadas. Consulta el informe `docs/pruebas/seguimiento-incidencias-120.md`. No se aplicó 013 en producción.

## Push Android — integración voluntaria y pruebas nativas

- Plugin oficial @capacitor/push-notifications 7.0.7, canal e icono de gota, permiso voluntario desde Cuenta y estado seguro sin Firebase; no se publica APK ni se cambian versión/firma.
- Capacidad de revocación/consentimiento en slot Keystore independiente; cierre offline pendiente de sincronizar, rotación y cambio de cuenta sin reutilizar colas anteriores.
- Navegación por UUID revalidada vía cliente autenticado; espera la navegación en curso y la restauración segura antes de abrir datos. Corrige diferencias del bridge nativo al registrar listeners de ciclo de vida.
- Chromium en cinco resoluciones, centro y Socket.IO reales con entrega simulada; Android 15: permisos/canal, almacenamiento cifrado y diez comprobaciones de login/toques/intents locales. Recepción remota FCM y dispositivos físicos pendientes.
- Gradle, cuatro JUnit y lint sin errores; regresiones y guías detalladas en docs/pruebas/notificaciones-push-120.md. Producción y APK oficiales conservadas.

## Push Android — backend de laboratorio

- Migración aditiva 012 con dispositivos cifrados, consentimiento, asociación a suministro/versión de seguridad y cola idempotente separada del centro leído/no leído.
- Adaptadores mock y FCM HTTP v1, OAuth de scope mínimo, backoff, retiro de tokens inválidos y resultado ambiguo sin reenvío automático. Todo cerrado por defecto.
- Vencimientos programables con fechas reales y exclusión de recibos pagados; cortes localizados sin difusión general y repetición de estado de incidencia sin avisos duplicados.
- 14 pruebas específicas Node 22/PostgreSQL 18 aprobadas. Arquitectura y límites en docs/pruebas/notificaciones-push-120.md; configuración futura en docs/android-push-firebase.md. Sin Firebase, migraciones o envíos productivos.

## Recuperación de contraseña — cliente, Admin y Android

- Acceso «¿Olvidaste tu contraseña?» y formularios compartidos con diseño acuático, validaciones, bloqueo de duplicados, recuperación de respuesta perdida por UUID y mensajes accesibles. Código/permiso solo en memoria; éxito vuelve al login sin iniciar sesión.
- Android espera la restauración pendiente antes de abrir recuperación; conserva el borrado seguro de Keystore ante revocación y la sesión cifrada después del nuevo login.
- Chromium responsive, WebView Android real, scrypt/2FA/JWT/Socket.IO, regresiones, Gradle/unitarias y lint comprobados; evidencia y límites en docs/pruebas/recuperacion-clave-120.md. PDF y APK oficiales conservados; sin cambios productivos.

## Recuperación segura de contraseña — backend de laboratorio

- Código de correo y permiso de cambio de un uso, límites por IP/identidad y outbox cifrada independiente del registro OTP; Gmail ambiguo no se reenvía automáticamente.
- Conserva 2FA y exige el factor existente a usuarios protegidos y Admin; cuentas administrativas sin factor requieren revisión de identidad independiente.
- Migración aditiva 011 revoca JWT al cambiar credenciales también sin 2FA, invalida solicitudes anteriores y conserva los datos históricos; aplicación únicamente en PostgreSQL aislado.
- Worker y función cerrados por defecto; 17 pruebas específicas aprobadas y regresiones documentadas en docs/pruebas/recuperacion-clave-120.md. Sin producción ni correo real.

## Identidad acuática — segunda composición visual

- Encabezados y navegación inferior azules, deuda con degradado efectivo y superficies blancas/celestes alternadas; login y cabeceras de recibos/pagos con bloques de marca.
- Admin conserva menú oscuro y gestión compacta, con encabezado azul, indicadores diferenciados, filtros celestes y formularios con mejor jerarquía.
- Corrige reglas de cascada que anulaban el degradado y devolvían los encabezados al blanco; foco y contraste adaptados a fondos oscuros.
- 39 comparativas reales, contraste comprobado y regresiones/PDF/Android documentados en docs/pruebas/identidad-acuatica-v2-120.md.
- El harness nativo libera conexiones HTTP remanentes del proxy del emulador al terminar; dos regresiones de cierre local. Sin cambios de negocio, publicación ni producción.

## PDF Android — código de operación

- Etiquetas «Código de operación» en cliente, Admin y constancias; número Yape solo para referencias del flujo externo correspondiente.
- Identidad acuática, contratos, auditoría y controles financieros conservados; los documentos de laboratorio no acreditan dinero ni cancelan deuda.
- Presentación/PDF 23/23, dos E2E web y diez comprobaciones Android nativas aprobadas; guardado/visor de ambos PDF reales de laboratorio. Guía USB sin instalar APK en docs/pruebas/pdf-android-codigo-operacion-120.md.

## Textos de pagos — presentación breve y alcance explícito

- Cliente Android/web, Admin y PDF usan «Pago con Yape», «Registrar pago», «Confirmar operación», «Operación confirmada» y «Constancia de operación».
- Aviso «Entorno de pruebas · Sin cobros reales» y confirmación obligatoria de que no se recibió dinero; no se acredita dinero ni se cancela deuda.
- La presentación de mensajes automáticos de auditoría conserva sus literales originales en la API/base; los motivos humanos no se reescriben.
- Pruebas de documentos/UI/paleta 23/23, backend 18/18, flujos web y responsive aprobados; Android nativo final 10 comprobaciones sin errores. Evidencia y fallos de entorno resueltos en docs/pruebas/textos-pagos-120.md.

## Documentos acuáticos — nueva composición y validación

- Recibo con encabezado azul, identificación, total/estado destacado y tabla de consumo; constancia con importe, banda de estado y trazabilidad propia.
- Logo proporcional, pie referencial, A4, tipografía y márgenes coherentes con la identidad compartida; no se inventan datos ni acreditaciones.
- Ocho ejemplos sintéticos, once páginas renderizadas; textos largos conservados y corregida paginación innecesaria con correo largo.
- 17 pruebas PDF y 3 de paleta; descargas web y Android verificadas. Informe: docs/pruebas/identidad-acuatica-pdf-120.md. Sin publicación 1.2.0 ni cambios productivos.

## Identidad acuática 1.2.0 — cliente y administración

- Paleta compartida azul/celeste, superficies suaves, tarjetas, formularios y navegación consistentes; logo e iconos originales conservados.
- Cliente Android/web y Admin mantienen funciones, tablas compactas y diálogo de pagos, con tintas semánticas accesibles.
- Capturas antes/después en cinco resoluciones y navegación real sin errores JavaScript; contratos OTP/2FA y Android de laboratorio comprobados.
- Exclusión de despliegues para la rama visual en ambos proyectos Vercel. Sin publicación, migraciones ni cambios productivos.

## Pagos Yape — sincronización visible y estados por entorno

- Corrige ventanas en la primera conexión y suscripción Socket.IO; recupera pagos al reconectar aunque otra pantalla esté visible.
- Agrupa lecturas, evita que respuestas antiguas sustituyan estados recientes y conserva filas/foco, filtros y contadores de Admin.
- Código de prueba / Registrar ensayo / Pendiente de revisión / Ensayo confirmado para simulaciones; número de operación y comprobación manual explícitos para Yape auténtico.
- Aviso de desconexión visible en móvil, identificadores sin superposición y constancias coherentes; no se modifica el contrato API ni el estado financiero del recibo.
- Regresión focalizada 21/21, cliente/Admin/PDF 18/18, flujos reales y responsive aprobados; Android final: 10 comprobaciones sin errores, incluidos corte de red y aviso visible. Evidencia y límites en docs/pruebas/pagos-tiempo-real-120.md.

## Auditoría de pagos — gestión compacta y recuperación segura

- Admin sustituye formularios dentro de tarjetas por tabla adaptable, cinco secciones, búsqueda/filtros, contadores/paginación real y diálogo de revisión accesible.
- Ensayos se confirman sin declarar dinero ficticio; revisión con hora/actor del servidor y cotejo independiente para Yape auténtico.
- Cliente recupera estado/historial tras respuesta perdida, impide otro QR/declaración y limpia el resumen privado al cerrar sesión.
- Constancia de ensayo explícita, ejemplos A4 sintéticos y sin sobrescribir documentos o APK anteriores.
- HidroBot espera los datos antes de habilitar su botón: corregida la carrera reproducida en Android, con prueba de carga retenida.
- Piloto Android final: 9 comprobaciones sin errores, PDF reales guardados/abiertos y retorno con Atrás; Gradle/JUnit/lint conservados aprobados.
- Playwright integral: cinco resoluciones, 16 comprobaciones y Socket.IO real. Regresión de pagos/HidroBot: 8/8; sesión nativa general: 13 comprobaciones sin errores. Evidencia detallada en docs/pruebas/auditoria-pagos-admin-120.md.

## Auditoría de pagos — integridad de la revisión

- Separa la confirmación de ensayos de la recepción bancaria; fecha de revisión generada por PostgreSQL y fecha bancaria opcional sin inventarla.
- Prepara migración local 010 sin reescribir el historial; bloquea otra declaración del mismo piloto tras rechazo/cancelación.
- Consulta paginada, búsqueda parametrizada, contadores y recuperación de operación existente.
- Backend focalizado: 9/9. Regresiones Node 22/PostgreSQL 18: 94 aprobadas, 1 histórico optativo omitido. Producción intacta.

## Piloto Yape - evitar una transferencia repetida

- Bloquea volver a mostrar el QR desde la primera declaración, incluso rechazada/cancelada; oculta la imagen ante respuesta incierta e indica consultar historial sin repetir dinero.
- Regresión afectada: 12/12; backend ampliado: 8/8; Android final: 9 comprobaciones, 0 errores. No hubo transferencias reales.

## Reproducibilidad de pruebas del piloto

- Las pruebas crean su carpeta local de evidencia en un clon nuevo, sin depender de artefactos anteriores ni copiar archivos privados.
- El launcher rechaza un contenedor detenido o cuyo puerto cambió; repetición backend/E2E: 9/9 aprobadas.

## Piloto Yape 1.2.0 - interfaces, launcher privado y constancia

- Cliente/Admin diferencian ensayo de transferencia voluntaria, con cotejo de importe, referencia, fecha y receptor; recibo sintético sin acreditación de servicio.
- Launcher loopback independiente crea cuentas sintéticas/DB nueva y guarda archivos 0600 fuera de Git; no ejecuta transferencias.
- Constancia con recepción/revisión separadas y sin datos del receptor; ejemplo sintético marcado.
- 52 pruebas conjuntas aprobadas, 1 histórico optativo omitido; 8 comprobaciones Android nativas, con Socket.IO y PDF reales de laboratorio.
- Guía humana de QR privado y prueba voluntaria; recepción real y prueba física pendientes, sin cambios productivos.

## Piloto Yape 1.2.0 - barrera local y revisión detallada

- Prepara 009 aditiva: entorno piloto local, marcador privado, ventana, participante/Admin/recibo acotados y datos de recepción contrastados.
- Conserva bloqueo de producción, historial, deuda sintética e idempotencia previa; no conecta con Yape ni mueve dinero.
- QR externo 0600 vinculado por huella; ninguna credencial bancaria ni dato receptor en PDF/API de operaciones.

## Verificación visual Android de PDF

- El harness espera archivo/página y píxeles del documento renderizado, además de comprobar el PDF guardado; evita aprobar una captura de arranque negra.
- Distingue extracción accesible diferida de Google Viewer de un defecto del documento. Repetición completa: 7 comprobaciones nativas aprobadas, sin cambios productivos ni nuevas releases.

## Desarrollo 1.2.0 - PDF profesionales y validación conjunta

- Recibos y constancias A4 con identidad visual, estado real, referencias, hora de servidor y alcance explícito; sin datos tributarios inventados ni QR de validación inexistente.
- Genera cinco ejemplos sintéticos locales; pruebas de paginación y consumo ausente.
- Android emulado: 7 comprobaciones, incluidos Keystore, recuperación, SAF y visor PDF; 4 JUnit, lint sin errores.
- Documenta proveedores/sandbox, bloqueos comerciales y roadmap maestro; producción y APK anteriores intactas.

## Desarrollo 1.2.0 - integridad de referencias declaradas

- Una declaración sin verificar no reserva referencias ajenas: aviso de coincidencias y unicidad al confirmar, probada bajo concurrencia.
- Normaliza separadores y prioriza pendientes; conserva rechazo seguro del pago demostrativo antiguo.
- Regresión PostgreSQL 18: 30 aprobadas, 1 histórico optativo omitido; sin cambios productivos.

## Desarrollo 1.2.0 - declaración Yape e historial transparente

- Cliente móvil: importe y suministro, QR privado, referencia/comprobante PNG y recuperación por UUID tras respuesta perdida.
- Admin: historial, evidencia protegida, motivo y confirmación de revisión independiente, con prevención de dobles envíos.
- Las pantallas mantienen la deuda y distinguen registros históricos de operaciones simuladas.
- Flujo Chromium/API/SQL validado con Node 22: 3 pruebas, sin correos ni movimientos reales.

## Desarrollo 1.2.0 - operaciones de pago sin acreditación ficticia

- Separa demostraciones, declaraciones y verificación de los pagos históricos.
- Prepara migración aditiva 008, revisión Yape solo de laboratorio, evidencia protegida e historial.
- Añade contrato/simulador de proveedor con idempotencia y conciliación; cobros reales bloqueados.
- Conserva 2FA y sesión automática OTP; sin publicación, migraciones ni despliegues productivos.

Este archivo registra cambios publicados y comprobados. Para futuras versiones, añadir una entrada nueva arriba con su fecha y cambios relevantes, sin repetir los manuales.

## En desarrollo — Kubernetes local actualizado

### 28 de octubre de 2026 — integración de Kubernetes local en `main` (PR #21)

- Kubernetes queda documentado como opción de ejecución local mantenida en
  `main`, adicional a Compose, Render, Vercel y Neon; no comparte volúmenes,
  secretos, bases ni puertos.
- Guía principal reescrita para `main`: inicio rápido, detención sin borrar el
  clúster, recuperación tras reinicio u OOM y verificación antes de publicar.
- `start.sh` detecta el nodo detenido con un mensaje claro y espera hasta 60 s a
  que Kubernetes esté Ready, inclusive justo después de `docker start`.
- `k8s/local` se conserva como guía histórica del clúster del compañero;
  `k8s/avance19` es el flujo mantenido.
- `browser.cjs` explica cómo instalar Playwright si no está disponible.
- Pruebas: `test:k8s` 3/3, configuración 13/13, UI 2/2, documentos 4/4,
  chatbot 4/4, correo 66/66 entre sus suites, recibos 21/21, Android 49/49,
  firma release 7/7, verificación k8s 14/14, Chromium 4/4 y persistencia OK.
- Sin merge, sin despliegues nuevos y sin cambios en Neon/Render/Vercel.

### 24 de octubre de 2026 — prueba de main en la PC

- Copia de trabajo independiente desde `d6a6b83`, conservando la rama local y
  la estructura de Frontend/Admin/Backend/Shared/Base-de-Datos y Compose.
- Kubernetes reutiliza los manifiestos existentes y reconoce las herramientas
  privadas de `.local/k8s/bin/`; guía de descarga actualizada a la rama de
  integración.
- Imágenes reconstruidas desde las fuentes actuales; cuatro Deployments Ready
  en kind `hidro-avance19`, con PostgreSQL nuevo y cuentas sintéticas.
- Pasaron configuración (13), documentos (4), importes (1), verificación
  funcional, Chromium y persistencia al recrear el Pod DB sin reiniciar la API.
- Rama `feature/k8s-local-actualizado` excluida de despliegues Git Vercel en
  ambas raíces. Publicación pendiente de revisar las automatizaciones Render.
- Evidencia y límites en `docs/pruebas/kubernetes-main-actualizado.md`.

### 28 de octubre de 2026 — repetición y portabilidad para otra laptop

- Repetición local: cuatro Pods Ready tras arrancar el nodo detenido, `start.sh`
  idempotente, 14 comprobaciones de `verify.cjs`, Chromium y persistencia.
- `test:config` 13/13, `test:ui` 2/2 y `test:documents` 4/4.
- Guía para el compañero: rama de clonación, Node/RAM/puertos/disco requeridos,
  build y verificación de imágenes, Playwright real y recuperación tras
  reinicio o falta de memoria. `start.sh` explica qué construir si faltan
  imágenes en vez de fallar con un error de Docker.
- No cambia código de la aplicación; el nodo se detuvo por `Exited 137` y se
  recuperó sin perder PVC ni datos sintéticos.

## En desarrollo — auditoría y endurecimiento 2FA (sin lanzamiento)

- Admin: segundo factor antes de cargar permisos, QR y gestión de su propia cuenta,
  UI compartida accesible, sesión web solo en memoria y alta administrativa cerrada
  por defecto. Promocionar un usuario conserva su factor y exige login nuevo.
- Downgrade reproducido en Docker aislado; comprobación de candidato rechaza el
  backend antiguo. La imposición externa en todos los despliegues/rollbacks sigue
  pendiente y bloquea una activación productiva segura.
- Cierre verificado: 80 pruebas backend aprobadas y 1 histórica omitida; 45 cliente,
  6 UX y 8 runtime, más 4 focalizadas Admin. WebView nativa: 6 comprobaciones 2FA y
  12 OTP; Java 21/Gradle y lint sin errores. Ninguna release nueva.
- Custodia: cifrado v2 con identificador de clave, lectura v1/anillo anterior,
  respaldo cifrado independiente, restauración 0600 y recifrado SQL transaccional.
  25 pruebas focalizadas aprobadas; dump/restauración aislada conserva 16 tablas,
  8 secuencias, fotografía, metadatos MFA y claves recuperadas.
- Recuperación sin factores: procedimiento humano y límites documentados; sin
  bypass por correo/suministro ni endpoint administrativo de emergencia.
- Corregidas carreras demostradas: socket pendiente tras revocación, petición
  de gestión con versión obsoleta y respuesta que repoblaba códigos tras logout.
- JWT ligado al rol vigente; la migración 007 pendiente incorpora revocación
  persistente al cambiar rol/estado, sin modificar las cuentas al aplicarla.
- Retención acotada de material temporal, sin borrar versiones de seguridad ni
  pasos TOTP. Regenerar recuperación requiere autenticador disponible; un código
  de recuperación sigue permitiendo desactivar de forma segura si se perdió.
- Pruebas focalizadas: 27 backend Node 22 y 18 Chromium aprobadas. Se conserva
  OTP/sesión automática y las APK existentes. Sin producción ni publicación.
- [Auditoría y trabajo pendiente](docs/pruebas/auditoria-2fa-seguridad.md).

## En preparación — 2FA opcional (propuesta 1.2.0 / código 6)

- Perfil: «Seguridad de la cuenta → Verificación en dos pasos», QR privado,
  confirmación TOTP, recuperación de un solo uso y desactivación con contraseña
  reciente más el factor existente. El secreto se cifra con AES-256-GCM en servidor.
- Login: desafío opaco de cinco minutos, sin JWT hasta completar el segundo
  factor; límites persistentes, prevención de reutilización y revocación de sesiones
  y sockets anteriores al cambiar 2FA. Usuarios sin factor mantienen el login.
- Migración manual 007 aditiva y esquema inicial; solo probados en PostgreSQL 18
  aislado. Nuevas activaciones cerradas por defecto; ningún cambio en Neon/Render.
- Se conserva la sesión automática tras OTP de 1.1.2 y su APK firmada intacta.
  Actualización compatible de `body-parser` 2.3.0 → 2.4.0; audit sin vulnerabilidades.
- [Informe, pruebas nativas y límites para publicar](docs/pruebas/seguridad-totp.md).

## 1.1.2 — candidata local, 24 de octubre de 2026

- OTP confirmado: la API entrega un JWT de ocho horas solo después del COMMIT,
  tras comprobar nuevamente usuario activo, rol y suministro. Se conserva el
  contrato anterior; la consulta pública y los OTP repetidos nunca recuperan tokens.
- Cliente: usa la sesión segura existente y entra al dashboard sin otro login,
  limpia el formulario y muestra la bienvenida. Ante respuesta perdida, backend
  anterior o fallo de almacenamiento, conserva una recuperación segura por login.
- Android 1.1.2/código 5: candidata local con certificado permanente y API HTTPS;
  no sustituye la APK 1.1.1. Pruebas de API/SQL aislado, Chromium, WebView Android,
  Keystore, reinicio/logout, Gradle y lint verificadas. Sin cambios en producción,
  esquema PostgreSQL, correo, outbox ni flags de registro.
- [Resultados y límites de la validación](docs/pruebas/android-otp-sesion-automatica.md).

## En desarrollo — mejoras de interfaz

### 23 de octubre de 2026 — referencias copiables e importes legibles

- Cliente: acciones para copiar los datos del recibo y el código de operación
  desde el detalle, el historial de pagos y la confirmación, con Clipboard API
  y respaldo para WebView. Los avisos reutilizan el sistema accesible existente.
- Cliente/Admin: importes en formato es-PE con separador de miles y dos decimales;
  los valores inválidos se muestran como cero sin romper la vista.
- Se conserva `test:receipts` de `main` junto a `test:ui`; el conflicto de
  `package.json` queda resuelto sin eliminar scripts de ninguna rama.
- Validación focalizada: configuración, chatbot, documentos e interfaz compartida.
  Sin cambios de API, base de datos, secretos, despliegues ni APK.

## 1.1.1 — prerelease para prueba por Internet

- APK publicada como prerelease v1.1.1, tag en 40ea51e, sin sustituir la estable
  v1.0.0. Descarga autenticada y checksum comprobados; prueba física pendiente.
- Android: versión 1.1.1/código 4, API pública HTTPS y certificado permanente
  compatible con 1.0.0/2 y candidatas 1.1.0/3; no se sobrescriben APK anteriores.
- Backend Gmail del PR #8 desplegado manualmente en Render desde `4b0781e`,
  con credenciales en secret file y claves anteriores conservadas. Registro y
  worker permanecen apagados hasta aprobar su alojamiento sin coste.
- Respaldo productivo cifrado y restauración aislada comprobados. 003–006 ya
  presentes, sin migraciones repetidas ni cambios en datos históricos/fotografías.
- 48 comprobaciones de correo/outbox Node22/PostgreSQL18 y 24 de firma/transición
  e interfaz Chromium aprobadas. Compilación, unitarias Android y lint aprobados;
  prueba física con datos móviles y OTP real pendientes. No se enviaron correos.

## En desarrollo — verificación de correo

### 23 de octubre de 2026 — alternativa de secreto privado para el montaje Render

- La proyección real no cumple las condiciones del lector protegido. Se admite
  GMAIL_CREDENTIALS_JSON como variable secreta del servidor, validada y copiada a
  archivo efímero 0600 sin relajar el lector de archivos ni seguir enlaces externos.
- El JSON se retira del entorno de API y worker hijos. No se imprime ni se incluye
  en Docker, Git, frontend o APK. El secret file existente se conserva.
- 60 comprobaciones Node22/PostgreSQL18 aprobadas, incluidos JSON inválido, alcance
  excesivo, tamaño, permisos privados, procesos reales y regresiones OTP/outbox.

### 23 de octubre de 2026 — montaje de secretos proyectados de Render

- El primer deploy del supervisor rechazó el secret file con ELOOP: Render lo
  proyecta mediante un enlace. Se permite resolver únicamente dentro del volumen
  protegido de secretos; destinos externos y directorios escribibles por terceros
  siguen rechazados. La copia del worker conserva permisos 0600.
- 59 comprobaciones Node22/PostgreSQL18 aprobadas, incluidos enlace del proveedor,
  escape del volumen y permisos inseguros. La versión previa siguió atendiendo
  durante el fallo; sin envío ni cambios de datos por ese despliegue fallido.

### 23 de octubre de 2026 — supervisor gratuito de API/worker y canario Gmail

- Opt-in de dos procesos dentro de la instancia existente de Render, autorizado
  por el propietario sin contratar servicios. API espera readiness del worker;
  una caída cierra ambos para recuperar el contenedor completo sin repetir envíos.
- SIGTERM drena HTTP/Socket.IO/PostgreSQL y el worker; timeout limitado solo sobre
  hijos propios. Secret file copiado exclusivamente a una ruta efímera 0700/0600.
- Canario por correo aplicado antes de SQL en altas y antes de Gmail en transporte;
  reenvíos respetan la restricción. No cambia TTL, intentos, outbox, Resend o JWT.
- 58 comprobaciones Node22/PostgreSQL18 aislado aprobadas y cuatro verificaciones
  de imagen final: arranque, caída del worker, recuperación y parada real Docker.
- Activación productiva limitada y confirmación física se documentan aparte;
  no se asume entrega Gmail ni registro general antes de la evidencia del propietario.

### 23 de octubre de 2026 — conservar y renovar la autorización Gmail sin exigir identidad

- Corrige la pérdida del grant cuando tokeninfo omite email/sub con solo gmail.send.
  Conserva ambos tokens en archivos privados 0600 y registra por separado que la
  identidad no está verificada automáticamente; no usa getProfile ni otros permisos.
- Reutiliza credenciales existentes, verifica renovación/audience/scope y conserva
  el archivo anterior ante errores. Escrituras atómicas y PKCE/state mantenidos.
- El backend admite el estado explícito scope_only; el remitente sigue fijado en
  el endpoint Gmail. Registro y worker locales permanecen desactivados.
- 17 pruebas focalizadas simuladas aprobadas con Node22; consentimiento, renovación
  real y carga de credenciales locales comprobados. Sin correos, cambios Render/Neon
  ni secretos versionados.

### 23 de octubre de 2026 — fijar identidad del remitente Gmail autorizado

- Cuenta Cloud y proyecto existentes comprobados; Gmail API ya habilitada. Identidad
  inmutable del remitente guardada solo en configuración privada 0600.
- OAuth exige email exacto o subject Google comprobado, scope exclusivo gmail.send
  y proyecto de escritorio coincidente. Sin identidad demostrable no guarda tokens;
  el worker rechaza credenciales no verificadas. No se usan tokens del conector.
- Cliente OAuth/consentimiento pendientes del navegador; sin correos ni cambios
  productivos en Neon o Render.
- 16 pruebas focalizadas aprobadas con Node22/PostgreSQL18 aislados: cuenta y
  proyecto incorrectos rechazados, identidad obligatoria y worker simulado compatible.

### 23 de octubre de 2026 — Gmail API preparado, sin activar envíos

- Proveedor Gmail opcional en el worker; Resend sigue predeterminado. MIME UTF-8,
  OAuth de escritorio con PKCE y solo gmail.send; tokens en archivos privados 0600.
- Proveedor congelado dentro del payload cifrado; Gmail no repite envíos ambiguos
  ni leases recuperados. Se conservan OTP, outbox, límites y seguridad de main.
- 54 comprobaciones locales Node22/PostgreSQL18 aprobadas y construcción Docker
  verificada; incluidos worker Gmail independiente simulado y confirmación OTP.
- CLI Google Cloud aislada preparada. Cuenta/proyecto Cloud, cliente y consentimiento
  reales pendientes de acceso del propietario; no se enviaron correos, no se activó
  Render ni se modificó Neon. Procedimiento y límites en docs/gmail-otp.md.
- Rama de preparación actualizada con main `c5301c6`; conflictos resueltos por
  archivo conservando el cierre de altas, los avances del equipo y ambos proveedores.

### 22 de octubre de 2026 — avance 24: diagnóstico y respaldo preparados

- Draft PR #6 abierto desde la rama de preparación, sin fusión. Vercel conserva
  cero despliegues de la rama y Render mantiene autodespliegue/previews apagados.
- Diagnóstico SQL manual READ ONLY con identidad esperada, catálogo, conteos,
  secuencias, huellas y preflight 005; no se conecta ni se ejecuta en Neon.
- Cinco grupos locales aprobados con datos sintéticos: guardias, esquema previo,
  migraciones, conservación/restauración de filas/FKs/secuencias y PNG/MIME,
  más include psql real. Ensayos iniciales corregidos y conservados localmente.
- Plan y autorizaciones por etapas en `docs/pruebas/preproduccion-avance-24.md`:
  copia real cifrada/restaurable aún pendiente, sin rollback al backend antiguo;
  parada temprana de worker 137 documentada. Código probado en avance 23 intacto.
- Sin respaldo real, consultas Neon, migraciones/despliegues productivos, correo,
  cambios Kubernetes o APK. Dumps/credenciales/evidencias excluidos de Git.

### 22 de octubre de 2026 — avance 24: proteger publicación de preparación

- Exclusión explícita de `preparation/backend-avance-23` en ambos JSON Vercel,
  conservando las protecciones anteriores y todas las opciones de build.
- Proyectos/builds Vercel y Render inspeccionados en lectura; Render mantiene
  main con autodespliegue/previews apagados. Sin workflows/hooks de GitHub.
- Se conservan los tres commits del avance 23 y su evidencia de 75 pruebas
  aprobadas/una omisión. No cambia el backend ni se repiten suites extensas.
- Publicación/PR Draft de preparación autorizados; sin merge, cambios en Neon,
  despliegues, correo real, APK ni intervención en Kubernetes.

### 22 de octubre de 2026 — avance 23: backend y migración ensayados en aislamiento

- Imagen candidata Node 22 y PostgreSQL 18: migraciones 003–006 repetidas,
  filas históricas sintéticas/FKs/secuencias conservadas y dos respaldos
  restaurados en bases nuevas. 005 rechaza inconsistencias sin corregir datos.
- Suite final: 75 aprobadas, cero fallidas y una omisión condicional; modo
  histórico separado 12/1 inversa. API/Admin/Socket.IO, cinco grupos Chromium,
  chatbot, pagos, incidencias y documentos comprobados sobre la candidata.
- OTP probado con API/worker separados y proveedor sin HTTP real; altas
  principales cerradas. Se documenta parada temprana 137 y parada lista 0.
- Harnesses locales con guardias y plan por etapas en
  `docs/pruebas/backend-produccion-avance-23.md`: respaldo real, auditoría 005,
  configuración y recuperación diferenciada de código/datos aún pendientes.
- Render inspeccionado solo en lectura, live antiguo y automatismos apagados.
  Sin cambios en Neon, despliegues, nueva APK, merge, PR ni push; commits solo locales.

### 22 de octubre de 2026 — avance 23: corregir dependencia de validación IPv6

- Auditoría npm: aviso moderado GHSA-rxp7-6hxx-x8q5 en `ip-address`,
  transitiva de `express-rate-limit`. Lockfile actualizado únicamente de
  10.7.3 a 10.7.4 dentro del rango existente, sin nuevas dependencias.
- Instalación limpia, auditoría npm y suite Node 22 repetidas; evidencia y
  límites en el informe del avance 23. Sin cambios remotos ni despliegues.

### 22 de octubre de 2026 — avance 23: exigir activación explícita de altas

- Reproducido en Docker aislado: con secretos de correo válidos y bandera ausente,
  el backend aceptaba un registro (202). Ahora solo `EMAIL_REGISTRATION_ENABLED=1`
  habilita altas/reenvíos; ausencia u otro valor mantiene 503 sin encolar.
- Plantillas con altas/worker detenidos y claves separadas; al actualizar se
  conserva el secreto JWT vigente. Fixtures OTP habilitados de forma explícita.
- Regresión de ausencia de bandera con PostgreSQL sintético, contrato, sesión y
  outbox. Sin cambios productivos, merge ni push en este avance de preparación.

### 22 de octubre de 2026 — avance 21: preparar PR definitivo sin despliegue

- `main` excluido del despliegue Git en ambos `vercel.json` de la integración,
  conservando las otras exclusiones y campos. El cambio protege el futuro
  commit de fusión; no modifica main ni servicios externos en este avance.
- Ancestro main y los 22 commits de PR #1 comprobados; revisión de servidor,
  HTML/chatbot/filtros y comandos sin cambios funcionales nuevos.
- Regresión: 66 pruebas aprobadas y tres de Perfil aprobadas al indicar la
  caché Chromium existente; el primer intento falló por ruta de herramienta.
- Auditoría de historial, esquema/migraciones, evidencia Android/Kubernetes y
  pendientes productivos en `docs/pruebas/integracion-main-avance-21.md`.
- Se prepara un Draft PR independiente; la fusión con merge commit conserva
  el historial y requiere autorización posterior. PR #1 no se fusiona aparte.

### 22 de octubre de 2026 — avance 20: protección de la rama integrada

- Exclusión explícita de `integration/avance-18` en ambos `vercel.json`,
  conservando la protección de `feature/verificacion-correo` y la política de
  las demás ramas. Sintaxis JSON y comparación con la configuración previa
  comprobadas; no se cambian servicios ni credenciales.
- Guía Kubernetes con clon independiente, descarga de PostgreSQL y comprobación
  básica de cuatro servicios; sin depender de archivos privados de otra laptop.
- Conexiones Git y últimos builds Vercel inspeccionados. Render confirmado en
  modo lectura: rama `main`, raíz `Backend`, autodespliegue y previews apagados.
  No se repiten suites funcionales ni se inicia o modifica un clúster.
- Evidencia y alcance de publicación en
  `docs/pruebas/publicacion-integracion-avance-20.md`.

### 22 de octubre de 2026 — avance 17: cierre de validación y actualización firmada

- Candidata final 1.1.0/3 compilada en salida exclusiva con recursos actuales,
  HTTPS y firma permanente; ambas APK anteriores intactas. Cuatro pruebas Java
  release, lint sin errores y auditoría de assets sin Admin/patrones de secretos.
- APK oficial 1.0.0/2 → install -r de la candidata sin desinstalar: mismo UID,
  certificado, fecha de primera instalación y preferencias. Seed/verify y prueba
  de Keystore en release aprobadas en AVD nuevo sin conectividad.
- Espera instrumental adaptada al arranque asíncrono; informe, checksum, causas
  de fallos del harness y resultados nativos/Chromium separados. Pruebas finales
  focalizadas: 31 aprobadas. Pendientes físicos/productivos y conflictos del PR
  documentados; sin distribución, despliegue ni integración con main.

### 22 de octubre de 2026 — avance 17: ubicación Android y coordenadas seguras

- Timeout reproducido con permisos/proveedor GPS operativo: petición BALANCED
  fría sin posición de red; alta precisión activa GPS y recibe coordenadas del AVD.
  Android pide alta precisión a demanda, sin nuevos plugins/permisos y manteniendo
  ocho segundos. La validación en teléfono físico continúa pendiente.
- Corregida reutilización de coordenadas antiguas después de un intento fallido,
  reproducida en SQL. Mensajes de permiso/proveedor/timeout, búsqueda única y
  descarte de callbacks después de cerrar/enviar/reiniciar el formulario.
- Ocho comprobaciones nativas aprobadas: GPS/denegación/proveedor apagado, foto,
  sesión/navegación, recibo/pago, PDF real/SAF y cortes/notificaciones. Inspección
  visual del PDF confirmada en Docs; 26 comprobaciones Chromium cliente/Admin
  sin errores JS/recursos fallidos. Evidencia y límites en el informe del avance 17.

### 22 de octubre de 2026 — avance 17: recuperar registro OTP tras reinicio

- UUID y suministro pendientes persistidos antes del POST en un estado Android
  separado, cifrado y fuera de backup; sin OTP, contraseña, correo ni JWT.
  Recuperación consulta SQL antes de habilitar acciones, conserva UUID/idempotencia
  ante respuestas perdidas y respeta plazos/estados de la outbox sin modificarla.
- Confirmación, solicitud cerrada y abandono retiran metadatos. Lectura fallida
  impide crear otro UUID; respuestas tardías de un registro abandonado se descartan.
  Web conserva recuperación OTP de pestaña; autenticación sigue solo en memoria.
- Verificados 7 escenarios nativos OTP/Keystore y 12 de regresión de sesión,
  18 OTP/transición, 25 comprobaciones E2E cliente/Admin y suite Node 110 OK/una
  omisión condicional. Corregidas carreras del harness con SKIP LOCKED/botones
  ocupados; sin cambiar la outbox. Resultados y límites en el informe del avance 17.

### 21 de octubre de 2026 — avance 17: sesión Android cifrada y validada

- Reproducida pérdida de sesión y UUID OTP al terminar el proceso Android.
  JWT ahora solo en memoria web y cifrado con AES-GCM/Android Keystore en
  Android, fuera de backups; sin contraseña persistida ni dependencias nuevas.
- Restauración única mediante ruta aditiva `/api/auth/session`, antes de mostrar
  datos privados o conectar Socket.IO. Conserva TTL de ocho horas y cuentas
  históricas; 401/403 retiran credencial, errores temporales permiten reintentar.
  Logout espera borrado seguro y cancela datos/peticiones de la identidad anterior.
- Bridge sin logging también en debug; pruebas de carreras de sesión, API/SQL,
  cifrado instrumental y ciclo de vida de WebView real. Informe de resultados y
  límites en `docs/pruebas/android-sesion-persistente.md`. OTP durable y ubicación
  continúan en incrementos separados; sin despliegue ni distribución.

### 21 de octubre de 2026 — avance 16: compilar y validar Android 1.1.0 nativo

- APK release 1.1.0/código 3 compilada localmente con runtime recién generado,
  Java 21 y firma permanente verificada contra la APK oficial 1.0.0/código 2.
  ApplicationId, certificado, diseño, permisos y API HTTPS conservados; sin publicar.
- AVD Android 15 independiente: actualización mediante install -r sin desinstalar,
  dos fases instrumentales aprobadas, localStorage del tutorial/marcador conservado,
  misma identidad interna y primera instalación. Nueva prueba instrumental opt-in.
- Segundo AVD y APK debug con API/PostgreSQL aislados y Resend simulado: registro,
  cola/OTP/reenvío/vencimiento, desconexión, login, perfil, teclado, Atrás, rotación,
  Socket.IO, recibos/pago, cortes/notificaciones y PDF guardado y abierto en visor real.
  Photo Picker y denegación de ubicación probados; obtención de posición con
  permiso concedido quedó sin aprobar por timeout del AVD, documentada para seguimiento.
  Reapertura de proceso conserva tutorial y exige login; el UUID OTP en
  sessionStorage se pierde, con solicitud SQL intacta. Persistencia durable pendiente.
- Corregido CRC del PNG sintético del E2E; sin cambios de lógica de negocio.
  Regresión Node: 113 aprobadas/una omisión condicional, sin fallos. E2E Chromium
  repetido: 25 comprobaciones, cero errores JS/recursos fallidos. Java: cuatro
  pruebas por variante; lint sin errores, con avisos previos. Prueba instrumental
  existente de paquete ejecutada en Android, además de las dos fases de actualización.
- Informe `docs/pruebas/android-1.1.0-nativo.md` y guías Android actualizados con
  checksums, evidencia, resultados nativos separados de Chromium y requisitos
  pendientes. Sin APK versionada, Release, correo real, despliegue, merge,
  cambios de Neon/Kubernetes ni cambios de servicios Docker existentes.

### 21 de octubre de 2026 — avance 15: preparar candidato Android 1.1.0

- Gradle propone versionName 1.1.0 / versionCode 3 frente a la release 1.0.0/2;
  conserva applicationId, namespace y certificado público permanente. Sin cambiar
  SDK, permisos, Capacitor, claves privadas ni artefactos ya publicados.
- Tres pruebas estáticas/de empaquetado comprueban incremento, identidad, firma
  pública, configuración Capacitor HTTPS y runtime OTP limpio sin código Admin.
  No equivalen a compilar, firmar, instalar ni ejecutar Android nativo.
- Documentación Android/release y plan coordinado actualizados; sin APK generada,
  tag, distribución, despliegue, correo real ni cambio en main/servicios/datos.

### 21 de octubre de 2026 — avance 15: transición del contrato Android y recuperación

- H01 reproducido con HTML/JS v1.0.0, PostgreSQL aislado y proveedor simulado:
  202 mostrado como error, solicitud sin pantalla OTP; login previo conservado.
- Rutas OTP específicas y cabecera de contrato; APK antigua recibe 426 legible
  antes de escribir. Preflight y ausencia de fallback impiden registrar sin OTP
  contra API antigua, incluso si cambia entre la consulta y el POST. Login intacto.
- UUID criptográfico persistido antes de enviar y registro idempotente con locks;
  respuesta perdida se recupera por estado, sin duplicar evento, hash o cuota.
  Recuperación de reenvío/confirmación, caducidad, intentos y desconexiones.
- CORS admite la nueva cabecera solo en orígenes autorizados. Timeout y limpieza
  de peticiones públicas, sin logout por errores OTP/red ni reintentos automáticos.
- Backend Node 20/22: TAP 66, 65 OK, una omisión condicional H02; tres contenedores
  de subpruebas incluidos. Transición/sesión: 18 pruebas; cinco perfiles emulados.
  Chromium cliente/admin: 25 comprobaciones; configuración/PDF/firma/Perfil OK.
- Plan Android/API/trabajador y límites documentados. Sin migración nueva,
  cambios de negocio, servicios, Neon, correos reales, APK ni merge. Candidato
  1.1.0/código 3 propuesto; preparación nativa en el siguiente incremento.

### 18 de octubre de 2026 — avance 14: integrar correo mediante Transactional Outbox

- H03 corregido en desarrollo: registro/reenvío confirman solicitud, reserva y
  evento cifrado en una transacción; la API ya no envía correos. El trabajador
  independiente solo procesa eventos confirmados, sin activación automática.
- OTP de seis dígitos, cinco minutos desde el primer claim confirmado, plazos
  obtenidos de PostgreSQL y presupuesto monótono; cola demorada no agota vigencia.
  Cancelación al sustituir/consumir, clave AES exclusiva y eliminación de payload
  terminal. Reintentos conservan cuerpo/identidad/vencimiento y máximo cinco intentos.
- HTTP 202 significa encolado; consulta privada de estado y cliente actualizado
  distinguen en cola/aceptado/errores sin prometer entrega. Retención protege
  trabajos activos y admite las FKs esperadas de 006; sin cambios en pagos/recibos.
- Node 20.19.2 y Node 22.23.3: TAP 61, 60 OK y una omisión condicional H02;
  incluye dos contenedores de subpruebas. Outbox: 19 escenarios PostgreSQL/API
  independientes; variante H02 legacy: 12 OK y una omisión del esquema alternativo.
  Casos de COMMIT fallido, dos procesos, SIGKILL/reinicio, SIGTERM durante HTTP,
  ambigüedad, reenvío intercalado, privacidad y rol sin acceso a negocio aprobados.
- Esquema/API/retención/CLI y simulación terminal aprobados. Configuración 13,
  documentos 4, firma 7 y Perfil 3 pruebas OK. Chromium: 25 comprobaciones, sin
  errores JS ni recursos fallidos. Runtimes web/Android temporales: 15 archivos
  cada uno, sin secretos ni código administrativo; no APK compilada.
- Migración 006 preparada y validada solo en bases nuevas: conserva datos previos,
  es repetible y revierte por timeout sin estado parcial. Guías de registro,
  auditoría, outbox, retención, permisos, habilitación y recuperación actualizadas.
- Pendientes: autorización/configuración productiva, dominio, monitoreo y H01
  (APK v1.0.0). No se promete entrega exactamente una vez ni recepción SMTP.
  Sin correos reales, Neon, despliegues, workers/cron productivos, APK ni merge.

### 18 de octubre de 2026 — avance 14, base transaccional de correo

- H03 reproducido antes de cambiar el registro: aceptación simulada seguida de
  fallo previo al commit deja cero solicitudes y el reintento usa otra identidad.
- Migración 006 aditiva y manual; cola cifrada AES-256-GCM con clave exclusiva,
  trabajador independiente desactivado por defecto, leases recuperables,
  idempotencia estable, backoff, cinco intentos y plazos de envío acotados.
- Fundación comprobada: 26 pruebas de correo/outbox aprobadas en Node 20;
  16 pruebas focalizadas de outbox/adaptador aprobadas en Node 22, con ocho
  escenarios PostgreSQL en bases nuevas y proveedor simulado. No correos reales.
- Este primer incremento prepara los componentes; la integración del registro,
  cliente y retención se completa en el siguiente incremento del avance 14.
  H03 todavía no se declara corregido en el flujo HTTP en este punto.

### 18 de octubre de 2026 — avance 13: corregir integridad concurrente de recibos y pagos

- H02 reproducido antes de corregir: dos altas 201/201, edición que deja recibo
  de S/ 20 con pago de S/ 10 y anulación/edición aceptadas después de pagar.
- Servicio transaccional para las cuatro escrituras: suministro y después recibo,
  relectura de pagos tras el lock, monto del servidor y verificación de propiedad.
  Conflictos 409 sanitizados, tiempos acotados, rollback y liberación de conexión.
- UNIQUE suministro/periodo y pago/recibo en bases nuevas. Migración 005 manual
  con preflight, rechazo de históricos inconsistentes y validación de drift;
  sin reconciliación automática ni cambios en bases existentes.
- H02: 21 pruebas aprobadas y una condicional omitida en Node 20 y Node 22;
  variante de esquema anterior: 12 aprobadas y una condicional omitida. Incluyen
  dos procesos, permisos, carga mixta, timeout, rollback, pool liberado, cero
  deadlocks observados y conservación de tablas/FKs/secuencias en migración.
- Regresiones de configuración, correo, esquema/API, retención/CLI, documentos,
  firma y Perfil aprobadas; Chromium cliente/admin: 25 comprobaciones sin
  errores JS ni recursos fallidos. Guías y seguimiento de auditoría actualizados.
- Sin Neon, despliegues, correos reales, cambios APK, borrado de históricos o merge.

### 18 de octubre de 2026 — avance 12: auditoría de preparación para producción

- Informe `docs/auditoria-produccion.md` con alcance, evidencias, 7 hallazgos altos,
  9 medios y 2 bajos, plan correctivo, transición Android/backend, checklist de
  despliegue y recuperación. Dictamen: nueva versión no lista para producción.
- Reproducidos en bases sintéticas nuevas: recibos duplicados concurrentes,
  anulación intercalada con pago y envío simulado aceptado sin commit persistido.
  Comprobados rechazo del contrato 202 por cliente v1.0.0, cabeceras CORS,
  bloqueo controlado de 003 y conservación de tablas previas con 003/004 repetidas.
- Regresiones aprobadas: configuración, correo, esquema/API, retención/CLI,
  documentos, firma y Perfil; harness Chromium con 25 comprobaciones, cero
  errores JS y recursos fallidos; runtimes cliente de 15 archivos por destino.
  Consultas npm sin avisos conocidos; límites de la evidencia detallados.
- Solo documentación: sin correcciones funcionales, correos reales, migraciones
  Neon, limpieza de bases existentes, programación, despliegues, APK ni merge.

### 18 de octubre de 2026 — comando de mantenimiento preparado

- Comando de un solo lote con simulación predeterminada y aplicación explícita;
  exige conexión privada exclusiva y nombre de base esperado, sin reutilizar
  `DATABASE_URL`, leer `.env` ni cargar la API o las credenciales de correo.
- Opciones estrictas, TLS verificado en conexiones externas, tiempos de espera
  acotados y salida de conteos sin datos personales ni errores SQL privados.
- Unitarias de correo/configuración y tres grupos CLI en PostgreSQL aislado
  aprobados: simulación, destino erróneo, cascada, idempotencia, dos procesos
  simultáneos, manejo de errores y privacidad de stdout/stderr.
- Procedimiento y contrato de salida listos para un planificador futuro; ninguno
  activado. Sin limpiezas de bases existentes ni cambios en infraestructura/APK.

### 18 de octubre de 2026 — retención segura de solicitudes de correo

- Núcleo de mantenimiento con simulación de solo lectura por defecto y retención
  mínima de 24 horas después de vencer la solicitud; conserva OTP vigentes y
  cualquier historial necesario para límites de envío.
- Lotes acotados, exclusión entre tareas, filas bloqueadas omitidas y revalidación
  antes del borrado. Solo elimina pendientes antiguos y su historial por cascada;
  dependencias inesperadas cancelan la tarea y los errores revierten el lote.
- Índice de vencimiento en bases nuevas y migración 004 aditiva preparada, sin
  aplicarla a bases existentes. Política y pruebas documentadas; sin programación.
- Unitarias de correo/configuración, esquema/API y seis grupos de retención en
  PostgreSQL aislado aprobados: concurrencia, idempotencia, rollback, límites,
  registros en curso y conservación de tablas de negocio con fixtures sintéticos.

### 18 de octubre de 2026 — prueba real OTP con Resend aprobada

- Verificado el último informe privado: modo `live`, resultado
  `prueba_real_aprobada`, dos envíos aceptados y nueve comprobaciones aprobadas.
- Caducidad de 300 segundos comprobada mediante espera real; códigos incorrecto
  y vencido rechazados sin crear cuenta. Reenvío con nuevo código sin reiniciar
  intentos; confirmación concurrente de consumo único y registro íntegro de
  usuario verificado y suministro, sin duplicados ni huérfanos.
- Login y perfil protegido de la cuenta nueva aprobados; contraseña incorrecta
  rechazada y compatibilidad de login con cuenta previa sintética conservada.
- Informe de pruebas actualizado con resultados y referencia verificable a la
  evidencia local. Validación documental: campos y nueve comprobaciones cotejados
  con el ejecutor, revisión del diff y exclusión de secretos/datos personales.
  No se repitieron correos ni se publicaron archivos de `artifacts/`.

### 18 de octubre de 2026 — preparación de prueba real privada

- Ejecutor de terminal para Resend real con confirmación previa de dos envíos,
  API Key por variable privada y OTP con entrada oculta. Base nueva por ejecución,
  servidor en loopback e informes sin credenciales, códigos ni datos personales.
- Procedimiento de caducidad tras cinco minutos reales, código incorrecto,
  confirmación concurrente, integridad PostgreSQL, login/perfil y cuenta previa.
- Ensayo con proveedor simulado y preparación aislada aprobados; envío real
  pendiente de autorización y credenciales. No se atribuye entrega real al ensayo.
- Unitarias de correo/configuración, esquema/API PostgreSQL, 25 comprobaciones
  Chromium, tres de Perfil, cuatro de documentos y firma Android aprobadas.
  Perfil usa la caché de Chromium ya instalada; restricciones del sandbox resueltas
  ejecutando las pruebas autorizadas fuera de él. Detalle en
  `docs/pruebas/2026-10-18-resend-otp.md`.

### 18 de octubre de 2026 — OTP vigente cinco minutos

- Vigencia del OTP reducida de 600 a 300 segundos; textos del correo y del cliente
  actualizados a cinco minutos, junto con las pruebas y documentación afectadas.
- Validación: `npm run test:email` y `git diff --check`.

### 18 de octubre de 2026 — impedir previews automáticas

- La auditoría remota detectó que la integración Vercel existente creaba previews
  automáticamente al hacer push, pese a que no se ejecutaron comandos de despliegue.
  En `a7ebcae`, la preview Admin terminó y la del proyecto `sedapal` falló por
  buscar `Backend/scripts/build-web.js` desde una raíz de proyecto incompatible.
- Despliegues Git deshabilitados para `feature/verificacion-correo` en la raíz
  y en `Backend/vercel.json`; regla persistente para revisar automatizaciones
  antes del primer push de futuras ramas. No se reintenta el build de la preview.
- Configuración JSON y diff revisados; auditoría final registrada en el PR.

### 18 de octubre de 2026 — cliente web/Android y validación completa

- Pantalla de verificación con entrada OTP, errores accesibles, reenvío con
  cuenta regresiva y protección contra doble envío. Confirmar retorna al login.
- Recuperación temporal del registro tras recargar con `sessionStorage`, sin
  guardar contraseñas ni códigos; limpieza al confirmar, reiniciar o iniciar sesión.
- Harness de cliente/admin adaptado al nuevo contrato, con proveedor simulado
  exclusivamente en pruebas y bases sintéticas nuevas por ejecución.
- Chromium: 25 comprobaciones aprobadas; sin errores JavaScript ni recursos
  fallidos. Pantalla OTP validada a 360, 390, 412, 768 y 1366 píxeles, incluyendo
  accesibilidad de campos y controles sin desbordamiento horizontal.
- Runtimes web y Android generados y verificados sin código administrativo ni
  secretos del servidor; pruebas de configuración, OTP/Resend y firma aprobadas.
- Configuración, límites, compatibilidad con APK previa y pasos pendientes de
  autorización documentados. Sin merge ni cambios en Neon; previews automáticas
  detectadas posteriormente y registradas en la entrada de auditoría.

### 18 de octubre de 2026 — API de registro y confirmación

- Registro devuelve una solicitud pendiente (202); solo la confirmación válida
  crea usuario y suministro juntos (201). No se emite JWT antes de confirmar.
- Rutas de confirmación y reenvío; vencimiento, intentos persistentes, límites por
  IP/correo/suministro y bloqueos PostgreSQL para solicitudes concurrentes.
- Reenvío invalida el código anterior sin reiniciar intentos; consumo único y
  limpieza del hash de contraseña pendiente tras confirmar o sustituir solicitud.
- Fallos de envío revierten la transacción. Configuración ausente devuelve 503,
  sin permitir registros sin verificación. Cuentas previas conservan su acceso.
- API HTTP real probada con Resend simulado y PostgreSQL nuevo: caducidad,
  concurrencia, reintentos de código, límites, conflictos, login y bloqueo admin.
  Pruebas unitarias y regresión de configuración aprobadas.

### 18 de octubre de 2026 — proveedor Resend

- Adaptador HTTPS de Resend con correo de verificación en texto y HTML accesible,
  timeout de 10 segundos por intento y un reintento para fallos transitorios.
- Cuerpo y clave de idempotencia conservados durante el reintento; errores
  permanentes sin reintento y mensajes sin datos sensibles del proveedor.
- Variables privadas exclusivamente en el backend; ejemplos vacíos y paso de
  configuración en Docker Compose. No se envían correos reales en las pruebas.
- Pruebas simuladas de envío, idempotencia, configuración, cuota, red y timeout.

### 18 de octubre de 2026 — esquema y códigos OTP

- Esquema inicial y migración aditiva `003_verificacion_correo.sql` para registros
  pendientes, historial de envíos y fecha de verificación. Sin ejecución en Neon.
- Códigos criptográficos de seis dígitos, HMAC SHA-256 ligado a la solicitud,
  comparación de tiempo constante y rechazo de formatos o secretos inválidos.
- Política: vigencia de 10 minutos, 5 intentos, 60 segundos entre envíos y hasta
  3 envíos por hora. El registro pendiente vence en una hora.
- Pruebas unitarias de generación, aislamiento por solicitud/secreto y entradas
  inválidas; regresión de configuración. Pruebas PostgreSQL en bases nuevas:
  migración repetible, conservación de cuenta previa y restricciones del esquema.

### 18 de octubre de 2026 — flujo de revisión

- Reglas persistentes de Git, seguridad y revisión incremental en `AGENTS.md`.
- Plan de verificación de correo con Resend y decisiones de seguridad documentados
  en `docs/verificacion-correo.md`.
- Validación: estado inicial limpio, rama existente comprobada y pruebas de
  configuración ejecutadas antes del commit. Sin cambios en producción.

## v1.0.0

Publicada el 8 de octubre de 2026. Referencia: [Release v1.0.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0), commit `135cb54173ee60e2f528738805564773e3c32e8b`.

- Primera APK release firmada permanentemente, versión Android `1.0.0`, `versionCode 2`.
- Aplicación Android exclusiva para clientes, con recibos, consumo, registros de pago, PDF, incidencias y atención.
- Panel administrativo independiente publicado en Vercel.
- Backend Node.js/Express publicado en Render y PostgreSQL de producción en Neon.
- API REST compartida con 41 rutas, incluidas 19 administrativas.
- Actualización en tiempo real mediante Socket.IO, con polling y WebSocket.
- Autenticación JWT, cuentas activas y autorización por roles `usuario`/`admin`.
- Distribución directa de la APK mediante GitHub Releases; sin publicación en Google Play.

La instalación y los flujos principales de la APK release fueron validados en un teléfono físico por el propietario. La infraestructura local Docker permanece independiente de producción.

## Avance 18 — auditoría de integración local

- Se documentan conflictos y riesgos antes de integrar main en un worktree aislado.
- Se conservan las ramas originales y los 22 commits; sin push ni despliegues.
- Evidencia y plan: `docs/pruebas/integracion-avance-18.md`.

- Integración de main conservando ambos historiales y resolución específica de servidor/comandos; chatbot y filtros preservados. Node: 114 OK/1 omisión; Chromium: 17 OK. Kubernetes aún pendiente de ajuste.

### Avance 18 — compatibilidad Kubernetes preparada

- Init generado desde SQL vigente, base/overlays coherentes y CORS Android.
- Worker OTP independiente preparado detenido, secretos externos y cierre explícito de altas por defecto; sin modificar cuentas/sesiones existentes.
- Verificador Kubernetes no usa registro legado ni promoción automática.
- Tres pruebas locales aprobadas: renderizado/controles, SQL nuevo y migraciones 003–006 repetibles, rechazo 503 sin encolar. No se ejecutó Kubernetes.

- Regresión del cambio operativo: 45/45 backend/contrato/sesión/outbox; solicitudes ya enviadas siguen consultables y confirmables durante la pausa.

### Avance 18 — contexto e imágenes locales

- Se excluyen secretos, respaldos y artefactos privados del contexto Docker.
- Tres builds locales y comprobaciones de contenido sin red aprobados; sin publicación, despliegue ni cambios a los servicios existentes.

### Avance 18 — regresión integrada y Android nativo

- Chatbot probado en DOM real Chromium/WebView: fuente oficial, prioridad de recibos y contenido tratado como texto. Filtros comprobados en ambos entornos.
- Android nativo: sesión 13/13, OTP 7/7, ubicación/funciones 9/9; PDF completo e inspeccionado en visor Android. Primer ensayo de automatización interrumpido documentado sin contarlo como aprobado.
- Regresión final Node: 114 aprobadas/1 omisión condicional; modo histórico separado 12/1 inversa. E2E Chromium 28 comprobaciones, sin errores. Node 22 en imagen: 56/1 más 18/18 de correo.
- Kubernetes: 31 recursos válidos con esquema estricto; sin clúster ni despliegues. Tres imágenes locales construidas y comprobadas.
- Informe y documentación Android/auditoría actualizados; release anterior conservada. Integración solo local: publicación, firma de release integrada, actualización desde 1.0.0 y operación Kubernetes pendientes.

## Avance 19 — Kubernetes local integrado verificado

- Arranque kind exclusivo `hidro-avance19`, kubeconfig privado, puertos 8084/8085 e imágenes del avance 18 reutilizadas, sin reconstrucción ni cambios al clúster del compañero/Compose.
- Fallback de importación de plataforma local para índices Docker/containerd incompletos; reutilización y guardia de Secret/PVC sin regenerar credenciales históricas.
- Web/Admin/backend/PostgreSQL listos; login/sesión, roles/19 rutas, recibos/pagos/incidencias, CORS, chatbot y Socket.IO comprobados mediante Kubernetes real y Chromium.
- Persistencia tras recrear Pod DB con PVC y filas conservadas; backend recuperado sin reinicios.
- API OTP interna y worker en Pods separados, base nueva/migraciones 003–006 y proveedor sin HTTP real: UUID idempotente, cola, confirmación y login aprobados; altas principales cerradas y fixtures detenidos.
- Informe `docs/pruebas/kubernetes-integracion-avance-19.md` y guía `k8s/avance19/README.md`; solo commit local, sin push, publicación de APK o intervención productiva.
