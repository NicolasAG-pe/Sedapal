# Perfiles del esquema — DD-01

No describe el catálogo desplegado de Neon. No ejecutar init en una base existente. Todas las cantidades provienen de extracción estática, no de un servidor SQL.

| Perfil | Tablas | Columnas | FK | Índices totales | Secuencias | Funciones | Triggers |
|---|---|---|---|---|---|---|---|
| laboratorio-init | 22 | 186 | 29 | 50 | 10 | 8 | 10 |
| laboratorio-ampliado | 27 | 254 | 38 | 64 | 10 | 15 | 17 |
| produccion-minima | 19 | 159 | 21 | 42 | 9 | 3 | 3 |
| produccion-extendida | 26 | 243 | 34 | 62 | 10 | 13 | 15 |


- **laboratorio-init**: init.sql completo. Incluye correo003/004/006, integridad005, 2FA007, operaciones008, piloto009/010 y seguimiento013. No incluye011/012/014.
- **laboratorio-ampliado**: init +011 +012. 013 ya está en init. Incluye piloto, recuperación y push. No aplicar014.
- **produccion-minima**: prefijo de init anterior al marcador de007 +007 +008 +014, igual al fixture DB-01. Conserva seis columnas de compatibilidad piloto, todas deben ser NULL, sin tabla/FK piloto.
- **produccion-extendida**: ese prefijo +007 +008 +011 +012 +013 +014. Es una composición sintética del contrato de pruebas, no prueba de autorización ni aplicación productiva de011/012.

001 añade lecturas y migra solo lecturas Usuario legacy; 002 agrega CHECK de nueve dígitos; 003 añade verificación/registro; 004 índice de retención; 005 valida relaciones/datos y agrega UNIQUE de recibos/pagos mediante DDL dinámico; 006 outbox; 007 MFA/revocación por rol/activo; 008 operaciones/auditoría y transiciones; 009 piloto aislado y ampliación entorno; 010 revisión sintética; 011 recuperación/revocación por credenciales; 012 push y notificaciones de cortes; 013 seguimiento e idempotencia de incidencias; 014 compatibilidad sin piloto. Las definiciones001–006 ya están en el prefijo usado, no forman una instalación desde cero independiente.

**Diferencias importantes**: 009 agrega FK operaciones_pago.piloto_id → control_piloto_yape.piloto_id y CHECK de nombre de base temporal; 010 reemplaza chk_piloto_local. 014 rechaza tabla piloto, no agrega FK y exige entorno simulado/metadatos NULL. Los índices parciales de operaciones activas y referencias verificadas no convierten esas relaciones en1:1 global. SQL admite varios suministros por usuario; pagos es0..1 por recibo; usuario_2fa es0..1 por usuario; correo_outbox es0..1 por envío. cortes_suministros es N:M legacy; la selección General/Zona es lógica de aplicación, no FK. activa_id de límites de recuperación y solicitud_id de eventos no son FK. El singleton del piloto permite a lo sumo una fila TRUE, no obliga a que exista.

**Backend**: receipt-transactions.js requiere pagos/operaciones y detecta piloto con to_regclass; email-cleanup.js verifica esquema de retención y FK outbox. Módulos email, two-factor, password-recovery, push, incident-tracking y payment-operations usan sus estructuras directamente; no se crean tablas en el arranque para ocultar ausencias. Las columnas fecha/hora/estado de cortes y notificaciones.leida son legacy. DATE no equivale a timestamp; TIMESTAMP antiguo no tiene zona; TIMESTAMPTZ guarda instantes. UUID sin default se proporciona desde aplicación.

**Rutinas y permisos**: se conservan cuerpos completos en el diccionario; 013 usa SECURITY DEFINER con search_path fijo y REVOKE sobre función registrar_evento_incidencia/tablas de historial. Son permisos declarados, no inventario de roles/ACL de producción. Las guardas DO, lock_timeout y statement_timeout son controles de migración, no triggers persistentes. No se ejecuta DDL dinámico en el extractor; las dos unicidades de005 están corroboradas explícitamente en init. No hay vistas ni CREATE SEQUENCE explícitos: se documentan secuencias implícitas serial/identity.

**Validación pendiente**: aplicar cada perfil solo en una base PG18 nueva aislada, comparar pg_attribute/pg_constraint/pg_index/pg_sequence/pg_trigger/pg_proc (definiciones, índices parciales, nulabilidad, defaults, permisos y nombres implícitos). PG18/Docker no disponibles en esta sesión; no se afirma comparación con pg_catalog ni apertura en Excel de escritorio. XLSX validado estructuralmente por ZIP/XML y conteos.

## Fuentes y reproducibilidad

El modelo JSON incluye hashes SHA256 de init y las14 migraciones. Ejecutar `python3 scripts/data-dictionary.py --check` y `python3 scripts/test-data-dictionary.py`. El extractor solo admite la sintaxis del DDL actual; no es un motor SQL general. Cambios de sintaxis requieren ampliar y revisar extractor y pruebas. No incluir fixtures, filas, claves, correos ni parámetros privados.

| Fuente versionada | SHA256 |
|---|---|
| Base-de-Datos/init.sql | df1e82b8e98cde7fb6901b40d0767f4cc62de8797b8f43b22250d54c569b88bb |
| Base-de-Datos/migrations/001_notificaciones_lecturas.sql | 4af4e4131fe7475dbfc21199a0e2514de3f13f7b8c4364f171c816af96fef224 |
| Base-de-Datos/migrations/002_suministro_9_digitos.sql | 37f54e4f0592dbcc6f1e208d691d312793d17ebb1449c3eb1f871a23c643b388 |
| Base-de-Datos/migrations/003_verificacion_correo.sql | 445ff1c33d57a810286103ed52b588d843caee32d273c18b8c0c2f50f5fab71f |
| Base-de-Datos/migrations/004_retencion_correo.sql | ca4e3ae4aebda0033dc1ad3228cc147226b36aa823909b179d52f38a321c2348 |
| Base-de-Datos/migrations/005_integridad_recibos.sql | 5b4e9dfa12868a426d1fccfa854f4875b82dc4749482009684e22e57566d818e |
| Base-de-Datos/migrations/006_correo_outbox.sql | 9dc23df3d87eb6382299c2adf73df1a5fced1d58072ebce3f595deb943b6d621 |
| Base-de-Datos/migrations/007_usuario_2fa.sql | feb2a080cfcae977dd720488c097266cdd58de8822d22cd1c9d90da518078cda |
| Base-de-Datos/migrations/008_operaciones_pago.sql | cb3691ecaa7b8e71e1ebb57865ccf8472b6ac90a0d944a5364dadabca5cbb13c |
| Base-de-Datos/migrations/009_yape_piloto_local.sql | 6d0ee800915e0692f1bf2eeb800f5759b33290b140f045b6728a31ba0e6d6040 |
| Base-de-Datos/migrations/010_revision_piloto_sintetico.sql | a7a6eeccb443a6191044cc445da1db097eb31203b2427b9e7883cf9d5598b2fa |
| Base-de-Datos/migrations/011_recuperacion_clave.sql | a01a68d757e5e51ddb134bd6f98a9351474708689a24d89759e37d82fb2c994f |
| Base-de-Datos/migrations/012_notificaciones_push.sql | 73e752439036287b985fc5f7dcca1715dda45565994dee443f1347d2e8dec271 |
| Base-de-Datos/migrations/013_seguimiento_incidencias.sql | 74afba99d79a3bdd4afb034998cbbde13314db50ab2b6ce94ce67475be768c59 |
| Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql | 35cf77eb8640f14356c4c40f88887ab5ab2ef83d4c98b5a34355f569327c8494 |
