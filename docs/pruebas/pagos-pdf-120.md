# Pagos y documentos: desarrollo previo a 1.2.0

Rama `feature/pagos-pdf-120`, base verificada `e01c9a2` de `feature/seguridad-totp`.
PR #11 y #12 siguen Draft. No publicar 1.2.0 ni aplicar 007/008 en producción.

## Auditoría y decisión de alcance

El antiguo `POST /api/pagos` insertaba una demostración en `pagos` y marcaba el recibo
como Pagado sin una transacción financiera. Se elimina ese camino de acreditación.
Una APK antigua que no envía UUID recibe 409 explicativo: nunca 201 que su interfaz
pueda interpretar como deuda cancelada. Debe actualizarse antes de declarar operaciones.
Las consultas de pagos históricos siguen disponibles; no se cambian sus filas,
estados de recibo ni se les atribuye confirmación bancaria. Reconciliar históricos
requiere una revisión autorizada separada, nunca reclasificación automática.

008 agrega operaciones, historial y deduplicación de eventos, sin modificar tablas
históricas ni datos. Exige 007. Nuevas operaciones quedan explícitamente en entorno
`simulado`; ni una decisión manual ni una aprobación del simulador inserta `pagos`
o cambia la deuda a Pagado. Esta barrera de base de datos impide habilitar cobros reales
con un cambio accidental de variable. La habilitación financiera futura requiere otro
avance revisado, conciliación real y autorización.

Estados: demostrativa; declarada; pendiente_verificacion; verificada_manual;
acreditada_proveedor; rechazada; cancelada; reembolsada. Declarada y pendiente se registran
en la misma transacción. El servidor controla las transiciones; no acepta estado,
importe, actor ni fecha desde el cliente. Motivo, administrador y fecha se auditan.

## Controles

- UUID por usuario y hash del contenido: repetir recupera el mismo resultado; cambiar
  contenido devuelve conflicto. Una sola operación activa por recibo y referencia
  normalizada única al verificarla. Las declaraciones duplicadas se advierten: una persona no puede reservar una referencia ajena sin prueba. Locks suministro -> recibo -> operación, transacción y timeouts.
- Verificación manual exige motivo y declaración explícita de revisión del movimiento
  independiente. El comprobante nunca aprueba automáticamente; no autorrevisión.
- PNG opcional hasta 1 MB / 2048 px, límites antes de decodificar, CRC y recodificación
  sin metadatos. Rechaza SVG, JPEG y formatos no soportados con mensaje explícito.
  Acceso propietario/Admin con JWT, sin enlaces públicos ni caché.
- QR privado externo 0600 y sin symlink; nunca datos personales en fuentes.
- `PAYMENTS_MANUAL_ENABLED=0`; además se rechaza en NODE_ENV=production incluso con flag1.
- Proveedor simulado inyectado en laboratorio: iniciar, consultar, evento firmado HMAC,
  reloj acotado, deduplicación, validación de importe/moneda/vinculación y conciliación.
  Ninguna ruta pública permite resolver/aprobar el simulador. No es un sandbox comercial.

## Pruebas

Resultados y ejemplos se completan con los siguientes incrementos. Las pruebas se
realizan en PostgreSQL 18 nuevo, tmpfs, `hm-pagos120-pg`, datos example.invalid;
Node.js 22 en Docker. Nunca Neon, correos ni cuentas financieras reales.

Primer incremento backend: 30 pruebas aprobadas, 0 fallidas y 1 caso histórico
optativo omitido (`HIDRO_RECEIPT_TEST_LEGACY`) entre payment-operations,
receipt-concurrency y receipt-schema, en Node 22 / PostgreSQL 18 aislado.
La primera regresión falló por esperar el mensaje antiguo de error del servicio;
se actualizó la expectativa al error público genérico de operaciones y se repitió
el conjunto. No se ocultaron errores de SQL ni se imprimieron datos privados.

## Interfaces y recuperación

Cliente: importe exacto, suministro y período; QR por petición autenticada; referencia
y PNG opcional; estado pendiente explícito. Un UUID se conserva en memoria durante
un resultado incierto y permite repetir el mismo contenido sin duplicar; una solicitud
con otro contenido no se reenvía a ciegas. El historial consulta la operación por su
ID exacto, incluso si fue rechazada/cancelada, y permite cancelar una declaración pendiente.
No se marca Pagado en el cliente. Logout borra formulario, referencias, imágenes/blob,
solicitudes en memoria y credencial mediante el mecanismo de sesión existente.
Después de terminar el proceso, consultar el historial recupera la operación del servidor;
la restricción única impide otra declaración activa aunque se pierda la UUID local.

Admin: sección de revisión con estados de prueba, motivo obligatorio y confirmación
de comprobación independiente; historial con actor y hora, evidencia autenticada,
prevención de solicitudes duplicadas y aviso de consultar historial si se pierde respuesta.
Los eventos Socket.IO existentes actualizan propietario y Admin; no se emiten imágenes.

3 pruebas Chromium/API/PostgreSQL aprobadas en Node 22.23.4: pérdida de respuesta y
recuperación de la misma UUID, revisión Admin y logout sin imágenes ni referencias.
Chromium móvil no equivale a Android nativo; este se informa por separado.

## Revisión adicional de referencias

Se corrigió un riesgo del primer diseño: hacer única globalmente una referencia
meramente declarada permitiría reservar una referencia ajena sin demostrar titularidad.
Ahora se normalizan espacios/guiones, se avisa al revisor de las coincidencias y la
unicidad se exige al confirmar manualmente. Dos confirmaciones concurrentes de la misma
referencia no pueden aprobarse; una declaración falsa no bloquea el registro de la legítima.
El motivo/revisión independiente sigue siendo obligatorio. Los pendientes se priorizan
en la lista Admin. Referencias vacías compuestas por separadores se rechazan.

La repetición SQL final de pagos/recibos pasó 30 pruebas, 0 fallidas y 1 histórico
optativo omitido. Se añadió comprobación explícita del rechazo seguro de la APK antigua
sin UUID. Un fallo anterior de permisos se debió a reutilizar un PNG 0600 creado por el
contenedor root: el fixture ahora utiliza un directorio nuevo por ejecución, sin relajar
permisos ni modificar recursos de aplicación.

## Documentos y validación conjunta final

Recibo y constancias conservan marca, logotipo, márgenes A4 y fuentes integradas.
La constancia muestra UUID de operación/verificación, método, referencia declarada,
estado, importe PEN, recibo/suministro/período, hora del servidor en America/Lima y
revisión interna cuando existe. El pie distingue generación en el dispositivo de la
fecha de registro del servidor. No se estiman impuestos, lecturas ni tarifas.
Históricos sin evidencia no se convierten en pagos bancarios. Una simulación aprobada
no se presenta como acreditación comercial. No son comprobantes SEDAPAL/SUNAT.
No hay QR documental público: falta un servicio de validación seguro; el identificador
solo se consulta en el historial autenticado, no es una firma digital del PDF.

Cinco ejemplos sintéticos locales (sin versionar) en `output/pdf/pagos-pdf-120-final/`:
recibo-sintetico, constancia-demostrativa, declaracion-pendiente,
revision-manual-simulada y proveedor-simulado. Todos de 1 página A4, revisados mediante
PDFInfo, extracción y render Poppler/Cairo. Los textos largos se probaron por separado
con paginación, cabeceras y numeración, sin recortar datos. No son PDF/UA etiquetados;
accesibilidad documental completa pendiente. Generador reproducible en
`scripts/generate-payment-pdf-examples.cjs`; no sobrescribe archivos existentes.

| Ejecución real | Resultado |
| --- | --- |
| Node 22.23.4 + PostgreSQL 18, backend conjunto (pagos, recibos/esquema, OTP-auto-session, Android-session, 2FA/Audit/Admin y outbox API) | 72 aprobadas, 0 fallidas, 1 histórico optativo omitido. |
| Después de endurecer referencias, conjunto afectado pagos/recibos/esquema | 30 aprobadas, 0 fallidas, el mismo histórico optativo omitido. |
| Última comprobación de referencias privadas y evidencia del simulador | 9 aprobadas; confirmaciones de referencia concurrentes únicas; 0 pagos financieros y 0 recibos acreditados por operaciones nuevas. |
| Cliente, configuración, documentos, sesiones, registro, HidroBot y 2FA, con Chromium/API/SQL donde corresponde | 70 aprobadas; no todas son pruebas E2E. |
| UI pagos tras el último cambio de revisión | 3 aprobadas Chromium móvil/escritorio, API/SQL reales de laboratorio; Socket.IO sustituido en este harness. |
| PDF final ampliado (incluye datos snake_case y consumo ausente) | 13 aprobadas; solapan las de documentos del conjunto anterior, no se suman como pruebas independientes. |
| WebView Android 15/API 35 real en AVD independiente hm_110_debug_api35 | 7 comprobaciones aprobadas: 1 instrumentada Keystore + 6 de pagos/PDF/ciclo de vida. |
| Java 21 / Gradle, :app:testDebugUnitTest y :app:lintDebug | BUILD SUCCESSFUL; 4 JUnit, 0 errores lint y 16 advertencias existentes de recursos/configuración. |
| Docker final API/Web/Admin en red interna y DB nueva | Imágenes construidas. Health, capabilities, Frontend, Admin y proxy Admin 200; session sin token 401; sin puertos públicos. |
| npm audit Backend --omit=dev | 0 vulnerabilidades conocidas. No sustituye auditoría de lógica. |

Las repeticiones focalizadas no se suman a los conjuntos anteriores. No quedan fallos
finales en las comprobaciones ejecutadas. Se conservaron los logs de intentos fallidos:
expectativa de mensaje antiguo, fixture PNG privado creado como root y primeras
maquetas PDF de dos páginas (reajustadas para los ejemplos finales).

### Android nativo

Evidencia privada `artifacts/android-session-native-VJ3OZ3/result.json`: passed,
7 comprobaciones, 0 errores. Compilación debug e instrumentación separadas; ninguna
APK release creada. Pérdida de respuesta después de COMMIT, reintento con la misma UUID,
force-stop, restauración cifrada, historial pendiente, demostración sin acreditar,
logout/reapertura y PDFs completos guardados por SAF y abiertos en el visor Android.
Socket.IO real en este harness y unicidad comprobada durante el login; no hubo sustitución de sockets.
El QR utilizado fue una imagen sintética de laboratorio sin cuenta receptora; no se
ensayó una transferencia ni un escaneo bancario. Evidencia sintética de estados del
simulador: `artifacts/pagos-pdf-120/fixture-IHtRn6/simulation-evidence.json`.

El nuevo PDF se guardó y visualizó realmente en Android. La repetición nativa final
incluye el código final del generador y espera página/archivo del visor más píxeles
renderizados de la marca sobre el papel, comprobando además el texto extraído del PDF
real guardado. No se considera suficiente una actividad abierta o una captura negra.
Se inspeccionaron las capturas finales de ambos documentos. El recibo repetido se
conservó en Downloads con sufijo (1), sin sobrescribir el documento anterior.

La revisión detectó una captura inicial tomada antes de dibujar la página. Un primer
endurecimiento del test falló porque Google Viewer no siempre expone todo el texto
accesible en la primera apertura (solo anuncia "page 1"), aunque el PDF ya se ve.
Se corrigió el criterio del harness para comprobar archivo, página y render, en lugar
de exigir un detalle asíncrono del visor. Se repitió el flujo completo: 7 comprobaciones
aprobadas y 0 errores en VJ3OZ3. El intento fallido se conserva en
`artifacts/android-session-native-vLT5ps/`. No se cambió el plugin ni se debilitaron
permisos Android; PDF/UA sigue sin certificarse.

### Reproducción sin secretos

Requiere Node 22, Docker y PostgreSQL 18. Usar un nombre nuevo si ya existe el contenedor;
no detener/reemplazar servicios originales. Estos datos son fixtures sintéticos:

```sh
npm ci
npm ci --prefix Backend
docker run -d --name hm-pagos120-pg --label hidro.task=pagos-pdf-120 \
  -e POSTGRES_USER=hm_fixture -e POSTGRES_PASSWORD=fixture-only-not-production \
  -e POSTGRES_DB=hm_email_test --tmpfs /var/lib/postgresql \
  -p 127.0.0.1::5432 postgres:18
export HIDRO_EMAIL_TEST_DB_PORT="$(docker inspect -f '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' hm-pagos120-pg)"
npm run test:payments
```

Los tests crean bases nuevas aleatorias y no leen `.env`. Nunca sustituir la conexión
por Neon. Para Chromium instalar herramientas de prueba en la carpeta ignorada:

```sh
npm install --prefix artifacts/vercel-validation/tools --no-save --no-package-lock playwright@1.56.1
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
artifacts/vercel-validation/tools/node_modules/.bin/playwright install chromium
npm run test:payments:e2e
npm run test:documents
npm run pdf:examples
```

El generador falla si existe un ejemplo con el mismo nombre; usar otra carpeta como
argumento para conservarlo. `npm run test:payments:native` exige el AVD dedicado y
Java 21/SDK descritos en ANDROID.md; instala únicamente un debug de prueba. No se
conectan teléfonos físicos ni servicios productivos. El runtime generado se devolvió
a HTTPS público al terminar, sin reconstruir una release.

### Pendientes y controles de publicación

- No hay integración con sandbox oficial: faltan credenciales autorizadas, contrato,
  autenticación del proveedor y conciliación duradera. Comparativa y costes en
  `../pagos-proveedores-sandbox.md`; no se contrataron servicios.
- Cobros reales/Yape receptor real bloqueados por código y esquema. Para dinero real
  se requiere otro avance revisado: recibos conciliados, operación única acreditable,
  reembolsos y controles de auditoría; nunca activar solo un flag.
- Límite de 200 operaciones por consulta. Paginación y búsqueda histórica avanzada
  están pendientes; Admin prioriza pendientes. Sin conciliación automática programada.
- Prueba física pendiente: QR receptor autorizado (solo tras autorización de cobros),
  selección de PNG, TalkBack, red móvil, visor/impresión y ciclo de vida; usar antes un
  backend HTTPS aislado y datos sintéticos, no cuentas bancarias reales automatizadas.
- Los controles externos contra rollback inseguro de 2FA siguen pendientes del PR #12.
  No habilitar funcionalidades reales por completar este avance.
- 007 y 008 siguen pendientes en producción. No se consultó ni escribió Neon. Antes
  de una futura actualización: revisión, respaldo/restauración autorizados, comprobar
  007 y 008 en orden, despliegue explícito y validación progresiva sin cobros habilitados.
- Si se aplicó un borrador anterior de 008 en una base local desechable, usar una nueva
  base aislada con el SQL final; no improvisar cambios sobre una base compartida.

Producción, main, feature/seguridad-totp, PR #11/#12, Kubernetes, firma permanente y
APK 1.1.1/1.1.2 no se modificaron. SHA-256 de esas APK conservadas:

- 1.1.1: `541b4c9d70a52396266358d786032db47c85e99aa2ae4d7ae1bcf5eb28c3bb4b`
- 1.1.2: `a6b81541a210e79ffb6ec8a38c79b8b1260758ab45c246b81fca45ee4439ed93`

Vercel excluye feature/pagos-pdf-120 en las dos raíces; consultas remotas de despliegues
posteriores al push: ninguna. Render inspeccionado solo en lectura: autoDeploy no,
previews off. Sin Release, APK 1.2.0, merge ni publicación productiva.
