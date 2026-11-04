# Implementation Plan — PKG-01

Branch: chore/adopcion-sdd-rpi | Date: 2026-11-04 | [Spec](spec.md)
Estado: implementación PKG-01 autorizada; ver resultados reales en validation.md.

## Summary

Cerrar tres brechas de empaquetado con el mínimo diff. Primero caracterizar, después completar las listas y el verificador. No unificar builders todavía.

## Technical Context

HTML/CSS/JavaScript; Node 22 como referencia del proyecto; scripts Node existentes, Docker BuildKit y Nginx. Sin persistencia. Plataformas: cliente local y artefacto web para Android. No modificar infraestructura ni ejecutar instalaciones existentes. Objetivo: integridad del artefacto, sin inventar SLA de rendimiento.

## Constitution Check

Antes del diseño: alcance localizado, evidencia E, sin secretos ni cambios de producción: conforme. Después del diseño: no hay migraciones, reorganización ni dependencias nuevas propuestas; validación aislada: conforme documentalmente. Implementación autorizada exclusivamente para PKG-01; pruebas locales y build ejecutados, validación HTTP/navegador pendiente. No hay excepción constitucional adicional.

## Project Structure

Documentos: esta carpeta con spec, research, plan, tasks, quickstart y contracts/runtime.md. Archivos futuros: Frontend/Dockerfile, Frontend/Dockerfile.dockerignore, scripts/verify-client-runtime.js y scripts/test/client-packaging.test.cjs (propuesto). Mantener estructura actual. scripts/build-web.js es consumidor de regresión, no cambio previsto.

## Diseño y secuencia

1. Comprobar autorización, Git y herramientas; inventariar referencias/transitivas sin cargar .env.
2. Crear pruebas propuestas PKG-T02/PKG-T03/PKG-T04; obtener fallo pertinente en runtime incompleto y control positivo.
3. Reproducir PKG-T01 cuando se autorice build aislado, sin docker compose up ni alteración de contenedores existentes.
4. Incorporar los dos scripts omitidos al COPY y reincorporar los tres al contexto; exigir password-recovery en verificador.
5. Ejecutar pruebas corregidas, inspeccionar imagen y comprobar carga PKG-T05 con entorno temporal autorizado. Registrar limitaciones si falta navegador; no declarar cierre completo.
6. Revisar diff, aceptación y trazabilidad. Publicación y CHANGELOG solo bajo autorización y ciclo AGENTS.md.

## Riesgos y cierre

Una prueba que imita la lista puede repetir el error: añadir omisión deliberada y comprobación del artefacto. Una ruta 200 puede servir HTML: validar contenido. Una exclusión histórica puede ser intencional: exigir únicamente dependencias reales. No ampliar Shared por conveniencia. Cierre exige todos los AC comprobados; instalaciones o construcción no autorizadas quedan pendientes.

La sesión actual prohíbe iniciar servicios. PKG-T05 y la parte HTTP de AC-PKG-02 no se ejecutan ni se sustituyen por validación estática. Se conserva el criterio de cierre original.
