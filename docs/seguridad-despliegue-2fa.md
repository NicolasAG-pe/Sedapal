# Bloqueo de downgrade y requisitos de despliegue 2FA

**No se despliega ni se activa nada en este avance.** 007 sigue pendiente en Neon.

## Riesgo demostrado

El laboratorio ejecutó el backend de `origin/main` (`d6a6b83`) y el candidato
en dos contenedores sin puertos públicos, con la misma base **sintética** y un
usuario que tenía 2FA activo. El antiguo devolvió login **200 con contraseña sola**
y acceso privado 200. El nuevo devolvió **202 sin JWT**, rechazó el JWT antiguo
(401) y solo permitió sesión completa después del factor (200).

La causa no es criptográfica: el servidor antiguo desconoce MFA y conserva permiso
de leer usuarios y firmar JWT. Una tabla nueva, un flag o una pantalla del cliente
no pueden obligar a código antiguo a hacer una comprobación que no implementa.

## Comprobación preparada

El candidato expone `auth_contract=hidro-auth-2fa-v2` en health/capabilities.
`scripts/check-auth-candidate.cjs` comprueba ambos, rechaza versiones antiguas,
redirecciones y HTTP remoto. No recibe contraseñas, no modifica servicios y no
contiene operaciones de deploy/rollback. HTTP se permite por defecto solo en
loopback; los laboratorios Docker usan una opción explícita del módulo.

Esta comprobación rechazó el contenedor antiguo y aceptó el candidato. **Es una
precondición, no una garantía autónoma de producción**: los metadatos no son una
atestación criptográfica del código ni enumeran todas las réplicas detrás de un LB.

## Control externo que falta aplicar con autorización

Antes de habilitar el primer factor real, todos los caminos de publicación y
rollback deben aceptar exclusivamente commits/imágenes revisados compatibles:

1. Registrar SHA de fuente, digest inmutable de imagen y evidencia de pruebas.
   Conservar una lista aprobada de candidatos y exigir revisión independiente.
2. Validar esos identificadores **antes** de entregar credenciales productivas o
   iniciar el servicio. No utilizar tags mutables ni «último commit» implícito.
3. Ejecutar la comprobación del contrato y pruebas aisladas de contraseña sola,
   desafío, MFA, permisos y cifrado antes de aprobar ese digest.
4. Restringir los permisos y caminos manuales que permitan seleccionar un commit
   antiguo en el Dashboard. Cada rollback debe pasar el mismo control; una ruta
   manual que lo eluda deja abierta la vulnerabilidad demostrada.
5. Comprobar todas las instancias y no mezclar servidores antiguos/nuevos al
   activar factores. Una muestra de health detrás de un LB no es suficiente.
6. Mantener nuevas activaciones cerradas mientras se verifica migración, lectores
   de cifrado, claves respaldadas, cliente compatible y recuperación.

No se configuraron esas restricciones remotas, ni se afirma que el plan actual
las imponga. Si la plataforma no permite controlar **todos** los caminos, queda
un bloqueo para activar 2FA real; una alternativa de aislamiento de credenciales
o acceso a datos requeriría diseño y autorización independientes.

## Recuperación compatible

No volver al backend productivo anterior después de configurar factores. Usar un
candidato revisado que conserve validación de rol/versión/MFA, cifrado v1/v2 y
claves necesarias; corregir hacia delante cuando sea necesario. Revertir código
y restaurar esquema/datos son decisiones distintas. Restaurar una base antigua
puede perder recibos, factores y consumos de recuperación; no se hace automáticamente.

El soporte Socket.IO actual cubre una instancia con adaptador en memoria. Varias
réplicas requieren propagación de revocación y pruebas específicas antes de usar
esa topología. No se modificó Kubernetes ni se certificó esa garantía distribuida.

Evidencia privada: `artifacts/totp-hardening/downgrade-lab/result.json`, imágenes
locales de ambos candidatos y smoke del proxy Admin. El primer smoke Admin falló
porque el fixture no tenía el alias DNS `backend` que exige el Nginx existente;
se corrigió solo la red de pruebas, sin modificar servicios originales ni Nginx.
