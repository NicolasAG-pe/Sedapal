# Orientación de HidroBot sobre Sedapal

El chatbot mantiene su diseño, seis opciones rápidas y consultas de la cuenta.
Añade orientación local sobre la empresa, cobertura, Aquafono, sedes, suministro,
reclamos, conexiones, Aquanet y ahorro de agua. No requiere claves ni un proveedor
externo de IA. No es un modelo generativo: las preguntas fuera de estos temas
reciben una sugerencia breve para reformular la consulta.

Las respuestas generales incluyen un enlace oficial y no afirman conocer costos,
horarios, requisitos específicos ni cortes en tiempo real. Las consultas personales
y emergencias mantienen prioridad y sus acciones existentes. Registrar una
incidencia en la app no reemplaza presentar un reclamo formal ante Sedapal.

Contenido en `Frontend/assets/js/sedapal-knowledge.js`. Fuentes consultadas el
21 de octubre de 2026:

- https://www.gob.pe/sedapal
- https://www.gob.pe/12786-llamar-a-sedapal-aquafono
- https://www.gob.pe/institucion/sedapal/contacto-y-numeros-de-emergencias

Validación: `npm run test:chatbot`, `npm run test:config`, `npm run build:web`
y `node scripts/verify-client-runtime.js artifacts/web/client`.

El archivo se incluye mediante `assets/` en los paquetes web y Android y en la
imagen del frontend para Kubernetes. No añade servicios ni variables de entorno.
