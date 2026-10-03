# Mapeo web → Java (TO-BE Hidro Mejora)

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
