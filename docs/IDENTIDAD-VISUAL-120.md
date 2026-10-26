# Identidad acuática de Hidro-Mejora

Desarrollo visual 1.2.0; no es una publicación. Se conservan nombre, símbolo SVG,
iconos locales, estructura y lógica de cliente Capacitor/Admin. No hay fuentes remotas,
frameworks nuevos, imágenes comerciales ni recursos de pago.

## Paleta y correspondencia con PDF

Fuente de identidad de interfaz: `Shared/styles.css`. Los adaptadores CSS mantienen
la composición propia de Android/web y Admin. `HMDocuments.palette` contiene su
correspondencia RGB para jsPDF; una prueba compara ambas fuentes para evitar divergencia.

| Función | Token CSS / HEX | PDF RGB |
| --- | --- | --- |
| Azul principal y encabezados | primary / navy: #0F4C81 | navy [15,76,129] |
| Azul secundario | secondary: #1E6BA8 | blue [30,107,168] |
| Acentos de agua | sky: #4DA8DA | sky [77,168,218] |
| Fondo suave | bg / sky-soft: #EAF4FB | pale [234,244,251] |
| Confirmación | green: #2E8B57 | green [46,139,87] |
| Advertencia | orange: #D9A441 | warning [217,164,65] |
| Alerta | red: #C94C4C | red [201,76,76] |
| Texto | text: #243746 | text [36,55,70] |
| Bordes | border: #D9E2EC | border [217,226,236] |
| Superficie | white / surface: #FFFFFF | white [255,255,255] |

Los acentos celeste/amarillo/verde no se usan indiscriminadamente como texto claro
sobre blanco. Las tintas semánticas green-ink, orange-ink y red-ink y sus fondos suaves
mantienen >=4.5:1 en las combinaciones de texto verificadas. Primary y secondary admiten
texto blanco. El foco emplea primary, no un celeste de bajo contraste. Los tonos oscuros
y transparencias son variantes de la paleta, no una identidad alternativa.

## Reglas de interfaz

- Fondo celeste y alternancia de superficies blancas/celestes; bandas de marca azules, sin convertir toda la pantalla en azul sólido.
- Login con cabecera de marca azul dentro de una tarjeta celeste; el fondo y el panel lateral usan degradados de la misma paleta.
- Encabezados principales, cabeceras de sección y barra inferior azules. Deuda/suministro con degradado azul; indicadores con superficies diferenciadas, no solo bordes.
- Jerarquía de títulos, etiquetas sobre campos, controles táctiles >=44 px cuando aplica.
- Mantener safe-area, teclado, barra móvil, foco visible y avisos de conexión existentes.
- Tablas compactas, filtros y diálogo de revisión de pagos conservados; no formularios
  extensos dentro de tarjetas. Estados financieros y sintéticos siguen diferenciados.
- Mensajes funcionales, endpoints, OTP/TOTP, sesiones, permisos y Socket.IO no se rediseñan
  desde CSS. Los iconos y el logo originales se reutilizan sin deformarlos.

## Composición de documentos

jsPDF se conserva. A4, márgenes laterales 16 mm, límite del cuerpo 262 mm y pie desde
276 mm. Encabezado azul limitado a 32 mm; predominan papel blanco y bloques celestes.
Logo PNG generado desde el símbolo original, con proporción conservada dentro de 19 mm.
Tipografía Helvetica local, títulos 19 pt, total 27 pt, cuerpo 9–10 pt y pie 7–7.5 pt.

**Recibo:** identificación del recibo/suministro, correo si existe, período y fechas;
resumen del total/estado antes de la tabla de concepto/consumo/importe; observaciones breves.
No se crean impuestos, tarifas, lecturas ni información personal inexistente.

**Constancia:** importe/estado primero, ficha de recibo/suministro/período/método y
trazabilidad separada. Fecha/actor de revisión solo si existen. La fecha bancaria se
muestra únicamente cuando está disponible; un ensayo no representa recepción bancaria.

Pie institucional, aviso referencial sin valor oficial y paginación en cada página.
Una constancia pendiente/rechazada no acredita fondos. No son comprobantes oficiales
de SEDAPAL ni SUNAT. No hay QR público inventado. Textos largos continúan en páginas
con encabezado/pie, sin eliminar datos ni generar páginas vacías.

## Evidencia

Ver `docs/pruebas/identidad-acuatica-pdf-120.md`. Capturas, PDF y renderizados sintéticos
se conservan localmente en artefactos ignorados. El roadmap mantiene pendientes las
funciones de negocio y la publicación, sujetas a revisión/autorización independientes.

## Textos de operaciones

Usar «Pago con Yape», «Registrar pago», «Confirmar operación», «Operación confirmada»
y «Constancia de operación». Presentar el aviso «Entorno de pruebas · Sin cobros reales»
en las pantallas de pagos y los PDF, sin repetir la naturaleza de prueba en cada etiqueta.
La confirmación obligatoria indica explícitamente que no se recibió dinero; confirmar una
operación de pruebas no acredita fondos ni cancela deuda. La comprobación de una
transferencia auténtica mantiene sus controles y su estado distinto.
Los nombres técnicos, contratos, estados y motivos de auditoría permanecen intactos.
Solo se adaptan para presentación los mensajes automáticos conocidos mediante
`HMShared.ui.paymentAuditMessage`; los motivos escritos por personas se conservan.

## Segunda composición cromática

Los archivos `app-layout.css` y `workspace.css` gobiernan la composición de cada
producto después de sus estilos heredados y de `Shared/styles.css`. Se corrigieron
las declaraciones de origen de topbar, cabecera Admin, login, deuda y navegación,
y se sustituyeron los bloques finales de la primera identidad; no se añadió otra
hoja superpuesta. La regla de deuda usa su selector específico
`.account-overview .balance-card`, que antes anulaba el degradado menos específico.

Las cabeceras y los indicadores oscuros usan texto blanco. El celeste vivo es acento,
no fondo de texto blanco pequeño. Los degradados mantienen contraste en ambos extremos.
En navegación inferior el elemento activo blanco usa foco azul, y el resto foco blanco.
Admin conserva menú oscuro, tabla compacta, filtros, paginación y diálogo de revisión.
HidroBot cambia únicamente sus superficies visuales. Logo e iconos se conservan.

Las plantillas PDF siguen aprobadas: papel blanco para impresión, cabecera azul y
bloques celestes con los mismos tokens; no necesitan aumentar el consumo de tinta
para parecerse a la interfaz. La composición y sus funciones no se reconstruyen.
Evidencia comparativa y límites: `docs/pruebas/identidad-acuatica-v2-120.md`.
