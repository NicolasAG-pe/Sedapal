# Diccionario de datos — DD-01

Metadatos estáticos del repositorio; sin filas ni consulta a Neon. Regenerar con `python3 scripts/data-dictionary.py`; verificar con `--check`. [Perfiles y límites](perfiles-esquema.md), [DER](diagrama-entidad-relacion.md), [Excel](diccionario-de-datos.xlsx) y [modelo verificable](modelo-esquema.json).

Cada perfil es independiente. `BIGSERIAL` se muestra como BIGINT con secuencia derivada; PK/identity implican NOT NULL. Sin DEFAULT significa ausencia de default explícito. Las FK usan MATCH SIMPLE, NO ACTION al actualizar y son inmediatas/no diferibles salvo cláusula SQL contraria (ninguna aquí). CHECK admite NULL salvo NOT NULL; UNIQUE nullable admite varios NULL. Nombres sin declaración explícita y secuencias son inferencias estáticas, no resultados de pg_catalog. Identificadores implícita_N son IDs documentales, no nombres reales de constraints.

## laboratorio-init

22 tablas, 186 columnas, 29 FK y 50 índices (incluidos PK/UNIQUE derivados).

### control_piloto_yape

Control singleton exclusivo de laboratorio con ensayo sintético. Fuente: `Base-de-Datos/init.sql:437`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| singleton | BOOLEAN | sí | true | PK | Base-de-Datos/init.sql:438 |
| piloto_id | UUID | sí | — | UK | Base-de-Datos/init.sql:439 |
| habilitado | BOOLEAN | sí | false |  | Base-de-Datos/init.sql:440 |
| ensayo_sintetico | BOOLEAN | sí | — |  | Base-de-Datos/init.sql:441 |
| id_recibo | BIGINT | sí | — | FK | Base-de-Datos/init.sql:442 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:443 |
| id_admin | BIGINT | sí | — | FK | Base-de-Datos/init.sql:444 |
| qr_hash | TEXT | sí | — |  | Base-de-Datos/init.sql:445 |
| monto_maximo | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:446 |
| inicio_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:447 |
| vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:448 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | singleton | Base-de-Datos/init.sql:438 |
| control_piloto_yape_singleton_check | CHECK | singleton | Base-de-Datos/init.sql:438 |
| implícita_3 | UNIQUE | piloto_id | Base-de-Datos/init.sql:439 |
| implícita_4 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/init.sql:442 |
| implícita_5 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:443 |
| implícita_6 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:444 |
| control_piloto_yape_qr_hash_check | CHECK | qr_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:445 |
| control_piloto_yape_monto_maximo_check | CHECK | monto_maximo>0 AND monto_maximo<=5 | Base-de-Datos/init.sql:446 |
| implícita_9 | CHECK | id_usuario<>id_admin | Base-de-Datos/init.sql:449 |
| implícita_10 | CHECK | vence_en>inicio_en AND vence_en<=inicio_en+INTERVAL '4 hours' | Base-de-Datos/init.sql:450 |
| implícita_11 | CHECK | current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' | Base-de-Datos/init.sql:451 |


### correo_outbox

Cola cifrada de correo de registro y control de leases/reintentos. Fuente: `Base-de-Datos/init.sql:67`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK, FK | Base-de-Datos/init.sql:68 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:69 |
| estado | VARCHAR(16) | sí | 'pendiente' |  | Base-de-Datos/init.sql:70 |
| payload | BYTEA | no | — |  | Base-de-Datos/init.sql:72 |
| clave_version | SMALLINT | sí | 1 |  | Base-de-Datos/init.sql:73 |
| clave_id | CHAR(16) | sí | — |  | Base-de-Datos/init.sql:74 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:75 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:76 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:77 |
| iniciado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:78 |
| codigo_vence_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:79 |
| enviar_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:80 |
| lease_token | UUID | no | — |  | Base-de-Datos/init.sql:81 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:82 |
| aceptado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:83 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:84 |
| proveedor_id | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:85 |
| hubo_ambiguedad | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:86 |
| ultimo_error | VARCHAR(16) | no | — |  | Base-de-Datos/init.sql:87 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:68 |
| implícita_2 | FOREIGN KEY | REFERENCES public.registros_correo_envios(id) ON DELETE CASCADE | Base-de-Datos/init.sql:68 |
| correo_outbox_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:69 |
| correo_outbox_estado_check | CHECK | estado IN ('pendiente','procesando','reintento','aceptado','fallido','caducado','cancelado','ambiguo') | Base-de-Datos/init.sql:70 |
| correo_outbox_clave_version_check | CHECK | clave_version=1 | Base-de-Datos/init.sql:73 |
| correo_outbox_clave_id_check | CHECK | clave_id ~ '^[a-f0-9]{16}$' | Base-de-Datos/init.sql:74 |
| correo_outbox_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:75 |
| correo_outbox_ultimo_error_check | CHECK | ultimo_error IN ('transitorio','permanente','ambiguo','cifrado','caducado') | Base-de-Datos/init.sql:87 |
| implícita_9 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (payload IS NOT NULL) | Base-de-Datos/init.sql:88 |
| implícita_10 | CHECK | payload IS NULL OR octet_length(payload) BETWEEN 29 AND 16384 | Base-de-Datos/init.sql:89 |
| implícita_11 | CHECK | (estado='procesando' AND lease_token IS NOT NULL AND bloqueado_hasta IS NOT NULL) OR (estado<>'procesando' AND lease_token IS NULL AND bloqueado_hasta IS NULL) | Base-de-Datos/init.sql:90 |
| implícita_12 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (finalizado_en IS NULL) | Base-de-Datos/init.sql:92 |
| implícita_13 | CHECK | (iniciado_en IS NULL AND codigo_vence_en IS NULL AND enviar_hasta IS NULL) OR (iniciado_en IS NOT NULL AND codigo_vence_en IS NOT NULL AND enviar_hasta IS NOT NULL AND enviar_hasta<codigo_vence_en) | Base-de-Datos/init.sql:93 |
| implícita_14 | CHECK | estado<>'aceptado' OR (aceptado_en IS NOT NULL AND proveedor_id IS NOT NULL) | Base-de-Datos/init.sql:95 |


### cortes_servicio

Avisos por General/Zona; fecha/hora/estado legacy conservados. Fuente: `Base-de-Datos/init.sql:182`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | nextval('public.cortes_servicio_id_corte_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:183 |
| alcance | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:185 |
| distrito | VARCHAR(80) | no | — |  | Base-de-Datos/init.sql:187 |
| zona | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:188 |
| motivo | VARCHAR(200) | sí | — |  | Base-de-Datos/init.sql:189 |
| fecha_inicio | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:191 |
| fecha_fin | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:192 |
| cancelado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:194 |
| fecha | DATE | no | — |  | Base-de-Datos/init.sql:196 |
| hora | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:197 |
| estado | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:199 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_corte | Base-de-Datos/init.sql:183 |
| chk_alcance_corte | CHECK | alcance IS NULL OR alcance IN ('Zona', 'General') | Base-de-Datos/init.sql:201 |
| chk_estado_corte | CHECK | estado IS NULL OR estado IN ('Programado', 'En proceso', 'Restablecido') | Base-de-Datos/init.sql:204 |


### cortes_suministros

Asociación N:M legacy de cortes y suministros. Fuente: `Base-de-Datos/init.sql:212`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:213 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:214 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_cortes_suministros | PRIMARY KEY | id_corte, id_suministro | Base-de-Datos/init.sql:216 |
| fk_cs_corte | FOREIGN KEY | REFERENCES cortes_servicio(id_corte) | Base-de-Datos/init.sql:219 |
| fk_cs_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:223 |


### desafios_2fa

Desafíos MFA temporales con versión y límite de intentos. Fuente: `Base-de-Datos/init.sql:327`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_hash | CHAR(64) | sí | — | PK | Base-de-Datos/init.sql:328 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:329 |
| version | INTEGER | sí | — |  | Base-de-Datos/init.sql:330 |
| clave_huella | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:331 |
| vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:332 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:333 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:334 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_hash | Base-de-Datos/init.sql:328 |
| desafios_2fa_id_hash_check | CHECK | id_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:328 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/init.sql:329 |
| desafios_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/init.sql:330 |
| desafios_2fa_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:333 |


### eventos_pago_proveedor

Idempotencia de eventos del proveedor simulado. Fuente: `Base-de-Datos/init.sql:404`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| evento_id | TEXT | sí | — | PK | Base-de-Datos/init.sql:405 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/init.sql:406 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/init.sql:407 |
| recibido_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:408 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | evento_id | Base-de-Datos/init.sql:405 |
| eventos_pago_proveedor_evento_id_check | CHECK | length(evento_id) BETWEEN 1 AND 100 | Base-de-Datos/init.sql:405 |
| implícita_3 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/init.sql:406 |


### incidencia_cambios

Resultados de decisiones administrativas por solicitud idempotente. Fuente: `Base-de-Datos/init.sql:521`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| solicitud_id | UUID | sí | — | PK | Base-de-Datos/init.sql:522 |
| id_incidencia | BIGINT | sí | — | FK | Base-de-Datos/init.sql:522 |
| id_administrador | BIGINT | sí | — | FK | Base-de-Datos/init.sql:523 |
| huella | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:524 |
| resultado | JSONB | sí | — |  | Base-de-Datos/init.sql:524 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:524 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | solicitud_id | Base-de-Datos/init.sql:522 |
| implícita_2 | FOREIGN KEY | REFERENCES public.incidencias(id_incidencia) | Base-de-Datos/init.sql:522 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:523 |


### incidencia_eventos

Historial de eventos protegido por triggers; orden identity. Fuente: `Base-de-Datos/init.sql:504`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | gen_random_uuid() | PK | Base-de-Datos/init.sql:505 |
| orden | BIGINT | sí | IDENTITY ALWAYS [generación, no DEFAULT explícito] | UK | Base-de-Datos/init.sql:506 |
| id_incidencia | BIGINT | sí | — | FK | Base-de-Datos/init.sql:507 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:508 |
| tipo | TEXT | sí | — |  | Base-de-Datos/init.sql:509 |
| estado_anterior | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:510 |
| estado_nuevo | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:511 |
| id_administrador | BIGINT | no | — | FK | Base-de-Datos/init.sql:512 |
| comentario_publico | VARCHAR(300) | no | — |  | Base-de-Datos/init.sql:513 |
| solicitud_id | UUID | no | — | UK | Base-de-Datos/init.sql:514 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:505 |
| implícita_2 | UNIQUE | orden | Base-de-Datos/init.sql:506 |
| implícita_3 | FOREIGN KEY | REFERENCES public.incidencias(id_incidencia) | Base-de-Datos/init.sql:507 |
| incidencia_eventos_tipo_check | CHECK | tipo IN('registro','estado') | Base-de-Datos/init.sql:509 |
| incidencia_eventos_estado_anterior_check | CHECK | estado_anterior IN('Registrada','En revisión','Resuelta') | Base-de-Datos/init.sql:510 |
| incidencia_eventos_estado_nuevo_check | CHECK | estado_nuevo IN('Registrada','En revisión','Resuelta') | Base-de-Datos/init.sql:511 |
| implícita_7 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:512 |
| implícita_8 | UNIQUE | solicitud_id | Base-de-Datos/init.sql:514 |
| implícita_9 | CHECK | (tipo='registro' AND estado_anterior IS NULL AND id_administrador IS NULL AND comentario_publico IS NULL) OR (tipo='estado' AND estado_anterior IS NOT NULL AND estado_anterior<>estado_nuevo) | Base-de-Datos/init.sql:515 |
| implícita_10 | CHECK | comentario_publico IS NULL OR (length(btrim(comentario_publico))>0 AND id_administrador IS NOT NULL) | Base-de-Datos/init.sql:517 |


### incidencias

Reporte, ubicación/foto opcionales y estado actual. Fuente: `Base-de-Datos/init.sql:149`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_incidencia | BIGINT | sí | nextval('public.incidencias_id_incidencia_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:150 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:151 |
| tipo | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:153 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:154 |
| referencia | VARCHAR(200) | no | — |  | Base-de-Datos/init.sql:155 |
| latitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:157 |
| longitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:158 |
| foto | BYTEA | no | — |  | Base-de-Datos/init.sql:160 |
| foto_mime | VARCHAR(50) | no | — |  | Base-de-Datos/init.sql:161 |
| estado | VARCHAR(30) | sí | 'Registrada' |  | Base-de-Datos/init.sql:163 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:165 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_incidencia | Base-de-Datos/init.sql:150 |
| chk_estado_incidencia | CHECK | estado IN ('Registrada', 'En revisión', 'Resuelta') | Base-de-Datos/init.sql:167 |
| fk_incidencia_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:170 |


### notificaciones

Avisos internos; leida global es legacy, lecturas individuales en tabla aparte. Fuente: `Base-de-Datos/init.sql:258`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | nextval('public.notificaciones_id_notificacion_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:259 |
| id_suministro | BIGINT | no | — | FK | Base-de-Datos/init.sql:260 |
| alcance | VARCHAR(20) | sí | 'Usuario' |  | Base-de-Datos/init.sql:261 |
| titulo | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:262 |
| mensaje | TEXT | sí | — |  | Base-de-Datos/init.sql:263 |
| tipo | VARCHAR(40) | sí | 'general' |  | Base-de-Datos/init.sql:264 |
| leida | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:265 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:266 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_notificacion | Base-de-Datos/init.sql:259 |
| chk_alcance_notificacion | CHECK | alcance IN ('Usuario', 'General') | Base-de-Datos/init.sql:268 |
| fk_notificacion_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:271 |


### notificaciones_lecturas

Lectura por notificación y suministro; fila existente significa leída. Fuente: `Base-de-Datos/init.sql:282`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:283 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:284 |
| fecha_lectura | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:285 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_notificaciones_lecturas | PRIMARY KEY | id_notificacion, id_suministro | Base-de-Datos/init.sql:287 |
| fk_lectura_notificacion | FOREIGN KEY | REFERENCES notificaciones(id_notificacion) ON DELETE CASCADE | Base-de-Datos/init.sql:290 |
| fk_lectura_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) ON DELETE CASCADE | Base-de-Datos/init.sql:295 |


### operaciones_pago

Operaciones demostrativas/verificación; no confundir con pagos acreditados. Fuente: `Base-de-Datos/init.sql:362`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:363 |
| solicitud_id | UUID | sí | — | UK | Base-de-Datos/init.sql:364 |
| id_usuario | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:365 |
| id_recibo | BIGINT | sí | — | FK | Base-de-Datos/init.sql:366 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:367 |
| moneda | TEXT | sí | 'PEN' |  | Base-de-Datos/init.sql:368 |
| entorno | TEXT | sí | — |  | Base-de-Datos/init.sql:369 |
| metodo | TEXT | sí | — |  | Base-de-Datos/init.sql:370 |
| estado | TEXT | sí | — |  | Base-de-Datos/init.sql:371 |
| referencia | TEXT | no | — |  | Base-de-Datos/init.sql:372 |
| referencia_hash | TEXT | no | — |  | Base-de-Datos/init.sql:373 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/init.sql:374 |
| comprobante | BYTEA | no | — |  | Base-de-Datos/init.sql:375 |
| comprobante_hash | TEXT | no | — |  | Base-de-Datos/init.sql:376 |
| proveedor_id | TEXT | no | — | UK | Base-de-Datos/init.sql:377 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:378 |
| actualizado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:379 |
| revisado_por | BIGINT | no | — | FK | Base-de-Datos/init.sql:380 |
| revisado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:381 |
| motivo | TEXT | no | — |  | Base-de-Datos/init.sql:382 |
| piloto_id | UUID | no | — | FK | Base-de-Datos/init.sql:453 |
| piloto_ensayo | BOOLEAN | no | — |  | Base-de-Datos/init.sql:454 |
| receptor_huella | TEXT | no | — |  | Base-de-Datos/init.sql:455 |
| recibido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:456 |
| monto_recibido | NUMERIC(10,2) | no | — |  | Base-de-Datos/init.sql:457 |
| receptor_comprobado | BOOLEAN | no | — |  | Base-de-Datos/init.sql:458 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:363 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:365 |
| implícita_3 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/init.sql:366 |
| operaciones_pago_monto_check | CHECK | monto>0 | Base-de-Datos/init.sql:367 |
| operaciones_pago_moneda_check | CHECK | moneda='PEN' | Base-de-Datos/init.sql:368 |
| operaciones_pago_metodo_check | CHECK | metodo IN ('demostrativo','yape_manual','proveedor_simulado') | Base-de-Datos/init.sql:370 |
| operaciones_pago_estado_check | CHECK | estado IN ('demostrativa','declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor','rechazada','cancelada','reembolsada') | Base-de-Datos/init.sql:371 |
| operaciones_pago_referencia_check | CHECK | length(referencia) BETWEEN 4 AND 100 | Base-de-Datos/init.sql:372 |
| operaciones_pago_referencia_hash_check | CHECK | referencia_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:373 |
| operaciones_pago_payload_hash_check | CHECK | payload_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:374 |
| operaciones_pago_comprobante_check | CHECK | octet_length(comprobante)<=1048576 | Base-de-Datos/init.sql:375 |
| operaciones_pago_comprobante_hash_check | CHECK | comprobante_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:376 |
| implícita_14 | UNIQUE | proveedor_id | Base-de-Datos/init.sql:377 |
| implícita_15 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:380 |
| operaciones_pago_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/init.sql:382 |
| implícita_17 | UNIQUE | id_usuario, solicitud_id | Base-de-Datos/init.sql:383 |
| implícita_18 | CHECK | (comprobante IS NULL)=(comprobante_hash IS NULL) | Base-de-Datos/init.sql:384 |
| implícita_19 | CHECK | (metodo='demostrativo')=(estado='demostrativa') | Base-de-Datos/init.sql:385 |
| implícita_20 | CHECK | estado<>'verificada_manual' OR (metodo='yape_manual' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL AND motivo IS NOT NULL) | Base-de-Datos/init.sql:386 |
| implícita_21 | CHECK | estado<>'acreditada_proveedor' OR (metodo='proveedor_simulado' AND proveedor_id IS NOT NULL) | Base-de-Datos/init.sql:387 |
| implícita_22 | FOREIGN KEY | REFERENCES public.control_piloto_yape(piloto_id) | Base-de-Datos/init.sql:453 |
| operaciones_pago_entorno_check | CHECK | entorno IN ('simulado','piloto_manual') | Base-de-Datos/init.sql:460 |
| chk_piloto_local | CHECK | (entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL) OR (entorno='piloto_manual' AND current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' AND metodo='yape_manual' AND estado NOT IN ('demostrativa','acreditada_proveedor','reembolsada') AND piloto_id IS NOT NULL AND piloto_ensayo IS NOT NULL AND receptor_huella IS NOT NULL AND receptor_huella ~ '^[a-f0-9]{64}$' AND (estado<>'verificada_manual' OR piloto_ensayo IS TRUE OR (monto_recibido IS NOT NULL AND monto_recibido=monto AND receptor_comprobado IS TRUE))) | Base-de-Datos/init.sql:483 |


### operaciones_pago_historial

Auditoría inmutable de estados de operación. Fuente: `Base-de-Datos/init.sql:396`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | BIGINT | sí | nextval('public.operaciones_pago_historial_id_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:397 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/init.sql:398 |
| estado | TEXT | sí | — |  | Base-de-Datos/init.sql:399 |
| actor_id | BIGINT | no | — | FK | Base-de-Datos/init.sql:400 |
| motivo | TEXT | sí | — |  | Base-de-Datos/init.sql:401 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:402 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:397 |
| implícita_2 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/init.sql:398 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:400 |
| operaciones_pago_historial_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/init.sql:401 |


### pagos

Registro histórico de pagos del prototipo; no certifica un cargo bancario. Fuente: `Base-de-Datos/init.sql:129`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_pago | BIGINT | sí | nextval('public.pagos_id_pago_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:130 |
| id_recibo | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:131 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:133 |
| metodo | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:135 |
| codigo_operacion | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:136 |
| fecha_pago | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:138 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_pago | Base-de-Datos/init.sql:130 |
| fk_pago_recibo | FOREIGN KEY | REFERENCES recibos(id_recibo) | Base-de-Datos/init.sql:140 |
| uq_pagos_recibo | UNIQUE | id_recibo | Base-de-Datos/init.sql:144 |


### recibos

Recibos de suministro, importe, consumo, periodo y estado. Fuente: `Base-de-Datos/init.sql:103`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_recibo | BIGINT | sí | nextval('public.recibos_id_recibo_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:104 |
| id_suministro | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:105 |
| periodo | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:107 |
| fecha_emision | DATE | sí | — |  | Base-de-Datos/init.sql:109 |
| fecha_vencimiento | DATE | sí | — |  | Base-de-Datos/init.sql:110 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:112 |
| consumo_m3 | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:113 |
| estado | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:115 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_recibo | Base-de-Datos/init.sql:104 |
| chk_estado_recibo | CHECK | estado IN ('Emitido', 'Pendiente', 'Pagado', 'Vencido', 'Anulado') | Base-de-Datos/init.sql:117 |
| fk_recibo_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:120 |
| uq_recibos_suministro_periodo | UNIQUE | id_suministro, periodo | Base-de-Datos/init.sql:124 |


### registros_correo_envios

Historial de envíos de códigos por solicitud de registro. Fuente: `Base-de-Datos/init.sql:57`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:58 |
| registro_id | UUID | sí | — | FK | Base-de-Datos/init.sql:59 |
| enviado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:60 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:58 |
| implícita_2 | FOREIGN KEY | REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE | Base-de-Datos/init.sql:59 |


### registros_correo_pendientes

Solicitudes de registro con verificación pendiente y caducidad. Fuente: `Base-de-Datos/init.sql:44`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:45 |
| correo | VARCHAR(120) | sí | — |  | Base-de-Datos/init.sql:46 |
| numero_suministro | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:47 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:48 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:49 |
| codigo_vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:50 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:51 |
| creado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:52 |
| vence_en | TIMESTAMPTZ | sí | (CURRENT_TIMESTAMP + INTERVAL '1 hour') |  | Base-de-Datos/init.sql:53 |
| consumido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:54 |
| invalidado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:55 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:45 |
| registros_correo_pendientes_correo_check | CHECK | correo = lower(trim(correo)) | Base-de-Datos/init.sql:46 |
| registros_correo_pendientes_numero_suministro_check | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:47 |
| registros_correo_pendientes_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:49 |
| registros_correo_pendientes_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:51 |


### solicitudes_atencion

Solicitudes y respuesta administrativa persistente. Fuente: `Base-de-Datos/init.sql:230`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_solicitud | BIGINT | sí | nextval('public.solicitudes_atencion_id_solicitud_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:231 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:232 |
| categoria | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:233 |
| asunto | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:234 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:235 |
| estado | VARCHAR(20) | sí | 'Registrada' |  | Base-de-Datos/init.sql:236 |
| respuesta | TEXT | no | — |  | Base-de-Datos/init.sql:237 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:238 |
| fecha_actualizacion | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:239 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_solicitud | Base-de-Datos/init.sql:231 |
| chk_estado_solicitud | CHECK | estado IN ('Registrada', 'En atención', 'Respondida', 'Cerrada') | Base-de-Datos/init.sql:241 |
| fk_solicitud_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:244 |


### suministros

Suministros asociados a cuentas; distrito/zona opcionales del prototipo. Fuente: `Base-de-Datos/init.sql:26`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_suministro | BIGINT | sí | nextval('public.suministros_id_suministro_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:27 |
| numero_suministro | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:28 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:29 |
| distrito | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:31 |
| zona | VARCHAR(150) | no | — |  | Base-de-Datos/init.sql:32 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_suministro | Base-de-Datos/init.sql:27 |
| implícita_2 | UNIQUE | numero_suministro | Base-de-Datos/init.sql:28 |
| chk_numero_suministro_9 | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:34 |
| fk_suministro_usuario | FOREIGN KEY | REFERENCES usuarios(id_usuario) | Base-de-Datos/init.sql:37 |


### usuario_2fa

Estado MFA y versión de seguridad por usuario; secretos cifrados por aplicación. Fuente: `Base-de-Datos/init.sql:307`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:308 |
| version | INTEGER | sí | 0 |  | Base-de-Datos/init.sql:309 |
| activo | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:310 |
| secreto | TEXT | no | — |  | Base-de-Datos/init.sql:311 |
| ultimo_paso | BIGINT | sí | -1 |  | Base-de-Datos/init.sql:312 |
| pendiente_secreto | TEXT | no | — |  | Base-de-Datos/init.sql:313 |
| pendiente_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:314 |
| reautenticado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:315 |
| fallos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:316 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:317 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/init.sql:308 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:308 |
| usuario_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/init.sql:309 |
| usuario_2fa_fallos_check | CHECK | fallos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:316 |
| implícita_5 | CHECK | NOT activo OR secreto IS NOT NULL | Base-de-Datos/init.sql:318 |
| implícita_6 | CHECK | (pendiente_secreto IS NULL) = (pendiente_hasta IS NULL) | Base-de-Datos/init.sql:319 |


### usuario_2fa_recuperacion

Hashes de códigos MFA de recuperación y consumo. Fuente: `Base-de-Datos/init.sql:321`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | FK, PK | Base-de-Datos/init.sql:322 |
| codigo_hash | CHAR(64) | sí | — | PK | Base-de-Datos/init.sql:323 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:324 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/init.sql:322 |
| usuario_2fa_recuperacion_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:323 |
| implícita_3 | PRIMARY KEY | id_usuario, codigo_hash | Base-de-Datos/init.sql:325 |


### usuarios

Cuentas, rol y habilitación; clave_hash contiene un derivado, nunca una contraseña en claro. Fuente: `Base-de-Datos/init.sql:10`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | nextval('public.usuarios_id_usuario_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:11 |
| correo | VARCHAR(120) | sí | — | UK | Base-de-Datos/init.sql:12 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:13 |
| rol | VARCHAR(20) | sí | 'usuario' |  | Base-de-Datos/init.sql:14 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:15 |
| activo | BOOLEAN | sí | TRUE |  | Base-de-Datos/init.sql:16 |
| correo_verificado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:17 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/init.sql:11 |
| implícita_2 | UNIQUE | correo | Base-de-Datos/init.sql:12 |
| chk_rol_usuario | CHECK | rol IN ('usuario', 'admin') | Base-de-Datos/init.sql:19 |


### Relaciones y cardinalidades

| Hija.columnas | Padre.columnas | Padres/hija | Hijas/padre | DELETE / UPDATE |
|---|---|---|---|---|
| suministros.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| registros_correo_envios.registro_id | registros_correo_pendientes.id | 1 | 0..N | CASCADE / NO ACTION |
| correo_outbox.id | registros_correo_envios.id | 1 | 0..1 | CASCADE / NO ACTION |
| recibos.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| pagos.id_recibo | recibos.id_recibo | 1 | 0..1 | NO ACTION / NO ACTION |
| incidencias.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_corte | cortes_servicio.id_corte | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| solicitudes_atencion.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.id_suministro | suministros.id_suministro | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones_lecturas.id_notificacion | notificaciones.id_notificacion | 1 | 0..N | CASCADE / NO ACTION |
| notificaciones_lecturas.id_suministro | suministros.id_suministro | 1 | 0..N | CASCADE / NO ACTION |
| usuario_2fa.id_usuario | usuarios.id_usuario | 1 | 0..1 | NO ACTION / NO ACTION |
| usuario_2fa_recuperacion.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| desafios_2fa.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_recibo | recibos.id_recibo | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.revisado_por | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.piloto_id | control_piloto_yape.piloto_id | 0..1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.actor_id | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| eventos_pago_proveedor.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| control_piloto_yape.id_recibo | recibos.id_recibo | 1 | 0..N | NO ACTION / NO ACTION |
| control_piloto_yape.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| control_piloto_yape.id_admin | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_eventos.id_incidencia | incidencias.id_incidencia | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_eventos.id_administrador | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| incidencia_cambios.id_incidencia | incidencias.id_incidencia | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_cambios.id_administrador | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |


### Índices

| Nombre | Tabla | Único | Definición | Origen | Fuente |
|---|---|---|---|---|---|
| idx_registro_correo | registros_correo_pendientes | False | CREATE INDEX idx_registro_correo ON registros_correo_pendientes(correo) | CREATE INDEX | Base-de-Datos/init.sql:62 |
| idx_registro_suministro | registros_correo_pendientes | False | CREATE INDEX idx_registro_suministro ON registros_correo_pendientes(numero_suministro) | CREATE INDEX | Base-de-Datos/init.sql:63 |
| idx_registro_vencimiento | registros_correo_pendientes | False | CREATE INDEX idx_registro_vencimiento ON registros_correo_pendientes(vence_en,id) | CREATE INDEX | Base-de-Datos/init.sql:64 |
| idx_registro_envios | registros_correo_envios | False | CREATE INDEX idx_registro_envios ON registros_correo_envios(registro_id, enviado_en) | CREATE INDEX | Base-de-Datos/init.sql:65 |
| idx_correo_outbox_disponible | correo_outbox | False | CREATE INDEX idx_correo_outbox_disponible ON public.correo_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento') | CREATE INDEX | Base-de-Datos/init.sql:97 |
| idx_correo_outbox_lease | correo_outbox | False | CREATE INDEX idx_correo_outbox_lease ON public.correo_outbox(bloqueado_hasta,id) WHERE estado='procesando' | CREATE INDEX | Base-de-Datos/init.sql:99 |
| idx_solicitudes_suministro | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_suministro ON solicitudes_atencion(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:248 |
| idx_solicitudes_estado | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_estado ON solicitudes_atencion(estado) | CREATE INDEX | Base-de-Datos/init.sql:249 |
| idx_notif_suministro | notificaciones | False | CREATE INDEX idx_notif_suministro ON notificaciones(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:275 |
| idx_notif_fecha | notificaciones | False | CREATE INDEX idx_notif_fecha ON notificaciones(fecha_registro DESC) | CREATE INDEX | Base-de-Datos/init.sql:276 |
| idx_lecturas_suministro | notificaciones_lecturas | False | CREATE INDEX idx_lecturas_suministro ON notificaciones_lecturas(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:300 |
| idx_desafios_2fa_usuario | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_usuario ON public.desafios_2fa(id_usuario) | CREATE INDEX | Base-de-Datos/init.sql:336 |
| idx_desafios_2fa_vencimiento | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_vencimiento ON public.desafios_2fa(vence_en) | CREATE INDEX | Base-de-Datos/init.sql:337 |
| uq_operacion_activa_recibo | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_operacion_activa_recibo ON public.operaciones_pago(id_recibo) WHERE estado IN ('declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor') | CREATE INDEX | Base-de-Datos/init.sql:389 |
| idx_referencia_declarada | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_referencia_declarada ON public.operaciones_pago(referencia_hash) WHERE referencia_hash IS NOT NULL | CREATE INDEX | Base-de-Datos/init.sql:392 |
| uq_referencia_verificada | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_referencia_verificada ON public.operaciones_pago(referencia_hash) WHERE estado='verificada_manual' | CREATE INDEX | Base-de-Datos/init.sql:393 |
| idx_operaciones_revision | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_operaciones_revision ON public.operaciones_pago(creado_en,id) WHERE estado='pendiente_verificacion' | CREATE INDEX | Base-de-Datos/init.sql:395 |
| idx_incidencia_eventos_orden | incidencia_eventos | False | CREATE INDEX IF NOT EXISTS idx_incidencia_eventos_orden ON public.incidencia_eventos(id_incidencia,orden) | CREATE INDEX | Base-de-Datos/init.sql:519 |
| uq_incidencia_evento_inicial | incidencia_eventos | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencia_evento_inicial ON public.incidencia_eventos(id_incidencia) WHERE tipo='registro' | CREATE INDEX | Base-de-Datos/init.sql:520 |
| usuarios_pkey | usuarios | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:11 |
| usuarios_correo_key | usuarios | True | UNIQUE btree (correo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:12 |
| suministros_pkey | suministros | True | UNIQUE btree (id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:27 |
| suministros_numero_suministro_key | suministros | True | UNIQUE btree (numero_suministro) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:28 |
| registros_correo_pendientes_pkey | registros_correo_pendientes | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:45 |
| registros_correo_envios_pkey | registros_correo_envios | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:58 |
| correo_outbox_pkey | correo_outbox | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:68 |
| recibos_pkey | recibos | True | UNIQUE btree (id_recibo) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:104 |
| uq_recibos_suministro_periodo | recibos | True | UNIQUE btree (id_suministro, periodo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:124 |
| pagos_pkey | pagos | True | UNIQUE btree (id_pago) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:130 |
| uq_pagos_recibo | pagos | True | UNIQUE btree (id_recibo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:144 |
| incidencias_pkey | incidencias | True | UNIQUE btree (id_incidencia) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:150 |
| cortes_servicio_pkey | cortes_servicio | True | UNIQUE btree (id_corte) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:183 |
| pk_cortes_suministros | cortes_suministros | True | UNIQUE btree (id_corte, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:216 |
| solicitudes_atencion_pkey | solicitudes_atencion | True | UNIQUE btree (id_solicitud) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:231 |
| notificaciones_pkey | notificaciones | True | UNIQUE btree (id_notificacion) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:259 |
| pk_notificaciones_lecturas | notificaciones_lecturas | True | UNIQUE btree (id_notificacion, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:287 |
| usuario_2fa_pkey | usuario_2fa | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:308 |
| usuario_2fa_recuperacion_pkey | usuario_2fa_recuperacion | True | UNIQUE btree (id_usuario, codigo_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:325 |
| desafios_2fa_pkey | desafios_2fa | True | UNIQUE btree (id_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:328 |
| operaciones_pago_pkey | operaciones_pago | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:363 |
| operaciones_pago_proveedor_id_key | operaciones_pago | True | UNIQUE btree (proveedor_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:377 |
| operaciones_pago_id_usuario_solicitud_id_key | operaciones_pago | True | UNIQUE btree (id_usuario, solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:383 |
| operaciones_pago_historial_pkey | operaciones_pago_historial | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:397 |
| eventos_pago_proveedor_pkey | eventos_pago_proveedor | True | UNIQUE btree (evento_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:405 |
| control_piloto_yape_pkey | control_piloto_yape | True | UNIQUE btree (singleton) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:438 |
| control_piloto_yape_piloto_id_key | control_piloto_yape | True | UNIQUE btree (piloto_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:439 |
| incidencia_eventos_pkey | incidencia_eventos | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:505 |
| incidencia_eventos_orden_key | incidencia_eventos | True | UNIQUE btree (orden) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:506 |
| incidencia_eventos_solicitud_id_key | incidencia_eventos | True | UNIQUE btree (solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:514 |
| incidencia_cambios_pkey | incidencia_cambios | True | UNIQUE btree (solicitud_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:522 |


### Secuencias (nombres y parámetros derivados)

| Nombre esperado | Propietario | Generación | Parámetros | Fuente |
|---|---|---|---|---|
| usuarios_id_usuario_seq | usuarios.id_usuario | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY usuarios.id_usuario | Base-de-Datos/init.sql:11 |
| suministros_id_suministro_seq | suministros.id_suministro | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY suministros.id_suministro | Base-de-Datos/init.sql:27 |
| recibos_id_recibo_seq | recibos.id_recibo | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY recibos.id_recibo | Base-de-Datos/init.sql:104 |
| pagos_id_pago_seq | pagos.id_pago | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY pagos.id_pago | Base-de-Datos/init.sql:130 |
| incidencias_id_incidencia_seq | incidencias.id_incidencia | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencias.id_incidencia | Base-de-Datos/init.sql:150 |
| cortes_servicio_id_corte_seq | cortes_servicio.id_corte | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY cortes_servicio.id_corte | Base-de-Datos/init.sql:183 |
| solicitudes_atencion_id_solicitud_seq | solicitudes_atencion.id_solicitud | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY solicitudes_atencion.id_solicitud | Base-de-Datos/init.sql:231 |
| notificaciones_id_notificacion_seq | notificaciones.id_notificacion | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY notificaciones.id_notificacion | Base-de-Datos/init.sql:259 |
| operaciones_pago_historial_id_seq | operaciones_pago_historial.id | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY operaciones_pago_historial.id | Base-de-Datos/init.sql:397 |
| incidencia_eventos_orden_seq | incidencia_eventos.orden | IDENTITY ALWAYS | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencia_eventos.orden | Base-de-Datos/init.sql:506 |


### Funciones y triggers


#### revocar_2fa_al_cambiar_cuenta

Fuente `Base-de-Datos/init.sql:339`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_2fa_al_cambiar_cuenta() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
        INSERT INTO public.usuario_2fa(id_usuario,version) VALUES (NEW.id_usuario,1)
        ON CONFLICT (id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1;
    END IF;
    RETURN NEW;
END;
$$;
```

#### controlar_operacion_pago

Fuente `Base-de-Datos/init.sql:410`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.controlar_operacion_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.id,NEW.solicitud_id,NEW.id_usuario,NEW.id_recibo,NEW.monto,NEW.moneda,NEW.entorno,NEW.metodo,NEW.referencia,NEW.referencia_hash,NEW.payload_hash,NEW.comprobante,NEW.comprobante_hash,NEW.creado_en)
 IS DISTINCT FROM ROW(OLD.id,OLD.solicitud_id,OLD.id_usuario,OLD.id_recibo,OLD.monto,OLD.moneda,OLD.entorno,OLD.metodo,OLD.referencia,OLD.referencia_hash,OLD.payload_hash,OLD.comprobante,OLD.comprobante_hash,OLD.creado_en)
 THEN RAISE EXCEPTION 'Datos originales inmutables'; END IF;
 IF NEW.estado<>OLD.estado AND NOT (
  (OLD.estado='declarada' AND NEW.estado='pendiente_verificacion') OR
  (OLD.estado='pendiente_verificacion' AND NEW.estado IN ('verificada_manual','acreditada_proveedor','rechazada','cancelada')) OR
  (OLD.estado='acreditada_proveedor' AND NEW.estado='reembolsada')
 ) THEN RAISE EXCEPTION 'Transición no permitida'; END IF;
 RETURN NEW;
END $$;
```

#### conservar_auditoria_pago

Fuente `Base-de-Datos/init.sql:426`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.conservar_auditoria_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Auditoría de pagos inmutable'; END $$;
```

#### controlar_piloto_yape

Fuente `Base-de-Datos/init.sql:466`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.controlar_piloto_yape() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.piloto_id,NEW.piloto_ensayo,NEW.receptor_huella) IS DISTINCT FROM ROW(OLD.piloto_id,OLD.piloto_ensayo,OLD.receptor_huella) THEN RAISE EXCEPTION 'Piloto y receptor originales inmutables'; END IF;
 IF OLD.revisado_en IS NOT NULL AND ROW(NEW.recibido_en,NEW.monto_recibido,NEW.receptor_comprobado,NEW.revisado_por,NEW.revisado_en,NEW.motivo) IS DISTINCT FROM ROW(OLD.recibido_en,OLD.monto_recibido,OLD.receptor_comprobado,OLD.revisado_por,OLD.revisado_en,OLD.motivo) THEN RAISE EXCEPTION 'Revisión final inmutable'; END IF;
 RETURN NEW;
END $$;
```

#### validar_revision_sintetica

Fuente `Base-de-Datos/init.sql:487`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.validar_revision_sintetica() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.piloto_ensayo IS TRUE AND NEW.estado='verificada_manual' AND OLD.estado<>'verificada_manual' AND (NEW.recibido_en IS NOT NULL OR NEW.monto_recibido IS NOT NULL OR NEW.receptor_comprobado IS NOT NULL) THEN
  RAISE EXCEPTION 'Un ensayo no registra recepción bancaria';
 END IF;
 RETURN NEW;
END $$;
```

#### proteger_evento_incidencia

Fuente `Base-de-Datos/init.sql:526`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.proteger_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' AND pg_trigger_depth()>=2 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'El historial de incidencias solo admite eventos de origen' USING ERRCODE='42501';
END; $$;
```

#### proteger_cambio_incidencia

Fuente `Base-de-Datos/init.sql:536`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.proteger_cambio_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Las decisiones registradas no se modifican' USING ERRCODE='42501'; END; $$;
```

#### registrar_evento_incidencia

Fuente `Base-de-Datos/init.sql:543`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.registrar_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor BIGINT; comentario TEXT; solicitud UUID;
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_nuevo) VALUES(NEW.id_incidencia,'registro',NEW.estado);
 ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
  actor=NULLIF(current_setting('hidro.incident_actor',true),'')::BIGINT;
  solicitud=NULLIF(current_setting('hidro.incident_request',true),'')::UUID;
  IF actor IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=actor AND rol='admin' AND activo) THEN
    RAISE EXCEPTION 'Responsable no autorizado' USING ERRCODE='42501';
   END IF;
   comentario=NULLIF(btrim(current_setting('hidro.incident_comment',true)),'');
   IF length(comentario)>300 OR comentario ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Comentario público inválido' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_anterior,estado_nuevo,id_administrador,comentario_publico,solicitud_id)
   VALUES(NEW.id_incidencia,'estado',OLD.estado,NEW.estado,actor,comentario,solicitud);
 END IF;
 RETURN NEW;
END; $$;
```
| Trigger | Tabla | Función | Definición | Fuente |
|---|---|---|---|---|
| revocar_2fa_cuenta | usuarios | revocar_2fa_al_cambiar_cuenta | CREATE OR REPLACE TRIGGER revocar_2fa_cuenta AFTER UPDATE OF rol,activo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.revocar_2fa_al_cambiar_cuenta() | Base-de-Datos/init.sql:349 |
| controlar_operacion_pago | operaciones_pago | controlar_operacion_pago | CREATE OR REPLACE TRIGGER controlar_operacion_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.controlar_operacion_pago() | Base-de-Datos/init.sql:424 |
| conservar_auditoria_pago | operaciones_pago_historial | conservar_auditoria_pago | CREATE OR REPLACE TRIGGER conservar_auditoria_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago_historial FOR EACH ROW EXECUTE FUNCTION public.conservar_auditoria_pago() | Base-de-Datos/init.sql:429 |
| controlar_piloto_yape | operaciones_pago | controlar_piloto_yape | CREATE OR REPLACE TRIGGER controlar_piloto_yape BEFORE UPDATE OR DELETE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.controlar_piloto_yape() | Base-de-Datos/init.sql:474 |
| validar_revision_sintetica | operaciones_pago | validar_revision_sintetica | CREATE OR REPLACE TRIGGER validar_revision_sintetica BEFORE UPDATE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.validar_revision_sintetica() | Base-de-Datos/init.sql:495 |
| proteger_evento_incidencia | incidencia_eventos | proteger_evento_incidencia | CREATE OR REPLACE TRIGGER proteger_evento_incidencia BEFORE INSERT OR UPDATE OR DELETE ON public.incidencia_eventos FOR EACH ROW EXECUTE FUNCTION public.proteger_evento_incidencia() | Base-de-Datos/init.sql:532 |
| proteger_evento_incidencia_truncate | incidencia_eventos | proteger_evento_incidencia | CREATE OR REPLACE TRIGGER proteger_evento_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_eventos FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_evento_incidencia() | Base-de-Datos/init.sql:534 |
| proteger_cambio_incidencia | incidencia_cambios | proteger_cambio_incidencia | CREATE OR REPLACE TRIGGER proteger_cambio_incidencia BEFORE UPDATE OR DELETE ON public.incidencia_cambios FOR EACH ROW EXECUTE FUNCTION public.proteger_cambio_incidencia() | Base-de-Datos/init.sql:539 |
| proteger_cambio_incidencia_truncate | incidencia_cambios | proteger_cambio_incidencia | CREATE OR REPLACE TRIGGER proteger_cambio_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_cambios FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_cambio_incidencia() | Base-de-Datos/init.sql:541 |
| registrar_evento_incidencia | incidencias | registrar_evento_incidencia | CREATE OR REPLACE TRIGGER registrar_evento_incidencia AFTER INSERT OR UPDATE OF estado ON public.incidencias FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_incidencia() | Base-de-Datos/init.sql:567 |


## laboratorio-ampliado

27 tablas, 254 columnas, 38 FK y 64 índices (incluidos PK/UNIQUE derivados).

### control_piloto_yape

Control singleton exclusivo de laboratorio con ensayo sintético. Fuente: `Base-de-Datos/init.sql:437`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| singleton | BOOLEAN | sí | true | PK | Base-de-Datos/init.sql:438 |
| piloto_id | UUID | sí | — | UK | Base-de-Datos/init.sql:439 |
| habilitado | BOOLEAN | sí | false |  | Base-de-Datos/init.sql:440 |
| ensayo_sintetico | BOOLEAN | sí | — |  | Base-de-Datos/init.sql:441 |
| id_recibo | BIGINT | sí | — | FK | Base-de-Datos/init.sql:442 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:443 |
| id_admin | BIGINT | sí | — | FK | Base-de-Datos/init.sql:444 |
| qr_hash | TEXT | sí | — |  | Base-de-Datos/init.sql:445 |
| monto_maximo | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:446 |
| inicio_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:447 |
| vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:448 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | singleton | Base-de-Datos/init.sql:438 |
| control_piloto_yape_singleton_check | CHECK | singleton | Base-de-Datos/init.sql:438 |
| implícita_3 | UNIQUE | piloto_id | Base-de-Datos/init.sql:439 |
| implícita_4 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/init.sql:442 |
| implícita_5 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:443 |
| implícita_6 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:444 |
| control_piloto_yape_qr_hash_check | CHECK | qr_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:445 |
| control_piloto_yape_monto_maximo_check | CHECK | monto_maximo>0 AND monto_maximo<=5 | Base-de-Datos/init.sql:446 |
| implícita_9 | CHECK | id_usuario<>id_admin | Base-de-Datos/init.sql:449 |
| implícita_10 | CHECK | vence_en>inicio_en AND vence_en<=inicio_en+INTERVAL '4 hours' | Base-de-Datos/init.sql:450 |
| implícita_11 | CHECK | current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' | Base-de-Datos/init.sql:451 |


### correo_outbox

Cola cifrada de correo de registro y control de leases/reintentos. Fuente: `Base-de-Datos/init.sql:67`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK, FK | Base-de-Datos/init.sql:68 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:69 |
| estado | VARCHAR(16) | sí | 'pendiente' |  | Base-de-Datos/init.sql:70 |
| payload | BYTEA | no | — |  | Base-de-Datos/init.sql:72 |
| clave_version | SMALLINT | sí | 1 |  | Base-de-Datos/init.sql:73 |
| clave_id | CHAR(16) | sí | — |  | Base-de-Datos/init.sql:74 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:75 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:76 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:77 |
| iniciado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:78 |
| codigo_vence_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:79 |
| enviar_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:80 |
| lease_token | UUID | no | — |  | Base-de-Datos/init.sql:81 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:82 |
| aceptado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:83 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:84 |
| proveedor_id | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:85 |
| hubo_ambiguedad | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:86 |
| ultimo_error | VARCHAR(16) | no | — |  | Base-de-Datos/init.sql:87 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:68 |
| implícita_2 | FOREIGN KEY | REFERENCES public.registros_correo_envios(id) ON DELETE CASCADE | Base-de-Datos/init.sql:68 |
| correo_outbox_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:69 |
| correo_outbox_estado_check | CHECK | estado IN ('pendiente','procesando','reintento','aceptado','fallido','caducado','cancelado','ambiguo') | Base-de-Datos/init.sql:70 |
| correo_outbox_clave_version_check | CHECK | clave_version=1 | Base-de-Datos/init.sql:73 |
| correo_outbox_clave_id_check | CHECK | clave_id ~ '^[a-f0-9]{16}$' | Base-de-Datos/init.sql:74 |
| correo_outbox_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:75 |
| correo_outbox_ultimo_error_check | CHECK | ultimo_error IN ('transitorio','permanente','ambiguo','cifrado','caducado') | Base-de-Datos/init.sql:87 |
| implícita_9 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (payload IS NOT NULL) | Base-de-Datos/init.sql:88 |
| implícita_10 | CHECK | payload IS NULL OR octet_length(payload) BETWEEN 29 AND 16384 | Base-de-Datos/init.sql:89 |
| implícita_11 | CHECK | (estado='procesando' AND lease_token IS NOT NULL AND bloqueado_hasta IS NOT NULL) OR (estado<>'procesando' AND lease_token IS NULL AND bloqueado_hasta IS NULL) | Base-de-Datos/init.sql:90 |
| implícita_12 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (finalizado_en IS NULL) | Base-de-Datos/init.sql:92 |
| implícita_13 | CHECK | (iniciado_en IS NULL AND codigo_vence_en IS NULL AND enviar_hasta IS NULL) OR (iniciado_en IS NOT NULL AND codigo_vence_en IS NOT NULL AND enviar_hasta IS NOT NULL AND enviar_hasta<codigo_vence_en) | Base-de-Datos/init.sql:93 |
| implícita_14 | CHECK | estado<>'aceptado' OR (aceptado_en IS NOT NULL AND proveedor_id IS NOT NULL) | Base-de-Datos/init.sql:95 |


### cortes_servicio

Avisos por General/Zona; fecha/hora/estado legacy conservados. Fuente: `Base-de-Datos/init.sql:182`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | nextval('public.cortes_servicio_id_corte_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:183 |
| alcance | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:185 |
| distrito | VARCHAR(80) | no | — |  | Base-de-Datos/init.sql:187 |
| zona | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:188 |
| motivo | VARCHAR(200) | sí | — |  | Base-de-Datos/init.sql:189 |
| fecha_inicio | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:191 |
| fecha_fin | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:192 |
| cancelado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:194 |
| fecha | DATE | no | — |  | Base-de-Datos/init.sql:196 |
| hora | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:197 |
| estado | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:199 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_corte | Base-de-Datos/init.sql:183 |
| chk_alcance_corte | CHECK | alcance IS NULL OR alcance IN ('Zona', 'General') | Base-de-Datos/init.sql:201 |
| chk_estado_corte | CHECK | estado IS NULL OR estado IN ('Programado', 'En proceso', 'Restablecido') | Base-de-Datos/init.sql:204 |


### cortes_suministros

Asociación N:M legacy de cortes y suministros. Fuente: `Base-de-Datos/init.sql:212`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:213 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:214 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_cortes_suministros | PRIMARY KEY | id_corte, id_suministro | Base-de-Datos/init.sql:216 |
| fk_cs_corte | FOREIGN KEY | REFERENCES cortes_servicio(id_corte) | Base-de-Datos/init.sql:219 |
| fk_cs_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:223 |


### desafios_2fa

Desafíos MFA temporales con versión y límite de intentos. Fuente: `Base-de-Datos/init.sql:327`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_hash | CHAR(64) | sí | — | PK | Base-de-Datos/init.sql:328 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:329 |
| version | INTEGER | sí | — |  | Base-de-Datos/init.sql:330 |
| clave_huella | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:331 |
| vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:332 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:333 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:334 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_hash | Base-de-Datos/init.sql:328 |
| desafios_2fa_id_hash_check | CHECK | id_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:328 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/init.sql:329 |
| desafios_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/init.sql:330 |
| desafios_2fa_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:333 |


### eventos_pago_proveedor

Idempotencia de eventos del proveedor simulado. Fuente: `Base-de-Datos/init.sql:404`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| evento_id | TEXT | sí | — | PK | Base-de-Datos/init.sql:405 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/init.sql:406 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/init.sql:407 |
| recibido_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:408 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | evento_id | Base-de-Datos/init.sql:405 |
| eventos_pago_proveedor_evento_id_check | CHECK | length(evento_id) BETWEEN 1 AND 100 | Base-de-Datos/init.sql:405 |
| implícita_3 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/init.sql:406 |


### incidencia_cambios

Resultados de decisiones administrativas por solicitud idempotente. Fuente: `Base-de-Datos/init.sql:521`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| solicitud_id | UUID | sí | — | PK | Base-de-Datos/init.sql:522 |
| id_incidencia | BIGINT | sí | — | FK | Base-de-Datos/init.sql:522 |
| id_administrador | BIGINT | sí | — | FK | Base-de-Datos/init.sql:523 |
| huella | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:524 |
| resultado | JSONB | sí | — |  | Base-de-Datos/init.sql:524 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:524 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | solicitud_id | Base-de-Datos/init.sql:522 |
| implícita_2 | FOREIGN KEY | REFERENCES public.incidencias(id_incidencia) | Base-de-Datos/init.sql:522 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:523 |


### incidencia_eventos

Historial de eventos protegido por triggers; orden identity. Fuente: `Base-de-Datos/init.sql:504`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | gen_random_uuid() | PK | Base-de-Datos/init.sql:505 |
| orden | BIGINT | sí | IDENTITY ALWAYS [generación, no DEFAULT explícito] | UK | Base-de-Datos/init.sql:506 |
| id_incidencia | BIGINT | sí | — | FK | Base-de-Datos/init.sql:507 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:508 |
| tipo | TEXT | sí | — |  | Base-de-Datos/init.sql:509 |
| estado_anterior | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:510 |
| estado_nuevo | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:511 |
| id_administrador | BIGINT | no | — | FK | Base-de-Datos/init.sql:512 |
| comentario_publico | VARCHAR(300) | no | — |  | Base-de-Datos/init.sql:513 |
| solicitud_id | UUID | no | — | UK | Base-de-Datos/init.sql:514 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:505 |
| implícita_2 | UNIQUE | orden | Base-de-Datos/init.sql:506 |
| implícita_3 | FOREIGN KEY | REFERENCES public.incidencias(id_incidencia) | Base-de-Datos/init.sql:507 |
| incidencia_eventos_tipo_check | CHECK | tipo IN('registro','estado') | Base-de-Datos/init.sql:509 |
| incidencia_eventos_estado_anterior_check | CHECK | estado_anterior IN('Registrada','En revisión','Resuelta') | Base-de-Datos/init.sql:510 |
| incidencia_eventos_estado_nuevo_check | CHECK | estado_nuevo IN('Registrada','En revisión','Resuelta') | Base-de-Datos/init.sql:511 |
| implícita_7 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:512 |
| implícita_8 | UNIQUE | solicitud_id | Base-de-Datos/init.sql:514 |
| implícita_9 | CHECK | (tipo='registro' AND estado_anterior IS NULL AND id_administrador IS NULL AND comentario_publico IS NULL) OR (tipo='estado' AND estado_anterior IS NOT NULL AND estado_anterior<>estado_nuevo) | Base-de-Datos/init.sql:515 |
| implícita_10 | CHECK | comentario_publico IS NULL OR (length(btrim(comentario_publico))>0 AND id_administrador IS NOT NULL) | Base-de-Datos/init.sql:517 |


### incidencias

Reporte, ubicación/foto opcionales y estado actual. Fuente: `Base-de-Datos/init.sql:149`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_incidencia | BIGINT | sí | nextval('public.incidencias_id_incidencia_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:150 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:151 |
| tipo | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:153 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:154 |
| referencia | VARCHAR(200) | no | — |  | Base-de-Datos/init.sql:155 |
| latitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:157 |
| longitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:158 |
| foto | BYTEA | no | — |  | Base-de-Datos/init.sql:160 |
| foto_mime | VARCHAR(50) | no | — |  | Base-de-Datos/init.sql:161 |
| estado | VARCHAR(30) | sí | 'Registrada' |  | Base-de-Datos/init.sql:163 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:165 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_incidencia | Base-de-Datos/init.sql:150 |
| chk_estado_incidencia | CHECK | estado IN ('Registrada', 'En revisión', 'Resuelta') | Base-de-Datos/init.sql:167 |
| fk_incidencia_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:170 |


### notificaciones

Avisos internos; leida global es legacy, lecturas individuales en tabla aparte. Fuente: `Base-de-Datos/init.sql:258`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | nextval('public.notificaciones_id_notificacion_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:259 |
| id_suministro | BIGINT | no | — | FK | Base-de-Datos/init.sql:260 |
| alcance | VARCHAR(20) | sí | 'Usuario' |  | Base-de-Datos/init.sql:261 |
| titulo | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:262 |
| mensaje | TEXT | sí | — |  | Base-de-Datos/init.sql:263 |
| tipo | VARCHAR(40) | sí | 'general' |  | Base-de-Datos/init.sql:264 |
| leida | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:265 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:266 |
| push_evento | UUID | sí | gen_random_uuid() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:20 |
| push_clave | TEXT | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:21 |
| push_recibo | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:22 |
| push_corte | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:23 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_notificacion | Base-de-Datos/init.sql:259 |
| chk_alcance_notificacion | CHECK | alcance IN ('Usuario', 'General') | Base-de-Datos/init.sql:268 |
| fk_notificacion_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:271 |
| implícita_4 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/migrations/012_notificaciones_push.sql:22 |
| implícita_5 | FOREIGN KEY | REFERENCES public.cortes_servicio(id_corte) | Base-de-Datos/migrations/012_notificaciones_push.sql:23 |


### notificaciones_lecturas

Lectura por notificación y suministro; fila existente significa leída. Fuente: `Base-de-Datos/init.sql:282`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:283 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:284 |
| fecha_lectura | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:285 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_notificaciones_lecturas | PRIMARY KEY | id_notificacion, id_suministro | Base-de-Datos/init.sql:287 |
| fk_lectura_notificacion | FOREIGN KEY | REFERENCES notificaciones(id_notificacion) ON DELETE CASCADE | Base-de-Datos/init.sql:290 |
| fk_lectura_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) ON DELETE CASCADE | Base-de-Datos/init.sql:295 |


### operaciones_pago

Operaciones demostrativas/verificación; no confundir con pagos acreditados. Fuente: `Base-de-Datos/init.sql:362`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:363 |
| solicitud_id | UUID | sí | — | UK | Base-de-Datos/init.sql:364 |
| id_usuario | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:365 |
| id_recibo | BIGINT | sí | — | FK | Base-de-Datos/init.sql:366 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:367 |
| moneda | TEXT | sí | 'PEN' |  | Base-de-Datos/init.sql:368 |
| entorno | TEXT | sí | — |  | Base-de-Datos/init.sql:369 |
| metodo | TEXT | sí | — |  | Base-de-Datos/init.sql:370 |
| estado | TEXT | sí | — |  | Base-de-Datos/init.sql:371 |
| referencia | TEXT | no | — |  | Base-de-Datos/init.sql:372 |
| referencia_hash | TEXT | no | — |  | Base-de-Datos/init.sql:373 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/init.sql:374 |
| comprobante | BYTEA | no | — |  | Base-de-Datos/init.sql:375 |
| comprobante_hash | TEXT | no | — |  | Base-de-Datos/init.sql:376 |
| proveedor_id | TEXT | no | — | UK | Base-de-Datos/init.sql:377 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:378 |
| actualizado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:379 |
| revisado_por | BIGINT | no | — | FK | Base-de-Datos/init.sql:380 |
| revisado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:381 |
| motivo | TEXT | no | — |  | Base-de-Datos/init.sql:382 |
| piloto_id | UUID | no | — | FK | Base-de-Datos/init.sql:453 |
| piloto_ensayo | BOOLEAN | no | — |  | Base-de-Datos/init.sql:454 |
| receptor_huella | TEXT | no | — |  | Base-de-Datos/init.sql:455 |
| recibido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:456 |
| monto_recibido | NUMERIC(10,2) | no | — |  | Base-de-Datos/init.sql:457 |
| receptor_comprobado | BOOLEAN | no | — |  | Base-de-Datos/init.sql:458 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:363 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:365 |
| implícita_3 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/init.sql:366 |
| operaciones_pago_monto_check | CHECK | monto>0 | Base-de-Datos/init.sql:367 |
| operaciones_pago_moneda_check | CHECK | moneda='PEN' | Base-de-Datos/init.sql:368 |
| operaciones_pago_metodo_check | CHECK | metodo IN ('demostrativo','yape_manual','proveedor_simulado') | Base-de-Datos/init.sql:370 |
| operaciones_pago_estado_check | CHECK | estado IN ('demostrativa','declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor','rechazada','cancelada','reembolsada') | Base-de-Datos/init.sql:371 |
| operaciones_pago_referencia_check | CHECK | length(referencia) BETWEEN 4 AND 100 | Base-de-Datos/init.sql:372 |
| operaciones_pago_referencia_hash_check | CHECK | referencia_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:373 |
| operaciones_pago_payload_hash_check | CHECK | payload_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:374 |
| operaciones_pago_comprobante_check | CHECK | octet_length(comprobante)<=1048576 | Base-de-Datos/init.sql:375 |
| operaciones_pago_comprobante_hash_check | CHECK | comprobante_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:376 |
| implícita_14 | UNIQUE | proveedor_id | Base-de-Datos/init.sql:377 |
| implícita_15 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:380 |
| operaciones_pago_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/init.sql:382 |
| implícita_17 | UNIQUE | id_usuario, solicitud_id | Base-de-Datos/init.sql:383 |
| implícita_18 | CHECK | (comprobante IS NULL)=(comprobante_hash IS NULL) | Base-de-Datos/init.sql:384 |
| implícita_19 | CHECK | (metodo='demostrativo')=(estado='demostrativa') | Base-de-Datos/init.sql:385 |
| implícita_20 | CHECK | estado<>'verificada_manual' OR (metodo='yape_manual' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL AND motivo IS NOT NULL) | Base-de-Datos/init.sql:386 |
| implícita_21 | CHECK | estado<>'acreditada_proveedor' OR (metodo='proveedor_simulado' AND proveedor_id IS NOT NULL) | Base-de-Datos/init.sql:387 |
| implícita_22 | FOREIGN KEY | REFERENCES public.control_piloto_yape(piloto_id) | Base-de-Datos/init.sql:453 |
| operaciones_pago_entorno_check | CHECK | entorno IN ('simulado','piloto_manual') | Base-de-Datos/init.sql:460 |
| chk_piloto_local | CHECK | (entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL) OR (entorno='piloto_manual' AND current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' AND metodo='yape_manual' AND estado NOT IN ('demostrativa','acreditada_proveedor','reembolsada') AND piloto_id IS NOT NULL AND piloto_ensayo IS NOT NULL AND receptor_huella IS NOT NULL AND receptor_huella ~ '^[a-f0-9]{64}$' AND (estado<>'verificada_manual' OR piloto_ensayo IS TRUE OR (monto_recibido IS NOT NULL AND monto_recibido=monto AND receptor_comprobado IS TRUE))) | Base-de-Datos/init.sql:483 |


### operaciones_pago_historial

Auditoría inmutable de estados de operación. Fuente: `Base-de-Datos/init.sql:396`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | BIGINT | sí | nextval('public.operaciones_pago_historial_id_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:397 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/init.sql:398 |
| estado | TEXT | sí | — |  | Base-de-Datos/init.sql:399 |
| actor_id | BIGINT | no | — | FK | Base-de-Datos/init.sql:400 |
| motivo | TEXT | sí | — |  | Base-de-Datos/init.sql:401 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:402 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:397 |
| implícita_2 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/init.sql:398 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:400 |
| operaciones_pago_historial_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/init.sql:401 |


### pagos

Registro histórico de pagos del prototipo; no certifica un cargo bancario. Fuente: `Base-de-Datos/init.sql:129`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_pago | BIGINT | sí | nextval('public.pagos_id_pago_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:130 |
| id_recibo | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:131 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:133 |
| metodo | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:135 |
| codigo_operacion | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:136 |
| fecha_pago | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:138 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_pago | Base-de-Datos/init.sql:130 |
| fk_pago_recibo | FOREIGN KEY | REFERENCES recibos(id_recibo) | Base-de-Datos/init.sql:140 |
| uq_pagos_recibo | UNIQUE | id_recibo | Base-de-Datos/init.sql:144 |


### push_dispositivos

Dispositivos, consentimiento, preferencias y token cifrado. Fuente: `Base-de-Datos/migrations/012_notificaciones_push.sql:8`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| prueba_hash | CHAR(64) | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| id_usuario | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:10 |
| id_suministro | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:11 |
| version_seguridad | INTEGER | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:12 |
| revision | INTEGER | sí | 1 |  | Base-de-Datos/migrations/012_notificaciones_push.sql:12 |
| token_hash | CHAR(64) | no | — | UK | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| token_cifrado | BYTEA | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| clave_id | CHAR(16) | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| activo | BOOLEAN | sí | FALSE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:14 |
| consentimiento_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:14 |
| recibos | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:15 |
| vencimientos | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:15 |
| incidencias | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:16 |
| cortes | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:16 |
| autorizado_hasta | TIMESTAMPTZ | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:17 |
| actualizado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:17 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| push_dispositivos_prueba_hash_check | CHECK | prueba_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/012_notificaciones_push.sql:10 |
| implícita_4 | FOREIGN KEY | REFERENCES public.suministros(id_suministro) | Base-de-Datos/migrations/012_notificaciones_push.sql:11 |
| implícita_5 | UNIQUE | token_hash | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| implícita_6 | CHECK | NOT activo OR (id_usuario IS NOT NULL AND id_suministro IS NOT NULL AND token_cifrado IS NOT NULL AND token_hash IS NOT NULL AND consentimiento_en IS NOT NULL) | Base-de-Datos/migrations/012_notificaciones_push.sql:18 |


### push_entregas

Cola de entregas push y revisiones de dispositivo. Fuente: `Base-de-Datos/migrations/012_notificaciones_push.sql:26`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | gen_random_uuid() | PK | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| id_dispositivo | UUID | no | — | FK, UK | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| id_notificacion | BIGINT | no | — | FK, UK | Base-de-Datos/migrations/012_notificaciones_push.sql:28 |
| revision | INTEGER | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:29 |
| categoria | TEXT | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:29 |
| estado | TEXT | sí | 'pendiente' |  | Base-de-Datos/migrations/012_notificaciones_push.sql:30 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/012_notificaciones_push.sql:31 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:32 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:32 |
| vence_en | TIMESTAMPTZ | sí | (clock_timestamp()+INTERVAL '1 hour') |  | Base-de-Datos/migrations/012_notificaciones_push.sql:33 |
| lease | UUID | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:34 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:34 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:34 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| implícita_2 | FOREIGN KEY | REFERENCES public.push_dispositivos(id) | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| implícita_3 | FOREIGN KEY | REFERENCES public.notificaciones(id_notificacion) | Base-de-Datos/migrations/012_notificaciones_push.sql:28 |
| push_entregas_categoria_check | CHECK | categoria IN('recibos','vencimientos','incidencias','cortes') | Base-de-Datos/migrations/012_notificaciones_push.sql:29 |
| push_entregas_estado_check | CHECK | estado IN('pendiente','procesando','reintento','aceptado','simulado','cancelado','fallido','ambiguo','caducado') | Base-de-Datos/migrations/012_notificaciones_push.sql:30 |
| push_entregas_intentos_check | CHECK | intentos BETWEEN 0 AND 3 | Base-de-Datos/migrations/012_notificaciones_push.sql:31 |
| implícita_7 | CHECK | (estado='procesando')=(lease IS NOT NULL) | Base-de-Datos/migrations/012_notificaciones_push.sql:35 |
| implícita_8 | CHECK | (lease IS NULL)=(bloqueado_hasta IS NULL) | Base-de-Datos/migrations/012_notificaciones_push.sql:35 |
| implícita_9 | UNIQUE | id_dispositivo, id_notificacion | Base-de-Datos/migrations/012_notificaciones_push.sql:36 |


### recibos

Recibos de suministro, importe, consumo, periodo y estado. Fuente: `Base-de-Datos/init.sql:103`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_recibo | BIGINT | sí | nextval('public.recibos_id_recibo_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:104 |
| id_suministro | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:105 |
| periodo | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:107 |
| fecha_emision | DATE | sí | — |  | Base-de-Datos/init.sql:109 |
| fecha_vencimiento | DATE | sí | — |  | Base-de-Datos/init.sql:110 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:112 |
| consumo_m3 | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:113 |
| estado | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:115 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_recibo | Base-de-Datos/init.sql:104 |
| chk_estado_recibo | CHECK | estado IN ('Emitido', 'Pendiente', 'Pagado', 'Vencido', 'Anulado') | Base-de-Datos/init.sql:117 |
| fk_recibo_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:120 |
| uq_recibos_suministro_periodo | UNIQUE | id_suministro, periodo | Base-de-Datos/init.sql:124 |


### recuperacion_clave_limites

Límites por identidad hash; activa_id es vínculo lógico sin FK. Fuente: `Base-de-Datos/migrations/011_recuperacion_clave.sql:15`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| identidad_hash | CHAR(64) | sí | — | PK | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| ventana_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:17 |
| ultimo_envio_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:18 |
| solicitudes | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:19 |
| activa_id | UUID | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:20 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | identidad_hash | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| recuperacion_clave_limites_identidad_hash_check | CHECK | identidad_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| recuperacion_clave_limites_solicitudes_check | CHECK | solicitudes BETWEEN 0 AND 3 | Base-de-Datos/migrations/011_recuperacion_clave.sql:19 |


### recuperacion_clave_outbox

Cola cifrada de códigos/avisos de recuperación. Fuente: `Base-de-Datos/migrations/011_recuperacion_clave.sql:43`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/011_recuperacion_clave.sql:44 |
| solicitud_id | UUID | sí | — | FK, UK | Base-de-Datos/migrations/011_recuperacion_clave.sql:45 |
| proposito | TEXT | sí | — | UK | Base-de-Datos/migrations/011_recuperacion_clave.sql:46 |
| proveedor | TEXT | sí | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:47 |
| estado | TEXT | sí | 'pendiente' |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:48 |
| payload | BYTEA | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:49 |
| clave_id | CHAR(16) | sí | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:50 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:51 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:52 |
| lease_token | UUID | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:53 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:54 |
| proveedor_id | VARCHAR(120) | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:55 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:56 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/011_recuperacion_clave.sql:44 |
| implícita_2 | FOREIGN KEY | REFERENCES public.recuperaciones_clave(id) | Base-de-Datos/migrations/011_recuperacion_clave.sql:45 |
| recuperacion_clave_outbox_proposito_check | CHECK | proposito IN ('codigo','aviso') | Base-de-Datos/migrations/011_recuperacion_clave.sql:46 |
| recuperacion_clave_outbox_proveedor_check | CHECK | proveedor IN ('gmail','resend') | Base-de-Datos/migrations/011_recuperacion_clave.sql:47 |
| recuperacion_clave_outbox_estado_check | CHECK | estado IN ('pendiente','procesando','reintento','aceptado','cancelado','caducado','fallido','ambiguo') | Base-de-Datos/migrations/011_recuperacion_clave.sql:48 |
| recuperacion_clave_outbox_intentos_check | CHECK | intentos BETWEEN 0 AND 3 | Base-de-Datos/migrations/011_recuperacion_clave.sql:51 |
| implícita_7 | CHECK | (estado='procesando')=(lease_token IS NOT NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:57 |
| implícita_8 | CHECK | (lease_token IS NULL)=(bloqueado_hasta IS NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:58 |
| implícita_9 | CHECK | estado NOT IN ('pendiente','procesando','reintento') OR payload IS NOT NULL | Base-de-Datos/migrations/011_recuperacion_clave.sql:59 |
| implícita_10 | UNIQUE | solicitud_id, proposito | Base-de-Datos/migrations/011_recuperacion_clave.sql:60 |


### recuperaciones_clave

Solicitudes temporales de recuperación de contraseña. Fuente: `Base-de-Datos/migrations/011_recuperacion_clave.sql:22`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/011_recuperacion_clave.sql:23 |
| identidad_hash | CHAR(64) | sí | — | FK | Base-de-Datos/migrations/011_recuperacion_clave.sql:24 |
| id_usuario | BIGINT | no | — | FK | Base-de-Datos/migrations/011_recuperacion_clave.sql:25 |
| version_seguridad | INTEGER | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:26 |
| clave_huella | CHAR(64) | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:27 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:28 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:29 |
| vence_en | TIMESTAMPTZ | sí | (clock_timestamp()+INTERVAL '15 minutes') |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:30 |
| vinculado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:31 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:32 |
| verificado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:33 |
| permiso_hash | CHAR(64) | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:34 |
| permiso_vence_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:35 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:36 |
| invalidado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:37 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/011_recuperacion_clave.sql:23 |
| implícita_2 | FOREIGN KEY | REFERENCES public.recuperacion_clave_limites(identidad_hash) | Base-de-Datos/migrations/011_recuperacion_clave.sql:24 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/011_recuperacion_clave.sql:25 |
| recuperaciones_clave_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/011_recuperacion_clave.sql:28 |
| recuperaciones_clave_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/migrations/011_recuperacion_clave.sql:32 |
| recuperaciones_clave_permiso_hash_check | CHECK | permiso_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/011_recuperacion_clave.sql:34 |
| implícita_7 | CHECK | (permiso_hash IS NULL)=(permiso_vence_en IS NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:38 |
| implícita_8 | CHECK | (id_usuario IS NULL)=(vinculado_en IS NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:39 |


### registros_correo_envios

Historial de envíos de códigos por solicitud de registro. Fuente: `Base-de-Datos/init.sql:57`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:58 |
| registro_id | UUID | sí | — | FK | Base-de-Datos/init.sql:59 |
| enviado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:60 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:58 |
| implícita_2 | FOREIGN KEY | REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE | Base-de-Datos/init.sql:59 |


### registros_correo_pendientes

Solicitudes de registro con verificación pendiente y caducidad. Fuente: `Base-de-Datos/init.sql:44`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:45 |
| correo | VARCHAR(120) | sí | — |  | Base-de-Datos/init.sql:46 |
| numero_suministro | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:47 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:48 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:49 |
| codigo_vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:50 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:51 |
| creado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:52 |
| vence_en | TIMESTAMPTZ | sí | (CURRENT_TIMESTAMP + INTERVAL '1 hour') |  | Base-de-Datos/init.sql:53 |
| consumido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:54 |
| invalidado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:55 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:45 |
| registros_correo_pendientes_correo_check | CHECK | correo = lower(trim(correo)) | Base-de-Datos/init.sql:46 |
| registros_correo_pendientes_numero_suministro_check | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:47 |
| registros_correo_pendientes_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:49 |
| registros_correo_pendientes_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:51 |


### solicitudes_atencion

Solicitudes y respuesta administrativa persistente. Fuente: `Base-de-Datos/init.sql:230`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_solicitud | BIGINT | sí | nextval('public.solicitudes_atencion_id_solicitud_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:231 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:232 |
| categoria | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:233 |
| asunto | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:234 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:235 |
| estado | VARCHAR(20) | sí | 'Registrada' |  | Base-de-Datos/init.sql:236 |
| respuesta | TEXT | no | — |  | Base-de-Datos/init.sql:237 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:238 |
| fecha_actualizacion | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:239 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_solicitud | Base-de-Datos/init.sql:231 |
| chk_estado_solicitud | CHECK | estado IN ('Registrada', 'En atención', 'Respondida', 'Cerrada') | Base-de-Datos/init.sql:241 |
| fk_solicitud_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:244 |


### suministros

Suministros asociados a cuentas; distrito/zona opcionales del prototipo. Fuente: `Base-de-Datos/init.sql:26`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_suministro | BIGINT | sí | nextval('public.suministros_id_suministro_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:27 |
| numero_suministro | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:28 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:29 |
| distrito | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:31 |
| zona | VARCHAR(150) | no | — |  | Base-de-Datos/init.sql:32 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_suministro | Base-de-Datos/init.sql:27 |
| implícita_2 | UNIQUE | numero_suministro | Base-de-Datos/init.sql:28 |
| chk_numero_suministro_9 | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:34 |
| fk_suministro_usuario | FOREIGN KEY | REFERENCES usuarios(id_usuario) | Base-de-Datos/init.sql:37 |


### usuario_2fa

Estado MFA y versión de seguridad por usuario; secretos cifrados por aplicación. Fuente: `Base-de-Datos/init.sql:307`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:308 |
| version | INTEGER | sí | 0 |  | Base-de-Datos/init.sql:309 |
| activo | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:310 |
| secreto | TEXT | no | — |  | Base-de-Datos/init.sql:311 |
| ultimo_paso | BIGINT | sí | -1 |  | Base-de-Datos/init.sql:312 |
| pendiente_secreto | TEXT | no | — |  | Base-de-Datos/init.sql:313 |
| pendiente_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:314 |
| reautenticado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:315 |
| fallos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:316 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:317 |
| cambio_seguridad_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:6 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/init.sql:308 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/init.sql:308 |
| usuario_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/init.sql:309 |
| usuario_2fa_fallos_check | CHECK | fallos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:316 |
| implícita_5 | CHECK | NOT activo OR secreto IS NOT NULL | Base-de-Datos/init.sql:318 |
| implícita_6 | CHECK | (pendiente_secreto IS NULL) = (pendiente_hasta IS NULL) | Base-de-Datos/init.sql:319 |


### usuario_2fa_recuperacion

Hashes de códigos MFA de recuperación y consumo. Fuente: `Base-de-Datos/init.sql:321`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | FK, PK | Base-de-Datos/init.sql:322 |
| codigo_hash | CHAR(64) | sí | — | PK | Base-de-Datos/init.sql:323 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:324 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/init.sql:322 |
| usuario_2fa_recuperacion_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:323 |
| implícita_3 | PRIMARY KEY | id_usuario, codigo_hash | Base-de-Datos/init.sql:325 |


### usuarios

Cuentas, rol y habilitación; clave_hash contiene un derivado, nunca una contraseña en claro. Fuente: `Base-de-Datos/init.sql:10`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | nextval('public.usuarios_id_usuario_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:11 |
| correo | VARCHAR(120) | sí | — | UK | Base-de-Datos/init.sql:12 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:13 |
| rol | VARCHAR(20) | sí | 'usuario' |  | Base-de-Datos/init.sql:14 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:15 |
| activo | BOOLEAN | sí | TRUE |  | Base-de-Datos/init.sql:16 |
| correo_verificado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:17 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/init.sql:11 |
| implícita_2 | UNIQUE | correo | Base-de-Datos/init.sql:12 |
| chk_rol_usuario | CHECK | rol IN ('usuario', 'admin') | Base-de-Datos/init.sql:19 |


### Relaciones y cardinalidades

| Hija.columnas | Padre.columnas | Padres/hija | Hijas/padre | DELETE / UPDATE |
|---|---|---|---|---|
| suministros.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| registros_correo_envios.registro_id | registros_correo_pendientes.id | 1 | 0..N | CASCADE / NO ACTION |
| correo_outbox.id | registros_correo_envios.id | 1 | 0..1 | CASCADE / NO ACTION |
| recibos.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| pagos.id_recibo | recibos.id_recibo | 1 | 0..1 | NO ACTION / NO ACTION |
| incidencias.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_corte | cortes_servicio.id_corte | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| solicitudes_atencion.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.id_suministro | suministros.id_suministro | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.push_recibo | recibos.id_recibo | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.push_corte | cortes_servicio.id_corte | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones_lecturas.id_notificacion | notificaciones.id_notificacion | 1 | 0..N | CASCADE / NO ACTION |
| notificaciones_lecturas.id_suministro | suministros.id_suministro | 1 | 0..N | CASCADE / NO ACTION |
| usuario_2fa.id_usuario | usuarios.id_usuario | 1 | 0..1 | NO ACTION / NO ACTION |
| usuario_2fa_recuperacion.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| desafios_2fa.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_recibo | recibos.id_recibo | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.revisado_por | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.piloto_id | control_piloto_yape.piloto_id | 0..1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.actor_id | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| eventos_pago_proveedor.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| control_piloto_yape.id_recibo | recibos.id_recibo | 1 | 0..N | NO ACTION / NO ACTION |
| control_piloto_yape.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| control_piloto_yape.id_admin | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_eventos.id_incidencia | incidencias.id_incidencia | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_eventos.id_administrador | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| incidencia_cambios.id_incidencia | incidencias.id_incidencia | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_cambios.id_administrador | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| recuperaciones_clave.identidad_hash | recuperacion_clave_limites.identidad_hash | 1 | 0..N | NO ACTION / NO ACTION |
| recuperaciones_clave.id_usuario | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| recuperacion_clave_outbox.solicitud_id | recuperaciones_clave.id | 1 | 0..N | NO ACTION / NO ACTION |
| push_dispositivos.id_usuario | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| push_dispositivos.id_suministro | suministros.id_suministro | 0..1 | 0..N | NO ACTION / NO ACTION |
| push_entregas.id_dispositivo | push_dispositivos.id | 0..1 | 0..N | NO ACTION / NO ACTION |
| push_entregas.id_notificacion | notificaciones.id_notificacion | 0..1 | 0..N | NO ACTION / NO ACTION |


### Índices

| Nombre | Tabla | Único | Definición | Origen | Fuente |
|---|---|---|---|---|---|
| idx_registro_correo | registros_correo_pendientes | False | CREATE INDEX idx_registro_correo ON registros_correo_pendientes(correo) | CREATE INDEX | Base-de-Datos/init.sql:62 |
| idx_registro_suministro | registros_correo_pendientes | False | CREATE INDEX idx_registro_suministro ON registros_correo_pendientes(numero_suministro) | CREATE INDEX | Base-de-Datos/init.sql:63 |
| idx_registro_vencimiento | registros_correo_pendientes | False | CREATE INDEX idx_registro_vencimiento ON registros_correo_pendientes(vence_en,id) | CREATE INDEX | Base-de-Datos/init.sql:64 |
| idx_registro_envios | registros_correo_envios | False | CREATE INDEX idx_registro_envios ON registros_correo_envios(registro_id, enviado_en) | CREATE INDEX | Base-de-Datos/init.sql:65 |
| idx_correo_outbox_disponible | correo_outbox | False | CREATE INDEX idx_correo_outbox_disponible ON public.correo_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento') | CREATE INDEX | Base-de-Datos/init.sql:97 |
| idx_correo_outbox_lease | correo_outbox | False | CREATE INDEX idx_correo_outbox_lease ON public.correo_outbox(bloqueado_hasta,id) WHERE estado='procesando' | CREATE INDEX | Base-de-Datos/init.sql:99 |
| idx_solicitudes_suministro | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_suministro ON solicitudes_atencion(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:248 |
| idx_solicitudes_estado | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_estado ON solicitudes_atencion(estado) | CREATE INDEX | Base-de-Datos/init.sql:249 |
| idx_notif_suministro | notificaciones | False | CREATE INDEX idx_notif_suministro ON notificaciones(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:275 |
| idx_notif_fecha | notificaciones | False | CREATE INDEX idx_notif_fecha ON notificaciones(fecha_registro DESC) | CREATE INDEX | Base-de-Datos/init.sql:276 |
| idx_lecturas_suministro | notificaciones_lecturas | False | CREATE INDEX idx_lecturas_suministro ON notificaciones_lecturas(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:300 |
| idx_desafios_2fa_usuario | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_usuario ON public.desafios_2fa(id_usuario) | CREATE INDEX | Base-de-Datos/init.sql:336 |
| idx_desafios_2fa_vencimiento | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_vencimiento ON public.desafios_2fa(vence_en) | CREATE INDEX | Base-de-Datos/init.sql:337 |
| uq_operacion_activa_recibo | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_operacion_activa_recibo ON public.operaciones_pago(id_recibo) WHERE estado IN ('declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor') | CREATE INDEX | Base-de-Datos/init.sql:389 |
| idx_referencia_declarada | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_referencia_declarada ON public.operaciones_pago(referencia_hash) WHERE referencia_hash IS NOT NULL | CREATE INDEX | Base-de-Datos/init.sql:392 |
| uq_referencia_verificada | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_referencia_verificada ON public.operaciones_pago(referencia_hash) WHERE estado='verificada_manual' | CREATE INDEX | Base-de-Datos/init.sql:393 |
| idx_operaciones_revision | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_operaciones_revision ON public.operaciones_pago(creado_en,id) WHERE estado='pendiente_verificacion' | CREATE INDEX | Base-de-Datos/init.sql:395 |
| idx_incidencia_eventos_orden | incidencia_eventos | False | CREATE INDEX IF NOT EXISTS idx_incidencia_eventos_orden ON public.incidencia_eventos(id_incidencia,orden) | CREATE INDEX | Base-de-Datos/init.sql:519 |
| uq_incidencia_evento_inicial | incidencia_eventos | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencia_evento_inicial ON public.incidencia_eventos(id_incidencia) WHERE tipo='registro' | CREATE INDEX | Base-de-Datos/init.sql:520 |
| idx_recuperaciones_clave_usuario | recuperaciones_clave | False | CREATE INDEX IF NOT EXISTS idx_recuperaciones_clave_usuario ON public.recuperaciones_clave(id_usuario) | CREATE INDEX | Base-de-Datos/migrations/011_recuperacion_clave.sql:41 |
| idx_recuperaciones_clave_vencimiento | recuperaciones_clave | False | CREATE INDEX IF NOT EXISTS idx_recuperaciones_clave_vencimiento ON public.recuperaciones_clave(vence_en) | CREATE INDEX | Base-de-Datos/migrations/011_recuperacion_clave.sql:42 |
| idx_recuperacion_outbox_pendiente | recuperacion_clave_outbox | False | CREATE INDEX IF NOT EXISTS idx_recuperacion_outbox_pendiente ON public.recuperacion_clave_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento','procesando') | CREATE INDEX | Base-de-Datos/migrations/011_recuperacion_clave.sql:62 |
| uq_notificacion_push_evento | notificaciones | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacion_push_evento ON public.notificaciones(push_evento) | CREATE INDEX | Base-de-Datos/migrations/012_notificaciones_push.sql:24 |
| uq_notificacion_push_clave | notificaciones | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacion_push_clave ON public.notificaciones(push_clave) WHERE push_clave IS NOT NULL | CREATE INDEX | Base-de-Datos/migrations/012_notificaciones_push.sql:25 |
| idx_push_entregas_pendientes | push_entregas | False | CREATE INDEX IF NOT EXISTS idx_push_entregas_pendientes ON public.push_entregas(disponible_en) WHERE estado IN('pendiente','reintento','procesando') | CREATE INDEX | Base-de-Datos/migrations/012_notificaciones_push.sql:38 |
| usuarios_pkey | usuarios | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:11 |
| usuarios_correo_key | usuarios | True | UNIQUE btree (correo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:12 |
| suministros_pkey | suministros | True | UNIQUE btree (id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:27 |
| suministros_numero_suministro_key | suministros | True | UNIQUE btree (numero_suministro) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:28 |
| registros_correo_pendientes_pkey | registros_correo_pendientes | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:45 |
| registros_correo_envios_pkey | registros_correo_envios | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:58 |
| correo_outbox_pkey | correo_outbox | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:68 |
| recibos_pkey | recibos | True | UNIQUE btree (id_recibo) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:104 |
| uq_recibos_suministro_periodo | recibos | True | UNIQUE btree (id_suministro, periodo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:124 |
| pagos_pkey | pagos | True | UNIQUE btree (id_pago) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:130 |
| uq_pagos_recibo | pagos | True | UNIQUE btree (id_recibo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:144 |
| incidencias_pkey | incidencias | True | UNIQUE btree (id_incidencia) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:150 |
| cortes_servicio_pkey | cortes_servicio | True | UNIQUE btree (id_corte) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:183 |
| pk_cortes_suministros | cortes_suministros | True | UNIQUE btree (id_corte, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:216 |
| solicitudes_atencion_pkey | solicitudes_atencion | True | UNIQUE btree (id_solicitud) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:231 |
| notificaciones_pkey | notificaciones | True | UNIQUE btree (id_notificacion) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:259 |
| pk_notificaciones_lecturas | notificaciones_lecturas | True | UNIQUE btree (id_notificacion, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:287 |
| usuario_2fa_pkey | usuario_2fa | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:308 |
| usuario_2fa_recuperacion_pkey | usuario_2fa_recuperacion | True | UNIQUE btree (id_usuario, codigo_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:325 |
| desafios_2fa_pkey | desafios_2fa | True | UNIQUE btree (id_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:328 |
| operaciones_pago_pkey | operaciones_pago | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:363 |
| operaciones_pago_proveedor_id_key | operaciones_pago | True | UNIQUE btree (proveedor_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:377 |
| operaciones_pago_id_usuario_solicitud_id_key | operaciones_pago | True | UNIQUE btree (id_usuario, solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:383 |
| operaciones_pago_historial_pkey | operaciones_pago_historial | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:397 |
| eventos_pago_proveedor_pkey | eventos_pago_proveedor | True | UNIQUE btree (evento_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:405 |
| control_piloto_yape_pkey | control_piloto_yape | True | UNIQUE btree (singleton) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:438 |
| control_piloto_yape_piloto_id_key | control_piloto_yape | True | UNIQUE btree (piloto_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:439 |
| incidencia_eventos_pkey | incidencia_eventos | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:505 |
| incidencia_eventos_orden_key | incidencia_eventos | True | UNIQUE btree (orden) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:506 |
| incidencia_eventos_solicitud_id_key | incidencia_eventos | True | UNIQUE btree (solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:514 |
| incidencia_cambios_pkey | incidencia_cambios | True | UNIQUE btree (solicitud_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:522 |
| recuperacion_clave_limites_pkey | recuperacion_clave_limites | True | UNIQUE btree (identidad_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| recuperaciones_clave_pkey | recuperaciones_clave | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:23 |
| recuperacion_clave_outbox_pkey | recuperacion_clave_outbox | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:44 |
| recuperacion_clave_outbox_solicitud_id_proposito_key | recuperacion_clave_outbox | True | UNIQUE btree (solicitud_id, proposito) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:60 |
| push_dispositivos_pkey | push_dispositivos | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| push_dispositivos_token_hash_key | push_dispositivos | True | UNIQUE btree (token_hash) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| push_entregas_pkey | push_entregas | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| push_entregas_id_dispositivo_id_notificacion_key | push_entregas | True | UNIQUE btree (id_dispositivo, id_notificacion) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:36 |


### Secuencias (nombres y parámetros derivados)

| Nombre esperado | Propietario | Generación | Parámetros | Fuente |
|---|---|---|---|---|
| usuarios_id_usuario_seq | usuarios.id_usuario | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY usuarios.id_usuario | Base-de-Datos/init.sql:11 |
| suministros_id_suministro_seq | suministros.id_suministro | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY suministros.id_suministro | Base-de-Datos/init.sql:27 |
| recibos_id_recibo_seq | recibos.id_recibo | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY recibos.id_recibo | Base-de-Datos/init.sql:104 |
| pagos_id_pago_seq | pagos.id_pago | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY pagos.id_pago | Base-de-Datos/init.sql:130 |
| incidencias_id_incidencia_seq | incidencias.id_incidencia | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencias.id_incidencia | Base-de-Datos/init.sql:150 |
| cortes_servicio_id_corte_seq | cortes_servicio.id_corte | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY cortes_servicio.id_corte | Base-de-Datos/init.sql:183 |
| solicitudes_atencion_id_solicitud_seq | solicitudes_atencion.id_solicitud | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY solicitudes_atencion.id_solicitud | Base-de-Datos/init.sql:231 |
| notificaciones_id_notificacion_seq | notificaciones.id_notificacion | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY notificaciones.id_notificacion | Base-de-Datos/init.sql:259 |
| operaciones_pago_historial_id_seq | operaciones_pago_historial.id | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY operaciones_pago_historial.id | Base-de-Datos/init.sql:397 |
| incidencia_eventos_orden_seq | incidencia_eventos.orden | IDENTITY ALWAYS | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencia_eventos.orden | Base-de-Datos/init.sql:506 |


### Funciones y triggers


#### revocar_2fa_al_cambiar_cuenta

Fuente `Base-de-Datos/init.sql:339`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_2fa_al_cambiar_cuenta() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
        INSERT INTO public.usuario_2fa(id_usuario,version) VALUES (NEW.id_usuario,1)
        ON CONFLICT (id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1;
    END IF;
    RETURN NEW;
END;
$$;
```

#### controlar_operacion_pago

Fuente `Base-de-Datos/init.sql:410`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.controlar_operacion_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.id,NEW.solicitud_id,NEW.id_usuario,NEW.id_recibo,NEW.monto,NEW.moneda,NEW.entorno,NEW.metodo,NEW.referencia,NEW.referencia_hash,NEW.payload_hash,NEW.comprobante,NEW.comprobante_hash,NEW.creado_en)
 IS DISTINCT FROM ROW(OLD.id,OLD.solicitud_id,OLD.id_usuario,OLD.id_recibo,OLD.monto,OLD.moneda,OLD.entorno,OLD.metodo,OLD.referencia,OLD.referencia_hash,OLD.payload_hash,OLD.comprobante,OLD.comprobante_hash,OLD.creado_en)
 THEN RAISE EXCEPTION 'Datos originales inmutables'; END IF;
 IF NEW.estado<>OLD.estado AND NOT (
  (OLD.estado='declarada' AND NEW.estado='pendiente_verificacion') OR
  (OLD.estado='pendiente_verificacion' AND NEW.estado IN ('verificada_manual','acreditada_proveedor','rechazada','cancelada')) OR
  (OLD.estado='acreditada_proveedor' AND NEW.estado='reembolsada')
 ) THEN RAISE EXCEPTION 'Transición no permitida'; END IF;
 RETURN NEW;
END $$;
```

#### conservar_auditoria_pago

Fuente `Base-de-Datos/init.sql:426`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.conservar_auditoria_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Auditoría de pagos inmutable'; END $$;
```

#### controlar_piloto_yape

Fuente `Base-de-Datos/init.sql:466`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.controlar_piloto_yape() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.piloto_id,NEW.piloto_ensayo,NEW.receptor_huella) IS DISTINCT FROM ROW(OLD.piloto_id,OLD.piloto_ensayo,OLD.receptor_huella) THEN RAISE EXCEPTION 'Piloto y receptor originales inmutables'; END IF;
 IF OLD.revisado_en IS NOT NULL AND ROW(NEW.recibido_en,NEW.monto_recibido,NEW.receptor_comprobado,NEW.revisado_por,NEW.revisado_en,NEW.motivo) IS DISTINCT FROM ROW(OLD.recibido_en,OLD.monto_recibido,OLD.receptor_comprobado,OLD.revisado_por,OLD.revisado_en,OLD.motivo) THEN RAISE EXCEPTION 'Revisión final inmutable'; END IF;
 RETURN NEW;
END $$;
```

#### validar_revision_sintetica

Fuente `Base-de-Datos/init.sql:487`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.validar_revision_sintetica() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.piloto_ensayo IS TRUE AND NEW.estado='verificada_manual' AND OLD.estado<>'verificada_manual' AND (NEW.recibido_en IS NOT NULL OR NEW.monto_recibido IS NOT NULL OR NEW.receptor_comprobado IS NOT NULL) THEN
  RAISE EXCEPTION 'Un ensayo no registra recepción bancaria';
 END IF;
 RETURN NEW;
END $$;
```

#### proteger_evento_incidencia

Fuente `Base-de-Datos/init.sql:526`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.proteger_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' AND pg_trigger_depth()>=2 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'El historial de incidencias solo admite eventos de origen' USING ERRCODE='42501';
END; $$;
```

#### proteger_cambio_incidencia

Fuente `Base-de-Datos/init.sql:536`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.proteger_cambio_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Las decisiones registradas no se modifican' USING ERRCODE='42501'; END; $$;
```

#### registrar_evento_incidencia

Fuente `Base-de-Datos/init.sql:543`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.registrar_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor BIGINT; comentario TEXT; solicitud UUID;
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_nuevo) VALUES(NEW.id_incidencia,'registro',NEW.estado);
 ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
  actor=NULLIF(current_setting('hidro.incident_actor',true),'')::BIGINT;
  solicitud=NULLIF(current_setting('hidro.incident_request',true),'')::UUID;
  IF actor IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=actor AND rol='admin' AND activo) THEN
    RAISE EXCEPTION 'Responsable no autorizado' USING ERRCODE='42501';
   END IF;
   comentario=NULLIF(btrim(current_setting('hidro.incident_comment',true)),'');
   IF length(comentario)>300 OR comentario ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Comentario público inválido' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_anterior,estado_nuevo,id_administrador,comentario_publico,solicitud_id)
   VALUES(NEW.id_incidencia,'estado',OLD.estado,NEW.estado,actor,comentario,solicitud);
 END IF;
 RETURN NEW;
END; $$;
```

#### fechar_version_seguridad

Fuente `Base-de-Datos/migrations/011_recuperacion_clave.sql:7`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.fechar_version_seguridad() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.version IS DISTINCT FROM OLD.version THEN NEW.cambio_seguridad_en=clock_timestamp(); END IF;
 RETURN NEW;
END; $$;
```

#### limpiar_verificacion_al_cambiar_correo

Fuente `Base-de-Datos/migrations/011_recuperacion_clave.sql:64`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.limpiar_verificacion_al_cambiar_correo() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.correo IS DISTINCT FROM OLD.correo THEN NEW.correo_verificado_en=NULL; END IF;
 RETURN NEW;
END; $$;
```

#### revocar_al_cambiar_credenciales

Fuente `Base-de-Datos/migrations/011_recuperacion_clave.sql:72`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_al_cambiar_credenciales() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.clave_hash IS DISTINCT FROM OLD.clave_hash OR NEW.correo IS DISTINCT FROM OLD.correo THEN
  INSERT INTO public.usuario_2fa(id_usuario,version) VALUES(NEW.id_usuario,1)
  ON CONFLICT(id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1,
   pendiente_secreto=NULL,pendiente_hasta=NULL,reautenticado_en=NULL;
  UPDATE public.desafios_2fa SET usado_en=COALESCE(usado_en,clock_timestamp()) WHERE id_usuario=NEW.id_usuario;
  UPDATE public.recuperaciones_clave SET invalidado_en=clock_timestamp(),permiso_hash=NULL,permiso_vence_en=NULL
   WHERE id_usuario=NEW.id_usuario AND usado_en IS NULL AND invalidado_en IS NULL;
  UPDATE public.recuperacion_clave_outbox o SET estado='cancelado',payload=NULL,lease_token=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp()
   FROM public.recuperaciones_clave r WHERE r.id=o.solicitud_id AND r.id_usuario=NEW.id_usuario
   AND o.proposito='codigo' AND o.estado IN ('pendiente','reintento','procesando');
 END IF;
 RETURN NEW;
END; $$;
```

#### encolar_notificacion_push

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:39`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.encolar_notificacion_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE categoria TEXT;
BEGIN
 categoria=CASE NEW.tipo WHEN 'recibo' THEN 'recibos' WHEN 'vencimiento' THEN 'vencimientos' WHEN 'incidencia' THEN 'incidencias' WHEN 'corte' THEN 'cortes' ELSE NULL END;
 IF categoria IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.push_entregas(id_dispositivo,id_notificacion,revision,categoria)
 SELECT d.id,NEW.id_notificacion,d.revision,categoria FROM public.push_dispositivos d
 JOIN public.usuarios u ON u.id_usuario=d.id_usuario JOIN public.suministros s ON s.id_suministro=d.id_suministro AND s.id_usuario=u.id_usuario
 LEFT JOIN public.usuario_2fa m ON m.id_usuario=u.id_usuario
 WHERE d.activo AND u.activo AND u.rol='usuario' AND d.version_seguridad=COALESCE(m.version,0)
 AND d.autorizado_hasta>clock_timestamp() AND (NEW.alcance='General' OR NEW.id_suministro=d.id_suministro)
 AND CASE categoria WHEN 'recibos' THEN d.recibos WHEN 'vencimientos' THEN d.vencimientos WHEN 'incidencias' THEN d.incidencias WHEN 'cortes' THEN d.cortes ELSE FALSE END
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
```

#### revocar_push_por_seguridad

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:55`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_push_por_seguridad() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.push_dispositivos SET activo=FALSE,token_cifrado=NULL,token_hash=NULL,revision=revision+1
 WHERE id_usuario=NEW.id_usuario AND version_seguridad<>NEW.version AND activo;
 RETURN NEW;
END; $$;
```

#### notificar_corte_local_push

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:64`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.notificar_corte_local_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.alcance='Zona' AND NOT NEW.cancelado THEN
  INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_corte)
  SELECT s.id_suministro,'Usuario','Aviso de corte de servicio','Consulta el aviso actualizado en Cortes.','corte','corte-local:'||NEW.id_corte||':'||s.id_suministro,NEW.id_corte
  FROM public.suministros s WHERE s.distrito=NEW.distrito AND s.zona=NEW.zona
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
```

#### notificar_corte_asociado_push

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:75`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.notificar_corte_asociado_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_corte)
 SELECT NEW.id_suministro,'Usuario','Aviso de corte de servicio','Consulta el aviso actualizado en Cortes.','corte','corte-local:'||NEW.id_corte||':'||NEW.id_suministro,NEW.id_corte
 FROM public.cortes_servicio c WHERE c.id_corte=NEW.id_corte AND c.alcance IS NULL AND NOT c.cancelado
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
```
| Trigger | Tabla | Función | Definición | Fuente |
|---|---|---|---|---|
| revocar_2fa_cuenta | usuarios | revocar_2fa_al_cambiar_cuenta | CREATE OR REPLACE TRIGGER revocar_2fa_cuenta AFTER UPDATE OF rol,activo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.revocar_2fa_al_cambiar_cuenta() | Base-de-Datos/init.sql:349 |
| controlar_operacion_pago | operaciones_pago | controlar_operacion_pago | CREATE OR REPLACE TRIGGER controlar_operacion_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.controlar_operacion_pago() | Base-de-Datos/init.sql:424 |
| conservar_auditoria_pago | operaciones_pago_historial | conservar_auditoria_pago | CREATE OR REPLACE TRIGGER conservar_auditoria_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago_historial FOR EACH ROW EXECUTE FUNCTION public.conservar_auditoria_pago() | Base-de-Datos/init.sql:429 |
| controlar_piloto_yape | operaciones_pago | controlar_piloto_yape | CREATE OR REPLACE TRIGGER controlar_piloto_yape BEFORE UPDATE OR DELETE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.controlar_piloto_yape() | Base-de-Datos/init.sql:474 |
| validar_revision_sintetica | operaciones_pago | validar_revision_sintetica | CREATE OR REPLACE TRIGGER validar_revision_sintetica BEFORE UPDATE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.validar_revision_sintetica() | Base-de-Datos/init.sql:495 |
| proteger_evento_incidencia | incidencia_eventos | proteger_evento_incidencia | CREATE OR REPLACE TRIGGER proteger_evento_incidencia BEFORE INSERT OR UPDATE OR DELETE ON public.incidencia_eventos FOR EACH ROW EXECUTE FUNCTION public.proteger_evento_incidencia() | Base-de-Datos/init.sql:532 |
| proteger_evento_incidencia_truncate | incidencia_eventos | proteger_evento_incidencia | CREATE OR REPLACE TRIGGER proteger_evento_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_eventos FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_evento_incidencia() | Base-de-Datos/init.sql:534 |
| proteger_cambio_incidencia | incidencia_cambios | proteger_cambio_incidencia | CREATE OR REPLACE TRIGGER proteger_cambio_incidencia BEFORE UPDATE OR DELETE ON public.incidencia_cambios FOR EACH ROW EXECUTE FUNCTION public.proteger_cambio_incidencia() | Base-de-Datos/init.sql:539 |
| proteger_cambio_incidencia_truncate | incidencia_cambios | proteger_cambio_incidencia | CREATE OR REPLACE TRIGGER proteger_cambio_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_cambios FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_cambio_incidencia() | Base-de-Datos/init.sql:541 |
| registrar_evento_incidencia | incidencias | registrar_evento_incidencia | CREATE OR REPLACE TRIGGER registrar_evento_incidencia AFTER INSERT OR UPDATE OF estado ON public.incidencias FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_incidencia() | Base-de-Datos/init.sql:567 |
| fechar_version_seguridad | usuario_2fa | fechar_version_seguridad | CREATE OR REPLACE TRIGGER fechar_version_seguridad BEFORE UPDATE OF version ON public.usuario_2fa FOR EACH ROW EXECUTE FUNCTION public.fechar_version_seguridad() | Base-de-Datos/migrations/011_recuperacion_clave.sql:13 |
| limpiar_verificacion_correo | usuarios | limpiar_verificacion_al_cambiar_correo | CREATE OR REPLACE TRIGGER limpiar_verificacion_correo BEFORE UPDATE OF correo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.limpiar_verificacion_al_cambiar_correo() | Base-de-Datos/migrations/011_recuperacion_clave.sql:70 |
| revocar_credenciales | usuarios | revocar_al_cambiar_credenciales | CREATE OR REPLACE TRIGGER revocar_credenciales AFTER UPDATE OF clave_hash,correo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.revocar_al_cambiar_credenciales() | Base-de-Datos/migrations/011_recuperacion_clave.sql:88 |
| encolar_push | notificaciones | encolar_notificacion_push | CREATE OR REPLACE TRIGGER encolar_push AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.encolar_notificacion_push() | Base-de-Datos/migrations/012_notificaciones_push.sql:54 |
| revocar_push_seguridad | usuario_2fa | revocar_push_por_seguridad | CREATE OR REPLACE TRIGGER revocar_push_seguridad AFTER INSERT OR UPDATE OF version ON public.usuario_2fa FOR EACH ROW EXECUTE FUNCTION public.revocar_push_por_seguridad() | Base-de-Datos/migrations/012_notificaciones_push.sql:61 |
| notificar_corte_local | cortes_servicio | notificar_corte_local_push | CREATE OR REPLACE TRIGGER notificar_corte_local AFTER INSERT ON public.cortes_servicio FOR EACH ROW EXECUTE FUNCTION public.notificar_corte_local_push() | Base-de-Datos/migrations/012_notificaciones_push.sql:74 |
| notificar_corte_asociado | cortes_suministros | notificar_corte_asociado_push | CREATE OR REPLACE TRIGGER notificar_corte_asociado AFTER INSERT ON public.cortes_suministros FOR EACH ROW EXECUTE FUNCTION public.notificar_corte_asociado_push() | Base-de-Datos/migrations/012_notificaciones_push.sql:83 |


## produccion-minima

19 tablas, 159 columnas, 21 FK y 42 índices (incluidos PK/UNIQUE derivados).

### correo_outbox

Cola cifrada de correo de registro y control de leases/reintentos. Fuente: `Base-de-Datos/init.sql:67`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK, FK | Base-de-Datos/init.sql:68 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:69 |
| estado | VARCHAR(16) | sí | 'pendiente' |  | Base-de-Datos/init.sql:70 |
| payload | BYTEA | no | — |  | Base-de-Datos/init.sql:72 |
| clave_version | SMALLINT | sí | 1 |  | Base-de-Datos/init.sql:73 |
| clave_id | CHAR(16) | sí | — |  | Base-de-Datos/init.sql:74 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:75 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:76 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:77 |
| iniciado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:78 |
| codigo_vence_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:79 |
| enviar_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:80 |
| lease_token | UUID | no | — |  | Base-de-Datos/init.sql:81 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:82 |
| aceptado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:83 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:84 |
| proveedor_id | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:85 |
| hubo_ambiguedad | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:86 |
| ultimo_error | VARCHAR(16) | no | — |  | Base-de-Datos/init.sql:87 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:68 |
| implícita_2 | FOREIGN KEY | REFERENCES public.registros_correo_envios(id) ON DELETE CASCADE | Base-de-Datos/init.sql:68 |
| correo_outbox_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:69 |
| correo_outbox_estado_check | CHECK | estado IN ('pendiente','procesando','reintento','aceptado','fallido','caducado','cancelado','ambiguo') | Base-de-Datos/init.sql:70 |
| correo_outbox_clave_version_check | CHECK | clave_version=1 | Base-de-Datos/init.sql:73 |
| correo_outbox_clave_id_check | CHECK | clave_id ~ '^[a-f0-9]{16}$' | Base-de-Datos/init.sql:74 |
| correo_outbox_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:75 |
| correo_outbox_ultimo_error_check | CHECK | ultimo_error IN ('transitorio','permanente','ambiguo','cifrado','caducado') | Base-de-Datos/init.sql:87 |
| implícita_9 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (payload IS NOT NULL) | Base-de-Datos/init.sql:88 |
| implícita_10 | CHECK | payload IS NULL OR octet_length(payload) BETWEEN 29 AND 16384 | Base-de-Datos/init.sql:89 |
| implícita_11 | CHECK | (estado='procesando' AND lease_token IS NOT NULL AND bloqueado_hasta IS NOT NULL) OR (estado<>'procesando' AND lease_token IS NULL AND bloqueado_hasta IS NULL) | Base-de-Datos/init.sql:90 |
| implícita_12 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (finalizado_en IS NULL) | Base-de-Datos/init.sql:92 |
| implícita_13 | CHECK | (iniciado_en IS NULL AND codigo_vence_en IS NULL AND enviar_hasta IS NULL) OR (iniciado_en IS NOT NULL AND codigo_vence_en IS NOT NULL AND enviar_hasta IS NOT NULL AND enviar_hasta<codigo_vence_en) | Base-de-Datos/init.sql:93 |
| implícita_14 | CHECK | estado<>'aceptado' OR (aceptado_en IS NOT NULL AND proveedor_id IS NOT NULL) | Base-de-Datos/init.sql:95 |


### cortes_servicio

Avisos por General/Zona; fecha/hora/estado legacy conservados. Fuente: `Base-de-Datos/init.sql:182`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | nextval('public.cortes_servicio_id_corte_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:183 |
| alcance | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:185 |
| distrito | VARCHAR(80) | no | — |  | Base-de-Datos/init.sql:187 |
| zona | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:188 |
| motivo | VARCHAR(200) | sí | — |  | Base-de-Datos/init.sql:189 |
| fecha_inicio | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:191 |
| fecha_fin | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:192 |
| cancelado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:194 |
| fecha | DATE | no | — |  | Base-de-Datos/init.sql:196 |
| hora | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:197 |
| estado | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:199 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_corte | Base-de-Datos/init.sql:183 |
| chk_alcance_corte | CHECK | alcance IS NULL OR alcance IN ('Zona', 'General') | Base-de-Datos/init.sql:201 |
| chk_estado_corte | CHECK | estado IS NULL OR estado IN ('Programado', 'En proceso', 'Restablecido') | Base-de-Datos/init.sql:204 |


### cortes_suministros

Asociación N:M legacy de cortes y suministros. Fuente: `Base-de-Datos/init.sql:212`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:213 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:214 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_cortes_suministros | PRIMARY KEY | id_corte, id_suministro | Base-de-Datos/init.sql:216 |
| fk_cs_corte | FOREIGN KEY | REFERENCES cortes_servicio(id_corte) | Base-de-Datos/init.sql:219 |
| fk_cs_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:223 |


### desafios_2fa

Desafíos MFA temporales con versión y límite de intentos. Fuente: `Base-de-Datos/migrations/007_usuario_2fa.sql:25`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_hash | CHAR(64) | sí | — | PK | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/migrations/007_usuario_2fa.sql:27 |
| version | INTEGER | sí | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:28 |
| clave_huella | CHAR(64) | sí | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:29 |
| vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:30 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:31 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:32 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_hash | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| desafios_2fa_id_hash_check | CHECK | id_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/migrations/007_usuario_2fa.sql:27 |
| desafios_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/migrations/007_usuario_2fa.sql:28 |
| desafios_2fa_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/migrations/007_usuario_2fa.sql:31 |


### eventos_pago_proveedor

Idempotencia de eventos del proveedor simulado. Fuente: `Base-de-Datos/migrations/008_operaciones_pago.sql:50`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| evento_id | TEXT | sí | — | PK | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:52 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:53 |
| recibido_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:54 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | evento_id | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| eventos_pago_proveedor_evento_id_check | CHECK | length(evento_id) BETWEEN 1 AND 100 | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| implícita_3 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/migrations/008_operaciones_pago.sql:52 |


### incidencias

Reporte, ubicación/foto opcionales y estado actual. Fuente: `Base-de-Datos/init.sql:149`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_incidencia | BIGINT | sí | nextval('public.incidencias_id_incidencia_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:150 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:151 |
| tipo | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:153 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:154 |
| referencia | VARCHAR(200) | no | — |  | Base-de-Datos/init.sql:155 |
| latitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:157 |
| longitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:158 |
| foto | BYTEA | no | — |  | Base-de-Datos/init.sql:160 |
| foto_mime | VARCHAR(50) | no | — |  | Base-de-Datos/init.sql:161 |
| estado | VARCHAR(30) | sí | 'Registrada' |  | Base-de-Datos/init.sql:163 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:165 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_incidencia | Base-de-Datos/init.sql:150 |
| chk_estado_incidencia | CHECK | estado IN ('Registrada', 'En revisión', 'Resuelta') | Base-de-Datos/init.sql:167 |
| fk_incidencia_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:170 |


### notificaciones

Avisos internos; leida global es legacy, lecturas individuales en tabla aparte. Fuente: `Base-de-Datos/init.sql:258`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | nextval('public.notificaciones_id_notificacion_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:259 |
| id_suministro | BIGINT | no | — | FK | Base-de-Datos/init.sql:260 |
| alcance | VARCHAR(20) | sí | 'Usuario' |  | Base-de-Datos/init.sql:261 |
| titulo | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:262 |
| mensaje | TEXT | sí | — |  | Base-de-Datos/init.sql:263 |
| tipo | VARCHAR(40) | sí | 'general' |  | Base-de-Datos/init.sql:264 |
| leida | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:265 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:266 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_notificacion | Base-de-Datos/init.sql:259 |
| chk_alcance_notificacion | CHECK | alcance IN ('Usuario', 'General') | Base-de-Datos/init.sql:268 |
| fk_notificacion_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:271 |


### notificaciones_lecturas

Lectura por notificación y suministro; fila existente significa leída. Fuente: `Base-de-Datos/init.sql:282`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:283 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:284 |
| fecha_lectura | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:285 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_notificaciones_lecturas | PRIMARY KEY | id_notificacion, id_suministro | Base-de-Datos/init.sql:287 |
| fk_lectura_notificacion | FOREIGN KEY | REFERENCES notificaciones(id_notificacion) ON DELETE CASCADE | Base-de-Datos/init.sql:290 |
| fk_lectura_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) ON DELETE CASCADE | Base-de-Datos/init.sql:295 |


### operaciones_pago

Operaciones demostrativas/verificación; no confundir con pagos acreditados. Fuente: `Base-de-Datos/migrations/008_operaciones_pago.sql:8`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/008_operaciones_pago.sql:9 |
| solicitud_id | UUID | sí | — | UK | Base-de-Datos/migrations/008_operaciones_pago.sql:10 |
| id_usuario | BIGINT | sí | — | FK, UK | Base-de-Datos/migrations/008_operaciones_pago.sql:11 |
| id_recibo | BIGINT | sí | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:12 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:13 |
| moneda | TEXT | sí | 'PEN' |  | Base-de-Datos/migrations/008_operaciones_pago.sql:14 |
| entorno | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:15 |
| metodo | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:16 |
| estado | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:17 |
| referencia | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:18 |
| referencia_hash | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:19 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:20 |
| comprobante | BYTEA | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:21 |
| comprobante_hash | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:22 |
| proveedor_id | TEXT | no | — | UK | Base-de-Datos/migrations/008_operaciones_pago.sql:23 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:24 |
| actualizado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:25 |
| revisado_por | BIGINT | no | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:26 |
| revisado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:27 |
| motivo | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:28 |
| piloto_id | UUID | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:17 |
| piloto_ensayo | BOOLEAN | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:18 |
| receptor_huella | TEXT | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:19 |
| recibido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:20 |
| monto_recibido | NUMERIC(10,2) | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:21 |
| receptor_comprobado | BOOLEAN | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:22 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/008_operaciones_pago.sql:9 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/008_operaciones_pago.sql:11 |
| implícita_3 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/migrations/008_operaciones_pago.sql:12 |
| operaciones_pago_monto_check | CHECK | monto>0 | Base-de-Datos/migrations/008_operaciones_pago.sql:13 |
| operaciones_pago_moneda_check | CHECK | moneda='PEN' | Base-de-Datos/migrations/008_operaciones_pago.sql:14 |
| operaciones_pago_entorno_check | CHECK | entorno='simulado' | Base-de-Datos/migrations/008_operaciones_pago.sql:15 |
| operaciones_pago_metodo_check | CHECK | metodo IN ('demostrativo','yape_manual','proveedor_simulado') | Base-de-Datos/migrations/008_operaciones_pago.sql:16 |
| operaciones_pago_estado_check | CHECK | estado IN ('demostrativa','declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor','rechazada','cancelada','reembolsada') | Base-de-Datos/migrations/008_operaciones_pago.sql:17 |
| operaciones_pago_referencia_check | CHECK | length(referencia) BETWEEN 4 AND 100 | Base-de-Datos/migrations/008_operaciones_pago.sql:18 |
| operaciones_pago_referencia_hash_check | CHECK | referencia_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/008_operaciones_pago.sql:19 |
| operaciones_pago_payload_hash_check | CHECK | payload_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/008_operaciones_pago.sql:20 |
| operaciones_pago_comprobante_check | CHECK | octet_length(comprobante)<=1048576 | Base-de-Datos/migrations/008_operaciones_pago.sql:21 |
| operaciones_pago_comprobante_hash_check | CHECK | comprobante_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/008_operaciones_pago.sql:22 |
| implícita_14 | UNIQUE | proveedor_id | Base-de-Datos/migrations/008_operaciones_pago.sql:23 |
| implícita_15 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/008_operaciones_pago.sql:26 |
| operaciones_pago_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/migrations/008_operaciones_pago.sql:28 |
| implícita_17 | UNIQUE | id_usuario, solicitud_id | Base-de-Datos/migrations/008_operaciones_pago.sql:29 |
| implícita_18 | CHECK | (comprobante IS NULL)=(comprobante_hash IS NULL) | Base-de-Datos/migrations/008_operaciones_pago.sql:30 |
| implícita_19 | CHECK | (metodo='demostrativo')=(estado='demostrativa') | Base-de-Datos/migrations/008_operaciones_pago.sql:31 |
| implícita_20 | CHECK | estado<>'verificada_manual' OR (metodo='yape_manual' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL AND motivo IS NOT NULL) | Base-de-Datos/migrations/008_operaciones_pago.sql:32 |
| implícita_21 | CHECK | estado<>'acreditada_proveedor' OR (metodo='proveedor_simulado' AND proveedor_id IS NOT NULL) | Base-de-Datos/migrations/008_operaciones_pago.sql:33 |
| chk_operacion_produccion_sin_piloto | CHECK | entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:30 |


### operaciones_pago_historial

Auditoría inmutable de estados de operación. Fuente: `Base-de-Datos/migrations/008_operaciones_pago.sql:42`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | BIGINT | sí | nextval('public.operaciones_pago_historial_id_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:44 |
| estado | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:45 |
| actor_id | BIGINT | no | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:46 |
| motivo | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:47 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:48 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| implícita_2 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/migrations/008_operaciones_pago.sql:44 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/008_operaciones_pago.sql:46 |
| operaciones_pago_historial_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/migrations/008_operaciones_pago.sql:47 |


### pagos

Registro histórico de pagos del prototipo; no certifica un cargo bancario. Fuente: `Base-de-Datos/init.sql:129`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_pago | BIGINT | sí | nextval('public.pagos_id_pago_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:130 |
| id_recibo | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:131 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:133 |
| metodo | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:135 |
| codigo_operacion | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:136 |
| fecha_pago | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:138 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_pago | Base-de-Datos/init.sql:130 |
| fk_pago_recibo | FOREIGN KEY | REFERENCES recibos(id_recibo) | Base-de-Datos/init.sql:140 |
| uq_pagos_recibo | UNIQUE | id_recibo | Base-de-Datos/init.sql:144 |


### recibos

Recibos de suministro, importe, consumo, periodo y estado. Fuente: `Base-de-Datos/init.sql:103`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_recibo | BIGINT | sí | nextval('public.recibos_id_recibo_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:104 |
| id_suministro | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:105 |
| periodo | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:107 |
| fecha_emision | DATE | sí | — |  | Base-de-Datos/init.sql:109 |
| fecha_vencimiento | DATE | sí | — |  | Base-de-Datos/init.sql:110 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:112 |
| consumo_m3 | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:113 |
| estado | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:115 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_recibo | Base-de-Datos/init.sql:104 |
| chk_estado_recibo | CHECK | estado IN ('Emitido', 'Pendiente', 'Pagado', 'Vencido', 'Anulado') | Base-de-Datos/init.sql:117 |
| fk_recibo_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:120 |
| uq_recibos_suministro_periodo | UNIQUE | id_suministro, periodo | Base-de-Datos/init.sql:124 |


### registros_correo_envios

Historial de envíos de códigos por solicitud de registro. Fuente: `Base-de-Datos/init.sql:57`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:58 |
| registro_id | UUID | sí | — | FK | Base-de-Datos/init.sql:59 |
| enviado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:60 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:58 |
| implícita_2 | FOREIGN KEY | REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE | Base-de-Datos/init.sql:59 |


### registros_correo_pendientes

Solicitudes de registro con verificación pendiente y caducidad. Fuente: `Base-de-Datos/init.sql:44`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:45 |
| correo | VARCHAR(120) | sí | — |  | Base-de-Datos/init.sql:46 |
| numero_suministro | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:47 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:48 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:49 |
| codigo_vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:50 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:51 |
| creado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:52 |
| vence_en | TIMESTAMPTZ | sí | (CURRENT_TIMESTAMP + INTERVAL '1 hour') |  | Base-de-Datos/init.sql:53 |
| consumido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:54 |
| invalidado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:55 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:45 |
| registros_correo_pendientes_correo_check | CHECK | correo = lower(trim(correo)) | Base-de-Datos/init.sql:46 |
| registros_correo_pendientes_numero_suministro_check | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:47 |
| registros_correo_pendientes_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:49 |
| registros_correo_pendientes_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:51 |


### solicitudes_atencion

Solicitudes y respuesta administrativa persistente. Fuente: `Base-de-Datos/init.sql:230`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_solicitud | BIGINT | sí | nextval('public.solicitudes_atencion_id_solicitud_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:231 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:232 |
| categoria | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:233 |
| asunto | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:234 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:235 |
| estado | VARCHAR(20) | sí | 'Registrada' |  | Base-de-Datos/init.sql:236 |
| respuesta | TEXT | no | — |  | Base-de-Datos/init.sql:237 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:238 |
| fecha_actualizacion | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:239 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_solicitud | Base-de-Datos/init.sql:231 |
| chk_estado_solicitud | CHECK | estado IN ('Registrada', 'En atención', 'Respondida', 'Cerrada') | Base-de-Datos/init.sql:241 |
| fk_solicitud_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:244 |


### suministros

Suministros asociados a cuentas; distrito/zona opcionales del prototipo. Fuente: `Base-de-Datos/init.sql:26`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_suministro | BIGINT | sí | nextval('public.suministros_id_suministro_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:27 |
| numero_suministro | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:28 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:29 |
| distrito | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:31 |
| zona | VARCHAR(150) | no | — |  | Base-de-Datos/init.sql:32 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_suministro | Base-de-Datos/init.sql:27 |
| implícita_2 | UNIQUE | numero_suministro | Base-de-Datos/init.sql:28 |
| chk_numero_suministro_9 | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:34 |
| fk_suministro_usuario | FOREIGN KEY | REFERENCES usuarios(id_usuario) | Base-de-Datos/init.sql:37 |


### usuario_2fa

Estado MFA y versión de seguridad por usuario; secretos cifrados por aplicación. Fuente: `Base-de-Datos/migrations/007_usuario_2fa.sql:5`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | PK, FK | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| version | INTEGER | sí | 0 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:7 |
| activo | BOOLEAN | sí | FALSE |  | Base-de-Datos/migrations/007_usuario_2fa.sql:8 |
| secreto | TEXT | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:9 |
| ultimo_paso | BIGINT | sí | -1 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:10 |
| pendiente_secreto | TEXT | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:11 |
| pendiente_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:12 |
| reautenticado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:13 |
| fallos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:14 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:15 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| usuario_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/migrations/007_usuario_2fa.sql:7 |
| usuario_2fa_fallos_check | CHECK | fallos BETWEEN 0 AND 5 | Base-de-Datos/migrations/007_usuario_2fa.sql:14 |
| implícita_5 | CHECK | NOT activo OR secreto IS NOT NULL | Base-de-Datos/migrations/007_usuario_2fa.sql:16 |
| implícita_6 | CHECK | (pendiente_secreto IS NULL) = (pendiente_hasta IS NULL) | Base-de-Datos/migrations/007_usuario_2fa.sql:17 |


### usuario_2fa_recuperacion

Hashes de códigos MFA de recuperación y consumo. Fuente: `Base-de-Datos/migrations/007_usuario_2fa.sql:19`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | FK, PK | Base-de-Datos/migrations/007_usuario_2fa.sql:20 |
| codigo_hash | CHAR(64) | sí | — | PK | Base-de-Datos/migrations/007_usuario_2fa.sql:21 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:22 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/migrations/007_usuario_2fa.sql:20 |
| usuario_2fa_recuperacion_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/007_usuario_2fa.sql:21 |
| implícita_3 | PRIMARY KEY | id_usuario, codigo_hash | Base-de-Datos/migrations/007_usuario_2fa.sql:23 |


### usuarios

Cuentas, rol y habilitación; clave_hash contiene un derivado, nunca una contraseña en claro. Fuente: `Base-de-Datos/init.sql:10`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | nextval('public.usuarios_id_usuario_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:11 |
| correo | VARCHAR(120) | sí | — | UK | Base-de-Datos/init.sql:12 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:13 |
| rol | VARCHAR(20) | sí | 'usuario' |  | Base-de-Datos/init.sql:14 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:15 |
| activo | BOOLEAN | sí | TRUE |  | Base-de-Datos/init.sql:16 |
| correo_verificado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:17 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/init.sql:11 |
| implícita_2 | UNIQUE | correo | Base-de-Datos/init.sql:12 |
| chk_rol_usuario | CHECK | rol IN ('usuario', 'admin') | Base-de-Datos/init.sql:19 |


### Relaciones y cardinalidades

| Hija.columnas | Padre.columnas | Padres/hija | Hijas/padre | DELETE / UPDATE |
|---|---|---|---|---|
| suministros.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| registros_correo_envios.registro_id | registros_correo_pendientes.id | 1 | 0..N | CASCADE / NO ACTION |
| correo_outbox.id | registros_correo_envios.id | 1 | 0..1 | CASCADE / NO ACTION |
| recibos.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| pagos.id_recibo | recibos.id_recibo | 1 | 0..1 | NO ACTION / NO ACTION |
| incidencias.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_corte | cortes_servicio.id_corte | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| solicitudes_atencion.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.id_suministro | suministros.id_suministro | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones_lecturas.id_notificacion | notificaciones.id_notificacion | 1 | 0..N | CASCADE / NO ACTION |
| notificaciones_lecturas.id_suministro | suministros.id_suministro | 1 | 0..N | CASCADE / NO ACTION |
| usuario_2fa.id_usuario | usuarios.id_usuario | 1 | 0..1 | NO ACTION / NO ACTION |
| usuario_2fa_recuperacion.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| desafios_2fa.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_recibo | recibos.id_recibo | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.revisado_por | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.actor_id | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| eventos_pago_proveedor.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |


### Índices

| Nombre | Tabla | Único | Definición | Origen | Fuente |
|---|---|---|---|---|---|
| idx_registro_correo | registros_correo_pendientes | False | CREATE INDEX idx_registro_correo ON registros_correo_pendientes(correo) | CREATE INDEX | Base-de-Datos/init.sql:62 |
| idx_registro_suministro | registros_correo_pendientes | False | CREATE INDEX idx_registro_suministro ON registros_correo_pendientes(numero_suministro) | CREATE INDEX | Base-de-Datos/init.sql:63 |
| idx_registro_vencimiento | registros_correo_pendientes | False | CREATE INDEX idx_registro_vencimiento ON registros_correo_pendientes(vence_en,id) | CREATE INDEX | Base-de-Datos/init.sql:64 |
| idx_registro_envios | registros_correo_envios | False | CREATE INDEX idx_registro_envios ON registros_correo_envios(registro_id, enviado_en) | CREATE INDEX | Base-de-Datos/init.sql:65 |
| idx_correo_outbox_disponible | correo_outbox | False | CREATE INDEX idx_correo_outbox_disponible ON public.correo_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento') | CREATE INDEX | Base-de-Datos/init.sql:97 |
| idx_correo_outbox_lease | correo_outbox | False | CREATE INDEX idx_correo_outbox_lease ON public.correo_outbox(bloqueado_hasta,id) WHERE estado='procesando' | CREATE INDEX | Base-de-Datos/init.sql:99 |
| idx_solicitudes_suministro | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_suministro ON solicitudes_atencion(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:248 |
| idx_solicitudes_estado | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_estado ON solicitudes_atencion(estado) | CREATE INDEX | Base-de-Datos/init.sql:249 |
| idx_notif_suministro | notificaciones | False | CREATE INDEX idx_notif_suministro ON notificaciones(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:275 |
| idx_notif_fecha | notificaciones | False | CREATE INDEX idx_notif_fecha ON notificaciones(fecha_registro DESC) | CREATE INDEX | Base-de-Datos/init.sql:276 |
| idx_lecturas_suministro | notificaciones_lecturas | False | CREATE INDEX idx_lecturas_suministro ON notificaciones_lecturas(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:300 |
| idx_desafios_2fa_usuario | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_usuario ON public.desafios_2fa(id_usuario) | CREATE INDEX | Base-de-Datos/migrations/007_usuario_2fa.sql:34 |
| idx_desafios_2fa_vencimiento | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_vencimiento ON public.desafios_2fa(vence_en) | CREATE INDEX | Base-de-Datos/migrations/007_usuario_2fa.sql:35 |
| uq_operacion_activa_recibo | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_operacion_activa_recibo ON public.operaciones_pago(id_recibo) WHERE estado IN ('declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor') | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:35 |
| idx_referencia_declarada | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_referencia_declarada ON public.operaciones_pago(referencia_hash) WHERE referencia_hash IS NOT NULL | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:38 |
| uq_referencia_verificada | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_referencia_verificada ON public.operaciones_pago(referencia_hash) WHERE estado='verificada_manual' | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:39 |
| idx_operaciones_revision | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_operaciones_revision ON public.operaciones_pago(creado_en,id) WHERE estado='pendiente_verificacion' | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:41 |
| usuarios_pkey | usuarios | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:11 |
| usuarios_correo_key | usuarios | True | UNIQUE btree (correo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:12 |
| suministros_pkey | suministros | True | UNIQUE btree (id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:27 |
| suministros_numero_suministro_key | suministros | True | UNIQUE btree (numero_suministro) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:28 |
| registros_correo_pendientes_pkey | registros_correo_pendientes | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:45 |
| registros_correo_envios_pkey | registros_correo_envios | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:58 |
| correo_outbox_pkey | correo_outbox | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:68 |
| recibos_pkey | recibos | True | UNIQUE btree (id_recibo) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:104 |
| uq_recibos_suministro_periodo | recibos | True | UNIQUE btree (id_suministro, periodo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:124 |
| pagos_pkey | pagos | True | UNIQUE btree (id_pago) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:130 |
| uq_pagos_recibo | pagos | True | UNIQUE btree (id_recibo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:144 |
| incidencias_pkey | incidencias | True | UNIQUE btree (id_incidencia) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:150 |
| cortes_servicio_pkey | cortes_servicio | True | UNIQUE btree (id_corte) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:183 |
| pk_cortes_suministros | cortes_suministros | True | UNIQUE btree (id_corte, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:216 |
| solicitudes_atencion_pkey | solicitudes_atencion | True | UNIQUE btree (id_solicitud) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:231 |
| notificaciones_pkey | notificaciones | True | UNIQUE btree (id_notificacion) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:259 |
| pk_notificaciones_lecturas | notificaciones_lecturas | True | UNIQUE btree (id_notificacion, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:287 |
| usuario_2fa_pkey | usuario_2fa | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| usuario_2fa_recuperacion_pkey | usuario_2fa_recuperacion | True | UNIQUE btree (id_usuario, codigo_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/007_usuario_2fa.sql:23 |
| desafios_2fa_pkey | desafios_2fa | True | UNIQUE btree (id_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| operaciones_pago_pkey | operaciones_pago | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:9 |
| operaciones_pago_proveedor_id_key | operaciones_pago | True | UNIQUE btree (proveedor_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:23 |
| operaciones_pago_id_usuario_solicitud_id_key | operaciones_pago | True | UNIQUE btree (id_usuario, solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:29 |
| operaciones_pago_historial_pkey | operaciones_pago_historial | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| eventos_pago_proveedor_pkey | eventos_pago_proveedor | True | UNIQUE btree (evento_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |


### Secuencias (nombres y parámetros derivados)

| Nombre esperado | Propietario | Generación | Parámetros | Fuente |
|---|---|---|---|---|
| usuarios_id_usuario_seq | usuarios.id_usuario | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY usuarios.id_usuario | Base-de-Datos/init.sql:11 |
| suministros_id_suministro_seq | suministros.id_suministro | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY suministros.id_suministro | Base-de-Datos/init.sql:27 |
| recibos_id_recibo_seq | recibos.id_recibo | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY recibos.id_recibo | Base-de-Datos/init.sql:104 |
| pagos_id_pago_seq | pagos.id_pago | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY pagos.id_pago | Base-de-Datos/init.sql:130 |
| incidencias_id_incidencia_seq | incidencias.id_incidencia | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencias.id_incidencia | Base-de-Datos/init.sql:150 |
| cortes_servicio_id_corte_seq | cortes_servicio.id_corte | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY cortes_servicio.id_corte | Base-de-Datos/init.sql:183 |
| solicitudes_atencion_id_solicitud_seq | solicitudes_atencion.id_solicitud | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY solicitudes_atencion.id_solicitud | Base-de-Datos/init.sql:231 |
| notificaciones_id_notificacion_seq | notificaciones.id_notificacion | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY notificaciones.id_notificacion | Base-de-Datos/init.sql:259 |
| operaciones_pago_historial_id_seq | operaciones_pago_historial.id | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY operaciones_pago_historial.id | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |


### Funciones y triggers


#### revocar_2fa_al_cambiar_cuenta

Fuente `Base-de-Datos/migrations/007_usuario_2fa.sql:37`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_2fa_al_cambiar_cuenta() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
        INSERT INTO public.usuario_2fa(id_usuario,version) VALUES (NEW.id_usuario,1)
        ON CONFLICT (id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1;
    END IF;
    RETURN NEW;
END;
$$;
```

#### controlar_operacion_pago

Fuente `Base-de-Datos/migrations/008_operaciones_pago.sql:56`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.controlar_operacion_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.id,NEW.solicitud_id,NEW.id_usuario,NEW.id_recibo,NEW.monto,NEW.moneda,NEW.entorno,NEW.metodo,NEW.referencia,NEW.referencia_hash,NEW.payload_hash,NEW.comprobante,NEW.comprobante_hash,NEW.creado_en)
 IS DISTINCT FROM ROW(OLD.id,OLD.solicitud_id,OLD.id_usuario,OLD.id_recibo,OLD.monto,OLD.moneda,OLD.entorno,OLD.metodo,OLD.referencia,OLD.referencia_hash,OLD.payload_hash,OLD.comprobante,OLD.comprobante_hash,OLD.creado_en)
 THEN RAISE EXCEPTION 'Datos originales inmutables'; END IF;
 IF NEW.estado<>OLD.estado AND NOT (
  (OLD.estado='declarada' AND NEW.estado='pendiente_verificacion') OR
  (OLD.estado='pendiente_verificacion' AND NEW.estado IN ('verificada_manual','acreditada_proveedor','rechazada','cancelada')) OR
  (OLD.estado='acreditada_proveedor' AND NEW.estado='reembolsada')
 ) THEN RAISE EXCEPTION 'Transición no permitida'; END IF;
 RETURN NEW;
END $$;
```

#### conservar_auditoria_pago

Fuente `Base-de-Datos/migrations/008_operaciones_pago.sql:72`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.conservar_auditoria_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Auditoría de pagos inmutable'; END $$;
```
| Trigger | Tabla | Función | Definición | Fuente |
|---|---|---|---|---|
| revocar_2fa_cuenta | usuarios | revocar_2fa_al_cambiar_cuenta | CREATE OR REPLACE TRIGGER revocar_2fa_cuenta AFTER UPDATE OF rol,activo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.revocar_2fa_al_cambiar_cuenta() | Base-de-Datos/migrations/007_usuario_2fa.sql:47 |
| controlar_operacion_pago | operaciones_pago | controlar_operacion_pago | CREATE OR REPLACE TRIGGER controlar_operacion_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.controlar_operacion_pago() | Base-de-Datos/migrations/008_operaciones_pago.sql:70 |
| conservar_auditoria_pago | operaciones_pago_historial | conservar_auditoria_pago | CREATE OR REPLACE TRIGGER conservar_auditoria_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago_historial FOR EACH ROW EXECUTE FUNCTION public.conservar_auditoria_pago() | Base-de-Datos/migrations/008_operaciones_pago.sql:75 |


## produccion-extendida

26 tablas, 243 columnas, 34 FK y 62 índices (incluidos PK/UNIQUE derivados).

### correo_outbox

Cola cifrada de correo de registro y control de leases/reintentos. Fuente: `Base-de-Datos/init.sql:67`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK, FK | Base-de-Datos/init.sql:68 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:69 |
| estado | VARCHAR(16) | sí | 'pendiente' |  | Base-de-Datos/init.sql:70 |
| payload | BYTEA | no | — |  | Base-de-Datos/init.sql:72 |
| clave_version | SMALLINT | sí | 1 |  | Base-de-Datos/init.sql:73 |
| clave_id | CHAR(16) | sí | — |  | Base-de-Datos/init.sql:74 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:75 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:76 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/init.sql:77 |
| iniciado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:78 |
| codigo_vence_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:79 |
| enviar_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:80 |
| lease_token | UUID | no | — |  | Base-de-Datos/init.sql:81 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:82 |
| aceptado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:83 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:84 |
| proveedor_id | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:85 |
| hubo_ambiguedad | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:86 |
| ultimo_error | VARCHAR(16) | no | — |  | Base-de-Datos/init.sql:87 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:68 |
| implícita_2 | FOREIGN KEY | REFERENCES public.registros_correo_envios(id) ON DELETE CASCADE | Base-de-Datos/init.sql:68 |
| correo_outbox_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:69 |
| correo_outbox_estado_check | CHECK | estado IN ('pendiente','procesando','reintento','aceptado','fallido','caducado','cancelado','ambiguo') | Base-de-Datos/init.sql:70 |
| correo_outbox_clave_version_check | CHECK | clave_version=1 | Base-de-Datos/init.sql:73 |
| correo_outbox_clave_id_check | CHECK | clave_id ~ '^[a-f0-9]{16}$' | Base-de-Datos/init.sql:74 |
| correo_outbox_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:75 |
| correo_outbox_ultimo_error_check | CHECK | ultimo_error IN ('transitorio','permanente','ambiguo','cifrado','caducado') | Base-de-Datos/init.sql:87 |
| implícita_9 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (payload IS NOT NULL) | Base-de-Datos/init.sql:88 |
| implícita_10 | CHECK | payload IS NULL OR octet_length(payload) BETWEEN 29 AND 16384 | Base-de-Datos/init.sql:89 |
| implícita_11 | CHECK | (estado='procesando' AND lease_token IS NOT NULL AND bloqueado_hasta IS NOT NULL) OR (estado<>'procesando' AND lease_token IS NULL AND bloqueado_hasta IS NULL) | Base-de-Datos/init.sql:90 |
| implícita_12 | CHECK | (estado IN ('pendiente','procesando','reintento')) = (finalizado_en IS NULL) | Base-de-Datos/init.sql:92 |
| implícita_13 | CHECK | (iniciado_en IS NULL AND codigo_vence_en IS NULL AND enviar_hasta IS NULL) OR (iniciado_en IS NOT NULL AND codigo_vence_en IS NOT NULL AND enviar_hasta IS NOT NULL AND enviar_hasta<codigo_vence_en) | Base-de-Datos/init.sql:93 |
| implícita_14 | CHECK | estado<>'aceptado' OR (aceptado_en IS NOT NULL AND proveedor_id IS NOT NULL) | Base-de-Datos/init.sql:95 |


### cortes_servicio

Avisos por General/Zona; fecha/hora/estado legacy conservados. Fuente: `Base-de-Datos/init.sql:182`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | nextval('public.cortes_servicio_id_corte_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:183 |
| alcance | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:185 |
| distrito | VARCHAR(80) | no | — |  | Base-de-Datos/init.sql:187 |
| zona | VARCHAR(120) | no | — |  | Base-de-Datos/init.sql:188 |
| motivo | VARCHAR(200) | sí | — |  | Base-de-Datos/init.sql:189 |
| fecha_inicio | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:191 |
| fecha_fin | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:192 |
| cancelado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:194 |
| fecha | DATE | no | — |  | Base-de-Datos/init.sql:196 |
| hora | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:197 |
| estado | VARCHAR(20) | no | — |  | Base-de-Datos/init.sql:199 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_corte | Base-de-Datos/init.sql:183 |
| chk_alcance_corte | CHECK | alcance IS NULL OR alcance IN ('Zona', 'General') | Base-de-Datos/init.sql:201 |
| chk_estado_corte | CHECK | estado IS NULL OR estado IN ('Programado', 'En proceso', 'Restablecido') | Base-de-Datos/init.sql:204 |


### cortes_suministros

Asociación N:M legacy de cortes y suministros. Fuente: `Base-de-Datos/init.sql:212`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_corte | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:213 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:214 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_cortes_suministros | PRIMARY KEY | id_corte, id_suministro | Base-de-Datos/init.sql:216 |
| fk_cs_corte | FOREIGN KEY | REFERENCES cortes_servicio(id_corte) | Base-de-Datos/init.sql:219 |
| fk_cs_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:223 |


### desafios_2fa

Desafíos MFA temporales con versión y límite de intentos. Fuente: `Base-de-Datos/migrations/007_usuario_2fa.sql:25`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_hash | CHAR(64) | sí | — | PK | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/migrations/007_usuario_2fa.sql:27 |
| version | INTEGER | sí | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:28 |
| clave_huella | CHAR(64) | sí | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:29 |
| vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:30 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:31 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:32 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_hash | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| desafios_2fa_id_hash_check | CHECK | id_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/migrations/007_usuario_2fa.sql:27 |
| desafios_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/migrations/007_usuario_2fa.sql:28 |
| desafios_2fa_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/migrations/007_usuario_2fa.sql:31 |


### eventos_pago_proveedor

Idempotencia de eventos del proveedor simulado. Fuente: `Base-de-Datos/migrations/008_operaciones_pago.sql:50`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| evento_id | TEXT | sí | — | PK | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:52 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:53 |
| recibido_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:54 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | evento_id | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| eventos_pago_proveedor_evento_id_check | CHECK | length(evento_id) BETWEEN 1 AND 100 | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| implícita_3 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/migrations/008_operaciones_pago.sql:52 |


### incidencia_cambios

Resultados de decisiones administrativas por solicitud idempotente. Fuente: `Base-de-Datos/migrations/013_seguimiento_incidencias.sql:22`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| solicitud_id | UUID | sí | — | PK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:23 |
| id_incidencia | BIGINT | sí | — | FK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:23 |
| id_administrador | BIGINT | sí | — | FK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:24 |
| huella | CHAR(64) | sí | — |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:25 |
| resultado | JSONB | sí | — |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:25 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:25 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | solicitud_id | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:23 |
| implícita_2 | FOREIGN KEY | REFERENCES public.incidencias(id_incidencia) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:23 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:24 |


### incidencia_eventos

Historial de eventos protegido por triggers; orden identity. Fuente: `Base-de-Datos/migrations/013_seguimiento_incidencias.sql:5`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | gen_random_uuid() | PK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:6 |
| orden | BIGINT | sí | IDENTITY ALWAYS [generación, no DEFAULT explícito] | UK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:7 |
| id_incidencia | BIGINT | sí | — | FK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:8 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:9 |
| tipo | TEXT | sí | — |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:10 |
| estado_anterior | VARCHAR(20) | no | — |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:11 |
| estado_nuevo | VARCHAR(20) | sí | — |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:12 |
| id_administrador | BIGINT | no | — | FK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:13 |
| comentario_publico | VARCHAR(300) | no | — |  | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:14 |
| solicitud_id | UUID | no | — | UK | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:15 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:6 |
| implícita_2 | UNIQUE | orden | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:7 |
| implícita_3 | FOREIGN KEY | REFERENCES public.incidencias(id_incidencia) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:8 |
| incidencia_eventos_tipo_check | CHECK | tipo IN('registro','estado') | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:10 |
| incidencia_eventos_estado_anterior_check | CHECK | estado_anterior IN('Registrada','En revisión','Resuelta') | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:11 |
| incidencia_eventos_estado_nuevo_check | CHECK | estado_nuevo IN('Registrada','En revisión','Resuelta') | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:12 |
| implícita_7 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:13 |
| implícita_8 | UNIQUE | solicitud_id | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:15 |
| implícita_9 | CHECK | (tipo='registro' AND estado_anterior IS NULL AND id_administrador IS NULL AND comentario_publico IS NULL) OR (tipo='estado' AND estado_anterior IS NOT NULL AND estado_anterior<>estado_nuevo) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:16 |
| implícita_10 | CHECK | comentario_publico IS NULL OR (length(btrim(comentario_publico))>0 AND id_administrador IS NOT NULL) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:18 |


### incidencias

Reporte, ubicación/foto opcionales y estado actual. Fuente: `Base-de-Datos/init.sql:149`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_incidencia | BIGINT | sí | nextval('public.incidencias_id_incidencia_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:150 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:151 |
| tipo | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:153 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:154 |
| referencia | VARCHAR(200) | no | — |  | Base-de-Datos/init.sql:155 |
| latitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:157 |
| longitud | NUMERIC(10,7) | no | — |  | Base-de-Datos/init.sql:158 |
| foto | BYTEA | no | — |  | Base-de-Datos/init.sql:160 |
| foto_mime | VARCHAR(50) | no | — |  | Base-de-Datos/init.sql:161 |
| estado | VARCHAR(30) | sí | 'Registrada' |  | Base-de-Datos/init.sql:163 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:165 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_incidencia | Base-de-Datos/init.sql:150 |
| chk_estado_incidencia | CHECK | estado IN ('Registrada', 'En revisión', 'Resuelta') | Base-de-Datos/init.sql:167 |
| fk_incidencia_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:170 |


### notificaciones

Avisos internos; leida global es legacy, lecturas individuales en tabla aparte. Fuente: `Base-de-Datos/init.sql:258`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | nextval('public.notificaciones_id_notificacion_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:259 |
| id_suministro | BIGINT | no | — | FK | Base-de-Datos/init.sql:260 |
| alcance | VARCHAR(20) | sí | 'Usuario' |  | Base-de-Datos/init.sql:261 |
| titulo | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:262 |
| mensaje | TEXT | sí | — |  | Base-de-Datos/init.sql:263 |
| tipo | VARCHAR(40) | sí | 'general' |  | Base-de-Datos/init.sql:264 |
| leida | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:265 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:266 |
| push_evento | UUID | sí | gen_random_uuid() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:20 |
| push_clave | TEXT | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:21 |
| push_recibo | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:22 |
| push_corte | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:23 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_notificacion | Base-de-Datos/init.sql:259 |
| chk_alcance_notificacion | CHECK | alcance IN ('Usuario', 'General') | Base-de-Datos/init.sql:268 |
| fk_notificacion_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:271 |
| implícita_4 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/migrations/012_notificaciones_push.sql:22 |
| implícita_5 | FOREIGN KEY | REFERENCES public.cortes_servicio(id_corte) | Base-de-Datos/migrations/012_notificaciones_push.sql:23 |


### notificaciones_lecturas

Lectura por notificación y suministro; fila existente significa leída. Fuente: `Base-de-Datos/init.sql:282`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_notificacion | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:283 |
| id_suministro | BIGINT | sí | — | PK, FK | Base-de-Datos/init.sql:284 |
| fecha_lectura | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:285 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| pk_notificaciones_lecturas | PRIMARY KEY | id_notificacion, id_suministro | Base-de-Datos/init.sql:287 |
| fk_lectura_notificacion | FOREIGN KEY | REFERENCES notificaciones(id_notificacion) ON DELETE CASCADE | Base-de-Datos/init.sql:290 |
| fk_lectura_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) ON DELETE CASCADE | Base-de-Datos/init.sql:295 |


### operaciones_pago

Operaciones demostrativas/verificación; no confundir con pagos acreditados. Fuente: `Base-de-Datos/migrations/008_operaciones_pago.sql:8`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/008_operaciones_pago.sql:9 |
| solicitud_id | UUID | sí | — | UK | Base-de-Datos/migrations/008_operaciones_pago.sql:10 |
| id_usuario | BIGINT | sí | — | FK, UK | Base-de-Datos/migrations/008_operaciones_pago.sql:11 |
| id_recibo | BIGINT | sí | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:12 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:13 |
| moneda | TEXT | sí | 'PEN' |  | Base-de-Datos/migrations/008_operaciones_pago.sql:14 |
| entorno | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:15 |
| metodo | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:16 |
| estado | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:17 |
| referencia | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:18 |
| referencia_hash | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:19 |
| payload_hash | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:20 |
| comprobante | BYTEA | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:21 |
| comprobante_hash | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:22 |
| proveedor_id | TEXT | no | — | UK | Base-de-Datos/migrations/008_operaciones_pago.sql:23 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:24 |
| actualizado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:25 |
| revisado_por | BIGINT | no | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:26 |
| revisado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:27 |
| motivo | TEXT | no | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:28 |
| piloto_id | UUID | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:17 |
| piloto_ensayo | BOOLEAN | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:18 |
| receptor_huella | TEXT | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:19 |
| recibido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:20 |
| monto_recibido | NUMERIC(10,2) | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:21 |
| receptor_comprobado | BOOLEAN | no | — |  | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:22 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/008_operaciones_pago.sql:9 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/008_operaciones_pago.sql:11 |
| implícita_3 | FOREIGN KEY | REFERENCES public.recibos(id_recibo) | Base-de-Datos/migrations/008_operaciones_pago.sql:12 |
| operaciones_pago_monto_check | CHECK | monto>0 | Base-de-Datos/migrations/008_operaciones_pago.sql:13 |
| operaciones_pago_moneda_check | CHECK | moneda='PEN' | Base-de-Datos/migrations/008_operaciones_pago.sql:14 |
| operaciones_pago_entorno_check | CHECK | entorno='simulado' | Base-de-Datos/migrations/008_operaciones_pago.sql:15 |
| operaciones_pago_metodo_check | CHECK | metodo IN ('demostrativo','yape_manual','proveedor_simulado') | Base-de-Datos/migrations/008_operaciones_pago.sql:16 |
| operaciones_pago_estado_check | CHECK | estado IN ('demostrativa','declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor','rechazada','cancelada','reembolsada') | Base-de-Datos/migrations/008_operaciones_pago.sql:17 |
| operaciones_pago_referencia_check | CHECK | length(referencia) BETWEEN 4 AND 100 | Base-de-Datos/migrations/008_operaciones_pago.sql:18 |
| operaciones_pago_referencia_hash_check | CHECK | referencia_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/008_operaciones_pago.sql:19 |
| operaciones_pago_payload_hash_check | CHECK | payload_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/008_operaciones_pago.sql:20 |
| operaciones_pago_comprobante_check | CHECK | octet_length(comprobante)<=1048576 | Base-de-Datos/migrations/008_operaciones_pago.sql:21 |
| operaciones_pago_comprobante_hash_check | CHECK | comprobante_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/008_operaciones_pago.sql:22 |
| implícita_14 | UNIQUE | proveedor_id | Base-de-Datos/migrations/008_operaciones_pago.sql:23 |
| implícita_15 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/008_operaciones_pago.sql:26 |
| operaciones_pago_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/migrations/008_operaciones_pago.sql:28 |
| implícita_17 | UNIQUE | id_usuario, solicitud_id | Base-de-Datos/migrations/008_operaciones_pago.sql:29 |
| implícita_18 | CHECK | (comprobante IS NULL)=(comprobante_hash IS NULL) | Base-de-Datos/migrations/008_operaciones_pago.sql:30 |
| implícita_19 | CHECK | (metodo='demostrativo')=(estado='demostrativa') | Base-de-Datos/migrations/008_operaciones_pago.sql:31 |
| implícita_20 | CHECK | estado<>'verificada_manual' OR (metodo='yape_manual' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL AND motivo IS NOT NULL) | Base-de-Datos/migrations/008_operaciones_pago.sql:32 |
| implícita_21 | CHECK | estado<>'acreditada_proveedor' OR (metodo='proveedor_simulado' AND proveedor_id IS NOT NULL) | Base-de-Datos/migrations/008_operaciones_pago.sql:33 |
| chk_operacion_produccion_sin_piloto | CHECK | entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL | Base-de-Datos/migrations/014_compatibilidad_operaciones_produccion.sql:30 |


### operaciones_pago_historial

Auditoría inmutable de estados de operación. Fuente: `Base-de-Datos/migrations/008_operaciones_pago.sql:42`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | BIGINT | sí | nextval('public.operaciones_pago_historial_id_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| operacion_id | UUID | sí | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:44 |
| estado | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:45 |
| actor_id | BIGINT | no | — | FK | Base-de-Datos/migrations/008_operaciones_pago.sql:46 |
| motivo | TEXT | sí | — |  | Base-de-Datos/migrations/008_operaciones_pago.sql:47 |
| fecha | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/008_operaciones_pago.sql:48 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| implícita_2 | FOREIGN KEY | REFERENCES public.operaciones_pago(id) | Base-de-Datos/migrations/008_operaciones_pago.sql:44 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/008_operaciones_pago.sql:46 |
| operaciones_pago_historial_motivo_check | CHECK | length(motivo) BETWEEN 8 AND 500 | Base-de-Datos/migrations/008_operaciones_pago.sql:47 |


### pagos

Registro histórico de pagos del prototipo; no certifica un cargo bancario. Fuente: `Base-de-Datos/init.sql:129`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_pago | BIGINT | sí | nextval('public.pagos_id_pago_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:130 |
| id_recibo | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:131 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:133 |
| metodo | VARCHAR(30) | no | — |  | Base-de-Datos/init.sql:135 |
| codigo_operacion | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:136 |
| fecha_pago | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:138 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_pago | Base-de-Datos/init.sql:130 |
| fk_pago_recibo | FOREIGN KEY | REFERENCES recibos(id_recibo) | Base-de-Datos/init.sql:140 |
| uq_pagos_recibo | UNIQUE | id_recibo | Base-de-Datos/init.sql:144 |


### push_dispositivos

Dispositivos, consentimiento, preferencias y token cifrado. Fuente: `Base-de-Datos/migrations/012_notificaciones_push.sql:8`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| prueba_hash | CHAR(64) | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| id_usuario | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:10 |
| id_suministro | BIGINT | no | — | FK | Base-de-Datos/migrations/012_notificaciones_push.sql:11 |
| version_seguridad | INTEGER | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:12 |
| revision | INTEGER | sí | 1 |  | Base-de-Datos/migrations/012_notificaciones_push.sql:12 |
| token_hash | CHAR(64) | no | — | UK | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| token_cifrado | BYTEA | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| clave_id | CHAR(16) | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| activo | BOOLEAN | sí | FALSE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:14 |
| consentimiento_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:14 |
| recibos | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:15 |
| vencimientos | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:15 |
| incidencias | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:16 |
| cortes | BOOLEAN | sí | TRUE |  | Base-de-Datos/migrations/012_notificaciones_push.sql:16 |
| autorizado_hasta | TIMESTAMPTZ | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:17 |
| actualizado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:17 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| push_dispositivos_prueba_hash_check | CHECK | prueba_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/012_notificaciones_push.sql:10 |
| implícita_4 | FOREIGN KEY | REFERENCES public.suministros(id_suministro) | Base-de-Datos/migrations/012_notificaciones_push.sql:11 |
| implícita_5 | UNIQUE | token_hash | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| implícita_6 | CHECK | NOT activo OR (id_usuario IS NOT NULL AND id_suministro IS NOT NULL AND token_cifrado IS NOT NULL AND token_hash IS NOT NULL AND consentimiento_en IS NOT NULL) | Base-de-Datos/migrations/012_notificaciones_push.sql:18 |


### push_entregas

Cola de entregas push y revisiones de dispositivo. Fuente: `Base-de-Datos/migrations/012_notificaciones_push.sql:26`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | gen_random_uuid() | PK | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| id_dispositivo | UUID | no | — | FK, UK | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| id_notificacion | BIGINT | no | — | FK, UK | Base-de-Datos/migrations/012_notificaciones_push.sql:28 |
| revision | INTEGER | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:29 |
| categoria | TEXT | sí | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:29 |
| estado | TEXT | sí | 'pendiente' |  | Base-de-Datos/migrations/012_notificaciones_push.sql:30 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/012_notificaciones_push.sql:31 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:32 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/012_notificaciones_push.sql:32 |
| vence_en | TIMESTAMPTZ | sí | (clock_timestamp()+INTERVAL '1 hour') |  | Base-de-Datos/migrations/012_notificaciones_push.sql:33 |
| lease | UUID | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:34 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:34 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/012_notificaciones_push.sql:34 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| implícita_2 | FOREIGN KEY | REFERENCES public.push_dispositivos(id) | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| implícita_3 | FOREIGN KEY | REFERENCES public.notificaciones(id_notificacion) | Base-de-Datos/migrations/012_notificaciones_push.sql:28 |
| push_entregas_categoria_check | CHECK | categoria IN('recibos','vencimientos','incidencias','cortes') | Base-de-Datos/migrations/012_notificaciones_push.sql:29 |
| push_entregas_estado_check | CHECK | estado IN('pendiente','procesando','reintento','aceptado','simulado','cancelado','fallido','ambiguo','caducado') | Base-de-Datos/migrations/012_notificaciones_push.sql:30 |
| push_entregas_intentos_check | CHECK | intentos BETWEEN 0 AND 3 | Base-de-Datos/migrations/012_notificaciones_push.sql:31 |
| implícita_7 | CHECK | (estado='procesando')=(lease IS NOT NULL) | Base-de-Datos/migrations/012_notificaciones_push.sql:35 |
| implícita_8 | CHECK | (lease IS NULL)=(bloqueado_hasta IS NULL) | Base-de-Datos/migrations/012_notificaciones_push.sql:35 |
| implícita_9 | UNIQUE | id_dispositivo, id_notificacion | Base-de-Datos/migrations/012_notificaciones_push.sql:36 |


### recibos

Recibos de suministro, importe, consumo, periodo y estado. Fuente: `Base-de-Datos/init.sql:103`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_recibo | BIGINT | sí | nextval('public.recibos_id_recibo_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:104 |
| id_suministro | BIGINT | sí | — | FK, UK | Base-de-Datos/init.sql:105 |
| periodo | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:107 |
| fecha_emision | DATE | sí | — |  | Base-de-Datos/init.sql:109 |
| fecha_vencimiento | DATE | sí | — |  | Base-de-Datos/init.sql:110 |
| monto | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:112 |
| consumo_m3 | NUMERIC(10,2) | sí | — |  | Base-de-Datos/init.sql:113 |
| estado | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:115 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_recibo | Base-de-Datos/init.sql:104 |
| chk_estado_recibo | CHECK | estado IN ('Emitido', 'Pendiente', 'Pagado', 'Vencido', 'Anulado') | Base-de-Datos/init.sql:117 |
| fk_recibo_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:120 |
| uq_recibos_suministro_periodo | UNIQUE | id_suministro, periodo | Base-de-Datos/init.sql:124 |


### recuperacion_clave_limites

Límites por identidad hash; activa_id es vínculo lógico sin FK. Fuente: `Base-de-Datos/migrations/011_recuperacion_clave.sql:15`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| identidad_hash | CHAR(64) | sí | — | PK | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| ventana_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:17 |
| ultimo_envio_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:18 |
| solicitudes | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:19 |
| activa_id | UUID | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:20 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | identidad_hash | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| recuperacion_clave_limites_identidad_hash_check | CHECK | identidad_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| recuperacion_clave_limites_solicitudes_check | CHECK | solicitudes BETWEEN 0 AND 3 | Base-de-Datos/migrations/011_recuperacion_clave.sql:19 |


### recuperacion_clave_outbox

Cola cifrada de códigos/avisos de recuperación. Fuente: `Base-de-Datos/migrations/011_recuperacion_clave.sql:43`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/011_recuperacion_clave.sql:44 |
| solicitud_id | UUID | sí | — | FK, UK | Base-de-Datos/migrations/011_recuperacion_clave.sql:45 |
| proposito | TEXT | sí | — | UK | Base-de-Datos/migrations/011_recuperacion_clave.sql:46 |
| proveedor | TEXT | sí | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:47 |
| estado | TEXT | sí | 'pendiente' |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:48 |
| payload | BYTEA | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:49 |
| clave_id | CHAR(16) | sí | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:50 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:51 |
| disponible_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:52 |
| lease_token | UUID | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:53 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:54 |
| proveedor_id | VARCHAR(120) | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:55 |
| finalizado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:56 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/011_recuperacion_clave.sql:44 |
| implícita_2 | FOREIGN KEY | REFERENCES public.recuperaciones_clave(id) | Base-de-Datos/migrations/011_recuperacion_clave.sql:45 |
| recuperacion_clave_outbox_proposito_check | CHECK | proposito IN ('codigo','aviso') | Base-de-Datos/migrations/011_recuperacion_clave.sql:46 |
| recuperacion_clave_outbox_proveedor_check | CHECK | proveedor IN ('gmail','resend') | Base-de-Datos/migrations/011_recuperacion_clave.sql:47 |
| recuperacion_clave_outbox_estado_check | CHECK | estado IN ('pendiente','procesando','reintento','aceptado','cancelado','caducado','fallido','ambiguo') | Base-de-Datos/migrations/011_recuperacion_clave.sql:48 |
| recuperacion_clave_outbox_intentos_check | CHECK | intentos BETWEEN 0 AND 3 | Base-de-Datos/migrations/011_recuperacion_clave.sql:51 |
| implícita_7 | CHECK | (estado='procesando')=(lease_token IS NOT NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:57 |
| implícita_8 | CHECK | (lease_token IS NULL)=(bloqueado_hasta IS NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:58 |
| implícita_9 | CHECK | estado NOT IN ('pendiente','procesando','reintento') OR payload IS NOT NULL | Base-de-Datos/migrations/011_recuperacion_clave.sql:59 |
| implícita_10 | UNIQUE | solicitud_id, proposito | Base-de-Datos/migrations/011_recuperacion_clave.sql:60 |


### recuperaciones_clave

Solicitudes temporales de recuperación de contraseña. Fuente: `Base-de-Datos/migrations/011_recuperacion_clave.sql:22`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/migrations/011_recuperacion_clave.sql:23 |
| identidad_hash | CHAR(64) | sí | — | FK | Base-de-Datos/migrations/011_recuperacion_clave.sql:24 |
| id_usuario | BIGINT | no | — | FK | Base-de-Datos/migrations/011_recuperacion_clave.sql:25 |
| version_seguridad | INTEGER | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:26 |
| clave_huella | CHAR(64) | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:27 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:28 |
| creado_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:29 |
| vence_en | TIMESTAMPTZ | sí | (clock_timestamp()+INTERVAL '15 minutes') |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:30 |
| vinculado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:31 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:32 |
| verificado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:33 |
| permiso_hash | CHAR(64) | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:34 |
| permiso_vence_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:35 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:36 |
| invalidado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:37 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/migrations/011_recuperacion_clave.sql:23 |
| implícita_2 | FOREIGN KEY | REFERENCES public.recuperacion_clave_limites(identidad_hash) | Base-de-Datos/migrations/011_recuperacion_clave.sql:24 |
| implícita_3 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/011_recuperacion_clave.sql:25 |
| recuperaciones_clave_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/011_recuperacion_clave.sql:28 |
| recuperaciones_clave_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/migrations/011_recuperacion_clave.sql:32 |
| recuperaciones_clave_permiso_hash_check | CHECK | permiso_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/011_recuperacion_clave.sql:34 |
| implícita_7 | CHECK | (permiso_hash IS NULL)=(permiso_vence_en IS NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:38 |
| implícita_8 | CHECK | (id_usuario IS NULL)=(vinculado_en IS NULL) | Base-de-Datos/migrations/011_recuperacion_clave.sql:39 |


### registros_correo_envios

Historial de envíos de códigos por solicitud de registro. Fuente: `Base-de-Datos/init.sql:57`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:58 |
| registro_id | UUID | sí | — | FK | Base-de-Datos/init.sql:59 |
| enviado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:60 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:58 |
| implícita_2 | FOREIGN KEY | REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE | Base-de-Datos/init.sql:59 |


### registros_correo_pendientes

Solicitudes de registro con verificación pendiente y caducidad. Fuente: `Base-de-Datos/init.sql:44`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id | UUID | sí | — | PK | Base-de-Datos/init.sql:45 |
| correo | VARCHAR(120) | sí | — |  | Base-de-Datos/init.sql:46 |
| numero_suministro | VARCHAR(20) | sí | — |  | Base-de-Datos/init.sql:47 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:48 |
| codigo_hash | CHAR(64) | sí | — |  | Base-de-Datos/init.sql:49 |
| codigo_vence_en | TIMESTAMPTZ | sí | — |  | Base-de-Datos/init.sql:50 |
| intentos | SMALLINT | sí | 0 |  | Base-de-Datos/init.sql:51 |
| creado_en | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:52 |
| vence_en | TIMESTAMPTZ | sí | (CURRENT_TIMESTAMP + INTERVAL '1 hour') |  | Base-de-Datos/init.sql:53 |
| consumido_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:54 |
| invalidado | BOOLEAN | sí | FALSE |  | Base-de-Datos/init.sql:55 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id | Base-de-Datos/init.sql:45 |
| registros_correo_pendientes_correo_check | CHECK | correo = lower(trim(correo)) | Base-de-Datos/init.sql:46 |
| registros_correo_pendientes_numero_suministro_check | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:47 |
| registros_correo_pendientes_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/init.sql:49 |
| registros_correo_pendientes_intentos_check | CHECK | intentos BETWEEN 0 AND 5 | Base-de-Datos/init.sql:51 |


### solicitudes_atencion

Solicitudes y respuesta administrativa persistente. Fuente: `Base-de-Datos/init.sql:230`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_solicitud | BIGINT | sí | nextval('public.solicitudes_atencion_id_solicitud_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:231 |
| id_suministro | BIGINT | sí | — | FK | Base-de-Datos/init.sql:232 |
| categoria | VARCHAR(80) | sí | — |  | Base-de-Datos/init.sql:233 |
| asunto | VARCHAR(150) | sí | — |  | Base-de-Datos/init.sql:234 |
| descripcion | TEXT | sí | — |  | Base-de-Datos/init.sql:235 |
| estado | VARCHAR(20) | sí | 'Registrada' |  | Base-de-Datos/init.sql:236 |
| respuesta | TEXT | no | — |  | Base-de-Datos/init.sql:237 |
| fecha_registro | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:238 |
| fecha_actualizacion | TIMESTAMPTZ | sí | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:239 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_solicitud | Base-de-Datos/init.sql:231 |
| chk_estado_solicitud | CHECK | estado IN ('Registrada', 'En atención', 'Respondida', 'Cerrada') | Base-de-Datos/init.sql:241 |
| fk_solicitud_suministro | FOREIGN KEY | REFERENCES suministros(id_suministro) | Base-de-Datos/init.sql:244 |


### suministros

Suministros asociados a cuentas; distrito/zona opcionales del prototipo. Fuente: `Base-de-Datos/init.sql:26`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_suministro | BIGINT | sí | nextval('public.suministros_id_suministro_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:27 |
| numero_suministro | VARCHAR(20) | sí | — | UK | Base-de-Datos/init.sql:28 |
| id_usuario | BIGINT | sí | — | FK | Base-de-Datos/init.sql:29 |
| distrito | VARCHAR(100) | no | — |  | Base-de-Datos/init.sql:31 |
| zona | VARCHAR(150) | no | — |  | Base-de-Datos/init.sql:32 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_suministro | Base-de-Datos/init.sql:27 |
| implícita_2 | UNIQUE | numero_suministro | Base-de-Datos/init.sql:28 |
| chk_numero_suministro_9 | CHECK | numero_suministro ~ '^[0-9]{9}$' | Base-de-Datos/init.sql:34 |
| fk_suministro_usuario | FOREIGN KEY | REFERENCES usuarios(id_usuario) | Base-de-Datos/init.sql:37 |


### usuario_2fa

Estado MFA y versión de seguridad por usuario; secretos cifrados por aplicación. Fuente: `Base-de-Datos/migrations/007_usuario_2fa.sql:5`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | PK, FK | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| version | INTEGER | sí | 0 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:7 |
| activo | BOOLEAN | sí | FALSE |  | Base-de-Datos/migrations/007_usuario_2fa.sql:8 |
| secreto | TEXT | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:9 |
| ultimo_paso | BIGINT | sí | -1 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:10 |
| pendiente_secreto | TEXT | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:11 |
| pendiente_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:12 |
| reautenticado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:13 |
| fallos | SMALLINT | sí | 0 |  | Base-de-Datos/migrations/007_usuario_2fa.sql:14 |
| bloqueado_hasta | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:15 |
| cambio_seguridad_en | TIMESTAMPTZ | sí | clock_timestamp() |  | Base-de-Datos/migrations/011_recuperacion_clave.sql:6 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| implícita_2 | FOREIGN KEY | REFERENCES public.usuarios(id_usuario) | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| usuario_2fa_version_check | CHECK | version >= 0 | Base-de-Datos/migrations/007_usuario_2fa.sql:7 |
| usuario_2fa_fallos_check | CHECK | fallos BETWEEN 0 AND 5 | Base-de-Datos/migrations/007_usuario_2fa.sql:14 |
| implícita_5 | CHECK | NOT activo OR secreto IS NOT NULL | Base-de-Datos/migrations/007_usuario_2fa.sql:16 |
| implícita_6 | CHECK | (pendiente_secreto IS NULL) = (pendiente_hasta IS NULL) | Base-de-Datos/migrations/007_usuario_2fa.sql:17 |


### usuario_2fa_recuperacion

Hashes de códigos MFA de recuperación y consumo. Fuente: `Base-de-Datos/migrations/007_usuario_2fa.sql:19`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | — | FK, PK | Base-de-Datos/migrations/007_usuario_2fa.sql:20 |
| codigo_hash | CHAR(64) | sí | — | PK | Base-de-Datos/migrations/007_usuario_2fa.sql:21 |
| usado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/migrations/007_usuario_2fa.sql:22 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | FOREIGN KEY | REFERENCES public.usuario_2fa(id_usuario) | Base-de-Datos/migrations/007_usuario_2fa.sql:20 |
| usuario_2fa_recuperacion_codigo_hash_check | CHECK | codigo_hash ~ '^[a-f0-9]{64}$' | Base-de-Datos/migrations/007_usuario_2fa.sql:21 |
| implícita_3 | PRIMARY KEY | id_usuario, codigo_hash | Base-de-Datos/migrations/007_usuario_2fa.sql:23 |


### usuarios

Cuentas, rol y habilitación; clave_hash contiene un derivado, nunca una contraseña en claro. Fuente: `Base-de-Datos/init.sql:10`.

| Columna | Tipo PostgreSQL | NOT NULL | Default / generación | Claves | Fuente |
|---|---|---|---|---|---|
| id_usuario | BIGINT | sí | nextval('public.usuarios_id_usuario_seq'::regclass) [derivado SERIAL] | PK | Base-de-Datos/init.sql:11 |
| correo | VARCHAR(120) | sí | — | UK | Base-de-Datos/init.sql:12 |
| clave_hash | VARCHAR(255) | sí | — |  | Base-de-Datos/init.sql:13 |
| rol | VARCHAR(20) | sí | 'usuario' |  | Base-de-Datos/init.sql:14 |
| fecha_registro | TIMESTAMP | no | CURRENT_TIMESTAMP |  | Base-de-Datos/init.sql:15 |
| activo | BOOLEAN | sí | TRUE |  | Base-de-Datos/init.sql:16 |
| correo_verificado_en | TIMESTAMPTZ | no | — |  | Base-de-Datos/init.sql:17 |

| Restricción / ID documental | Tipo | Expresión SQL | Fuente |
|---|---|---|---|
| implícita_1 | PRIMARY KEY | id_usuario | Base-de-Datos/init.sql:11 |
| implícita_2 | UNIQUE | correo | Base-de-Datos/init.sql:12 |
| chk_rol_usuario | CHECK | rol IN ('usuario', 'admin') | Base-de-Datos/init.sql:19 |


### Relaciones y cardinalidades

| Hija.columnas | Padre.columnas | Padres/hija | Hijas/padre | DELETE / UPDATE |
|---|---|---|---|---|
| suministros.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| registros_correo_envios.registro_id | registros_correo_pendientes.id | 1 | 0..N | CASCADE / NO ACTION |
| correo_outbox.id | registros_correo_envios.id | 1 | 0..1 | CASCADE / NO ACTION |
| recibos.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| pagos.id_recibo | recibos.id_recibo | 1 | 0..1 | NO ACTION / NO ACTION |
| incidencias.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_corte | cortes_servicio.id_corte | 1 | 0..N | NO ACTION / NO ACTION |
| cortes_suministros.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| solicitudes_atencion.id_suministro | suministros.id_suministro | 1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.id_suministro | suministros.id_suministro | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.push_recibo | recibos.id_recibo | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones.push_corte | cortes_servicio.id_corte | 0..1 | 0..N | NO ACTION / NO ACTION |
| notificaciones_lecturas.id_notificacion | notificaciones.id_notificacion | 1 | 0..N | CASCADE / NO ACTION |
| notificaciones_lecturas.id_suministro | suministros.id_suministro | 1 | 0..N | CASCADE / NO ACTION |
| usuario_2fa.id_usuario | usuarios.id_usuario | 1 | 0..1 | NO ACTION / NO ACTION |
| usuario_2fa_recuperacion.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| desafios_2fa.id_usuario | usuario_2fa.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_usuario | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.id_recibo | recibos.id_recibo | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago.revisado_por | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| operaciones_pago_historial.actor_id | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| eventos_pago_proveedor.operacion_id | operaciones_pago.id | 1 | 0..N | NO ACTION / NO ACTION |
| recuperaciones_clave.identidad_hash | recuperacion_clave_limites.identidad_hash | 1 | 0..N | NO ACTION / NO ACTION |
| recuperaciones_clave.id_usuario | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| recuperacion_clave_outbox.solicitud_id | recuperaciones_clave.id | 1 | 0..N | NO ACTION / NO ACTION |
| push_dispositivos.id_usuario | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| push_dispositivos.id_suministro | suministros.id_suministro | 0..1 | 0..N | NO ACTION / NO ACTION |
| push_entregas.id_dispositivo | push_dispositivos.id | 0..1 | 0..N | NO ACTION / NO ACTION |
| push_entregas.id_notificacion | notificaciones.id_notificacion | 0..1 | 0..N | NO ACTION / NO ACTION |
| incidencia_eventos.id_incidencia | incidencias.id_incidencia | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_eventos.id_administrador | usuarios.id_usuario | 0..1 | 0..N | NO ACTION / NO ACTION |
| incidencia_cambios.id_incidencia | incidencias.id_incidencia | 1 | 0..N | NO ACTION / NO ACTION |
| incidencia_cambios.id_administrador | usuarios.id_usuario | 1 | 0..N | NO ACTION / NO ACTION |


### Índices

| Nombre | Tabla | Único | Definición | Origen | Fuente |
|---|---|---|---|---|---|
| idx_registro_correo | registros_correo_pendientes | False | CREATE INDEX idx_registro_correo ON registros_correo_pendientes(correo) | CREATE INDEX | Base-de-Datos/init.sql:62 |
| idx_registro_suministro | registros_correo_pendientes | False | CREATE INDEX idx_registro_suministro ON registros_correo_pendientes(numero_suministro) | CREATE INDEX | Base-de-Datos/init.sql:63 |
| idx_registro_vencimiento | registros_correo_pendientes | False | CREATE INDEX idx_registro_vencimiento ON registros_correo_pendientes(vence_en,id) | CREATE INDEX | Base-de-Datos/init.sql:64 |
| idx_registro_envios | registros_correo_envios | False | CREATE INDEX idx_registro_envios ON registros_correo_envios(registro_id, enviado_en) | CREATE INDEX | Base-de-Datos/init.sql:65 |
| idx_correo_outbox_disponible | correo_outbox | False | CREATE INDEX idx_correo_outbox_disponible ON public.correo_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento') | CREATE INDEX | Base-de-Datos/init.sql:97 |
| idx_correo_outbox_lease | correo_outbox | False | CREATE INDEX idx_correo_outbox_lease ON public.correo_outbox(bloqueado_hasta,id) WHERE estado='procesando' | CREATE INDEX | Base-de-Datos/init.sql:99 |
| idx_solicitudes_suministro | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_suministro ON solicitudes_atencion(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:248 |
| idx_solicitudes_estado | solicitudes_atencion | False | CREATE INDEX idx_solicitudes_estado ON solicitudes_atencion(estado) | CREATE INDEX | Base-de-Datos/init.sql:249 |
| idx_notif_suministro | notificaciones | False | CREATE INDEX idx_notif_suministro ON notificaciones(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:275 |
| idx_notif_fecha | notificaciones | False | CREATE INDEX idx_notif_fecha ON notificaciones(fecha_registro DESC) | CREATE INDEX | Base-de-Datos/init.sql:276 |
| idx_lecturas_suministro | notificaciones_lecturas | False | CREATE INDEX idx_lecturas_suministro ON notificaciones_lecturas(id_suministro) | CREATE INDEX | Base-de-Datos/init.sql:300 |
| idx_desafios_2fa_usuario | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_usuario ON public.desafios_2fa(id_usuario) | CREATE INDEX | Base-de-Datos/migrations/007_usuario_2fa.sql:34 |
| idx_desafios_2fa_vencimiento | desafios_2fa | False | CREATE INDEX IF NOT EXISTS idx_desafios_2fa_vencimiento ON public.desafios_2fa(vence_en) | CREATE INDEX | Base-de-Datos/migrations/007_usuario_2fa.sql:35 |
| uq_operacion_activa_recibo | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_operacion_activa_recibo ON public.operaciones_pago(id_recibo) WHERE estado IN ('declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor') | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:35 |
| idx_referencia_declarada | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_referencia_declarada ON public.operaciones_pago(referencia_hash) WHERE referencia_hash IS NOT NULL | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:38 |
| uq_referencia_verificada | operaciones_pago | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_referencia_verificada ON public.operaciones_pago(referencia_hash) WHERE estado='verificada_manual' | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:39 |
| idx_operaciones_revision | operaciones_pago | False | CREATE INDEX IF NOT EXISTS idx_operaciones_revision ON public.operaciones_pago(creado_en,id) WHERE estado='pendiente_verificacion' | CREATE INDEX | Base-de-Datos/migrations/008_operaciones_pago.sql:41 |
| idx_recuperaciones_clave_usuario | recuperaciones_clave | False | CREATE INDEX IF NOT EXISTS idx_recuperaciones_clave_usuario ON public.recuperaciones_clave(id_usuario) | CREATE INDEX | Base-de-Datos/migrations/011_recuperacion_clave.sql:41 |
| idx_recuperaciones_clave_vencimiento | recuperaciones_clave | False | CREATE INDEX IF NOT EXISTS idx_recuperaciones_clave_vencimiento ON public.recuperaciones_clave(vence_en) | CREATE INDEX | Base-de-Datos/migrations/011_recuperacion_clave.sql:42 |
| idx_recuperacion_outbox_pendiente | recuperacion_clave_outbox | False | CREATE INDEX IF NOT EXISTS idx_recuperacion_outbox_pendiente ON public.recuperacion_clave_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento','procesando') | CREATE INDEX | Base-de-Datos/migrations/011_recuperacion_clave.sql:62 |
| uq_notificacion_push_evento | notificaciones | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacion_push_evento ON public.notificaciones(push_evento) | CREATE INDEX | Base-de-Datos/migrations/012_notificaciones_push.sql:24 |
| uq_notificacion_push_clave | notificaciones | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacion_push_clave ON public.notificaciones(push_clave) WHERE push_clave IS NOT NULL | CREATE INDEX | Base-de-Datos/migrations/012_notificaciones_push.sql:25 |
| idx_push_entregas_pendientes | push_entregas | False | CREATE INDEX IF NOT EXISTS idx_push_entregas_pendientes ON public.push_entregas(disponible_en) WHERE estado IN('pendiente','reintento','procesando') | CREATE INDEX | Base-de-Datos/migrations/012_notificaciones_push.sql:38 |
| idx_incidencia_eventos_orden | incidencia_eventos | False | CREATE INDEX IF NOT EXISTS idx_incidencia_eventos_orden ON public.incidencia_eventos(id_incidencia,orden) | CREATE INDEX | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:20 |
| uq_incidencia_evento_inicial | incidencia_eventos | True | CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencia_evento_inicial ON public.incidencia_eventos(id_incidencia) WHERE tipo='registro' | CREATE INDEX | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:21 |
| usuarios_pkey | usuarios | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:11 |
| usuarios_correo_key | usuarios | True | UNIQUE btree (correo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:12 |
| suministros_pkey | suministros | True | UNIQUE btree (id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:27 |
| suministros_numero_suministro_key | suministros | True | UNIQUE btree (numero_suministro) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:28 |
| registros_correo_pendientes_pkey | registros_correo_pendientes | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:45 |
| registros_correo_envios_pkey | registros_correo_envios | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:58 |
| correo_outbox_pkey | correo_outbox | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:68 |
| recibos_pkey | recibos | True | UNIQUE btree (id_recibo) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:104 |
| uq_recibos_suministro_periodo | recibos | True | UNIQUE btree (id_suministro, periodo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:124 |
| pagos_pkey | pagos | True | UNIQUE btree (id_pago) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:130 |
| uq_pagos_recibo | pagos | True | UNIQUE btree (id_recibo) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:144 |
| incidencias_pkey | incidencias | True | UNIQUE btree (id_incidencia) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:150 |
| cortes_servicio_pkey | cortes_servicio | True | UNIQUE btree (id_corte) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:183 |
| pk_cortes_suministros | cortes_suministros | True | UNIQUE btree (id_corte, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:216 |
| solicitudes_atencion_pkey | solicitudes_atencion | True | UNIQUE btree (id_solicitud) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:231 |
| notificaciones_pkey | notificaciones | True | UNIQUE btree (id_notificacion) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:259 |
| pk_notificaciones_lecturas | notificaciones_lecturas | True | UNIQUE btree (id_notificacion, id_suministro) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/init.sql:287 |
| usuario_2fa_pkey | usuario_2fa | True | UNIQUE btree (id_usuario) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/007_usuario_2fa.sql:6 |
| usuario_2fa_recuperacion_pkey | usuario_2fa_recuperacion | True | UNIQUE btree (id_usuario, codigo_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/007_usuario_2fa.sql:23 |
| desafios_2fa_pkey | desafios_2fa | True | UNIQUE btree (id_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/007_usuario_2fa.sql:26 |
| operaciones_pago_pkey | operaciones_pago | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:9 |
| operaciones_pago_proveedor_id_key | operaciones_pago | True | UNIQUE btree (proveedor_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:23 |
| operaciones_pago_id_usuario_solicitud_id_key | operaciones_pago | True | UNIQUE btree (id_usuario, solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:29 |
| operaciones_pago_historial_pkey | operaciones_pago_historial | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| eventos_pago_proveedor_pkey | eventos_pago_proveedor | True | UNIQUE btree (evento_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/008_operaciones_pago.sql:51 |
| recuperacion_clave_limites_pkey | recuperacion_clave_limites | True | UNIQUE btree (identidad_hash) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:16 |
| recuperaciones_clave_pkey | recuperaciones_clave | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:23 |
| recuperacion_clave_outbox_pkey | recuperacion_clave_outbox | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:44 |
| recuperacion_clave_outbox_solicitud_id_proposito_key | recuperacion_clave_outbox | True | UNIQUE btree (solicitud_id, proposito) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/011_recuperacion_clave.sql:60 |
| push_dispositivos_pkey | push_dispositivos | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:9 |
| push_dispositivos_token_hash_key | push_dispositivos | True | UNIQUE btree (token_hash) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:13 |
| push_entregas_pkey | push_entregas | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:27 |
| push_entregas_id_dispositivo_id_notificacion_key | push_entregas | True | UNIQUE btree (id_dispositivo, id_notificacion) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/012_notificaciones_push.sql:36 |
| incidencia_eventos_pkey | incidencia_eventos | True | UNIQUE btree (id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:6 |
| incidencia_eventos_orden_key | incidencia_eventos | True | UNIQUE btree (orden) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:7 |
| incidencia_eventos_solicitud_id_key | incidencia_eventos | True | UNIQUE btree (solicitud_id) | derivado UNIQUE (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:15 |
| incidencia_cambios_pkey | incidencia_cambios | True | UNIQUE btree (solicitud_id) | derivado PRIMARY KEY (nombre esperado, no pg_catalog) | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:23 |


### Secuencias (nombres y parámetros derivados)

| Nombre esperado | Propietario | Generación | Parámetros | Fuente |
|---|---|---|---|---|
| usuarios_id_usuario_seq | usuarios.id_usuario | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY usuarios.id_usuario | Base-de-Datos/init.sql:11 |
| suministros_id_suministro_seq | suministros.id_suministro | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY suministros.id_suministro | Base-de-Datos/init.sql:27 |
| recibos_id_recibo_seq | recibos.id_recibo | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY recibos.id_recibo | Base-de-Datos/init.sql:104 |
| pagos_id_pago_seq | pagos.id_pago | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY pagos.id_pago | Base-de-Datos/init.sql:130 |
| incidencias_id_incidencia_seq | incidencias.id_incidencia | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencias.id_incidencia | Base-de-Datos/init.sql:150 |
| cortes_servicio_id_corte_seq | cortes_servicio.id_corte | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY cortes_servicio.id_corte | Base-de-Datos/init.sql:183 |
| solicitudes_atencion_id_solicitud_seq | solicitudes_atencion.id_solicitud | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY solicitudes_atencion.id_solicitud | Base-de-Datos/init.sql:231 |
| notificaciones_id_notificacion_seq | notificaciones.id_notificacion | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY notificaciones.id_notificacion | Base-de-Datos/init.sql:259 |
| operaciones_pago_historial_id_seq | operaciones_pago_historial.id | BIGSERIAL | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY operaciones_pago_historial.id | Base-de-Datos/migrations/008_operaciones_pago.sql:43 |
| incidencia_eventos_orden_seq | incidencia_eventos.orden | IDENTITY ALWAYS | BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY incidencia_eventos.orden | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:7 |


### Funciones y triggers


#### revocar_2fa_al_cambiar_cuenta

Fuente `Base-de-Datos/migrations/007_usuario_2fa.sql:37`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_2fa_al_cambiar_cuenta() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
        INSERT INTO public.usuario_2fa(id_usuario,version) VALUES (NEW.id_usuario,1)
        ON CONFLICT (id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1;
    END IF;
    RETURN NEW;
END;
$$;
```

#### controlar_operacion_pago

Fuente `Base-de-Datos/migrations/008_operaciones_pago.sql:56`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.controlar_operacion_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.id,NEW.solicitud_id,NEW.id_usuario,NEW.id_recibo,NEW.monto,NEW.moneda,NEW.entorno,NEW.metodo,NEW.referencia,NEW.referencia_hash,NEW.payload_hash,NEW.comprobante,NEW.comprobante_hash,NEW.creado_en)
 IS DISTINCT FROM ROW(OLD.id,OLD.solicitud_id,OLD.id_usuario,OLD.id_recibo,OLD.monto,OLD.moneda,OLD.entorno,OLD.metodo,OLD.referencia,OLD.referencia_hash,OLD.payload_hash,OLD.comprobante,OLD.comprobante_hash,OLD.creado_en)
 THEN RAISE EXCEPTION 'Datos originales inmutables'; END IF;
 IF NEW.estado<>OLD.estado AND NOT (
  (OLD.estado='declarada' AND NEW.estado='pendiente_verificacion') OR
  (OLD.estado='pendiente_verificacion' AND NEW.estado IN ('verificada_manual','acreditada_proveedor','rechazada','cancelada')) OR
  (OLD.estado='acreditada_proveedor' AND NEW.estado='reembolsada')
 ) THEN RAISE EXCEPTION 'Transición no permitida'; END IF;
 RETURN NEW;
END $$;
```

#### conservar_auditoria_pago

Fuente `Base-de-Datos/migrations/008_operaciones_pago.sql:72`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.conservar_auditoria_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Auditoría de pagos inmutable'; END $$;
```

#### fechar_version_seguridad

Fuente `Base-de-Datos/migrations/011_recuperacion_clave.sql:7`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.fechar_version_seguridad() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.version IS DISTINCT FROM OLD.version THEN NEW.cambio_seguridad_en=clock_timestamp(); END IF;
 RETURN NEW;
END; $$;
```

#### limpiar_verificacion_al_cambiar_correo

Fuente `Base-de-Datos/migrations/011_recuperacion_clave.sql:64`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.limpiar_verificacion_al_cambiar_correo() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.correo IS DISTINCT FROM OLD.correo THEN NEW.correo_verificado_en=NULL; END IF;
 RETURN NEW;
END; $$;
```

#### revocar_al_cambiar_credenciales

Fuente `Base-de-Datos/migrations/011_recuperacion_clave.sql:72`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_al_cambiar_credenciales() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.clave_hash IS DISTINCT FROM OLD.clave_hash OR NEW.correo IS DISTINCT FROM OLD.correo THEN
  INSERT INTO public.usuario_2fa(id_usuario,version) VALUES(NEW.id_usuario,1)
  ON CONFLICT(id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1,
   pendiente_secreto=NULL,pendiente_hasta=NULL,reautenticado_en=NULL;
  UPDATE public.desafios_2fa SET usado_en=COALESCE(usado_en,clock_timestamp()) WHERE id_usuario=NEW.id_usuario;
  UPDATE public.recuperaciones_clave SET invalidado_en=clock_timestamp(),permiso_hash=NULL,permiso_vence_en=NULL
   WHERE id_usuario=NEW.id_usuario AND usado_en IS NULL AND invalidado_en IS NULL;
  UPDATE public.recuperacion_clave_outbox o SET estado='cancelado',payload=NULL,lease_token=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp()
   FROM public.recuperaciones_clave r WHERE r.id=o.solicitud_id AND r.id_usuario=NEW.id_usuario
   AND o.proposito='codigo' AND o.estado IN ('pendiente','reintento','procesando');
 END IF;
 RETURN NEW;
END; $$;
```

#### encolar_notificacion_push

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:39`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.encolar_notificacion_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE categoria TEXT;
BEGIN
 categoria=CASE NEW.tipo WHEN 'recibo' THEN 'recibos' WHEN 'vencimiento' THEN 'vencimientos' WHEN 'incidencia' THEN 'incidencias' WHEN 'corte' THEN 'cortes' ELSE NULL END;
 IF categoria IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.push_entregas(id_dispositivo,id_notificacion,revision,categoria)
 SELECT d.id,NEW.id_notificacion,d.revision,categoria FROM public.push_dispositivos d
 JOIN public.usuarios u ON u.id_usuario=d.id_usuario JOIN public.suministros s ON s.id_suministro=d.id_suministro AND s.id_usuario=u.id_usuario
 LEFT JOIN public.usuario_2fa m ON m.id_usuario=u.id_usuario
 WHERE d.activo AND u.activo AND u.rol='usuario' AND d.version_seguridad=COALESCE(m.version,0)
 AND d.autorizado_hasta>clock_timestamp() AND (NEW.alcance='General' OR NEW.id_suministro=d.id_suministro)
 AND CASE categoria WHEN 'recibos' THEN d.recibos WHEN 'vencimientos' THEN d.vencimientos WHEN 'incidencias' THEN d.incidencias WHEN 'cortes' THEN d.cortes ELSE FALSE END
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
```

#### revocar_push_por_seguridad

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:55`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.revocar_push_por_seguridad() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.push_dispositivos SET activo=FALSE,token_cifrado=NULL,token_hash=NULL,revision=revision+1
 WHERE id_usuario=NEW.id_usuario AND version_seguridad<>NEW.version AND activo;
 RETURN NEW;
END; $$;
```

#### notificar_corte_local_push

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:64`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.notificar_corte_local_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.alcance='Zona' AND NOT NEW.cancelado THEN
  INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_corte)
  SELECT s.id_suministro,'Usuario','Aviso de corte de servicio','Consulta el aviso actualizado en Cortes.','corte','corte-local:'||NEW.id_corte||':'||s.id_suministro,NEW.id_corte
  FROM public.suministros s WHERE s.distrito=NEW.distrito AND s.zona=NEW.zona
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
```

#### notificar_corte_asociado_push

Fuente `Base-de-Datos/migrations/012_notificaciones_push.sql:75`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.notificar_corte_asociado_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_corte)
 SELECT NEW.id_suministro,'Usuario','Aviso de corte de servicio','Consulta el aviso actualizado en Cortes.','corte','corte-local:'||NEW.id_corte||':'||NEW.id_suministro,NEW.id_corte
 FROM public.cortes_servicio c WHERE c.id_corte=NEW.id_corte AND c.alcance IS NULL AND NOT c.cancelado
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
```

#### proteger_evento_incidencia

Fuente `Base-de-Datos/migrations/013_seguimiento_incidencias.sql:27`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.proteger_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' AND pg_trigger_depth()>=2 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'El historial de incidencias solo admite eventos de origen' USING ERRCODE='42501';
END; $$;
```

#### proteger_cambio_incidencia

Fuente `Base-de-Datos/migrations/013_seguimiento_incidencias.sql:37`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.proteger_cambio_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Las decisiones registradas no se modifican' USING ERRCODE='42501'; END; $$;
```

#### registrar_evento_incidencia

Fuente `Base-de-Datos/migrations/013_seguimiento_incidencias.sql:44`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.

```sql
CREATE OR REPLACE FUNCTION public.registrar_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor BIGINT; comentario TEXT; solicitud UUID;
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_nuevo) VALUES(NEW.id_incidencia,'registro',NEW.estado);
 ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
  actor=NULLIF(current_setting('hidro.incident_actor',true),'')::BIGINT;
  solicitud=NULLIF(current_setting('hidro.incident_request',true),'')::UUID;
  IF actor IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=actor AND rol='admin' AND activo) THEN
    RAISE EXCEPTION 'Responsable no autorizado' USING ERRCODE='42501';
   END IF;
   comentario=NULLIF(btrim(current_setting('hidro.incident_comment',true)),'');
   IF length(comentario)>300 OR comentario ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Comentario público inválido' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_anterior,estado_nuevo,id_administrador,comentario_publico,solicitud_id)
   VALUES(NEW.id_incidencia,'estado',OLD.estado,NEW.estado,actor,comentario,solicitud);
 END IF;
 RETURN NEW;
END; $$;
```
| Trigger | Tabla | Función | Definición | Fuente |
|---|---|---|---|---|
| revocar_2fa_cuenta | usuarios | revocar_2fa_al_cambiar_cuenta | CREATE OR REPLACE TRIGGER revocar_2fa_cuenta AFTER UPDATE OF rol,activo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.revocar_2fa_al_cambiar_cuenta() | Base-de-Datos/migrations/007_usuario_2fa.sql:47 |
| controlar_operacion_pago | operaciones_pago | controlar_operacion_pago | CREATE OR REPLACE TRIGGER controlar_operacion_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.controlar_operacion_pago() | Base-de-Datos/migrations/008_operaciones_pago.sql:70 |
| conservar_auditoria_pago | operaciones_pago_historial | conservar_auditoria_pago | CREATE OR REPLACE TRIGGER conservar_auditoria_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago_historial FOR EACH ROW EXECUTE FUNCTION public.conservar_auditoria_pago() | Base-de-Datos/migrations/008_operaciones_pago.sql:75 |
| fechar_version_seguridad | usuario_2fa | fechar_version_seguridad | CREATE OR REPLACE TRIGGER fechar_version_seguridad BEFORE UPDATE OF version ON public.usuario_2fa FOR EACH ROW EXECUTE FUNCTION public.fechar_version_seguridad() | Base-de-Datos/migrations/011_recuperacion_clave.sql:13 |
| limpiar_verificacion_correo | usuarios | limpiar_verificacion_al_cambiar_correo | CREATE OR REPLACE TRIGGER limpiar_verificacion_correo BEFORE UPDATE OF correo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.limpiar_verificacion_al_cambiar_correo() | Base-de-Datos/migrations/011_recuperacion_clave.sql:70 |
| revocar_credenciales | usuarios | revocar_al_cambiar_credenciales | CREATE OR REPLACE TRIGGER revocar_credenciales AFTER UPDATE OF clave_hash,correo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.revocar_al_cambiar_credenciales() | Base-de-Datos/migrations/011_recuperacion_clave.sql:88 |
| encolar_push | notificaciones | encolar_notificacion_push | CREATE OR REPLACE TRIGGER encolar_push AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.encolar_notificacion_push() | Base-de-Datos/migrations/012_notificaciones_push.sql:54 |
| revocar_push_seguridad | usuario_2fa | revocar_push_por_seguridad | CREATE OR REPLACE TRIGGER revocar_push_seguridad AFTER INSERT OR UPDATE OF version ON public.usuario_2fa FOR EACH ROW EXECUTE FUNCTION public.revocar_push_por_seguridad() | Base-de-Datos/migrations/012_notificaciones_push.sql:61 |
| notificar_corte_local | cortes_servicio | notificar_corte_local_push | CREATE OR REPLACE TRIGGER notificar_corte_local AFTER INSERT ON public.cortes_servicio FOR EACH ROW EXECUTE FUNCTION public.notificar_corte_local_push() | Base-de-Datos/migrations/012_notificaciones_push.sql:74 |
| notificar_corte_asociado | cortes_suministros | notificar_corte_asociado_push | CREATE OR REPLACE TRIGGER notificar_corte_asociado AFTER INSERT ON public.cortes_suministros FOR EACH ROW EXECUTE FUNCTION public.notificar_corte_asociado_push() | Base-de-Datos/migrations/012_notificaciones_push.sql:83 |
| proteger_evento_incidencia | incidencia_eventos | proteger_evento_incidencia | CREATE OR REPLACE TRIGGER proteger_evento_incidencia BEFORE INSERT OR UPDATE OR DELETE ON public.incidencia_eventos FOR EACH ROW EXECUTE FUNCTION public.proteger_evento_incidencia() | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:33 |
| proteger_evento_incidencia_truncate | incidencia_eventos | proteger_evento_incidencia | CREATE OR REPLACE TRIGGER proteger_evento_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_eventos FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_evento_incidencia() | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:35 |
| proteger_cambio_incidencia | incidencia_cambios | proteger_cambio_incidencia | CREATE OR REPLACE TRIGGER proteger_cambio_incidencia BEFORE UPDATE OR DELETE ON public.incidencia_cambios FOR EACH ROW EXECUTE FUNCTION public.proteger_cambio_incidencia() | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:40 |
| proteger_cambio_incidencia_truncate | incidencia_cambios | proteger_cambio_incidencia | CREATE OR REPLACE TRIGGER proteger_cambio_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_cambios FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_cambio_incidencia() | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:42 |
| registrar_evento_incidencia | incidencias | registrar_evento_incidencia | CREATE OR REPLACE TRIGGER registrar_evento_incidencia AFTER INSERT OR UPDATE OF estado ON public.incidencias FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_incidencia() | Base-de-Datos/migrations/013_seguimiento_incidencias.sql:68 |
