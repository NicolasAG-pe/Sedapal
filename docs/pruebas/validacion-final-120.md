# Cierre de laboratorio y preparación física — incremento D

Código de producto: `327215132f519df6211eaa17552a8e4fc723a849`.
Rama `feature/auditoria-calidad-ux-120`, Draft PR #20 dependiente de #19.
**Desarrollo 1.2.0, sin publicación, merge ni aprobación física/productiva.**

## Resultado disponible y trazabilidad

A (`50f53cc`) auditó la integración; B (`1eb7dd5`) corrigió legibilidad y tamaño
táctil; C (`3272151`) completó el resumen operativo sin cambiar contratos o
atribuir fondos bancarios. D valida esa candidata y documenta su uso físico
pendiente. El helper nativo espera el tutorial real antes de navegar también
en el primer arranque, sin modificar el producto ni inyectar callbacks.

Después de un reinicio se perdieron los artefactos de `/tmp`, no los commits
publicados. Se reconstruyó la referencia exacta `b13ebb0` desde Git, se ejecutó
de nuevo y se regeneró la evidencia actual en disco persistente. No se fingen
capturas perdidas ni se repite el FCM autorizado anteriormente.

## Pruebas actuales

| Comprobación | Resultado |
| --- | --- |
| Unitarias/backend/PostgreSQL/correo/sesión/migraciones | 301 casos: **300 aprobados, 1 omitido condicional, 0 fallidos** |
| Navegador: pagos, auditoría, tiempo real, recuperación, push sin envío, incidencias y validador Firebase | Siete casos restantes aprobados y archivo de pagos corregido 4/4 |
| Recorrido completo cliente/Admin y matriz visual | **30 comprobaciones**, cero errores JS/recursos fallidos; 153 capturas |
| Matriz requerida cliente/Admin | 63 capturas de referencia y 63 posteriores, todas de ejecución real |
| Estadísticas Admin con datos | 67 capturas; siete estados coinciden con REST, demostración no cuenta como pago histórico |
| Estadísticas vacías/carga/503/recuperación | 22 capturas; mensajes correctos, cifras antiguas retiradas ante error y recuperación correcta |
| Migraciones 007–013 | Dos aplicaciones de cada una en base nueva, guardas de dependencia y legado sin eventos inventados |
| Respaldo/restauración | Custom restaurado en otra base nueva: 1 usuario, 2 incidencias y 1 evento conservados |
| Android 15, sesión | 13 comprobaciones: Keystore real, reinicios, JWT expirado/alterado, cuenta bloqueada, logout/cambio de usuario, red y logcat |
| Android 15, seguimiento | 6 comprobaciones: Socket.IO, historial, red, foto, Atrás y reapertura; WebView 360×800 y 390×844 |
| Gradle/Android | Debug e instrumental compilados; JUnit 4/4, Keystore instrumental 1/1 por ejecución, lint 0 errores/16 advertencias existentes |

Los grupos no se suman como casos únicos. La omisión corresponde al histórico
duplicado sin migración, condicionado al modo legado. La primera prueba de pago
falló porque seleccionaba otro recibo; el log se conserva y la corrección elige
el periodo explícito, mantiene la aserción y añade controles de ausencia de
fondos/deuda conservada. No se cambió la aplicación para satisfacer esa prueba.

## Android y firma

La primera instalación tras el reinicio fue rechazada por incompatibilidad con
la firma debug temporal de la instalación anterior. No se desinstaló ni borró
ese AVD. Se conservó completo y se abrió otra instancia desde su imagen base
inicial, sin copiar el overlay de datos. Se comprobó que el paquete no estaba
instalado antes de continuar. La clave debug actual se guarda fuera de Git en
el entorno persistente; la firma permanente y las APK oficiales no se modifican.

Se usan exclusivamente AVD Android 15/API35 de laboratorio, Capacitor 7,
`HM_PUSH_ANDROID_ENABLED=0` y backend/PostgreSQL sintéticos. La APK debug
conserva el paquete y metadatos base, sin presentarla como una release 1.2.0.
Android 13/14 no se ejecutaron por espacio para otras imágenes/AVD. No se
borraron imágenes, contenedores, volúmenes, bases, respaldos ni archivos previos.

La APK apunta al backend local del emulador; **no es instalable como candidata
física lista para usar** sin preparar explícitamente el backend privado y la
modalidad de instalación. No instalar sobre una APK oficial ni cambiar su firma
para resolver un conflicto. La guía de demostración conserva la lista física.

## Seguridad y límites

- JWT/OTP/2FA/recuperación, permisos cliente/Admin, suministro, foto, historial,
  cifrado push, idempotencia y concurrencia están cubiertos por las suites actuales.
- Firebase revisado en lectura: cuenta `hm-fcm-pilot-120`, permiso de envío
  `cloudmessaging.messages.create`; obtención temporal limitada a esa cuenta por
  `iam.serviceAccounts.getAccessToken` con condición hasta 2026-11-03 UTC.
  Cero claves USER_MANAGED; facturación desactivada. A–D no modifican cuentas,
  roles ni APIs remotas y no obtienen OAuth del remitente ni envían FCM real.
- No hubo correos/cobros reales, Neon ni cambios/despliegues Render/Vercel/Kubernetes.
  Las dos raíces Vercel excluyen la rama y Render conserva autoDeploy/previews off.
- No se certifica WCAG completa, TalkBack, PDF/UA, carga grande o recuperación
  productiva/distribuida. El restore sintético no sustituye DR ni custodia de claves.
- Se comprobaron errores/vacíos en flujos existentes y en el resumen; no se
  declara inyección exhaustiva de 500/timeout en todos los módulos Admin.

## Rendimiento y mejoras medidas

Carga cliente local sin throttling: referencia DOMContentLoaded 295–389 ms y
618 550 bytes; candidata 283–359 ms y 619 162 bytes. Son observaciones de cuatro
viewport, no percentiles ni un benchmark controlado de teléfono/red móvil; no
se atribuye una mejora de velocidad a diferencias de decenas de milisegundos.
No hay frameworks ni recursos remotos nuevos y no se quitaron validaciones.

La mejora comprobada de UX sí es directa: etiquetas de accesos rápidos en una
línea y controles de al menos 44 px; conversación visible a 360 px de 81 a 152 px
en la comparación original. C expone siete estados en lugar de dos conteos
terminales, usando una consulta REST por navegación después del handshake.

## Evidencia persistente y demostración

Directorio privado del worktree:
`artifacts/auditoria-calidad-120/`. Abrir **localmente** `comparacion-actual.html`:
63 pares de imágenes sin editar, con datos sintéticos equivalentes. Las galerías
de datos/vacío y la matriz E2E complementan esos pares. No se publican en internet.

Se conservan logs originales/corregidos posteriores al reinicio, capturas,
resultados JSON, informes Gradle, instrumentación, APK debug, dump y manifiesto
SHA-256. El cierre registra recursos detenidos, permisos privados y hashes.
SDK, OAuth, JWT, dumps, fotos y APK quedan fuera de Git.

Informes: [A](auditoria-calidad-ux-120.md), [B](pulido-ux-120.md),
[C](reportes-operacion-120.md), [guía de demostración](../DEMO-LABORATORIO-120.md),
[roadmap](../ROADMAP-1.2.0.md).

## Pendientes concretos para teléfono físico

1. Autorizar/identificar teléfono y modalidad de candidata sin sustituir la oficial.
2. Preparar acceso privado del teléfono a backend/PG de laboratorio con orígenes
   y transporte seguros; recompilar con ese destino, nunca con Neon/Render.
3. Instalar la candidata exacta autorizada; registrar hash, Android y WebView.
4. Probar cámara/selector, permisos voluntarios, ubicación, PDF/descargas/visor,
   teclado/safe areas, Atrás, bloqueo/reanudación, red móvil y batería/Doze.
5. Validar OTP/2FA/recuperación/sesión sin entregas reales, cambio de usuario,
   centro interno, Socket.IO, seguimiento y TalkBack/zoom/contraste.
6. Tratar B-03 (preferencia del tutorial en reinicio rápido), carga grande y
   paginación de listados heredados como escenarios específicos abiertos.
7. Cualquier nuevo FCM real, despliegue, migración productiva o publicación
   requiere autorización independiente. El único envío anterior ya se consumió.

## Archivos del avance completo

- Runtime cliente: `Frontend/assets/css/app-layout.css`, `client.css`.
- Runtime Admin: `Admin/index.html`, `assets/css/workspace.css`, `assets/js/admin.js`.
- QA Backend: `Backend/test/quality-migrations.cjs`, `incident-tracking-fixture.cjs`.
- QA navegador/Android: `scripts/test/admin-e2e.cjs`, `android-incident-tracking-native.cjs`,
  `android-session-native.cjs`, `android-upgrade.test.cjs`, `client-checks.cjs`,
  `payment-flow.cjs`, `quality-audit-flow.cjs`.
- Publicación bloqueada: `vercel.json`, `Backend/vercel.json`.
- Documentación: CHANGELOG, roadmap, guía de demostración e informes A/B/C/D.

Sin cambios del backend de negocio, modelo/migraciones, dependencias, logotipo,
paleta, notificaciones, firma permanente ni documentos del usuario.
