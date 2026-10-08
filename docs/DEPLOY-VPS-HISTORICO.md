> **Documento histórico. No representa la infraestructura actual de producción.** La infraestructura vigente es Android/Admin Vercel → Render → Neon; consultar [DEPLOYMENT](DEPLOYMENT.md).
>
> El cuerpo conserva la alternativa VPS original, no un procedimiento validado para v1.0.0. Sus cifras/checklists y afirmaciones de objetivo corresponden a esa alternativa. No ejecutar estos comandos sobre los servicios actuales. En particular, revisar el conflicto de puerto 80 entre proxy y web, el comportamiento real de variables del Compose y la restauración con `--clean`, que puede destruir datos. Los tres servicios citados en la guía no representan los cuatro del Compose vigente. Respaldos/restauración: [MAINTENANCE](MAINTENANCE.md).

> Guía histórica de VPS conservada. No es el objetivo actual Render/Neon/Vercel y no se ejecutó ningún despliegue durante la organización. Los comandos parten de la raíz Sedapal.

# DEPLOY.md — Primer despliegue de Hidro Mejora en VPS

Guía propia, en orden. Sin secretos. Arquitectura objetivo:

```
Internet → HTTPS (443) → Proxy TLS → web:80 → /api → backend:3000 → db:5432
```

Puertos públicos del VPS: **22, 80, 443**. Nunca públicos: **3000, 5432**.
`DOMINIO_EJEMPLO` es un marcador: reemplazar por el dominio real al ejecutar.

---

## 1. Crear el VPS Linux

- Ubuntu LTS (22.04 o 24.04), 1 vCPU / 2 GB RAM mínimo.
- Anotar la IP pública. Apuntar el DNS: registro `A` de `DOMINIO_EJEMPLO`
  (y `api.D fourth` NO hace falta: todo va por el mismo dominio, same-origin).

## 2. Crear usuario normal con sudo (no trabajar como root)

```bash
adduser despliegue
usermod -aG sudo despliegue
```

## 3. Configurar SSH por llave (mantener una sesión abierta mientras se cambia)

```bash
# En tu PC: copiar tu llave pública al VPS
ssh-copy-id despliegue@IP_DEL_VPS
# Probar en OTRA terminal que entras sin contraseña, y recién entonces:
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```

> Si algo falla, la sesión vieja sigue abierta para revertir. No cerrar todo
> hasta verificar el acceso nuevo.

## 4. Firewall UFW (solo 22/80/443)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

No abrir 3000 ni 5432. No ejecutar UFW en la máquina local de desarrollo.

## 5. Instalar Docker en el VPS

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker despliegue
# Reingresar para que aplique el grupo docker
docker --version
docker compose version
```

## 6. Clonar el repositorio

```bash
git clone <URL_DEL_REPO> hidro-mejora
cd hidro-mejora
git status   # rama main, árbol limpio
```

## 7. Crear el `.env` de producción (valores únicos, nunca los de desarrollo)

```bash
cp .env.production.example .env
chmod 600 .env
nano .env   # completar POSTGRES_* (ver paso 8 para el secreto JWT)
```

## 8. Generar `AUTH_TOKEN_SECRET` nuevo y exclusivo de producción

```bash
openssl rand -hex 64
# Pegar el resultado en AUTH_TOKEN_SECRET dentro del .env del VPS.
# No reutilizar el secreto de desarrollo. No versionarlo jamás.
```

## 9. Configurar el DNS del dominio

- Registro `A`: `DOMINIO_EJEMPLO` → IP del VPS.
- Verificar propagación: `dig +short DOMINIO_EJEMPLO` debe responder la IP.
- `CORS_ALLOWED_ORIGINS` en el `.env`: puede quedar vacío (same-origin
  detrás del mismo dominio) o con `https://DOMINIO_EJEMPLO`.

## 10. Levantar Docker (producción)

```bash
docker compose -f compose.yaml -f docs/historical/compose.prod.yaml up -d --build
docker compose ps
# db healthy, backend healthy, web healthy
```

`docs/historical/compose.prod.yaml` solo ajusta: web en `80:80`, `NODE_ENV=production`
(vía `.env`) y rotación de logs. No reexpone 3000 ni 5432.

## 11. HTTPS (recomendación: **opción A, Caddy**)

**Opción A — Caddy delante de Docker (recomendada: simpleza y mantenimiento).**
Emisión y renovación Let's Encrypt automáticas, ~5 líneas de config:

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
DOMINIO_EJEMPLO {
    reverse_proxy 127.0.0.1:80
}
EOF
sudo systemctl reload caddy
```

**Opción B — Nginx + Certbot.** Válida si ya se administra Nginx en el host,
pero exige renovaciones y vhosts manuales; más piezas móviles para este
proyecto. Por simplicidad y mantenimiento se recomienda la opción A.

En ambos casos el Nginx del contenedor sigue igual (`/` → frontend,
`/api/` → `backend:3000` por nombre Docker, sin IPs hardcodeadas).

## 12. Aplicar migraciones

- **Base nueva:** nada que hacer, `init.sql` ya deja el esquema actualizado
  (incluye `notificaciones_lecturas` y el CHECK de 9 dígitos).
- **Base restaurada desde backup:** aplicar solo las pendientes, en orden,
  con `ON_ERROR_STOP`:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 < Base-de-Datos/migrations/001_notificaciones_lecturas.sql
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 < Base-de-Datos/migrations/002_suministro_9_digitos.sql
```

(Las migraciones son idempotentes: reejecutarlas no duplica nada.)
Nunca aplicar migraciones destructivas. Nunca `down -v`.

## 13. Verificar health

```bash
curl -s https://DOMINIO_EJEMPLO/api/health
# {"estado":"ok", ...}  → 200
```

## 14. Probar login (usuario y admin) + permisos

- Login usuario → 200 y navega sus módulos.
- Login admin → panel visible.
- Usuario contra `/api/admin/*` → 403. Sin token → 401.
- Exceder intentos de login → 429 (rate-limit activo).

## 15. Backup inicial (y rutina)

```bash
./scripts/backup-db.sh
# genera backups/hidro_mejora_YYYYMMDD_HHMM.dump (carpeta ignorada por Git)
```

Rutina sugerida: cron diario en el VPS + copia externa. Ejemplo:

```bash
crontab -e
# 0 3 * * * cd ~/hidro-mejora && ./scripts/backup-db.sh >> ~/hidro-mejora/backups/cron.log 2>&1
```

**Restauración** (solo cuando corresponda, nunca sobre producción sin respaldo
previo del estado actual):

```bash
# Copiar el .dump al VPS si viene de fuera, luego:
docker compose exec -T db pg_restore \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c < backups/hidro_mejora_YYYYMMDD_HHMM.dump
```

## 16. Rollback básico

1. Volver al commit/tag anterior: `git fetch && git checkout <tag-anterior>`.
2. Reconstruir: `docker compose -f compose.yaml -f docs/historical/compose.prod.yaml up -d --build`.
3. Restaurar backup **solo** si hubo una migración incompatible; si el esquema
   no cambió de forma incompatible, basta con los pasos 1-2.
4. No automatizar restauraciones destructivas. Prohibido `down -v` en
   producción salvo intención explícita de destruir la base
   (`postgres_data` es el volumen persistente).

---

## Anexos operativos

**Logs:**

```bash
docker compose logs -f web
docker compose logs -f backend
docker compose logs -f db
```

Rotación `10m × 3 archivos` ya configurada en `docs/historical/compose.prod.yaml`.
Los logs no incluyen passwords, JWT, `AUTH_TOKEN_SECRET`, hashes ni BYTEA
(errores al cliente siempre genéricos; detalle solo en servidor).

**Checklist de producción** (todo debe cumplirse):

- [ ] `GET /api/health` → 200 vía `https://DOMINIO_EJEMPLO/api/health`
- [ ] Login usuario → OK · Login admin → OK
- [ ] Usuario en `/api/admin/*` → 403 · Sin token → 401
- [ ] Rate-limit → 429 al exceder intentos
- [ ] PostgreSQL inaccesible desde Internet (sin puerto publicado)
- [ ] Backend `:3000` inaccesible desde Internet (sin puerto publicado)
- [ ] HTTPS válido y `http://` redirige a `https://`
- [ ] Backup inicial generado y restauración documentada
