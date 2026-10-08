# Reglas de negocio TO-BE — Hidro Mejora

> **Modelo académico e histórico TO-BE; no es el contrato de Hidro-Mejora v1.0.0.** Estas clases Java y el texto original describen una etapa anterior del prototipo. No son el backend Node/Express, el esquema PostgreSQL ni las clases nativas Android. Se conserva toda la información original como antecedente, incluso donde usa la palabra «actual». Las cantidades y simulaciones del cuerpo pertenecen a ese modelo, cuya fecha/commit original no se fija aquí.
>
> Documentación vigente: [arquitectura](../../../../docs/ARCHITECTURE.md), [API y reglas de entrada](../../../../docs/API.md), [PostgreSQL](../../../../docs/DATABASE.md), [producto](../../../../docs/MEJORA-PROFESIONAL.md) y [Android/Java 21](../../../../docs/ANDROID.md). El rol SQL/API normal es `usuario`, el otro es `admin`; el suministro actual exige nueve dígitos. Recibos, pagos, incidencias, fotos y atención se persisten mediante API/PostgreSQL; no siguen series demo ni almacenamiento local como fuente de verdad.


Reglas extraídas del código actual del prototipo. Nada de lo aquí
descrito corresponde a tarifas o procesos oficiales de SEDAPAL.

## Acceso

- El número de suministro acepta solo dígitos, de 7 a 9
  (`Suministro.esNumeroValido()`).
- La clave demo exige mínimo 4 caracteres; no hay autenticación real.

## Recibos

- El historial de referencia contiene 12 recibos por suministro.
- El más reciente inicia `PENDIENTE`, el segundo `VENCIDO`; el resto
  sigue una serie demostrativa fija.
- El monto se calcula desde el consumo (cargo fijo + componente
  variable + ajuste determinístico); a mayor consumo, normalmente mayor
  monto, con variación natural.
- Los datos son estables por suministro: el mismo suministro muestra la
  misma serie en cada sesión demostrativa.

## Consumo y gráficos

- El promedio de consumo de los últimos 6 meses se usa en el chip, la
  línea, la leyenda, el detalle, HidroBot y el PDF (un solo valor).
- Semáforo: Normal (≤ promedio), Sobre el promedio y Consumo elevado
  (> 20 m³); nunca afirma fugas por sí solo.

## Pago simulado

- Solo recibos pendientes o vencidos pueden pagarse.
- Al confirmar se genera `PAG-año-número`, el recibo pasa a `PAGADO` y
  la deuda queda en S/ 0.00. No hay cargos reales.

## Comprobantes PDF

- Todo documento indica prototipo académico sin valor oficial.
- El recibo pagado muestra “Monto del recibo” y “Deuda pendiente:
  S/ 0.00”, nunca “Total a pagar”.
- La constancia exige recibo pagado con código de operación registrado.
- El desglose 60/22/18 es referencial del prototipo y cuadra al céntimo.

## Incidencias

- Descripción mínima de 10 caracteres y dirección obligatoria.
- Código `INC-2026-número`; foto solo en sesión (`tieneFoto`), ubicación
  opcional; almacenamiento local del navegador.

## Cortes

- Información demostrativa con buscador por distrito; estados
  Programado, En proceso y Restablecido.

## Tutorial e HidroBot

- Tutorial de 10 pasos: automático el primer acceso, repetible después;
  marca visto al finalizar, omitir o pulsar Escape.
- HidroBot reconoce 20 intenciones locales, sin IA externa ni backend.
