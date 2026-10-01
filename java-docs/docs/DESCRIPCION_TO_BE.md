# Descripción del TO-BE: Hidro Mejora

## AS-IS y TO-BE

- **AS-IS**: situación / aplicación original de SEDAPAL analizada por el
  equipo.
- **TO-BE**: **Hidro Mejora**, la propuesta de mejora desarrollada como
  prototipo web.

Este documento describe únicamente Hidro Mejora.

## Qué es Hidro Mejora

Prototipo académico de plataforma corporativa de facturación de agua
potable. El usuario ingresa con su número de suministro (7–9 dígitos) y
una clave demostrativa, y accede a un panel con navegación interna por
secciones.

## Módulos reales del TO-BE

- **Inicio**: resumen del suministro, acciones rápidas y gráficos de
  consumo (m³) y evolución del gasto (S/) de los últimos 6 meses.
- **Recibos**: historial de 12 recibos con búsqueda por mes, filtro por
  año y filtros por estado (Todos/Pagado/Pendiente/Vencido).
- **Detalle del recibo**: periodo, emisión, vencimiento, lecturas,
  desglose demostrativo, consumo con semáforo y acciones de PDF y pago.
- **PDF**: comprobante demostrativo en A4 con jsPDF; modo recibo y modo
  constancia de pago con código de operación.
- **Pago simulado**: modal con métodos demostrativos que marca el recibo
  como pagado y genera el código `PAG-año-número`. Sin cargos reales.
- **Incidencias**: registro local en el navegador (código
  `INC-2026-número`, tipo, descripción, dirección, foto solo en sesión,
  ubicación opcional).
- **Cortes de servicio**: listado demostrativo con buscador por distrito
  y estados Programado/En proceso/Restablecido.
- **Atención al Cliente**: canales de orientación, reclamos y preguntas
  frecuentes (módulo informativo, no entidad).
- **Tutorial**: recorrido guiado de 10 pasos, automático en el primer
  acceso y repetible con “Ver tutorial”.
- **HidroBot**: asistente virtual local basado en reglas e intenciones,
  sin IA externa; orienta sobre recibos, consumo, incidencias, cortes,
  tutorial y atención.

## Datos

Todos los recibos, pagos, cortes y montos del prototipo son
**demostrativos** y no corresponden a información productiva de SEDAPAL.
