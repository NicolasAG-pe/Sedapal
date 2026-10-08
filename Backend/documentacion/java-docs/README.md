# Hidro Mejora — Modelo técnico TO-BE en Java

> **Modelo académico e histórico TO-BE; no es el contrato de Hidro-Mejora v1.0.0.** Estas clases Java y el texto original describen una etapa anterior del prototipo. No son el backend Node/Express, el esquema PostgreSQL ni las clases nativas Android. Se conserva toda la información original como antecedente, incluso donde usa la palabra «actual». Las cantidades y simulaciones del cuerpo pertenecen a ese modelo, cuya fecha/commit original no se fija aquí.
>
> Documentación vigente: [arquitectura](../../../docs/ARCHITECTURE.md), [API y reglas de entrada](../../../docs/API.md), [PostgreSQL](../../../docs/DATABASE.md), [producto](../../../docs/MEJORA-PROFESIONAL.md) y [Android/Java 21](../../../docs/ANDROID.md). El rol SQL/API normal es `usuario`, el otro es `admin`; el suministro actual exige nueve dígitos. Recibos, pagos, incidencias, fotos y atención se persisten mediante API/PostgreSQL; no siguen series demo ni almacenamiento local como fuente de verdad.


Proyecto académico Hidro Mejora · Universidad Norbert Wiener · Software I · 2026-II.

## 1. Qué es Hidro Mejora

Hidro Mejora es la **propuesta de mejora de la experiencia digital
analizada de SEDAPAL**: un prototipo web (HTML5, CSS3 y Vanilla
JavaScript) donde un usuario ingresa con su número de suministro y
consulta recibos, consumo, pagos simulados, incidencias, cortes de
servicio, comprobantes en PDF, tutorial guiado y el asistente HidroBot.

## 2. AS-IS y TO-BE

- **AS-IS**: situación / aplicación original de SEDAPAL analizada por el
  equipo.
- **TO-BE**: **Hidro Mejora**, nuestra solución de mejora.

Esta carpeta documenta técnicamente el **TO-BE**. No representa la
aplicación original de SEDAPAL ni propone otro sistema distinto.

## 3. Alcance de esta carpeta

> “El modelo Java documenta la estructura lógica del modelo TO-BE Hidro
> Mejora. La implementación funcional actual corresponde al prototipo web
> desarrollado con HTML, CSS y JavaScript.”

- **NO** es un backend: no hay Spring Boot, API REST, base de datos ni
  servidor.
- **NO** modifica `index.html`, CSS, JavaScript ni `assets/`.
- Sirve para documentación, modelado UML, explicación de arquitectura y
  preparación de una futura implementación Java.

## 4. Clases identificadas

| Clase | Representa en Hidro Mejora |
|---|---|
| `model.Suministro` | Número de suministro de la sesión (7–9 dígitos) |
| `model.Recibo` | Objeto del arreglo `recibos[]` (`generarRecibos()`) |
| `model.HistorialRecibos` | Conjunto de 12 recibos y sus consultas |
| `model.Pago` | Registro del pago simulado (`PAG-año-número`) |
| `model.Incidencia` | Reporte del formulario de incidencias |
| `model.CorteServicio` | Elemento del arreglo demostrativo `CORTES` |
| `model.Tutorial` | Recorrido guiado de 10 pasos (`SPOT_STEPS`) |
| `assistant.HidroBot` | Asistente local basado en reglas |
| `assistant.IntencionHidroBot` | 20 intenciones de `HIDROBOT_INTENTS` |

Enums: `EstadoRecibo`, `EstadoCorte`, `TipoIncidencia`.
Interfaces de documentación: `ReciboService`, `PagoService`,
`IncidenciaService`, `CorteService`, `ComprobanteService`.

## 5. Organización

```text
java-docs/
├── README.md
├── src/main/java/pe/edu/hidromejora/{model,enums,service,assistant}/
├── docs/
│   ├── DESCRIPCION_TO_BE.md
│   ├── MODELO_DOMINIO.md
│   ├── REGLAS_NEGOCIO.md
│   ├── MAPEO_WEB_JAVA.md
│   └── DIAGRAMA_CLASES_TO_BE_HIDRO_MEJORA.puml
└── javadoc/
```

## 6. Compilar las clases (solo JDK, Java 17)

```bash
cd java-docs
javac --release 17 -encoding UTF-8 \
  -d /tmp/hidromejora-classes \
  $(find src/main/java -name '*.java')
```

Resultado esperado: 0 errores. No se dejan `.class` en `src`.

## 7. Generar Javadoc

```bash
cd java-docs
javadoc --release 17 -encoding UTF-8 -docencoding UTF-8 -charset UTF-8 \
  -d javadoc -sourcepath src/main/java \
  pe.edu.hidromejora.model pe.edu.hidromejora.enums \
  pe.edu.hidromejora.service pe.edu.hidromejora.assistant
```

Abrir `javadoc/index.html` en el navegador.

## 8. Visualizar el PlantUML

El diagrama está en
`docs/DIAGRAMA_CLASES_TO_BE_HIDRO_MEJORA.puml`. Con PlantUML instalado:

```bash
plantuml -tsvg docs/DIAGRAMA_CLASES_TO_BE_HIDRO_MEJORA.puml
```

o pegarlo en el servidor web de PlantUML.

## Referencia vigente y conservación académica

El modelo continúa siendo una representación académica compilable con Java 17; Android utiliza Java 21 y otro árbol de fuentes. Las interfaces Java no implementan servicios REST ni deben desplegarse.

Los documentos originales se conservan, sin fusionarlos destructivamente:

- [Descripción TO-BE histórica](docs/DESCRIPCION_TO_BE.md).
- [Modelo de dominio académico](docs/MODELO_DOMINIO.md).
- [Reglas del prototipo anterior](docs/REGLAS_NEGOCIO.md).
- [Mapeo histórico y correspondencias vigentes](docs/MAPEO_WEB_JAVA.md).
- [Diagrama PlantUML académico](docs/DIAGRAMA_CLASES_TO_BE_HIDRO_MEJORA.puml); no es el ER PostgreSQL.

Los comandos originales de javac/Javadoc describen generación académica; no son resultados ejecutados de la actualización documental. `javadoc/` es una salida ignorada, nunca miles de archivos HTML fuente. Para trabajar exclusivamente dentro de Sedapal, generar clases en una salida nueva bajo `artifacts/` en vez de la ruta temporal histórica.
