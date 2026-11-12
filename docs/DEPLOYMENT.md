# Destinos y publicación controlada

Esta guía describe configuración versionada y destinos históricos; **no certifica su estado remoto actual**. Referencia: `main` en `4f15173`, comprobada el 2026-11-11. [Auditoría previa a publicación](../specs/004-integracion-continua/prepublication.md).

| Componente | Destino documentado / fuente |
|---|---|
| Admin | Proyecto Vercel hidro-mehora-admin; dominio histórico hidro-mehora-admin.vercel.app |
| Segundo proyecto Vercel | sedapal aparece vinculado al repositorio; raíz y propósito efectivos pendientes de comprobación |
| Backend | Servicio Render histórico hidro-mejora-api; Docker contexto Backend |
| Datos productivos | Neon, fuera de alcance; no se consultó ni migró |
| Cliente | Android Capacitor, distribución APK con autorización; [firma/versionado](ANDROID-RELEASE.md) |

El archivo raíz [vercel.json](../vercel.json) configura framework:null, `node scripts/build-web.js admin`, salida artifacts/web/admin e instalación omitida. [Backend/vercel.json](../Backend/vercel.json) contiene controles Git separados por la raíz de otro proyecto. El conector remoto devuelve framework express en ambos proyectos pero no expone raíz/Git/hooks: resolver esa discrepancia en Dashboard antes de asumir qué configuración se aplica. No modificarla por inferencia.

[Backend/Dockerfile](../Backend/Dockerfile) usa Node22-alpine, npm ci --omit=dev y **node start.cjs**, que supervisa API/workers según flags. No afirmar que inicia directamente server.js ni que los workers estén activos. La configuración remota de proveedor, esquema y flags requiere revisión específica sin revelar secretos.

Ambos `vercel.json` excluyen `main`, `chore/adopcion-sdd-rpi`, `feature/verificacion-correo` y otras ramas mediante `git.deploymentEnabled`. Revisar los archivos para conocer la lista exacta: las ramas nuevas necesitan su propia exclusión en las dos raíces antes del primer push. Estos controles Git no acreditan el bloqueo de hooks, API ni otros proveedores. Conservar las exclusiones existentes.

El flujo vigente de [AGENTS.md](../AGENTS.md) requiere un Draft PR hacia `main` desde el primer avance, con revisión de automatizaciones antes del push y comprobación posterior de ausencia de despliegues. El merge, los despliegues y la publicación de APK requieren autorización explícita. [CI](CI.md) registra la evidencia remota disponible.

Los informes de lanzamiento y pruebas remotas anteriores son históricos: [preparación1.2.0](LANZAMIENTO-OFICIAL-120.md), [guía VPS anterior](DEPLOY-VPS-HISTORICO.md). No revalidarlos consultando endpoints productivos en este avance. Para entornos nuevos locales, usar [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).
