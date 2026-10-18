# Flujo obligatorio de Hidro-Mejora

Estas reglas se aplican a todos los avances del proyecto.

- Antes de editar, revisar `git status`, rama y remoto. Conservar cambios existentes.
- Mantener `main` estable. Para verificación de correo usar `feature/verificacion-correo`; comprobar si la rama existe antes de crearla.
- Dividir el trabajo en avances pequeños, coherentes y verificables. Cada avance completo requiere revisar el diff, ejecutar las pruebas pertinentes, actualizar `CHANGELOG.md`, hacer un commit descriptivo (preferentemente en español) y hacer push inmediatamente.
- Mantener un Draft Pull Request hacia `main` desde el primer avance y actualizar su descripción con el progreso y las pruebas comprobadas.
- Antes de cada commit, inspeccionar los archivos preparados y su contenido para excluir API keys, secretos JWT, credenciales privadas, archivos `.env` privados, keystores, respaldos, dumps y datos personales. Nunca publicar contraseñas o API keys reales, tampoco en ramas de prueba. Usar solo fixtures sintéticos y ejemplos sin secretos.
- No hacer merge a `main`, despliegues en Render/Vercel/Kubernetes, cambios en Neon ni publicar APK sin autorización explícita del propietario.
- No ejecutar comandos destructivos de Git ni borrar datos o volúmenes de Docker. Probar cambios de base de datos únicamente en una base nueva y aislada con datos sintéticos.
- Corregir las pruebas fallidas antes de declarar terminado un avance. No afirmar commits, pushes ni pruebas sin comprobarlos.
- Al terminar cada avance informar: cambios, pruebas que pasaron, hash del commit, resultado del push, enlace de GitHub y siguiente avance propuesto.
