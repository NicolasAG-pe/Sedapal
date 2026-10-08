# Mapeo web → Java (TO-BE Hidro Mejora)

> **Modelo académico e histórico TO-BE; no es el contrato de Hidro-Mejora v1.0.0.** Estas clases Java y el texto original describen una etapa anterior del prototipo. No son el backend Node/Express, el esquema PostgreSQL ni las clases nativas Android. Se conserva toda la información original como antecedente, incluso donde usa la palabra «actual». Las cantidades y simulaciones del cuerpo pertenecen a ese modelo, cuya fecha/commit original no se fija aquí.
>
> Documentación vigente: [arquitectura](../../../../docs/ARCHITECTURE.md), [API y reglas de entrada](../../../../docs/API.md), [PostgreSQL](../../../../docs/DATABASE.md), [producto](../../../../docs/MEJORA-PROFESIONAL.md) y [Android/Java 21](../../../../docs/ANDROID.md). El rol SQL/API normal es `usuario`, el otro es `admin`; el suministro actual exige nueve dígitos. Recibos, pagos, incidencias, fotos y atención se persisten mediante API/PostgreSQL; no siguen series demo ni almacenamiento local como fuente de verdad.


Demuestra que cada clase Java representa una parte real del prototipo.

| Implementación web | Símbolo en `index.html` | Representación Java |
|---|---|---|
| Login y suministro | `login-form`, `recibos = generarRecibos(sup)` | `Suministro` (+ `esNumeroValido()`) |
| Recibo mensual | objetos de `recibos[]` | `Recibo` |
| Estados del recibo | `'Pagado'/'Pendiente'/'Vencido'` | `EstadoRecibo` |
| Historial y filtros | `renderCards()`, chips, `search-mes`, `filter-anio` | `HistorialRecibos` |
| Gráficos y promedios | `renderChart()`, `renderSpendChart()`, `promedio6()` | `HistorialRecibos.calcularPromedioConsumo/Gasto` |
| Detalle del recibo | `abrirDetalle()`, `desglose()` | `Recibo`, `HistorialRecibos` |
| Pago simulado | `abrirPago()`, `paymentCode` (`PAG-…`) | `Pago`, `PagoService` |
| PDF recibo/constancia | `generarReciboPDF(r, opciones)`, modo `payment` | `ComprobanteService` |
| Incidencias | `incidencias[]`, `guardarInc()`, `tieneFoto` | `Incidencia`, `IncidenciaService` |
| Tipos de incidencia | `select#inc-tipo` (8 opciones) | `TipoIncidencia` |
| Cortes | `CORTES`, `renderCortes()`, buscador | `CorteServicio`, `EstadoCorte`, `CorteService` |
| Tutorial 10 pasos | `SPOT_STEPS`, “Ver tutorial” | `Tutorial` |
| HidroBot | `detectBotIntent()`, `handleBotIntent()` | `HidroBot` |
| Intenciones | `HIDROBOT_INTENTS` (20 ids) | `IntencionHidroBot` |
| Consultas del bot | último recibo, deuda, consumo, cortes | `ReciboService`, `HistorialRecibos` |
| Atención al Cliente | módulo informativo de ayuda | Documentado, sin entidad propia |

## Correspondencias comprobadas en v1.0.0

La tabla original precedente es histórica. `generarRecibos`, `hmHash` y `hmRand` ya no existen en Frontend; `CORTES` no es la fuente vigente de avisos.

| Función actual | Fuente de verdad / entrada |
|---|---|
| Sesión | `client-session.js`, JWT; API auth. No asignación de rol desde el modelo Java. |
| Recibos/gráficos | `cargarRecibosDesdeAPI`, `/api/me/recibos`; promedios desde recibos consultados, sin doce filas fijas. |
| Pago | POST `/api/pagos`; monto/código del backend, sin transacción bancaria. |
| PDF | Motor `HMDocuments.receipt/payment` en documents.js y wrappers de Frontend; no desglose tarifario inventado en documentos. |
| Incidencias | `/api/me/incidencias`, POST incidencia, foto BYTEA; `cargarIncidenciasDesdeAPI`. |
| Cortes | `/api/me/cortes`, `/api/cortes`; alcance y fechas persistidos. |
| Atención | `/api/atencion`; solicitudes/respuestas persistidas, a diferencia del modelo informativo antiguo. |
| Perfil | `/api/me/perfil`, `openDashboardPage` y `cargarPerfil`, incluidos hash/Cuenta móvil. |
| Tutorial/HidroBot | Reglas y navegación frontend vigentes; no ejecución de assistant.HidroBot Java. |

Los enums/clases Java conservan su alcance académico original; no representan necesariamente todos los estados y campos del SQL vigente. Consultar los documentos enlazados al inicio para el contrato actual.
