# Integración aislada — avance 18

## Auditoría previa a modificar código (22 de octubre de 2026)

Origen limpio y publicado: `feature/verificacion-correo` en
`68d76964887ec5d4604bb331b4e74727a6f7b6c5` (22 commits propios).
`git fetch origin` obtuvo main `049ca5f5d0979221ec2ed64b1f7f2779681ff116`
(seis commits propios). Main local permanece en `7930b26`.
PR [#1](https://github.com/NicolasAG-pe/Sedapal/pull/1): abierto, Draft,
CONFLICTING al comenzar. No se modifica su base, cabeza ni estado.

Se crea `integration/avance-18` en un worktree independiente, partiendo del
commit verificado. No se modifica ninguna de las dos ramas originales.
Por instrucción del propietario, los commits de integración quedan locales:
no se hace push, aunque el flujo general de AGENTS.md normalmente lo requiera.

### Cambios de main y riesgos detectados

- Kubernetes: manifiestos PostgreSQL 18/PVC, backend, Web/Admin, overlay y
  herramientas locales; handler de errores de conexiones SQL inactivas.
- Chatbot: conocimiento estático Sedapal con fuentes oficiales; conserva
  prioridades de consultas personales/emergencias. No usa IA remota ni secretos.
- Filtros: selectores `[data-filter]` sustituyen `.chip-filter`.
- `git merge-tree --write-tree` detectó conflictos de contenido únicamente en
  `Backend/server.js` y `package.json`. `Frontend/index.html` se combina sin
  conflicto textual; necesita pruebas de integración y revisión específica.
- El ConfigMap SQL de Kubernetes es anterior a 003–006: faltan solicitudes OTP,
  retención, integridad de recibos y outbox. Inicializarlo así rompe la API nueva.
  Una copia de init.sql no migra PVC existentes; no se deben aplicar migraciones
  automáticamente al arrancar cada réplica ni restaurar sobre datos históricos.
- Kubernetes no configura secretos OTP/outbox ni worker independiente. Las altas
  deben permanecer cerradas hasta acreditar correo/worker; nunca usar la ruta
  antigua como alternativa ni habilitar Resend durante estas pruebas.
- CORS de producción omite `https://localhost`, necesario para Android. Revisar
  además proxies API/Socket.IO y mantener una réplica hasta diseñar escalado.
- Las etiquetas locales reutilizadas y scripts `up.sh` crean/aplican recursos.
  No se ejecutarán: solo renderizado/validación local de archivos, sin clúster.
- Imágenes, secretos externos, TLS/Ingress, privilegios SQL mínimos, migración de
  históricos y recuperación requieren preparación operativa y autorización.
- La combinación de HTML no puede perder el arranque seguro, contrato OTP,
  generación de sesión, ubicación, navegación ni aislamiento del código Admin.

### Plan de comprobación

Revisar cada conflicto, conservar ambos aportes y probar con bases nuevas en un
contenedor PostgreSQL exclusivo y Resend simulado. Ejecutar regresión Node,
Chromium y Android WebView real por separado. Conservar servicios Docker
existentes y todos sus datos. Verificar ancestros Git y refs originales al final.
Las pruebas previas de avance 17 son antecedentes, no resultados de esta rama.

## Resultado

Pendiente de integración y ejecución; no se declara Kubernetes operativo ni
Android integrado aprobado por esta auditoría.
