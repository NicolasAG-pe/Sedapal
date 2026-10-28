# Plan maestro de Hidro-Mejora 1.2.0

Estado: desarrollo. **No publicada; sin fecha de lanzamiento comprometida.**
Base integrada de auditoría: `feature/firebase-fcm-piloto-120` / Draft PR #19,
commit `b13ebb0`. Incluye por ascendencia los PR #12–#18 y el cambio equivalente
del #11; no requiere fusionar de nuevo ese parche. La auditoría A continúa en
`feature/auditoria-calidad-ux-120`, con base #19, sin merges a main.
La versión 1.2.0 reunirá varias mejoras futuras; este roadmap no autoriza activarlas.

| Área | Avance comprobado | Próxima tarea y criterio de cierre |
| --- | --- | --- |
| 2FA TOTP | Usuario y Admin, secreto cifrado, recuperación de un uso, sesiones revocadas, pruebas aisladas/nativas del PR #12. | Control externo obligatorio contra despliegue/rollback de backend antiguo; recuperación de identidad y revocación distribuida antes de activar factores reales. 007 pendiente en producción. |
| Sesión tras OTP | Auto-login y persistencia Keystore incorporados del PR #11. | Ensayo físico de APK compatible y pérdidas de red; no fusionar PR #11 por separado sin revisar dependencias. |
| Recuperación de contraseña | Cliente/Android y Admin con correo verificado, código y permiso de un uso, límites, 2FA conservado, sesiones revocadas y worker cifrado separado; validado solo en laboratorio. | Revisar PR dependiente, autorizar 011/configuración/entrega, retención y control de rollback; revocación interinstancia y prueba física. Cerrado por defecto, sin Neon ni correos reales. |
| Validación de pagos | Demostraciones separadas, declaración/revisión manual de laboratorio y simulador con auditoría. | Receptor autorizado, sandbox comercial, conciliación financiera, privacidad, contrato y autorización; 008 pendiente en producción y cobros bloqueados. |
| Recibos y constancias | A4 con datos registrados, estados explícitos, trazabilidad y ejemplos sintéticos. | Revisión institucional/legal, accesibilidad PDF y prueba física de impresión/visualización. No comprobantes oficiales SEDAPAL/SUNAT. |
| Push | PR #17 y #19: plugin Capacitor 7, consentimiento, tokens cifrados y adaptador HTTP v1 con identidad dedicada/OAuth temporal. Un único envío autorizado fue aceptado y recibido en Android 15; toque real a Incidencias y aislamiento REST comprobados. Desactivado nuevamente. | Revisión/aplicación posterior autorizada de 012 y pruebas físicas/Android 13–14. El envío histórico no autoriza repetirlo durante auditoría. Distrito independiente de cortes requiere ampliar el modelo; nunca difusión general de avisos locales. |
| Incidencias | PR #18 incorporado: línea de tiempo cliente/Admin, eventos append-only y avisos atómicos, migración 013, consultas por propietario y Socket.IO; pruebas navegador y WebView de laboratorio documentadas. | Revisión del Draft PR #18 con base #17, autorización posterior para 013 y prueba física/TalkBack. No inventar historial anterior; el único FCM remoto está documentado por separado en #19. |
| Dashboard | Estructura existente conservada. | Métricas claras que no confundan declaración con dinero recibido; pruebas de estados vacíos, carga y error. |
| Admin | 2FA, tablas, filtros y revisión paginada de operaciones ya existentes; distribución de recibos y resumen operativo presentes. | Medir límites de listados heredados antes de añadir paginación; aclarar importes históricos sin atribuir acreditación bancaria. Doble control para cambios críticos pendiente. |
| Auditoría | Historial append-only de operaciones nuevas. | Política de retención y exportación autorizada, separación de funciones y trazabilidad resistente a abuso administrativo. |
| Reportes/estadísticas | Existen consumo/gasto derivados de recibos y conteos administrativos; no son conciliación bancaria. | Incremento C: distribuciones útiles y filtros a partir de datos existentes, estados vacíos y separación explícita de operaciones sintéticas/administrativas. No inventar fondos acreditados. |
| HidroBot | Función existente y regresiones conservadas. | Respuestas basadas en estados financieros reales, revisión de intención y límites; ninguna autorización financiera por chat. |
| Accesibilidad | Etiquetas, alertas y bloqueo de duplicados en formularios modificados. | Auditoría WCAG/TalkBack, teclado, contraste y PDF etiquetado (jsPDF actual no acredita PDF/UA). |
| Rendimiento | Índices de operaciones y consultas acotadas. | Paginación por cursor más allá de 200 operaciones, carga/conciliación grande y medición en celulares modestos. |
| Android físico | AVD separado para desarrollo; APK 1.1.1/1.1.2 conservadas. | QR, selección de imagen, PDF, permisos, accesibilidad, datos móviles y ciclo de vida en teléfono autorizado. No declarar AVD como prueba física. |
| Publicación | Ningún despliegue/merge/release de esta etapa. | Revisiones de PR dependientes, respaldo/restauración autorizados, preflight/migraciones, variables privadas, rollout controlado y autorización expresa del propietario. |

## Presupuesto y fronteras

Desarrollo local S/ 0, sin servicios nuevos ni facturación automática. Credenciales
comerciales, afiliación, KYC/RUC, comisiones o cambios de plan se evalúan por separado
antes de contratar. No se confunde un simulador con un sandbox oficial ni una
operación registrada con un cobro bancario. Ver `pagos-proveedores-sandbox.md`.

Orden recomendado: cerrar revisión de seguridad y pagos; ensayar sandbox autorizado;
completar mejoras pendientes por incrementos; probar integración/físico; decidir
alcance y versión final con el propietario. No activar funciones reales por completar
una casilla del roadmap.

## Continuación: piloto manual Yape

PR #14 depende del #13. Piloto loopback preparado con QR privado, base nueva, ventana,
recibo/participantes sintéticos y atestación manual detallada. Ensayo de extremo a extremo
y Android emulado aprobados, sin transferir dinero. Pendiente actuación voluntaria del
titular con QR auténtico y comprobación de movimientos; no equivale a pasarela ni activa
pagos productivos. Guía: [yape-piloto-local.md](yape-piloto-local.md).


## Identidad acuática y documentos — etapa visual

Rama `feature/identidad-acuatica-pdf-120`, dependiente de PR #14. Paleta común,
interfaz cliente/Admin y composición nueva de recibos/constancias. Ver
`IDENTIDAD-VISUAL-120.md` y el informe de pruebas. No publica 1.2.0 ni habilita
funciones financieras. La recuperación, push y línea de tiempo se incorporaron
posteriormente en los PR #16–#19. Sus evidencias de laboratorio no aprueban
publicación ni sustituyen pruebas físicas. Las estadísticas adicionales y la
validación física siguen organizadas como incrementos independientes.

## Auditoría integral — incrementos A–D

A inventaría y comprueba la base integrada, corrige verificadores obsoletos y
conserva capturas reales de referencia. B corrigió legibilidad/tamaño táctil con
comparación real antes/después. C completó estados operativos en Admin y aclaró
importes históricos sin cambios de contrato. Los límites de listados/carga grande
requieren otra dependencia medida. D cerró la regresión de laboratorio y preparó
la guía física; teléfono, TalkBack y despliegue autorizado continúan pendientes.
La APK del emulador no sustituye la preparación de una candidata física.

Informe y prioridades: [auditoria-calidad-ux-120](pruebas/auditoria-calidad-ux-120.md).
Demostración reproducible: [DEMO-LABORATORIO-120](DEMO-LABORATORIO-120.md).
El criterio de salida sigue abierto hasta resolver hallazgos prioritarios y
validar teléfono físico/despliegue mediante autorizaciones independientes.

Cierre actual: [validación final de laboratorio](pruebas/validacion-final-120.md).
Las evidencias anteriores de `/tmp` se perdieron al reiniciar; las nuevas están
en el worktree persistente y se verifican mediante un manifiesto SHA-256.
