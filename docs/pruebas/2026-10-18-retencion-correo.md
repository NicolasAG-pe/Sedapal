# Retención de correo — pruebas del 18 de octubre de 2026

## Avance 1: política y núcleo transaccional

Se reutilizó el contenedor aislado `hidro-email-test-20261018` (PostgreSQL 18,
solo loopback, sin montajes). Cada ejecución creó una base nueva con fixtures
sintéticos; no se limpiaron bases anteriores, incluida la usada para Resend real.
No se enviaron correos reales ni se modificó infraestructura o APK.

Comandos comprobados:

| Prueba | Resultado |
| --- | --- |
| `npm run test:email` | Cuatro archivos unitarios aprobados; incluye validación de retención mínima y lotes antes de conectar |
| `npm run test:config` | Tres archivos aprobados |
| `HIDRO_EMAIL_TEST_DB_PORT=32768 node Backend/test/email-cleanup.cjs` | Seis grupos de comprobaciones PostgreSQL aprobados |
| `HIDRO_EMAIL_TEST_DB_PORT=32768 node Backend/test/email-schema.cjs` | Esquema, migración y cuenta previa aprobados |
| `HIDRO_EMAIL_TEST_DB_PORT=32768 node Backend/test/email-api.cjs` | Registro, límites, confirmación, concurrencia y login con proveedor simulado aprobados |

Cobertura del nuevo harness:

1. Esquema nuevo e índice de vencimiento; migración 004 ejecutada dos veces en
   esa base sin duplicar el índice. Fixtures de usuario, suministro, recibo y pago.
2. Simulación sin cambios; conserva solicitud vigente, OTP vencido con solicitud
   vigente, solicitud recién vencida y vencimiento de menos de 24 horas. Elimina
   la que supera 24 horas y las antiguas invalidadas/consumidas, incluyendo su
   historial. Comprueba lotes de dos filas, conteos e idempotencia con cero borrados.
3. Retención ampliada a 48 horas; guardas ante OTP/envíos futuros y envíos recientes;
   revalidación de un envío confirmado entre selección y segunda lectura. Fila
   bloqueada omitida y bloqueo global de otra limpieza devuelto como `ocupado`.
4. Seis ejecuciones simultáneas con lotes de tres, seguidas de lotes acotados:
   exactamente 20 padres y 20 envíos eliminados, sin dobles conteos ni huérfanos.
   Comparación de contenido de todas las tablas de negocio antes y después, con
   usuarios, suministros, recibos y pagos sintéticos conservados.
5. El historial reciente conserva el rechazo 429 por tres envíos. Registro en
   curso con el envío simulado detenido mientras corre la limpieza; después,
   confirmación y limpieza simultáneas, con usuario verificado creado correctamente.
6. Error forzado después de borrar: rollback conserva padres e historial. FK
   entrante inesperada con cascada: cancelación del lote y conservación de datos.

Los casos de frontera usan vencimientos a ambos lados del mínimo (24 horas menos
y más un minuto). Las fechas sintéticas se construyen con el reloj PostgreSQL;
el código productivo no recibe un reloj/corte configurable desde el cliente.
No se reducen las vigencias del registro ni del OTP.

## Avance 2: comando operativo y preparación para automatización

Se comprobaron `npm run test:email` (cuatro archivos), `npm run test:config`
(tres archivos), `npm run maintenance:email -- --help` y
`HIDRO_EMAIL_TEST_DB_PORT=32768 node Backend/test/email-cleanup-cli.cjs`.
La integración CLI creó otra base sintética nueva y ejecutó subprocesos Node con
solo su entorno de fixtures, sin heredar secretos del entorno de desarrollo.

Tres grupos de integración CLI aprobados:

1. Simulación por defecto y explícita sin cambios. Usar solo `DATABASE_URL` o
   un nombre de base esperado distinto falla antes de borrar. Aplicación de un
   solo lote, cascada correcta e idempotencia; solicitud reciente conservada.
2. Dos procesos CLI simultáneos y un lote posterior: exactamente cuatro padres
   y cuatro envíos antiguos eliminados, sin duplicados ni pérdida de datos recientes.
3. Dependencia inesperada: salida 1, cancelación y datos conservados. stdout y
   stderr no contienen URL, credencial, nombre de base ni correo del fixture;
   los fallos usan un mensaje fijo y los éxitos solo conteos permitidos.

Las unitarias también comprueban argumentos ambiguos/duplicados, política mínima,
destino explícito, TLS externo verificado, ayuda sin conexión y errores privados
sanitizados. No se ha ejecutado el comando contra bases anteriores ni producción.
No se instalaron programaciones automáticas.

## Decisiones y alcance

La [política](../retencion-correo.md) define 24 horas después de `vence_en`, no
desde la creación ni desde el vencimiento del OTP. Se conserva la ventana horaria
de límites incluso ante datos anómalos. El historial se borra solo por la cascada
del padre elegible; no se modifica ningún dato de negocio.

No se requieren credenciales Resend para la limpieza. No se guardan códigos,
identificadores de solicitudes ni datos personales en este informe. No existe
programación automática activa. Las pruebas de concurrencia cubren el esquema y
la API actuales; un cambio de FKs, triggers o reglas de historial requiere revisión.
