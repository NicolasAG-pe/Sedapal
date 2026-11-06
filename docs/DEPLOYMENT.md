# Destinos y publicación controlada

Esta guía describe configuración versionada y destinos históricos; **no certifica su estado remoto actual**. DOC-01 no despliega ni cambia settings. [Auditoría previa a publicación](../specs/004-integracion-continua/prepublication.md).

| Componente | Destino documentado / fuente |
|---|---|
| Admin | Proyecto Vercel hidro-mehora-admin; dominio histórico hidro-mehora-admin.vercel.app |
| Segundo proyecto Vercel | sedapal aparece vinculado al repositorio; raíz y propósito efectivos pendientes de comprobación |
| Backend | Servicio Render histórico hidro-mejora-api; Docker contexto Backend |
| Datos productivos | Neon, fuera de alcance; no se consultó ni migró |
| Cliente | Android Capacitor, distribución APK con autorización; [firma/versionado](ANDROID-RELEASE.md) |

El archivo raíz [vercel.json](../vercel.json) configura framework:null, `node scripts/build-web.js admin`, salida artifacts/web/admin e instalación omitida. [Backend/vercel.json](../Backend/vercel.json) contiene controles Git separados por la raíz de otro proyecto. El conector remoto devuelve framework express en ambos proyectos pero no expone raíz/Git/hooks: resolver esa discrepancia en Dashboard antes de asumir qué configuración se aplica. No modificarla por inferencia.

[Backend/Dockerfile](../Backend/Dockerfile) usa Node22-alpine, npm ci --omit=dev y **node start.cjs**, que supervisa API/workers según flags. No afirmar que inicia directamente server.js ni que los workers estén activos. La configuración remota de proveedor, esquema y flags requiere revisión específica sin revelar secretos.

Los dos vercel.json actuales excluyen main y varias ramas, pero no chore/adopcion-sdd-rpi. No se cambiaron aquí. El parche específico propuesto y los controles Render, previews, hooks y Apps figuran en la auditoría. Un workflow sin deploy no impide despliegues de proveedores externos. Mantener main y demás ramas sin cambios.

La autorización de CI remoto no equivale a permiso para desplegar aplicaciones, publicar APK ni crear PR. Hasta completar el inventario de todos los servicios y recibir autorización para el SHA revisado, no hacer push. [CI](CI.md) conserva su ejecución remota como pendiente.

Los informes de lanzamiento y pruebas remotas anteriores son históricos: [preparación1.2.0](LANZAMIENTO-OFICIAL-120.md), [guía VPS anterior](DEPLOY-VPS-HISTORICO.md). No revalidarlos consultando endpoints productivos en este avance. Para entornos nuevos locales, usar [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
