# Modelo de dominio TO-BE — Hidro Mejora

> **Modelo académico e histórico TO-BE; no es el contrato de Hidro-Mejora v1.0.0.** Estas clases Java y el texto original describen una etapa anterior del prototipo. No son el backend Node/Express, el esquema PostgreSQL ni las clases nativas Android. Se conserva toda la información original como antecedente, incluso donde usa la palabra «actual». Las cantidades y simulaciones del cuerpo pertenecen a ese modelo, cuya fecha/commit original no se fija aquí.
>
> Documentación vigente: [arquitectura](../../../../docs/ARCHITECTURE.md), [API y reglas de entrada](../../../../docs/API.md), [PostgreSQL](../../../../docs/DATABASE.md), [producto](../../../../docs/MEJORA-PROFESIONAL.md) y [Android/Java 21](../../../../docs/ANDROID.md). El rol SQL/API normal es `usuario`, el otro es `admin`; el suministro actual exige nueve dígitos. Recibos, pagos, incidencias, fotos y atención se persisten mediante API/PostgreSQL; no siguen series demo ni almacenamiento local como fuente de verdad.


## Suministro (`model.Suministro`)

- **Responsabilidad**: identificar la sesión demostrativa del usuario.
- **Datos**: número (7–9 dígitos), estado del servicio (“Activo”).
- **Operaciones**: `esNumeroValido()`.
- **Relaciones**: 1 — 1 con `HistorialRecibos`.
- **Representa**: formulario `login-form` y chip de suministro del panel.

## Recibo (`model.Recibo`)

- **Responsabilidad**: recibo mensual consultable del historial.
- **Datos**: id, número, etiqueta, periodo, mes, año, emisión,
  vencimiento, monto (`BigDecimal`), estado, consumo m³ y lecturas,
  código de pago opcional.
- **Operaciones**: `tieneDeudaPendiente()`, `tieneConstanciaDisponible()`.
- **Relaciones**: pertenece a `HistorialRecibos` (1..*); 1 — 0..1 con
  `Pago`.
- **Representa**: objetos del arreglo `recibos[]` de `generarRecibos()`.

## HistorialRecibos (`model.HistorialRecibos`)

- **Responsabilidad**: agrupar los 12 recibos y sus consultas.
- **Operaciones**: listar, buscar, filtrar por estado, últimos meses,
  promedio de consumo, promedio de gasto y deuda acumulada.
- **Relaciones**: composición 1 — 1..* con `Recibo`.
- **Representa**: `renderCards()`, filtros, búsqueda y gráficos web.

## Pago (`model.Pago`)

- **Responsabilidad**: registro del pago **simulado**.
- **Datos**: código de operación, recibo, monto, fecha y método.
- **Relaciones**: 1 — 0..1 con `Recibo` (existe solo si se pagó).
- **Representa**: modal de pago y código `PAG-año-número`.

## Incidencia (`model.Incidencia`)

- **Responsabilidad**: reporte ciudadano del suministro.
- **Datos**: código, tipo, descripción, dirección, suministro, fecha,
  coordenadas opcionales y `tieneFoto` (sin Base64).
- **Relaciones**: cada reporte pertenece a un suministro (1 — *).
- **Representa**: formulario de incidencias y arreglo `incidencias[]`.

## CorteServicio (`model.CorteServicio`)

- **Responsabilidad**: intervención programada o atendida (demostrativa).
- **Datos**: distrito, zona, fecha, horario, motivo y estado.
- **Representa**: elementos del arreglo `CORTES` y su buscador.

## Tutorial (`model.Tutorial`)

- **Responsabilidad**: estado y navegación del recorrido guiado.
- **Datos**: activo, paso actual, total (10) y visto.
- **Operaciones**: iniciar, siguiente, anterior, finalizar, reiniciar.
- **Representa**: `SPOT_STEPS` y el botón “Ver tutorial”.

## HidroBot (`assistant.HidroBot`)

- **Responsabilidad**: detectar la intención del mensaje y responder con
  datos de la sesión. Asistente local por reglas, sin IA externa.
- **Operaciones**: `detectarIntencion()`, `generarRespuesta()`.
- **Relaciones**: dependencias de consulta hacia `HistorialRecibos`,
  `Incidencia`, `CorteServicio` y `Tutorial`.
- **Representa**: `detectBotIntent()` / `handleBotIntent()` y sus 20
  intenciones (`assistant.IntencionHidroBot`).

## Decisiones de modelado

- No existe clase `Cliente`: la sesión solo usa el número de suministro;
  inventar DNI o datos privados falsearía el modelo.
- No existe clase `Coordenada`: la ubicación es un texto opcional
  “latitud, longitud” dentro de `Incidencia`.
- Atención al Cliente es un módulo informativo, no una entidad.
- El PDF se modela como la interfaz `ComprobanteService` (recibo y
  constancia), no como entidad.
