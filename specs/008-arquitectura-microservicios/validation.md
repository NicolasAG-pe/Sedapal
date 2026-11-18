# Validación MS-01 a MS-05

## MS-05 — Gateway y dominios integrados

El [laboratorio 8280/8281](../../docs/microservices/10-laboratorio-servicios.md)
ejecutó las rutas públicas sin iniciar `Backend/server.js`. El inventario
ejecutable coincide en las 75 combinaciones de método y ruta. Se verificaron
roles, vistas y funciones delimitadas en PostgreSQL 18 compartida, junto con
la aplicación repetible de 015 en una instancia separada con 008/014.

- Node 22.23.5: 165 unitarias/contratos aprobados.
- Regresión PostgreSQL 18: 92 aprobadas, una omisión condicional esperada,
  cero fallos.
- Smoke del laboratorio: recuperación y OTP stub, aviso/push mock, eventos
  Socket.IO, PNG, cortes y atención. Reintento de pago e incidencia tras
  descartar la respuesta y recuperación tras detener Auth, Operations y Realtime.
- Firefox comprobó cliente y panel, permisos, recibos, incidencias, 2FA y
  revocación. Un recorrido adicional comprobó descarga de recibo PDF, pago
  demostrativo, deuda en HidroBot y bandeja de avisos. Pruebas de PDF con
  Poppler: 17 aprobadas. HidroBot: 4 aprobadas.
- Se generó el runtime Android con API local. El entorno carece de JDK/SDK,
  ADB y dispositivo autorizado para compilar e instalar el APK nativo.

Quedan pendientes la prueba nativa, el ensayo del corte oficial y la
publicación autorizada. La evidencia MS-01 siguiente es histórica.

MS-02: [resultados nuevos](../../docs/microservices/06-pruebas-validacion.md):
147 pruebas seguras aprobadas; integración 90 aprobadas y 1 omisión condicional;
imagen Notifications construida/arrancada. Transporte opt-in; monolito preservado.
Autorización posterior: consulta Render solo lectura, implementación y commits
locales; **sin push, merge ni despliegues**. No preparar publicación como paso
automático al concluir las pruebas.

Fecha 2026-11-13, SHA de referencia 1be9c28891272567f63b79f19838800431c09e91.

- Inventario de pruebas: vigente, comprobado con comando del repositorio.
- Node 22.23.4: 141 aprobadas, cero fallidas/omitidas; informe safe-CKGDJl.
- Intentos iniciales fallaron por Git ausente y ownership del montaje; corregido
  únicamente en el contenedor temporal. Pruebas y expectativas intactas.
- Express importado sin red ni puertos: 75 rutas, incluidos bucles expandidos.
- No se probó PostgreSQL, E2E navegador, APK ni arquitectura nueva en este avance.
- Producción: solo consultas de metadatos; ninguna modificación remota.

Resultados y aceptación pendiente: [06](../../docs/microservices/06-pruebas-validacion.md).
Push/PR pendientes de comprobación suficiente de automatizaciones. No existe
un resultado CI de esta rama que pueda acreditarse todavía.
