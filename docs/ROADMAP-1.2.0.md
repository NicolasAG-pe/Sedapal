# Plan maestro de Hidro-Mejora 1.2.0

Estado: desarrollo. **No publicada; sin fecha de lanzamiento comprometida.**
Base de esta etapa: `feature/seguridad-totp` / Draft PR #12; pagos y PDF se revisan
por separado en `feature/pagos-pdf-120`, Draft PR #13 con base de seguridad.
La versión 1.2.0 reunirá varias mejoras futuras; este roadmap no autoriza activarlas.

| Área | Avance comprobado | Próxima tarea y criterio de cierre |
| --- | --- | --- |
| 2FA TOTP | Usuario y Admin, secreto cifrado, recuperación de un uso, sesiones revocadas, pruebas aisladas/nativas del PR #12. | Control externo obligatorio contra despliegue/rollback de backend antiguo; recuperación de identidad y revocación distribuida antes de activar factores reales. 007 pendiente en producción. |
| Sesión tras OTP | Auto-login y persistencia Keystore incorporados del PR #11. | Ensayo físico de APK compatible y pérdidas de red; no fusionar PR #11 por separado sin revisar dependencias. |
| Recuperación de contraseña | No implementada en esta etapa. | Diseño de tokens limitados de un uso, límites, entrega verificada y conservación del segundo factor; nunca recuperación por suministro/correo público. |
| Validación de pagos | Demostraciones separadas, declaración/revisión manual de laboratorio y simulador con auditoría. | Receptor autorizado, sandbox comercial, conciliación financiera, privacidad, contrato y autorización; 008 pendiente en producción y cobros bloqueados. |
| Recibos y constancias | A4 con datos registrados, estados explícitos, trazabilidad y ejemplos sintéticos. | Revisión institucional/legal, accesibilidad PDF y prueba física de impresión/visualización. No comprobantes oficiales SEDAPAL/SUNAT. |
| Push | Pendiente; no contratado ningún proveedor. | Evaluar opciones gratuitas, permisos voluntarios, privacidad, entrega/reintentos y consumo Android; no prometer disponibilidad gratuita permanente. |
| Incidencias | Flujo existente conservado. | Línea de tiempo de eventos autorizados por suministro, adjuntos protegidos, no reescribir el flujo actual. |
| Dashboard | Estructura existente conservada. | Métricas claras que no confundan declaración con dinero recibido; pruebas de estados vacíos, carga y error. |
| Admin | 2FA y revisión de operaciones preparadas localmente. | Filtros/paginación de pendientes, doble control para cambios críticos y mejoras operativas con permisos explícitos. |
| Auditoría | Historial append-only de operaciones nuevas. | Política de retención y exportación autorizada, separación de funciones y trazabilidad resistente a abuso administrativo. |
| Reportes/estadísticas | No desarrollados aquí. | Métricas de fondos verificados separadas de históricos/simulaciones, sin datos personales en exportaciones. |
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
funciones financieras. Recuperación de contraseña, push, línea de tiempo de
incidencias, reportes, seguridad adicional y pruebas físicas siguen pendientes
en sus etapas; no se implementan como parte del rediseño.
