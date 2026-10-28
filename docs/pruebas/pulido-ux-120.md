# Pulido medido de cliente — incremento B

Sobre el incremento A (`50f53cc`), sin reconstruir pantallas, cambiar logo,
paleta, dependencias, contratos, documentos ni funciones de negocio.

## Defectos y corrección

| Hallazgo | Antes | Después comprobado |
| --- | --- | --- |
| B-01: accesos rápidos estrechos | «Documentos»/«Reportar» partidos dentro de palabras a 360 px | Tres columnas en teléfonos, cinco accesos conservados, etiquetas de 13 px y una línea en 360/390/412/768 |
| B-02: controles HidroBot | Cerrar/minimizar/limpiar: 30×30 px; sugerencias: 36 px de alto | Objetivos de al menos 44×44 px y sugerencias de al menos 44 px de alto |
| Tutorial de Inicio | Botón de 40 px | 44 px usando el token táctil existente |
| Espacio del asistente | 81 px de conversación en la referencia comparable a 360 px; ampliar botones sin recomponer empeoraba el espacio | Encabezado con rejilla, subtítulo legible, sugerencias en dos columnas y entrada mínima de 44 px; conversación visible de 152/180/180/220 px |

La revisión de las primeras capturas rechazó la ampliación aislada de botones
porque restaba espacio útil al chat. La composición final conserva todos los
controles, texto introductorio, sugerencias, envío y conversación desplazable.
No se ocultan acciones para conseguir que el diseño quepa.

## Evidencia real

63 capturas posteriores: `artifacts/auditoria-calidad-120/after-7e2sV0/`.
Matriz cliente 360×800, 390×844, 412×915 y 768×1024; Admin 1366×768 y 1920×1080.
Cero findings de overflow, controles fuera del ancho, campos sin nombre ni
imágenes rotas; cero errores JS o recursos HTTP fallidos.

El harness exige cinco etiquetas de accesos rápidos de una sola línea y controles
HidroBot de 44 px en los cuatro tamaños cliente, además de conversación visible
de al menos 96 px. Espera el saludo real del asistente antes de capturar.
Pruebas dirigidas de HidroBot, perfil y paleta: **10/10 aprobadas**.

Se conserva la galería inicial de A. Para una comparación homogénea del saludo,
se sirve su runtime anterior preservado con el mismo harness/espera de la captura
posterior. Esto ejecuta el cliente anterior en Chromium contra API y PostgreSQL
reales nuevos; no revierte fuentes ni fabrica imágenes:

```bash
HIDRO_QUALITY_REFERENCE=baseline-tIAJjU \
  node scripts/test/quality-audit-flow.cjs baseline
```

`HIDRO_QUALITY_REFERENCE` acepta solo un directorio `baseline-*` preservado bajo
los artefactos de esta auditoría. No apunta a producción ni permite otro origen
en el navegador. La nueva captura es una ejecución de referencia, no una nueva
compilación de las fuentes actuales. Comparar `client-inicio` y `client-hidrobot`
de esa galería (`baseline-UrZGnt`) con `after-7e2sV0`;
`comparacion-b.html` enlaza los 63 pares de imágenes reales. La referencia
confirmó dos líneas para Documentos/Reportar a 360 px y nueve controles menores
de 44 px al abrir el asistente; la captura posterior comprobó cero en ese estado.

Las capturas son full-page: las barras fijas aparecen en su posición de viewport;
el resto del contenido se recorre mediante scroll. No se interpretan como que
todo el documento es visible simultáneamente en el teléfono.

## Límites

Los cuadros de preferencias push miden 20 px, pero su label completo es el área
interactiva; no se los clasifica automáticamente como defecto de 20 px. Las
acciones compactas de tablas Admin mantienen su tratamiento existente para
puntero preciso/coarse. No se cambia globalmente el tamaño de todas las tablas.

B-03 (preferencia del tutorial al reiniciar muy rápido), teclado/zoom/TalkBack,
pantalla física y condiciones de teclado virtual reducido siguen pendientes.
La candidata Android con el CSS final se comprobará en D; las ejecuciones nativas
de A no se presentan como prueba de estos estilos nuevos. Sin FCM/correo/cobros
reales, cambios productivos ni APK oficial modificada.
