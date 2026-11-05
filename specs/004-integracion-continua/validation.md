# Validación CI-01 — implementación local lista, ejecución remota pendiente

2026-11-05. Base: TEST-01 commit6c4c2a4. Un workflow .github/workflows/ci.yml, dos jobs safe e integration con needs:safe. Código funcional, migraciones, lockfiles, pruebas existentes y configuración de despliegue sin cambios.

## Comprobaciones locales realizadas

- YAML parseado con yaml2.3.4 ya disponible, uniqueKeys=true; sin errores. scripts/check-ci.cjs --self-test ejecutado con Node20 host y Node22.23.4 de imagen local, parser montado read-only; ambos salida0.
- Ocho controles negativos rechazados: evento privilegiado, contents:write, contexto job.services colocado en job.env, acción móvil sin SHA, comando deploy, montaje de host, subida amplia de artifacts y clave YAML duplicada. No es el esquema completo ni motor de GitHub Actions; actionlint/act no instalados.
- El primer borrador colocaba job.services.postgres.ports en job.env; revisión de la [tabla oficial de contextos](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts) detectó que allí no existe job. Se movió a steps.env del comando de integración y se añadió control negativo. Ningún borrador fue publicado ni ejecutado remotamente.
- Acciones oficiales v7 fijadas a los SHA verificados en research.md; checkout persist-credentials=false y fetch-depth0 en job seguro para tag v1.0.0. Node del proyecto22 y caché automática deshabilitada. El runtime de acciones no sustituye ese Node.
- contents:read, sin secrets/OIDC/environments, sin PR privilegiado, runs-on ubuntu-24.04 hosted; eventos PR/main, push desarrollo y manual. Concurrencia por ref y timeout10min. No comandos de despliegue, publicación, correos live, APK, Neon o herramientas de análisis ajenas al alcance.
- Scripts/rutas comprobados por checker, catálogo vigente. npm ci Backend --ignore-scripts se validó offline en TEST-01 (151 paquetes). Comparación posterior: las151 versiones instaladas en la imagen usada para pruebas coinciden con Backend/package-lock.json. No se instalaron dependencias en el repositorio ni paquetes nuevos del producto. El CI instalará solo Backend; herramientas Capacitor del lock raíz no son necesarias para estas suites.
- npm test y sus contratos:128 aprobadas; integración PG18 sintética:62 aprobadas/0 fallidas/1 omisión condicional ya acreditada en DB-01. Se reutiliza evidencia TEST-01 porque código y comandos no cambiaron. No se repiten suites sin motivo ni se atribuyen estas ejecuciones a GitHub.
- Reportes de TEST-01 reales: JUnit y run.json existen. Upload configurado exclusivamente safe-*/junit.xml/run.json e integration-*/junit.xml/run.json, sin V8, fixtures, keystores, ocultos ni artifacts/**. Retención7días, if:always y aviso si no existen; un paso de test fallido conserva su estado fallido.

## PostgreSQL y límites

Workflow crea service postgres:18 nuevo por job, padre hm_email_test/rol hm_fixture, contraseña explícitamente sintética, PGDATA tmpfs, healthcheck y puerto dinámico solo127.0.0.1. El puerto se entrega exclusivamente al paso de integración; runner preflight comprueba DB/rol/versión y luego crea bases hijas nuevas. Sin variables de conexión reales ni montajes de base existente. La topología exacta, interpolación de puertos, pulls/health y retirada automática del service de GitHub requieren run remoto; no se simularon como aprobados. Localmente se validó PG18.6 network none y tmpfs en TEST-01; sus recursos ya están retirados.

## Colaboración y publicación

Consulta ls-remote de solo lectura: main remoto d3d27d0, rama local no publicada. No alteró ramas de compañeros, protecciones, PR ni refs locales. Los scripts existentes se conservan; cualquier colaborador que cambie/añada tests debe revisar y regenerar el inventario antes de que pase test:inventory. No se introdujeron políticas externas ni checks requeridos sin autorización.

No push/PR/merge: no existe URL de run remoto que se pueda afirmar. No se inspeccionaron settings de Actions ni políticas de la organización; podrían restringir versiones/acciones/permisos. Antes de publicar es obligatorio revisar previews y automatizaciones conectadas. La rama actual no figura expresamente bloqueada en ambos vercel.json y no se autoriza cambiarlos en este trabajo: permanece como precondición de publicación futura, no una afirmación de despliegues deshabilitados en proveedores.

AC-CI-01..05 comprobados en el alcance local (diseño, sintaxis, políticas y scripts); CI-TASK-006 permanece pendiente y sin autorizar. Implementación preparada y commit local independiente; no CI verde en GitHub. No cambios de otros avances ni configuraciones de otros compañeros.
