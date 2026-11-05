# Plan — DOC-01

1. Research específico de fuentes/docs y auditoría de automatizaciones en lectura, conservando rama y árbol.
2. Especificar FR/NFR/AC y pruebas DOC-T01..05; corregir guías de entrada, arquitectura/Docker/BD/tests/seguridad y alcance histórico API/Android.
3. Añadir guías CI y SDD/RPI, auditar controles de publicación y actualizar índice, trazabilidad y CHANGELOG.
4. Validar enlaces locales, catálogo, checker CI con controles negativos y simulación en memoria del parche Vercel; revisar diff/contenido preparado. Commit local separado; no push/PR.

Constitution Check antes/después: una constitución, sin cambios funcionales ni migraciones, sin credenciales, recursos reales o automatismos de Spec Kit. El permiso actual del propietario sustituye la exigencia general de push/PR. No ampliar alcance a ajustes de providers ni trabajo de análisis de otro compañero.

Dependencias/riesgos: settings remotos no expuestos, overlays con PR26 y deriva futura de tests. Mitigar explicitando pendientes y repitiendo auditoría antes de publicación. No bloquear el cierre documental por un run remoto no autorizado; sí bloquear publicación hasta inventario externo completo.
