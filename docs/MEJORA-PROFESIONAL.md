# Hidro-Mejora: producto y mejoras vigentes

Arquitectura conservada: cliente HTML/CSS/JS para Capacitor 7, Admin web independiente,
API Express/Socket.IO y PostgreSQL. Android utiliza Java 21. El README documenta
instalación, variables, seguridad, pruebas, respaldo y futuro despliegue.

## Cliente

Navegación móvil inferior, encabezado compacto y resumen de deuda, vencimiento,
consumo, último recibo, pagos recientes, cortes, incidencias y notificaciones.
Usa únicamente registros recibidos de la API. Mantiene registro/login, recibos/copias,
pagos simulados, PDF, fotografías y ubicación, atención, perfil, contraseña,
HidroBot y tutorial. En escritorio conserva navegación lateral.

## Admin

Sidebar y topbar propias, seis KPIs existentes, resumen operativo, tablas específicas
con filtros y acciones por fila. Conserva usuarios/suministros, recibos, pagos,
cortes, incidencias/fotografías, atención y cuenta. Usa las mismas 19 rutas protegidas
por rol del backend. La API compartida conserva sus 41 rutas.

## Identidad y accesibilidad

Shared/styles.css centraliza paleta institucional, controles, espacios, radios,
sombras, estados y transiciones breves. Shared/icons.js centraliza SVG locales.
Emblema e ilustración del login son locales; icono y splash Android son vectoriales.
Los originales históricos únicos de Frontend/assets siguen conservados, fuera de
los paquetes nuevos mientras no tengan referencias. No se requiere un CDN esencial.

Botones táctiles, inputs móviles legibles, foco visible, labels/nombres accesibles,
aria-busy, estados vacíos y mensajes claros. Animación por opacity/transform y
prefers-reduced-motion. El navegador verifica tamaños, modales, imágenes y teclado;
no existe certificación completa con lector de pantalla.

## UX, seguridad y rendimiento

Bloqueo de doble envío, estados de carga, recuperación de conexión y limpieza
completa tras logout/expiración. Una conexión Socket.IO autenticada por sesión.
Roles y JWT siguen siendo autoridad del backend; el cliente rechaza administradores
y Admin rechaza usuarios normales. No se duplica lógica de API.

Se quitaron renderizados redundantes comprobados, se centralizó el motor PDF y se
cachea el logo. No se realizó una reescritura de CSS/JS ni optimizaciones especulativas.
La corrección histórica de recibos preserva YYYY-MM-DD al escribir campos DATE;
las fechas mostradas usan America/Lima. La política de TIMESTAMP históricos sin
zona requiere revisión futura y no se altera durante limpieza.

## Documentos PDF

Hay dos generadores activos con jsPDF existente en Frontend/assets/js/documents.js.
Recibo y constancia usan A4, margen de 16 mm, logo, cabeceras distintas, importes
alineados, fecha de generación, pie y numeración real, con paginación de texto extenso.

El recibo utiliza suministro, correo disponible, periodo, referencia, fechas, estado,
consumo e importe registrados. La constancia añade operación, fecha, método e importe
del pago. No incluyen impuestos/cargos simulados como información oficial. La constancia
aclara que es registro del prototipo universitario, sin cargo bancario real.

Muestras vigentes, de PostgreSQL temporal y datos ficticios:
- artifacts/pdf/integral-20261007_162512/Recibo_HidroMejora_900000002_2026-10.pdf: 14.276 bytes.
- artifacts/pdf/integral-20261007_162512/Constancia_Pago_HidroMejora_HM-PAG-2026-000002.pdf: 14.296 bytes.

El emblema SVG se rasteriza a 320 px; presupuesto de descargas con logo: 40 KB.
`npm run test:documents` comprueba contenido, A4 y paginación mediante Poppler.
El harness Chromium descarga ambos PDF reales desde fixtures aislados.

## Android y límites pendientes

applicationId pe.edu.hidromejora.app, minSdk 23, target 35, Capacitor 7 y Java 21.
Runtime solo de usuarios, sincronizado desde salida limpia. Márgenes automáticos
para Android 15+, navegación, permisos e iconos conservados. HidroDocuments guarda
PDF mediante el selector del sistema y solicita abrirlos con un visor instalado,
sin añadir permisos/dependencias. API debug para emulador: http://10.0.2.2:8080.

Build/JUnit/lint y compilación instrumental no acreditan funcionamiento en un
móvil físico. Pendientes: GPS/permisos reales, fotos/cámara, teclado, botón Atrás,
notch, guardado y apertura PDF en dispositivos/WebView. Persisten advertencias de
lint de plantilla/dependencias. No existe firma release, pasarela bancaria real ni
despliegue Vercel/Render/Neon. Contactos de atención requieren confirmación externa.

Los informes de fases dejaron de ser documentación operativa. Sus versiones únicas
están en el respaldo privado de recuperación; ver LIMPIEZA-SEDAPAL.md.
