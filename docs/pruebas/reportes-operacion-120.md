# Resumen Admin y estados operativos — incremento C

Base: incremento B, `1eb7dd5`. Se reutilizan el panel, tokens visuales y
`GET /api/admin/resumen`; sin endpoints, migraciones ni dependencias nuevas.

## Cambio y utilidad

El resumen muestra los tres estados de incidencias y los cuatro de atención en
dos grupos compactos. Antes mostraba únicamente sus dos conteos terminales.
La distribución de recibos existente se conserva. No se añaden gráficos
decorativos ni datos para llenar espacios.

Los importes se identifican como **históricos**, sin acreditación bancaria
atribuida. Las declaraciones, demostraciones y revisiones continúan separadas
en el gestor de operaciones. El indicador de registros de hoy se conserva en
la tarjeta; los cortes programados ya se muestran en su indicador existente.

Una demostración sintética creada por la API deja el conteo de pagos históricos
en cero. No se añade un indicador de fondos acreditados: el contrato actual
no aporta la evidencia bancaria necesaria para afirmarlo.

## Verificación después del reinicio

El equipo se reinició durante el cierre anterior y eliminó el worktree/evidencias
temporales de `/tmp`. Los commits A/B y sus informes publicados se conservaron;
los cambios C sin commit se reconstruyeron sobre B y se volvieron a probar.
No se presentan los últimos procesos interrumpidos como pruebas aprobadas.

Worktree y evidencias actuales están en disco persistente bajo
`~/.local/share/hidromejora/quality-120/worktree/`, sin modificar otros worktrees.
Se creó otro contenedor PostgreSQL propio y bases nuevas; los anteriores se
conservan detenidos. La referencia visual se recompiló desde `b13ebb0` y se
ejecutó de nuevo con datos sintéticos, sin reenviar FCM.

| Escenario | Resultado | Evidencia privada persistente |
| --- | --- | --- |
| Datos registrados | Siete estados coinciden con REST; demostración no cuenta como pago histórico | `after-XASUwd`, 67 capturas |
| Sin datos operativos | Mensajes vacíos de incidencias/atención y conteos cero provenientes de PostgreSQL | `after-VQwwsi`, 22 capturas |
| Cargando | `aria-busy` y estado de carga durante solicitud retenida | Capturas `admin-summary-loading` |
| HTTP 503 | Cifras anteriores retiradas, mensaje de error; no se muestran como cero nuevo | Capturas `admin-summary-error` |
| Recuperación | Nueva consulta correcta restaura conteos; sesión conservada | Estados `statistics-loading-error-recovery` |
| Red | Una consulta por navegación del resumen, cero endpoints añadidos | `uiSummaryRequests=1` en 1366 y 1920 |

La validación inicial de permisos, la carga inicial y la recuperación tras
handshake Socket.IO son fases existentes distintas. El contador de la prueba
espera que terminen antes de medir una navegación; no se suprime ninguna
validación ni actualización para lograr una cifra menor.

La regresión repetida de backend/unitarias/correo/sesión/migraciones produjo
**300 aprobadas y una omisión condicional, cero fallidas**. El recorrido completo
cliente/Admin con matriz visual aprobó 30 comprobaciones. El fixture mantiene
su legado por defecto y permite omitirlo solo para construir una base nueva
vacía en esta prueba; no se borran filas para fabricar un estado vacío.

La corrida de navegador encontró un selector intermitente en `payment-flow`:
elegía el primer recibo, que podía ser el Yape ya revisado en un escenario
anterior. Ahora elige el periodo exacto. Se conserva la aserción original y
se añaden comprobaciones de una demostración, cero pagos financieros y deuda
Pendiente. El archivo completo pasó 4/4 después; los otros siete casos de
navegador habían pasado. Se conservan ambos logs, incluido el fallo inicial.

## Límites separados

La revisión de operaciones ya tiene filtros/paginación. Se conserva el límite
500 de pagos/atención y se documentan los listados heredados completos de
usuarios/recibos/incidencias: paginación servidor/cursor, carga grande y semántica
temporal de históricos requieren un incremento de contrato medido, no una
migración improvisada. No se modifica arquitectura ni se atribuye una zona
horaria o una confirmación financiera nueva a datos históricos.

Las capturas y los controles anteriores no certifican TalkBack/WCAG completa,
teléfono físico ni despliegue. El cierre de candidata y los pendientes concretos
se documentan por separado en el incremento D. Sin cambios remotos Firebase,
FCM/correos/cobros reales, Neon, despliegues ni APK oficiales.
