# Hidro-Mejora: producto, uso y mejoras vigentes

Guía funcional de **v1.0.0**. Conserva las decisiones visuales de la mejora profesional y describe los módulos existentes sin inventar funciones. Arquitectura: cliente HTML/CSS/JS empaquetado con Capacitor 7, Admin independiente, Express/Socket.IO y PostgreSQL. Producción vigente: [DEPLOYMENT](DEPLOYMENT.md).

## Acceso y separación de roles

Login utiliza suministro de nueve dígitos y contraseña. El cliente admite `usuario`; el panel solo `admin`. No existe selector para obtener un rol distinto. Una cuenta inactiva es rechazada. El registro crea cliente sin verificar el suministro ante un sistema oficial.

La recuperación automática de contraseña no está disponible: el enlace informa esa limitación. Los contactos mostrados son orientación del prototipo y requieren confirmación externa; los botones informativos de llamada no acreditan que se haya iniciado una llamada real.

Los datos son persistentes mediante REST/PostgreSQL. Salir limpia sesión, listas y fotos; volver requiere autenticarse. No modificar sessionStorage como procedimiento de acceso. [Seguridad](SECURITY.md).

## Cliente: módulos y uso

| Módulo | Uso y datos |
|---|---|
| Inicio | Deuda acumulada, próximo vencimiento, último recibo, consumo, pendientes, pagos recientes, cortes, incidencias abiertas y notificaciones. Accesos rápidos; gráficos de consumo y gasto derivados de recibos consultados. |
| Recibos | Búsqueda por mes, filtros de año/estado, detalle, pagar cuando corresponde y obtener copias. No genera un historial ficticio si falla la API. |
| Pagos | Confirmación del registro, historial, búsqueda y constancia del pago persistido. Importe/código provienen del backend. No ejecuta cargos bancarios. |
| Incidencias | Crear reporte con tipo, descripción y referencia; adjuntar foto opcional hasta 2 MB JPG/PNG/WebP y ubicación opcional. Consultar estado y abrir foto autenticada. |
| Cortes | Vista propia y catálogo general; distrito/zona del suministro y avisos generales. Estados calculados con fechas; finalizados y cancelados se conservan en base pero no en listado activo. |
| Atención | Crear solicitud por categoría/asunto/descripción, consultar historial, estado y respuesta administrativa. |
| Notificaciones | Avisos generales o propios; marcar lectura por suministro. No hay push ni integración Firebase. |
| Perfil | Correo, suministro y fecha de registro. Cambio de contraseña verifica la actual y confirmación. No hay edición general de correo/nombre. |
| Tutorial | Recorrido guiado, repetible desde Inicio. Marca local de visto; salir limpia la sesión sin forzar una finalización. Omitir/finalizar controlan el recorrido. |
| HidroBot | Reglas e intenciones locales: orienta y utiliza datos cargados de recibos, consumo, pagos, incidencias y cortes. No llama a una IA externa ni puede operar si faltan datos/sesión. |

En móvil hay navegación inferior, encabezado compacto y menú lateral para opciones adicionales. En escritorio permanece la navegación lateral. Perfil carga desde el controlador común, tanto Cuenta móvil como hash o menú; las respuestas tardías no deben reponer datos después del logout.

### Datos reales y cálculos de presentación

Deuda, promedios, gráficos y alertas se calculan desde registros de API. No son mediciones independientes ni certificación de pérdidas de agua. El semáforo visual de detalle usa umbrales locales de consumo; no sustituye una evaluación técnica.

El detalle conserva un **desglose demostrativo 60/22/18** para presentación. Es un cálculo del frontend y no una tarifa, impuesto ni cargo oficial obtenido de PostgreSQL. La API no proporciona lecturas de medidor: el detalle informa No disponible cuando faltan. **El PDF no utiliza ese desglose estimado.**

## Admin: módulos y operación

| Módulo | Operaciones disponibles |
|---|---|
| Resumen | Seis áreas de indicadores existentes: usuarios, recibos, pagos, incidencias, cortes y atención. Agregados del backend; no nuevas métricas ni reportes exportables. |
| Usuarios | Búsqueda/filtros de rol y estado, detalle de actividad, activar/desactivar; no permite desactivar la propia cuenta administrativa. |
| Suministros | Editar distrito y zona **desde el detalle del usuario**. No hay navegación ni CRUD independiente de suministros. |
| Recibos | Listar, filtrar, crear, editar y anular; no editar/anular si hay pago asociado. Anular conserva el registro. |
| Pagos | Lectura y filtros por suministro, periodo y método. No editar/borrar pagos ni procesar cargos financieros. |
| Incidencias | Listado/filtros, foto protegida y transición Registrada/En revisión/Resuelta. |
| Cortes | Crear/editar/cancelar por General o Zona, con fechas y motivo. Incluye histórico operativo y estado calculado; no borra filas. |
| Atención | Filtrar solicitudes, editar estado y respuesta, con avisos al cliente según la operación. |
| Cuenta | Consulta de datos de la cuenta administrativa. No es un editor de roles o credenciales ajenas. |

Admin tiene sidebar/topbar propias, densidad de escritorio, tablas, badges y acciones por fila. Usa las 19 rutas administrativas de la misma API. Los formularios confirman operaciones y evitan doble envío; logout elimina el DOM administrativo clonado, fotos y peticiones pendientes.

Los avisos Socket.IO refrescan el módulo visible por REST; no todos los cambios generan avisos a todos los roles. El contrato real está en [API](API.md).

## Documentos PDF

Motor único: [Frontend/assets/js/documents.js](../Frontend/assets/js/documents.js), jsPDF 2.5.1 distribuido localmente. Dos documentos activos:

| Documento | Información y finalidad |
|---|---|
| Recibo de servicio | Suministro, correo si está disponible, referencia interna, periodo, emisión/vencimiento, estado, consumo e importe registrado. Documento referencial sin valor oficial. |
| Constancia de pago | Suministro, correo disponible, recibo/periodo, importe, método, fecha y código persistido de operación. Acredita registro del prototipo, no cargo bancario. |

A4, margen de 16 mm, encabezados distintos, emblema, alineación de importes, pie, numeración y paginación de texto largo. La generación usa fecha/hora del dispositivo, identificada como tal. No inventa impuestos, cargos, lecturas de medidor ni nombres de persona ausentes del esquema.

Nombres: `Recibo_HidroMejora_<suministro>_<periodo-ISO>.pdf` y `Constancia_Pago_HidroMejora_<operacion>.pdf`. El periodo se toma de una referencia ISO o de la fecha de emisión cuando corresponde. La constancia exige código de operación y monto disponibles.

El emblema SVG se rasteriza a 320 px y se cachea. El presupuesto utilizado en la mejora fue 40 KB por descarga con logo, no una garantía para textos extensos. **Muestras históricas del 7 de octubre de 2026, con fixtures PostgreSQL aislados:** recibo 14.276 bytes y constancia 14.296 bytes, conservadas entonces bajo `artifacts/pdf/integral-20261007_162512/`. No representan pesos universales ni contenido de usuarios reales.

En navegador jsPDF descarga el archivo; Android usa selector de destino y visor del sistema mediante HidroDocuments. Cancelar el selector no indica guardado correcto. Las pruebas PDF verifican contenido/A4/paginación con Poppler; ver [TESTING](TESTING.md).

## Identidad, recursos y accesibilidad

Shared/styles.css centraliza paleta institucional, controles, espacios, radios, sombras, estados y transiciones. Shared/icons.js centraliza SVG. Emblema e ilustración del login son locales; icono y splash Android son vectoriales.

Se conservan cuatro imágenes históricas únicas de Frontend/assets; el generador omite de paquetes las que no tengan referencias. No depende de un CDN esencial para iconos, jsPDF o Socket.IO.

Botones táctiles, labels, nombres accesibles, foco visible, aria-busy, estados vacíos y mensajes de conexión. Animaciones breves con opacity/transform y prefers-reduced-motion. Admin incluye manejo de teclado/foco en modales. No existe certificación completa con lector de pantalla.

## UX, rendimiento y límites

Se centralizó el motor PDF, se cachea el logo y se eliminaron renderizados redundantes comprobados durante la mejora del 7 de octubre de 2026; no fue una reescritura del producto. Una conexión Socket.IO por sesión, cancelación de requests y limpieza tras logout/expiración.

Las fechas DATE preservan el día al escribirse; la presentación usa America/Lima. TIMESTAMP históricos sin zona requieren revisión separada y no se alteran como parte de documentación.

La release v1.0.0 ya tiene firma permanente y producción Vercel/Render/Neon. El propietario confirmó pruebas físicas de foto, ubicación, PDF, navegación principal, Atrás y tiempo real en su celular; la lista original de pruebas no certifica todos los teclados, notch, dispositivos o versiones WebView. Persistían advertencias lint en informes anteriores; no se afirma una nueva corrida aquí.

Limitaciones: sin cargo bancario, PDF oficial, push, validación externa de suministro, recuperación automática, IA externa o actualizador automático APK. No hay funcionamiento offline completo de los módulos que consultan API. Guías: [Android](ANDROID.md), [release](ANDROID-RELEASE.md) y [pruebas](TESTING.md).

Los informes de fases y recuperación de fuentes siguen siendo antecedentes privados/históricos; ver [LIMPIEZA-SEDAPAL](LIMPIEZA-SEDAPAL.md).
