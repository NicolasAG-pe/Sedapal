# Revisión defensiva OWASP: Hidro-Mejora 1.2.0

Fecha: 7 de noviembre de 2026. Alcance: copias Docker de cliente y administrador y API con PostgreSQL temporal en una red Docker interna sin salida. Usuarios, contraseñas, JWT y certificados fueron sintéticos. No se probaron activamente los servicios que ya estaban en 8080/8081, ni se modificó su base o sus contenedores. La entrega real de correo y push estuvo desactivada.

La interfaz ZAP existente en `localhost:8091/zap/` no ofreció API accesible y no había navegador de control disponible. Una copia de su sesión guardada tenía cero registros de alertas e historial; esto **no prueba** que su sesión interactiva no contenga alertas. Para obtener resultados reproducibles se inició un ZAP 2.17.0 independiente en la red de prueba. Las cifras corresponden a una muestra controlada, no a un rastreo exhaustivo de la aplicación.

## Comparación ZAP

En cada panel se consultaron pasivamente la página, configuración pública, CSS, JavaScript, módulo compartido, salud y un endpoint protegido sin autenticar. Al final también se observaron las comprobaciones sintéticas autenticadas. Las cifras cuentan alertas por recurso, no vulnerabilidades únicas.

| Resultado | Cliente inicial | Cliente final | Admin inicial | Admin final |
|---|---:|---:|---:|---:|
| Alertas medias | 2 | 0 | 2 | 0 |
| Alertas bajas | 12 | 0 | 12 | 0 |
| Informativas | 4 | 5 | 3 | 3 |
| Total | 18 | 5 | 17 | 3 |

**Confirmados y corregidos en ambos Nginx:** CSP ausente, protección contra encuadre ausente, `X-Content-Type-Options` ausente en recursos estáticos y versión de Nginx divulgada. Los archivos con su propia cabecera de caché incluyen las cabeceras de seguridad explícitamente para evitar perderlas por las reglas de herencia de Nginx. El cliente permite su único bloque inline mediante un hash SHA-256 comprobado por prueba; Admin no necesita scripts inline. Las políticas restringen scripts a los recursos locales, prohíben `object`, limitan conexiones al mismo origen e impiden el encuadre. Se añadió `Cache-Control: no-store` a las respuestas de la API, incluidos rechazos.

**Otras correcciones confirmadas:** la configuración PostgreSQL por `DB_HOST` remoto usaba `ssl: false`; ahora exige TLS y valida certificados para destinos distintos de `db` y loopback. Una base TLS sintética aceptó una CA confiable y rechazó tanto una CA desconocida como un nombre incorrecto. Los errores internos de la API ya no registran objetos completos de PostgreSQL/proveedores: solo emiten un código de una lista cerrada, sin mensajes, consultas ni detalles que puedan contener datos privados. Se confirmó que el login respondía 403 para una cuenta inactiva antes de validar la contraseña, frente a 401 para una inexistente; ahora ambas responden 401 con contraseña incorrecta y la cuenta inactiva solo informa el bloqueo tras una contraseña correcta.

**Informativas evaluadas:** los comentarios marcados en el muestreo eran etiquetas de secciones, notas de interfaz y descripción de configuración pública; no se observó una credencial en ellos. La detección de gestión de sesión corresponde a la respuesta de login y la de aplicación moderna describe el tipo de cliente; no son por sí solas vulnerabilidades confirmadas. Se conservaron sin reclasificación manual. La evidencia sanitizada de los avisos, sin cuerpos ni tokens, está en `artifacts/owasp/hidro-zap-evidencia.json` localmente.

## Verificaciones

- ZAP pasivo primero; después, escaneo activo **solo de XSS reflejado** contra `GET /api/cortes?probe=synthetic` en cada proxy aislado: regla 40012, intensidad baja, un hilo, demora 1000 ms, límite de un minuto y sin alertas activas. No equivale a una prueba completa de XSS ni se ejecutó el conjunto activo completo.
- Comprobaciones activas manuales limitadas a los servicios sintéticos: 401 sin sesión, 403 para usuario en 13 rutas GET administrativas, 200 para administrador autorizado y recibos propios, 401 para JWT inválido y 2FA sin sesión; dos entradas de inyección/XSS fueron rechazadas con 400 sin reflejo; las cuentas inexistentes e inactivas respondieron igual ante contraseña incorrecta; el origen CORS ajeno no recibió autorización. El login no emitió cookies de sesión y una cookie sintética sin Bearer no autenticó ni permitió cambiar la contraseña. La limitación de login respondió 429. Estos casos no demuestran ausencia general de inyección, XSS o CSRF.
- Chromium abrió e inició sesión como cliente y administrador sintéticos; Socket.IO se estableció en ambos y se recorrieron las cinco secciones administrativas. También se abrieron y cerraron recuperación de contraseña y el formulario de registro sin enviar correo, y se generaron en el navegador un recibo y una constancia de pago sintéticos con la CSP activa. No se observaron errores JavaScript ni violaciones CSP en esos recorridos. No se probaron todos los navegadores, tamaños ni flujos.
- 155 pruebas seguras Node aprobadas; integración PostgreSQL aislada final: 91 aprobadas, una omitida y ninguna fallida. Una repetición previa agotó el `tmpfs` y otra descubrió que la prueba debía renovar la sesión invalidada al desactivar su cuenta sintética; se corrigió la prueba y se reejecutó en una base temporal nueva. Otras 24 pruebas de recuperación de contraseña y OTP aprobaron con red externa bloqueada y proveedores simulados. Las pruebas incluyen 2FA y validaciones existentes, pero no equivalen a una auditoría criptográfica completa.
- Las pruebas de configuración validaron el hash CSP, ambos Dockerfiles, TLS de `DB_HOST` y el registro sin detalles privados. No se usaron datos ni credenciales reales ni se enviaron correos.

## Límites y pendientes

- `style-src-attr 'unsafe-inline'` permanece para los estilos por atributo que usa la interfaz. Se restringió `style-src` y no se permite `unsafe-inline` para scripts; ZAP no marcó esta excepción específica, que sigue siendo una relajación CSP y debe reducirse con una migración probada de estilos. Navegadores antiguos sin soporte de CSP3 pueden renderizar estilos de otra forma.
- Las cabeceras corregidas corresponden a los Nginx Docker; no se verificaron ni cambiaron las plataformas remotas. La prueba fue HTTP dentro de la red aislada: no valida HTTPS, HSTS ni terminación TLS del entorno de despliegue. No usar HTTP de desarrollo con credenciales reales.
- La excepción de PostgreSQL sin TLS se mantiene para `db` y loopback, con la confianza en la red Docker local. Otros nombres, incluso los de redes privadas personalizadas, requieren un certificado PostgreSQL confiable; revisar esa compatibilidad antes de adoptar la configuración.
- El límite de login se verificó en una sola instancia; no se evaluó una política distribuida entre réplicas. Aunque se igualaron las respuestas de cuentas inexistentes e inactivas ante contraseñas incorrectas, no se ha descartado enumeración mediante tiempos de respuesta. Los logs conservan solo códigos de error permitidos: revisar su integración con la observabilidad operativa antes de desplegar.
- El disco del sistema estaba lleno; se liberó solo caché regenerable de npm y caché de código de Opera. Las bases sintéticas que seguían activas se conservaron; la instancia de prueba que agotó su `tmpfs` terminó con error y su contenido temporal no persistió. Se sustituyó por otra base sintética nueva.
- No se accedió a datos reales ni se realizó despliegue; no se inspeccionó exhaustivamente cada ruta, rol, navegador, dependencia o configuración remota. La rama puede actualizar el PR #29 pero no se ha fusionado ni desplegado. El resultado no implica inmunidad frente a ataques.

Referencia: [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

## Seguimiento defensivo posterior

La autenticación de un suministro desconocido terminaba antes de ejecutar scrypt, a diferencia de la contraseña incorrecta de una cuenta existente. Ahora ejecuta una verificación scrypt con datos sintéticos fijos antes de responder el mismo 401. La prueba de integración comprueba una invocación de scrypt en ambos casos y conserva la comprobación de cuenta inactiva. Esto reduce una diferencia importante de tiempo; no demuestra que el tiempo de respuesta completo sea indistinguible ante todas las condiciones de base de datos y red.

En Admin los estilos HTML estáticos pasaron a CSS y la CSP utiliza `style-src-attr 'none'`. Chromium verificó con una cuenta sintética el login y la navegación por recibos, cortes, incidencias, usuarios, pagos, atención y cuenta, sin infracciones CSP observadas. Se corrigió una diferencia de especificidad CSS detectada durante esa prueba. El cliente mantiene `style-src-attr 'unsafe-inline'` porque contiene estilos por atributo y su migración completa no se ha validado.

Una nueva instancia ZAP operó exclusivamente en una red Docker interna, con copias aisladas de los paneles. El muestreo pasivo y la regla 40012 de XSS reflejado, limitada a un hilo, demora de un segundo y GET con parámetro sintético, finalizaron sin alertas altas, medias ni bajas. Las alertas informativas restantes corresponden a comentarios y a identificación de aplicación web moderna; no se comprobó que constituyan vulnerabilidades. El muestreo ampliado registró ocho instancias informativas para el cliente y cuatro para Admin, incluyendo las URL con parámetro de la prueba activa. No es un análisis exhaustivo.

Pasaron 155 pruebas Node seguras; 12 pruebas aisladas de incidencias y autorización, y 30 de recuperación y 2FA, con proveedores sintéticos. El navegador también comprobó el cliente y el panel administrativo con las CSP activas. No se enviaron correos ni notificaciones reales y no se utilizaron datos de producción.

El intento de análisis SonarQube posterior se cargó, pero la tarea `ba6ad8e5-e2c9-44f1-a9e3-ad27acf61d8a` falló: Elasticsearch puso índices en solo lectura por falta de espacio y rechazó la indexación. El dashboard consultado mostraba Quality Gate **ERROR** y cobertura nueva 0,0 %; no se importó un informe de cobertura para este intento. Las métricas mostradas no verifican los cambios de este seguimiento. Hace falta recuperar suficiente espacio, comprobar que Elasticsearch salga del modo de solo lectura y repetir el análisis con cobertura real actualizada.

Siguen pendientes la comprobación de HTTPS y HSTS en cada entorno de despliegue, la revisión exhaustiva de autorizaciones y la medición de tiempos en condiciones variadas. La copia Docker solo verifica configuración local y no certifica la configuración de plataformas remotas. No se ha desplegado ni fusionado la rama.
