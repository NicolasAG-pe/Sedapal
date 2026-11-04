# Feature Specification: PKG-01 — empaquetado del cliente

Feature Branch: chore/adopcion-sdd-rpi (conservada por instrucción del propietario).
Created: 2026-11-04. Status: Draft / PLAN-01; implementación no autorizada.
Input: corregir mínimamente recursos explícitos y exclusiones Docker, conservando arquitectura.
Base: [baseline](../baseline.md). Constitución: [única](../../.specify/memory/constitution.md).

## User Scenarios & Testing

### US1 — Cliente completo en instalación local (P1)
Como usuario necesito que el cliente cargue sus recursos para acceder a las funciones existentes.
Prueba independiente: inspeccionar artefacto y cargarlo en un servidor aislado.

- AC-PKG-01: Dado el contexto raíz y el Dockerfile de Frontend, cuando se construya con BuildKit, todos los COPY tendrán entradas disponibles y el build terminará sin error por recursos excluidos.
- AC-PKG-02: Dado el artefacto resultante, cuando se soliciten two-factor-ui.js, password-recovery-ui.js e incident-timeline.js bajo shared/, los tres existirán con contenido esperado y se servirán como JavaScript, sin respuesta HTML sustitutiva.
- AC-PKG-03: Dado el cliente, cuando se abran recuperación y seguimiento con fixtures y capacidades pertinentes, los módulos cargarán sin errores por dependencia ausente; funciones deshabilitadas conservarán su comportamiento.

### US2 — Omisión detectada antes de publicar (P2)
Como mantenedor necesito que la verificación rechace artefactos incompletos.
Prueba independiente: retirar cada recurso obligatorio de una copia sintética del artefacto.

- AC-PKG-04: Dado un runtime completo, cuando se valide, será aceptado; si falta cualquiera de los tres scripts, fallará identificando su ruta.
- AC-PKG-05: Dados los destinos existentes, cuando se valide su contrato, build-web cliente y assets destinados a Android conservarán sus recursos y la comprobación de ausencia de código administrativo.

### Edge Cases

Resolver rutas relativas desde el documento/recurso que las referencia; distinguir URL externas, data:, fragmentos y query strings. Conservar capitalización en Linux. Los recursos cargados dinámicamente deben estar inventariados aunque no aparezcan como script src. No considerar un HTTP 200 con HTML de fallback como éxito. No exigir incluir imágenes históricas excluidas intencionalmente si no son dependencias del runtime.

## Requirements

### Functional Requirements

- FR-PKG-001: El contexto debe permitir todos los recursos solicitados por los COPY vigentes.
- FR-PKG-002: El artefacto debe incluir las dependencias locales ejecutables del cliente, incluyendo los siete módulos Shared enumerados en el contrato.
- FR-PKG-003: El verificador debe rechazar ausencia de cualquiera de los tres módulos implicados y conservar sus verificaciones actuales.
- FR-PKG-004: Los recursos y rutas de build-web/Android deben conservarse sin publicar código Admin en el cliente.

### Non-Functional Requirements

- NFR-PKG-001: Corrección mínima: listas explícitas y exclusiones; sin cambios de framework, Compose, Nginx, despliegues o funcionalidades.
- NFR-PKG-002: La validación no leerá secretos ni necesitará servicios reales, pagos, correo o notificaciones live.
- NFR-PKG-003: Pruebas de contrato reproducibles con herramientas existentes cuando sea posible; dependencias adicionales requieren revisión separada.

## Success Criteria

SC-PKG-001: AC-PKG-01 a 05 comprobados con resultado, SHA y entorno registrados; cero dependencias locales obligatorias ausentes en el alcance validado.
SC-PKG-002: Cada omisión deliberada de los tres módulos produce fallo de verificación; el artefacto completo pasa.
SC-PKG-003: No hay cambios de comportamiento funcional, SQL ni configuración de despliegue en el diff de corrección.

## Assumptions and Boundaries

La construcción y navegador requieren autorización posterior y herramientas disponibles; no se ejecutan en PLAN-01. Kubernetes es referencia de lectura, no destino a modificar. No se compila ni publica APK para este cambio. Dependencias locales transitivas se inventariarán antes de afirmar cobertura completa.
