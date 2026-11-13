# Preparación futura de producción

## Consulta Render autorizada — MS-02

Workspace confirmado por el propietario: wDeco's workspace. Consulta en lectura
2026-11-13: `hidro-mejora-api`, rama main, raíz Backend, autoDeploy=no,
autoDeployTrigger=off, previews.generation=off y pullRequestPreviewsEnabled=no.
Último despliegue listado `dep-dbhoj23bc2fs73f115q0`: live, trigger api, commit
6894b3e3fde8c6600a87816ad8675c0446b676d5. No se consultaron secretos ni se
modificó configuración. Esto no inventaría hooks externos ni certifica salud
funcional. La instrucción posterior del propietario **prohíbe push**, aunque
los despliegues automáticos del servicio estén desactivados.

Notifications ya dispone de Dockerfile independiente. Su modo proveedor sigue
cerrado por defecto y no se ha probado contra servicios reales.

Estado: **no lista para desplegar**. No se crearon servicios, Blueprints ni
credenciales; no se consultó ni modificó Neon. La integración a main y la
activación deben ser decisiones separadas.

Destino propuesto: gateway y Realtime persistentes en Render o equivalente;
Auth/Billing/Operations/Notifications con despliegue independiente y comunicación
privada autenticada. Admin estático en Vercel. Neon con roles mínimos distintos,
TLS verificado y límites de conexiones por proceso. Los pools deben caber en
el presupuesto de conexiones incluso durante solapamiento de releases.

La APK publicada contiene una URL del proveedor. Mantenerla requiere que el
propietario conserve ese servicio/hostname como gateway o proxy de transición;
crear otra URL no actualiza APK instaladas. Revisar además CORS de Admin y
`https://localhost`, Socket.IO polling/upgrade y expiración/revocación de JWT.

## Cambios que deberá realizar el propietario después de autorizar

1. Confirmar cuenta, región, red privada, capacidades, planes y presupuesto.
2. Crear servicios independientes desde imágenes inmutables, con auto-deploy y
   previews controlados; configurar health y shutdown.
3. Provisionar secretos por servicio sin recrear la identidad JWT vigente;
   preservar claves OTP/outbox durante drenaje y rotar con procedimiento.
4. Inventariar esquema real de Neon, ensayar respaldo/restauración y migración
   aditiva; aplicar solo cambios aprobados y pendientes.
5. Desplegar sin tráfico, validar readiness y contratos con cuentas de prueba
   autorizadas; ningún envío real se presupone autorizado.
6. Mantener el hostname actual en gateway. Activar lecturas por dominio antes
   de escrituras; un único escritor por dominio. Sin espejar POST/PATCH.
7. Actualizar gateway por configuración versionada, comprobar upstreams,
   drenar conexiones y verificar polling/WebSocket tras reconexión.
8. Observar errores, latencia, locks, cola y conexiones; revertir usando 07 si
   falla un criterio. Retirar monolito únicamente al terminar la ventana acordada.

## Costos y límites pendientes

No se ha cotizado un plan ni verificado tarifas actuales. El presupuesto debe
incluir gateway + cuatro dominios + Realtime, workers si se separan, Neon,
transferencia entre proveedores, logs y entornos de revisión. Medir RAM/CPU,
concurrencia Socket.IO, latencia a Neon, máximo de conexiones y retención de
outbox antes de dimensionar. Verificar suspensión por inactividad, soporte de
red privada/WebSocket y límites de build con documentación vigente del plan.
No asumir que servicios gratuitos cubren procesos persistentes independientes.

## Checklist de salida

- [ ] Implementación completa y pruebas de 06 acreditadas por SHA.
- [ ] Configuraciones de despliegue independientes creadas y validadas sin aplicar.
- [ ] Perfiles PostgreSQL y permisos negativos probados.
- [ ] URL estable, Android, Admin y Socket.IO validados.
- [ ] Roles, secretos, backups, restauración y conexiones revisados.
- [ ] Costos/límites vigentes revisados por propietario.
- [ ] Canario, corte de escritor y rollback ensayados.
- [ ] Automatizaciones comprobadas antes de push/PR.
- [ ] Aprobación de merge y, separadamente, de activación productiva.

Consulta de automatizaciones de esta sesión: Vercel devuelve dos proyectos
asociados al repositorio, pero su proyección no muestra raíces ni hooks/reglas
completas. Render requiere confirmar el workspace descubierto antes de listar
servicios. No se interpreta ausencia de datos como ausencia de automatización.
