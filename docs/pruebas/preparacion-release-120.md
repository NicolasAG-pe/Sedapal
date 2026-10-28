# Verificación específica del candidato oficial 1.2.0

**Preparación local: no publicación, merge de PR ni despliegue productivo.**

| Comprobación | Evidencia actual |
| --- | --- |
| Integración main+cadena | Main `aba629f` + cabeza #20 `772e5e6`; #12–#20 ancestros de la cabeza; documentos/scripts de #21 idénticos |
| OTP | Patch-id de #11 `6cd433c` idéntico a incorporación `afac774`; sin reaplicar |
| Exclusión LAB | Sin src/lab, sufijo appId, firmante o scripts del #22 |
| Pruebas dirigidas | 24/24: identidad/actualización, firma, configuración pública, paleta y backend config |
| Gradle release | assembleRelease, testReleaseUnitTest, lintRelease y compilación de fuentes instrumentales aprobados |
| Firma | La permanente original; runner instrumental y APK anterior también coinciden |
| Upgrade Android15 | 1.1.2/código5 → 1.2.0/código6; install-r Success, sin desinstalar, UID/fecha/markers/preferencia conservados; instrumentación2/2 |
| Respaldo Neon | Custom consistente, conexión directa/TLS verify-full,13 tablas,435941 bytes; sin escrituras productivas |
| Restauración | Hashes de filas, columnas y secuencias iguales en contenedor sin red ni puertos |
| Ensayo migraciones | 007–013 dos veces en otra base local; datos previos conservados |
| Ruta productiva sin009/010 | Bloqueo histórico reproducido en1350258; corregido después por014 y validado en otra restauración. Ver informe de compatibilidad |
| Docker runtime | COPY corregido para8 módulos ausentes; imagen local construida y smoke sin red aprobado1/1 |
| Automatizaciones | Ambas raíces excluyen rama; Render autoDeploy/previews off; no workflow/hook nuevo |

La auditoría A–D y las pruebas ya aprobadas se reutilizan, no se vuelven a ejecutar
como si fueran evidencia nueva. Se solicitó la referencia de aprobaciones físicas
externas porque los informes versionados todavía las marcan pendientes; no se
inventa su resultado. El ensayo nuevo de upgrade es de emulador, no físico.

Durante la preparación inicial no se convirtió ningún PR Draft en Ready/merged.
Las reviews formales #12–#20
siguen vacías; hay condiciones de seguridad/operación que deben cerrarse. La
inscripción MFA queda deshabilitada: cero factores productivos activos observados
no equivale a disponer de un control obligatorio de downgrade remoto.

Los fallos del harness se conservan: CA del contenedor, servidor temporal de
bootstrap PG, bigint JSON texto/número y appId/userId en dumpsys Android15.
Se corrigieron selección de confianza/readiness y lectores de metadatos; no se
rebajaron aserciones ni se borraron datos para pasar. El defecto del Dockerfile
sí era de producto y habría impedido arrancar el backend desplegado.

La recuperación productiva no fue ejecutada; el restore local omite owner/ACL y
no certifica custodia externa ni recuperación de una región. El backup debe
renovarse antes de una futura ventana de migración mientras haya escrituras.
009/010 siguen sujetas a revisión por su naturaleza de laboratorio.

Evidencias privadas persistentes en
`/home/nico/.local/share/hidromejora/release-120/private/`: backup, fingerprint,
restauración/ensayo, builds, certificado, imagen, tests y upgrade. Los archivos
con datos productivos/secretos no se incluyen en Git ni en artefactos públicos.
[Plan y bloqueos concretos](../LANZAMIENTO-OFICIAL-120.md).


## Cierre de esta preparación

Se abrió Draft PR #23 hacia main; integración técnica `a87ef1a` con padres `aba629f` y
`772e5e6`. Los PR originales no se fusionaron ni cambiaron de Draft. Ninguna
función LAB del #22 está incorporada. Main sigue en `aba629f`.

El bloqueo de pagos de esta preparación inicial quedó resuelto posteriormente
por014, sin009/010. [Corrección y validación](compatibilidad-pagos-produccion-120.md).
La publicación sigue sujeta a revisión del PR y autorizaciones pendientes. La protección externa contra
downgrade no se ha instalado y la inscripción MFA permanece cerrada. No se
publicó tag/release/APK oficial1.2.0 ni se ejecutaron despliegues o migraciones
productivas. Las referencias de Render/Vercel y versiones previas se conservan;
las operaciones reales siguen apagadas.

## Preparación para revisión independiente —28/10/2026

Continuación de6010e6d, exclusivamente documental. Se reutilizan20 regresiones,
5 grupos REST,4 UI y pruebas Android anteriores; no se atribuyen ejecuciones nuevas.

- Nuevo respaldo Neon20:25:41Z, consistente/READ ONLY/TLS verify-full,435941 bytes.
  Restore20:27:50Z en base nueva aislada:13 tablas, hashes de filas, columnas y
  secuencias iguales; cero MFA activos. Producción sin DDL/escrituras; PG detenido
  después y todas las copias anteriores conservadas.
- Revalidación de la APK existente: apksigner correcto, certificado igual al pin
  permanente, aapt1.2.0/código6/paquete oficial y SHA-256 idéntico. Sin reconstruir
  ni abrir emuladores. La prueba física requiere referenciar el acta existente del
  mismo hash; no consta aquí, ni se declara aprobada por el ensayo AVD.
- Todo `k8s/` y el informe Kubernetes21 idénticos a mainaba629f. Cabezas12–20 son
  ancestros;22 no lo es y faltan sus archivos exclusivos. OTP no se reaplica.
- Render mismo deploy live, autodeploy/previews off. Admin estable mismo alias/ID,
  API_BASE_URL HTTPS coincide y CORS contiene su origen. Vercel cero deployments
  de esta rama antes de publicar. Sin workflows/hooks/rulesets ni protección de
  main; checks/reviews de23 vacíos al inicio. No equiparar CLEAN con aprobación.
- Revisor independiente disponible con permiso write:saul123bidfo. Solo23 se
  prepara para Ready por solicitud del propietario;12–20 permanecen Draft.
- Espacio libre aproximado2.4GiB/97% usado antes de los cambios; sin limpiezas.

[Ventana propuesta y gates exactos](../VENTANA-LANZAMIENTO-120.md). El bloqueo SQL
está resuelto; faltan revisión/actas, recuperación operativa y autorización de la
ventana. No hay merge, despliegue, migración Neon ni release en este avance.
