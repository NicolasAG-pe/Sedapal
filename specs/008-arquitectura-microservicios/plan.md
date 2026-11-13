# Plan MS-01

1. Auditoría, baseline segura, contratos y riesgos; commit documental.
2. Resolver contratos transaccionales y definir pruebas negativas antes de
   cambiar propietarios SQL. Extraer transporte Notifications con proveedor stub.
3. Extraer Auth; demostrar revocación, OTP, recuperación y MFA concurrentes.
4. Extraer Operations y Billing conservando transacciones; componer consultas
   administrativas y trasladar eventos a outbox/realtime.
5. Gateway con modos explícitos legacy/nuevo; laboratorio Compose exclusivo y
   roles independientes. Ningún cambio en compose estable.
6. Ejecutar matriz completa, preparar configuración productiva sin aplicarla,
   ensayar rollback y actualizar Draft PR con pruebas y CI verificadas.

Constitution Check: cambio arquitectónico autorizado expresamente; migraciones
históricas inmutables; main estable; datos sintéticos; no nuevos frameworks ni
broker sin necesidad demostrada. Cualquier cambio de garantía se documenta y
resuelve antes de habilitar tráfico, no se oculta como detalle de implementación.

Puerta de publicación: comprobar Render/Vercel y otros disparadores; exclusión
exacta local de esta rama en ambos vercel.json. Si no hay evidencia suficiente,
conservar commit local sin push. No alterar settings activos para sortearlo.
