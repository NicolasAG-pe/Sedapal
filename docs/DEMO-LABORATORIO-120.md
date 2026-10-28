# Demostración local reproducible — 1.2.0 en desarrollo

Esta guía usa pantallas y contratos auténticos con datos sintéticos. No publica
una demo, no habilita pagos y no acredita validación en teléfono físico.
Base integrada y límites: [auditoría A](pruebas/auditoria-calidad-ux-120.md).

## Preparación

Usar un worktree independiente de la rama de auditoría. Requiere Node 22,
dependencias bloqueadas del repositorio/Backend, Playwright con Chromium como
herramienta de QA y PostgreSQL 18 exclusivamente de laboratorio. No cargar
`.env` privados ni usar el Compose, Neon o un PostgreSQL existente de la aplicación.

Crear un contenedor **nuevo**, con nombre que no exista, padre `hm_email_test`,
usuario `hm_fixture` y contraseña exclusivamente sintética
`fixture-only-not-production`; publicar 5432 solo en `127.0.0.1` y un puerto libre.
No montar volúmenes ni datos existentes. El harness crea otra base nueva por
ejecución y no borra las anteriores. Guardar el nombre del contenedor para
detener únicamente ese recurso al terminar, conservando sus datos.

Definir `HIDRO_EMAIL_TEST_DB_PORT` con su puerto y, si corresponde,
`HIDRO_PLAYWRIGHT_MODULE`/`PLAYWRIGHT_BROWSERS_PATH` con las herramientas locales.
No instalar frameworks ni recursos remotos en la aplicación para demostrarla.

Ejecutar el recorrido automático:

```bash
PUSH_REAL_DELIVERY_ALLOWED=0 PUSH_WORKER_ENABLED=0 PUSH_REMINDERS_ENABLED=0 \
  node scripts/test/quality-audit-flow.cjs baseline
```

Produce un directorio nuevo bajo `artifacts/auditoria-calidad-120/baseline-*`,
con `gallery.html`, capturas y `result.json`. Abrir la galería **localmente**;
no subirla a hosting ni adjuntar artefactos privados al PR. El recorrido autentica
cuentas sintéticas usando la API real, realiza las consultas reales y cierra
sesiones, navegador y backend al terminar. No es una maqueta ni un servidor
dejado abierto para una demostración pública.

`captured` significa que se completó la captura; revisar también `findings`,
`errors`, geometría y las imágenes. Una captura sin overflow no certifica
legibilidad, contraste, teclado o tamaños táctiles por sí sola.

## Recorrido de presentación, 8–10 minutos

| Paso | Qué mostrar en las pantallas reales | Qué explicar |
| --- | --- | --- |
| 1 | Login, registro y seguridad de Cuenta | Correo verificado, 2FA opcional y cierre seguro; las entregas están simuladas |
| 2 | Inicio, consumo y evolución del gasto | Datos registrados del suministro; vacío significa sin registros, no ceros inventados |
| 3 | Recibos, detalle y PDF descargado | Fechas/importe/estado registrados; documento referencial, no comprobante oficial |
| 4 | Incidencias, fotografía y seguimiento | Actualización administrativa, cronología real y recuperación por REST/Socket.IO |
| 5 | Centro de avisos y preferencias | Lectura del usuario y consentimiento; no activar ni enviar FCM real |
| 6 | Atención e HidroBot | Consulta/respuesta con contexto propio; orientación, sin decisiones financieras |
| 7 | Admin: resumen, usuarios, recibos, incidencias y atención | Panel independiente y acceso por rol; filtros/tablas existentes |
| 8 | Revisión de operaciones y logout | Demostración/revisión manual no equivalen a dinero recibido; limpiar datos y conexiones |

La galería incluye login, dashboard, recibos, pagos, incidencias, seguimiento,
notificaciones, perfil, HidroBot, atención y los módulos Admin en las resoluciones
requeridas. Las pruebas funcionales de PDF, OTP, revocación, fotografía y permisos
se ejecutan en sus suites existentes; no simularlas con una imagen estática.

Para repetir los flujos interactivos completos con fixtures reales, usar
`scripts/test/admin-e2e.cjs` y las suites de pagos/incidencias/recuperación/push
indicadas en el informe. `HIDRO_TEST_CHROME` selecciona Chromium y
`HIDRO_TEST_REPORT_DIR` un directorio nuevo de evidencias. Correo usa adaptadores
de prueba; FCM real y workers reales permanecen deshabilitados.

## Preparación física pendiente — incremento D

- Resolver primero los hallazgos prioritarios B/C y congelar el commit candidato.
- Identificar teléfono/perfil Android y versión WebView autorizados; no conectarse
  ni instalar automáticamente en el celular del propietario.
- Definir instalación de laboratorio sin sustituir la oficial. El debug actual
  conserva `pe.edu.hidromejora.app` y firma debug: no instalarlo sobre una APK
  oficial ni cambiar la firma permanente para resolver un conflicto.
- Preparar backend y PostgreSQL aislados accesibles solo para la prueba autorizada;
  conservar HTTPS/orígenes y autenticación. No apuntar la candidata a Neon/Render.
- Verificar OTP/autologin, 2FA/recuperación sin entregas reales, bloqueo/reanudación,
  logout/cambio de usuario y pérdida de red con la candidata exacta.
- Probar selector/cámara/foto, ubicación voluntaria, PDF/descarga/visor, teclado,
  Atrás, safe areas, zoom de texto, TalkBack, contraste y controles táctiles.
- Probar centro interno y preferencias push sin realizar un nuevo envío real.
  Cualquier entrega FCM adicional necesita autorización específica independiente.
- Registrar resultados, APK/hash y limitaciones; conservar APK oficiales,
  datos, respaldos y evidencias. La validación física/despliegue sigue pendiente.
