# API REST y tiempo real

Contrato de [Backend/server.js](../Backend/server.js) en **v1.0.0**, commit `135cb54`: **41 rutas**, 24 GET, 8 POST y 9 PATCH; 19 son administrativas. No existe una API de generación PDF ni un endpoint REST de logout.

Base pública: `https://hidro-mejora-api.onrender.com`. En Docker se usa `/api` desde el origen de cada cliente mediante Nginx. No concatenar `/api` dos veces.

## Convenciones

- Cuerpos de escritura: JSON, `Content-Type: application/json`; límite global de 3 MB.
- **JWT**: `Authorization: Bearer <token>`; no incluir un token real en ejemplos o documentación.
- Roles reales: `usuario` y `admin`. `requiereAuth` admite ambos y reconstruye el rol/estado actual desde la base. `requiereAdmin` exige además `admin`.
- **Propio**: suministro de la sesión, no del cuerpo. Las rutas heredadas con `:suministro` admiten el suministro propio; un admin puede consultar otro mediante `puedeVerSuministro`.
- `:id` es el identificador del recurso, no el número de suministro; los suministros son cadenas de nueve dígitos, conservando ceros iniciales.
- Los listados vacíos devuelven 200 con arreglo vacío. `cantidad` representa las filas devueltas, no necesariamente un total global.
- `NUMERIC` y `BIGINT` pueden llegar como cadenas por `pg`; convertir solo para presentación/cálculo controlado. Fechas SQL DATE se escriben como `YYYY-MM-DD`; timestamps requieren considerar su zona según [DATABASE](DATABASE.md).
- La mayoría de errores usa `estado: error` y `mensaje`; algunas rutas de recibos/incidencias solo incluyen `mensaje`. No asumir una envoltura uniforme en toda la API.

Códigos comunes: **401** sin JWT válido o expirado; **403** cuenta inexistente/inactiva o permiso insuficiente; **500** error del servidor/base. Estos códigos se aplican a todas las rutas protegidas, además de los específicos de las tablas. Las rutas públicas también pueden devolver 500. Las rutas con limitador pueden devolver 429. Un JSON inválido o un cuerpo excesivo puede ser rechazado antes del handler, sin su formato JSON particular.

## Estado del servicio

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| GET | `/api/health` | Público | Ninguno | 200: `estado`, `mensaje`, `fecha` obtenida con `SELECT NOW()`; 500 si falla PostgreSQL. |

## Autenticación

| Método | Ruta | Acceso | Cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| POST | `/api/auth/login` | Público, limitador | `numero_suministro`, `password` | 200: `estado`, `token`, `usuario` con id/correo/rol y `suministro` con id/número. 400 suministro inválido; 401 credenciales inválidas; 403 cuenta inactiva; 429. |
| POST | `/api/auth/register` | Público, limitador | `correo`, `numero_suministro`, `password` | 201: cuenta creada, `estado`, `mensaje`, `usuario`; no entrega JWT. 400 validación; 409 correo/suministro existente; 429. |
| POST | `/api/auth/change-password` | JWT, ambos roles, limitador | `password_actual`, `password_nueva`, `password_confirmacion` | 200: `estado`, `mensaje`. 400 validación; 401 contraseña actual incorrecta; 429. No revoca todos los JWT existentes. |

Login exige nueve dígitos; acepta contraseña de 4 a 128 caracteres para verificar cuentas existentes. Registro y contraseña nueva exigen 8–128 caracteres, al menos una letra y un número. Correo se normaliza a minúsculas y admite hasta 120 caracteres. Registro crea `usuario`, sin aceptar rol del cliente, y usa transacción para usuario/suministro. No valida el suministro contra un sistema oficial.

## Perfil

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| GET | `/api/me/perfil` | JWT, propio | Ninguno | 200: objeto plano `correo`, `numero_suministro`, `fecha_registro`, `distrito`, `zona`; 404 sin suministro. |
| GET | `/api/perfil/:suministro` | JWT; propio o admin, heredada | `suministro`: nueve dígitos | 200: objeto plano con correo/número/registro, sin ubicación; 400 formato; 403 ajeno; 404 inexistente. |

No hay endpoint para editar correo/nombre/perfil general. La ubicación del suministro solo se modifica con la ruta administrativa correspondiente.

## Recibos

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| GET | `/api/me/recibos` | JWT, propio | Ninguno | 200: `suministro`, `cantidad`, `recibos`. |
| GET | `/api/recibos/:suministro` | JWT; propio o admin, heredada | `suministro` | Misma envoltura de listado; 403 ajeno. |

Cada recibo contiene `id_recibo`, `periodo`, `fecha_emision`, `fecha_vencimiento`, `monto`, `consumo_m3`, `estado`. No contiene lecturas del medidor ni desglose tarifario. PDFs: generación cliente descrita en [MEJORA-PROFESIONAL](MEJORA-PROFESIONAL.md).

## Pagos

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| POST | `/api/pagos` | JWT, propio, limitador | `id_recibo`, `metodo` | 201: `estado`, `pago` y `recibo` con id/estado. 400 validación; 404 recibo inexistente/ajeno; 409 pagado o anulado; 429. |
| GET | `/api/me/pagos` | JWT, propio | Ninguno | 200: `suministro`, `cantidad`, `pagos`. |
| GET | `/api/pagos/:suministro` | JWT; propio o admin, heredada | `suministro` | Misma envoltura de listado; 403 ajeno. |

Pago: `id_pago`, `id_recibo`, `monto`, `metodo`, `codigo_operacion`, `fecha_pago`; los listados añaden `periodo`. Método obligatorio de hasta 30 caracteres. El backend obtiene el monto de PostgreSQL, bloquea el recibo con `FOR UPDATE`, registra el pago y cambia el estado en una transacción. El código `HM-PAG-<año>-<id_pago con al menos seis dígitos>` se genera en el backend. No acepta monto ni código del cliente y no ejecuta un cargo bancario.

## Incidencias y fotografía

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| POST | `/api/incidencias` | JWT, propio, limitador | `tipo`, `descripcion`, `referencia`; opcionales `latitud`, `longitud`, `foto_base64`, `foto_mime` | 201: `estado`, `incidencia`. 400 validación/foto; 413 fotografía demasiado grande; 429. |
| GET | `/api/me/incidencias` | JWT, propio | Ninguno | 200: `suministro`, `cantidad`, `incidencias`. |
| GET | `/api/incidencias/:suministro` | JWT; propio o admin, heredada | `suministro` | Misma envoltura; 403 ajeno. |
| GET | `/api/incidencias/:id/foto` | JWT, foto del suministro propio | `id`: incidencia | 200: bytes de imagen y Content-Type validado; 404 id inválido, imagen ausente/ajena o MIME no admitido. Admin usa su ruta de foto. |

Incidencia: id, tipo, descripción, referencia, coordenadas, `tiene_foto`, estado y registro; los listados no exponen BYTEA/base64. Tipo: obligatorio, máximo 80; descripción: 10–2000; referencia: obligatoria, máximo 200. Fotografía opcional de hasta 2 MB, JPG/PNG/WebP, data URL base64 con MIME coherente y firma binaria verificada. Coordenadas no finitas se convierten a null; el código actual no valida rangos geográficos completos.

## Cortes

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| GET | `/api/cortes` | Público | Ninguno | 200: `actualizado_en`, `cantidad`, `cortes` activos/programados del catálogo. |
| GET | `/api/me/cortes` | JWT, propio | Ninguno | 200: `suministro`, `ubicacion`, `actualizado_en`, `cantidad`, `cortes`. |
| GET | `/api/cortes/:suministro` | JWT; propio o admin, heredada | `suministro`: nueve dígitos | Misma envoltura contextual; 400 formato; 403 ajeno. |

Corte: `id_corte`, `alcance`, `distrito`, `zona`, `motivo`, `fecha_inicio`, `fecha_fin`, estado calculado. Se incluyen avisos generales y, para la sesión, los que coinciden exactamente con distrito/zona. No usa nuevas filas en `cortes_suministros`. Excluye cancelados, fechas ausentes y finalizados. Son avisos del proyecto, no una integración oficial de cortes.

## Atención

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| POST | `/api/atencion` | JWT, propio, limitador | `categoria`, `asunto`, `descripcion` | 201: `estado`, `solicitud`; 400 validación; 429. |
| GET | `/api/atencion` | JWT, propio | Ninguno | 200: `cantidad`, `solicitudes`, ordenadas por registro. |

Categoría obligatoria hasta 80; asunto hasta 150; descripción 10–2000 caracteres. Solicitudes: id, categoría, asunto, descripción, estado, respuesta y fechas. El POST devuelve `solicitud` con `id_solicitud`, `estado`, `fecha`, `categoria`, `asunto`; no devuelve descripción, respuesta ni fecha de actualización. El GET devuelve `fecha_registro` y `fecha_actualizacion` junto al detalle; no confundir ambas formas de respuesta.

## Notificaciones

| Método | Ruta | Acceso | Parámetros/cuerpo | Respuesta y códigos propios |
|---|---|---|---|---|
| GET | `/api/notificaciones` | JWT, propio | Ninguno | 200: `cantidad`, `no_leidas`, `notificaciones`; máximo 100 filas. |
| PATCH | `/api/notificaciones/:id/leida` | JWT, propio | `id`; sin cuerpo requerido | 200: `estado`, `notificacion` con id y `leida: true`; 404 inexistente/ajena. |

Se incluyen notificaciones generales y del suministro. Campos: id, alcance, título, mensaje, tipo, lectura y fecha. La lectura es individual mediante `notificaciones_lecturas`; no se usa el booleano global heredado. No existe push ni una ruta administrativa pública para redactar notificaciones: determinadas operaciones del backend las crean internamente.

## Administración: 19 rutas

Todas las filas siguientes exigen **JWT y rol `admin` vigente**. Siempre aplican 401 sin JWT válido, 403 para `usuario`/cuenta inactiva y 500 ante errores internos. Los filtros visuales de usuarios/recibos/incidencias se realizan en Admin; solo pagos y atención tienen los filtros query indicados.

| Método | Ruta | Finalidad y entrada | Respuesta y códigos propios |
|---|---|---|---|
| GET | `/api/admin/resumen` | Sin parámetros. Indicadores globales. | 200: `estado`, agregados `usuarios`, `recibos`, `pagos`, `incidencias`, `cortes`, `solicitudes`. |
| GET | `/api/admin/usuarios` | Sin parámetros. Listar cuentas con suministro. | 200: `cantidad`, `usuarios` con rol/activo/registro, ubicación y cantidades de actividad. |
| GET | `/api/admin/usuarios/:id` | `id`: usuario. Detalle y actividad reciente. | 200: `estado`, `cuenta`, `suministro`, `actividad`, `ultimos_recibos`, `ultimos_pagos`, `ultimas_incidencias` (hasta cinco por grupo); 404. |
| PATCH | `/api/admin/usuarios/:id/estado` | `id`: usuario; cuerpo `activo` booleano. | 200: `estado`, `usuario`; 400 tipo; 404; 409 al intentar desactivar la propia cuenta administrativa. |
| PATCH | `/api/admin/suministros/:id/ubicacion` | `id`: suministro; cuerpo `distrito`, `zona`, convertibles a null si vacíos. | 200: `estado`, `suministro`; 400 límites distrito 100/zona 150; 404. |
| GET | `/api/admin/recibos` | Sin parámetros. Listado global. | 200: `cantidad`, `recibos`, número de suministro y `tiene_pago`. |
| POST | `/api/admin/recibos` | Cuerpo de recibo completo, descrito abajo. | 201: `estado`, `recibo` Emitido; 400; 404 suministro; 409 suministro/periodo existente. |
| PATCH | `/api/admin/recibos/:id` | `id`: recibo; campos completos editables, sin cambiar suministro/estado. | 200: `estado`, `recibo`; 400; 404; 409 con pago existente o periodo duplicado. |
| PATCH | `/api/admin/recibos/:id/anular` | `id`: recibo; sin cuerpo requerido. | 200: `estado`, `recibo` Anulado; 404; 409 con pago existente. No borra la fila. |
| GET | `/api/admin/cortes` | Sin parámetros. Incluye cancelados/finalizados. | 200: `cantidad`, `cortes`, con `cancelado` y estado calculado. |
| POST | `/api/admin/cortes` | Cuerpo de corte completo, descrito abajo. | 201: `estado`, `corte`; 400 validación. |
| PATCH | `/api/admin/cortes/:id` | `id`: corte; cuerpo completo. | 200: `estado`, `corte`; 400; 404; 409 si cancelado. |
| PATCH | `/api/admin/cortes/:id/cancelar` | `id`: corte; sin cuerpo requerido. | 200: `estado`, `corte` cancelado; 404. No borra la fila. |
| GET | `/api/admin/incidencias` | Sin parámetros. Listado global. | 200: `cantidad`, `incidencias`, número de suministro y `tiene_foto`. |
| GET | `/api/admin/incidencias/:id/foto` | `id`: incidencia. | 200: imagen binaria; 404 id/foto/MIME inválido o ausente. |
| PATCH | `/api/admin/incidencias/:id/estado` | `id`: incidencia; cuerpo `estado`. | 200: `estado`, `incidencia`; 400 estado no admitido; 404. |
| GET | `/api/admin/pagos` | Query opcional `suministro`, `periodo`, `metodo`. | 200: `cantidad`, `pagos`, con suministro/periodo; hasta 500; 400 filtro suministro inválido. |
| GET | `/api/admin/atencion` | Query opcional `estado`, `categoria`, `suministro`. | 200: `cantidad`, `solicitudes` con suministro; hasta 500; 400 estado/suministro inválido. |
| PATCH | `/api/admin/atencion/:id` | `id`: solicitud; cuerpo `estado` y/o `respuesta`. | 200: `estado`, `solicitud`; 400 validación/sin campos; 404. |

### Validaciones administrativas

- **Recibo:** `numero_suministro`, `periodo`, `fecha_emision`, `fecha_vencimiento`, `monto`, `consumo_m3`. Periodo obligatorio hasta 20 caracteres; fechas válidas y vencimiento no anterior a emisión; monto positivo hasta 99999999.99; consumo no negativo hasta ese límite. PATCH toma el suministro de la fila existente, no del body. El SQL DATE conserva el día ISO. La comprobación de periodo duplicado está en la API, no en un UNIQUE compuesto.
- **Corte:** `alcance` Zona/General, `motivo` obligatorio hasta 200, `fecha_inicio` y `fecha_fin` válidas con fin posterior. Zona exige `distrito` hasta 80 y `zona` hasta 120; General guarda ambos null. Admin deriva estados Programado/En proceso/Finalizado/Cancelado.
- **Incidencia:** estado Registrada/En revisión/Resuelta.
- **Atención:** estado Registrada/En atención/Respondida/Cerrada; respuesta hasta 2000 caracteres. Respuesta null/vacía limpia el texto. No requiere respuesta no vacía para cada transición de estado.
- **Pagos:** suministro parcial de 1–9 dígitos, periodo parcial recortado a 60, método comparado sin distinguir mayúsculas, recortado a 30; Todos no filtra. Atención: suministro parcial de 1–9 dígitos, categoría parcial recortada a 80; Todos no filtra estado/categoría.

No hay DELETE ni API para editar roles, borrar usuarios, editar pagos o crear administradores. La cuenta administrativa usa `/api/me/perfil`; no necesita una ruta adicional de cuenta.

## Socket.IO: autenticación y salas

Servidor en el mismo origen de API, path `/socket.io/`. El cliente envía JWT mediante `auth.token` del handshake, no como URL pública. Verifica firma/expiración, usuario existente/activo y rol actual en PostgreSQL. Origin se controla para polling y upgrade WebSocket. Detalles en [SECURITY](SECURITY.md).

| Sala | Miembros y asignación |
|---|---|
| `authenticated` | Todos los sockets autenticados. |
| `usuario:<id_usuario>` | Sockets de esa cuenta, también para invalidación. |
| `admins` | Solo sockets cuyo rol vigente en el handshake es admin. |
| `suministro:<id_suministro>` | Cliente no admin asociado al suministro. |

El servidor asigna las salas; no existe handler cliente `join`. Un cliente no obtiene privilegios administrativos eligiendo una sala o modificando almacenamiento.

### Eventos emitidos realmente

| Evento | Destino | Payload relevante | Reconsulta REST recomendada |
|---|---|---|---|
| `incidencia:nueva` | Admins y suministro | `id` | Admin incidencias/resumen; cliente incidencias. |
| `incidencia:actualizada` | Suministro | `id`, `estado` | Incidencias y notificaciones del cliente. |
| `atencion:nueva` | Admins y suministro | `id` | Atención y resumen según rol. |
| `atencion:actualizada` | Suministro | `id`, `estado` | Atención y notificaciones. |
| `recibo:nuevo` | Suministro | `id`, `periodo` | Recibos, inicio y notificaciones. |
| `recibo:actualizado` | Suministro | `id`; al anular, `estado` | Recibos e inicio. |
| `pago:registrado` | Suministro | `id_pago`, `id_recibo` | Recibos, pagos e inicio. |
| `pago:nuevo` | Admins | `id_pago`, `id_recibo` | Pagos y resumen. |
| `corte:actualizado` | Todos los autenticados | `id`, `accion` creado/editado/cancelado | Catálogo y cortes propios; Admin cortes/resumen. |
| `perfil:actualizado` | Suministro | `id` del suministro | Perfil y cortes propios. |
| `notificacion:nueva` | Todos si General; suministro si Usuario | `id`, `alcance`, `tipo` | Notificaciones e inicio. |
| `sesion:invalidada` | Cuenta y suministro al desactivar | `motivo: desactivada` | Cerrar sesión y limpiar datos; servidor desconecta sockets. |

No todos los eventos llegan a admins: la tabla refleja emisores reales, aunque el panel tenga listeners adicionales. Cambios de usuarios no emiten un evento administrativo global de refresco. Las operaciones completadas persisten por REST/SQL; el pago emite después del COMMIT. La generación de determinadas notificaciones se intenta adicionalmente y su fallo no siempre revierte la operación principal.

### Reconexión y ciclo de vida

Los clientes mantienen una conexión por sesión, permiten polling y WebSocket y reconectan con demora de 1 a 8 segundos. No interpretan el evento como sustituto de datos completos: vuelven a consultar el módulo visible; el cliente también refresca notificaciones. Al cerrar sesión, cancelan peticiones, limpian listeners/timers y desconectan el socket.

No hay cola persistente de eventos ni recuperación automática de cada mensaje perdido. La reconsulta REST recupera el estado. Las salas viven en una instancia; la expiración JWT se valida al conectar/reconectar, sin un temporizador servidor que desconecte al llegar `exp`.
