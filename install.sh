#!/usr/bin/env bash
#
# Ravix — fast installer for Debian 12 (bookworm) / Ubuntu.
#
# Installs Ravix from PRE-BUILT release artifacts (no Maven/npm build on the
# target) — a cold install drops from ~5-8 min to ~30-60 s. The slow part of
# the old installer was compiling Quarkus and bundling the frontend on the
# server; that now happens once in CI (see .github/workflows/release.yml) and
# every install just downloads the result.
#
# If no published release / artifacts can be found, this script transparently
# FALLS BACK to building from source (install-from-source.sh), so the exact
# same one-liner works on a fresh repo with no releases yet.
#
# Usage (one-liner):            curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
# Usage (from a clone):         sudo ./install.sh
# Force a source build:         RAVIX_INSTALL_MODE=source sudo ./install.sh
# Pin a version:                RAVIX_VERSION=v0.1.0 sudo ./install.sh
# Private repo asset auth:      RAVIX_RELEASE_TOKEN=<token> sudo ./install.sh
#
set -euo pipefail

# --- Configuration (override via env) --------------------------------------
RAVIX_REPO="${RAVIX_REPO:-https://github.com/tnAnGel/Ravix.git}"
RAVIX_BRANCH="${RAVIX_BRANCH:-main}"
RAVIX_INSTALL_MODE="${RAVIX_INSTALL_MODE:-auto}"     # auto | release | source
RAVIX_VERSION="${RAVIX_VERSION:-latest}"             # release tag, or "latest"
RAVIX_RELEASE_TOKEN="${RAVIX_RELEASE_TOKEN:-}"       # GitHub/Gitea token for private repos
RAVIX_HTTP_PORT="${RAVIX_HTTP_PORT:-8080}"
RAVIX_PANEL_PORT="${RAVIX_PANEL_PORT:-9162}"         # public HTTPS port for the panel (not 80/443)
RAVIX_ADMIN_EMAIL="${RAVIX_ADMIN_EMAIL:-admin@localhost}"
RAVIX_ADMIN_PASSWORD="${RAVIX_ADMIN_PASSWORD:-}"     # generated if empty
RAVIX_DOMAIN="${RAVIX_DOMAIN:-}"                     # set to enable HTTPS via certbot
RAVIX_TLS_EMAIL="${RAVIX_TLS_EMAIL:-}"               # Let's Encrypt contact (optional)
RAVIX_FIREWALL="${RAVIX_FIREWALL:-1}"               # 1 = configure ufw + fail2ban

APP_DIR=/opt/ravix
SRC_DIR=/opt/ravix/src
WEB_DIR=/var/www/ravix
ETC_DIR=/etc/ravix
DATA_DIR=/var/lib/ravix
LOG_DIR=/var/log/ravix
ENV_FILE="$ETC_DIR/ravix.env"

DB_NAME=ravix
DB_USER=ravix
DB_PORT="${RAVIX_DB_PORT:-5432}"

# Stable asset names published by the release workflow (version lives in the URL).
BACKEND_ASSET="ravix-backend-jvm.tar.gz"
FRONTEND_ASSET="ravix-frontend.tar.gz"
CHECKSUM_ASSET="SHA256SUMS"

# --- Colours / logging ------------------------------------------------------
if [ -t 1 ]; then
  C_DIM=$'\033[2m'; C_RESET=$'\033[0m'; C_CYAN=$'\033[1;36m'
  C_GREEN=$'\033[1;32m'; C_YELLOW=$'\033[1;33m'; C_RED=$'\033[1;31m'
else
  C_DIM=""; C_RESET=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi
log()  { printf '  %s▸%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die()  { printf '\n%s✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }
t0=$(date +%s)

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."
command -v apt-get >/dev/null 2>&1 || die "This installer targets Debian/Ubuntu (apt-get not found)."

printf '\n%s  Ravix installer%s — fast path (pre-built release artifacts)\n\n' "$C_CYAN" "$C_RESET"

# --- Derive the release API base from the repo URL --------------------------
# GitHub keeps its API on a separate host, Gitea serves it from the repo host:
#   https://github.com/tnAnGel/Ravix.git  -> https://api.github.com/repos/tnAnGel/Ravix
#   https://git.example.com/admin/Ravix.git -> https://git.example.com/api/v1/repos/admin/Ravix
# Both expose the same /releases/latest, /releases/tags/<tag> and
# /releases/download/<tag>/<asset> shapes we rely on below.
REPO_NOEXT="${RAVIX_REPO%.git}"
GIT_HOST="$(printf '%s' "$REPO_NOEXT" | sed -E 's#(https?://[^/]+)/.*#\1#')"
OWNER_REPO="$(printf '%s' "$REPO_NOEXT" | sed -E 's#https?://[^/]+/##')"

auth_header=()
case "$GIT_HOST" in
  https://github.com|http://github.com)
    API_BASE="https://api.github.com/repos/$OWNER_REPO"
    [ -n "$RAVIX_RELEASE_TOKEN" ] && auth_header=(-H "Authorization: Bearer $RAVIX_RELEASE_TOKEN")
    ;;
  *)
    API_BASE="$GIT_HOST/api/v1/repos/$OWNER_REPO"
    [ -n "$RAVIX_RELEASE_TOKEN" ] && auth_header=(-H "Authorization: token $RAVIX_RELEASE_TOKEN")
    ;;
esac

# Ensure curl exists before we try to talk to the API.
command -v curl >/dev/null 2>&1 || { log "Installing curl…"; apt-get update -qq && apt-get install -y -qq curl >/dev/null; }

# --- Resolve the release + its download base --------------------------------
RELEASE_BASE=""
RESOLVED_VERSION=""
resolve_release() {
  [ "$RAVIX_INSTALL_MODE" = "source" ] && return 1
  local meta tag
  if [ "$RAVIX_VERSION" = "latest" ]; then
    meta="$(curl -fsSL "${auth_header[@]}" "$API_BASE/releases/latest" 2>/dev/null || true)"
  else
    meta="$(curl -fsSL "${auth_header[@]}" "$API_BASE/releases/tags/$RAVIX_VERSION" 2>/dev/null || true)"
  fi
  [ -n "$meta" ] || return 1
  tag="$(printf '%s' "$meta" | sed -n 's/.*"tag_name" *: *"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$tag" ] || return 1
  RESOLVED_VERSION="$tag"
  RELEASE_BASE="$GIT_HOST/$OWNER_REPO/releases/download/$tag"
  # Confirm the backend asset is actually downloadable (HEAD).
  curl -fsSL -I "${auth_header[@]}" "$RELEASE_BASE/$BACKEND_ASSET" >/dev/null 2>&1
}

USE_RELEASE=0
if resolve_release; then
  USE_RELEASE=1
  ok "Found release $RESOLVED_VERSION — installing pre-built artifacts."
else
  if [ "$RAVIX_INSTALL_MODE" = "release" ]; then
    die "No installable release found (mode=release). Set RAVIX_VERSION or publish a release first."
  fi
  warn "No published release artifacts found — falling back to a source build."
fi

# --- Source fallback: hand off to install-from-source.sh --------------------
if [ "$USE_RELEASE" -eq 0 ]; then
  if [ -f "./backend/pom.xml" ] && [ -f "./install-from-source.sh" ]; then
    log "Running install-from-source.sh from the current checkout…"
    exec bash ./install-from-source.sh
  fi
  log "Cloning $RAVIX_REPO to build from source…"
  command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git >/dev/null; }
  rm -rf "$SRC_DIR"; mkdir -p "$(dirname "$SRC_DIR")"
  git clone --depth 1 --branch "$RAVIX_BRANCH" "$RAVIX_REPO" "$SRC_DIR"
  cd "$SRC_DIR"
  exec bash ./install-from-source.sh
fi

# ===========================================================================
#  FAST PATH — install from pre-built release artifacts
# ===========================================================================

export DEBIAN_FRONTEND=noninteractive

# --- 1. Runtime packages ----------------------------------------------------
log "Installing runtime packages (PostgreSQL, Nginx, JRE)…"
apt-get update -qq
apt-get install -y -qq postgresql postgresql-client nginx curl wget gpg \
  ca-certificates apt-transport-https openssl tar >/dev/null

if ! command -v java >/dev/null 2>&1 \
   || ! java -version 2>&1 | grep -Eq 'version "(21|22|23|24|25)'; then
  if ! apt-get install -y -qq openjdk-21-jre-headless >/dev/null 2>&1; then
    log "openjdk-21 not in base repos — adding Adoptium Temurin 21…"
    install -d -m 0755 /etc/apt/keyrings
    wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg
    echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(. /etc/os-release; echo "$VERSION_CODENAME") main" \
      > /etc/apt/sources.list.d/adoptium.list
    apt-get update -qq
    apt-get install -y -qq temurin-21-jre >/dev/null
  fi
fi
JAVA_BIN="$(command -v java)"
ok "Runtime ready (java: $JAVA_BIN)."

# --- 2. System user + directories ------------------------------------------
id ravix >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin ravix
mkdir -p "$APP_DIR" "$WEB_DIR" "$ETC_DIR" "$DATA_DIR" "$DATA_DIR/backups" \
  "$DATA_DIR/dmarc/inbox" "$DATA_DIR/fbl/inbox" "$LOG_DIR"
ok "User and directories ready."

# --- 3. PostgreSQL ----------------------------------------------------------
log "Configuring PostgreSQL…"
systemctl enable --now postgresql >/dev/null 2>&1 || true
DB_PASS="$(openssl rand -hex 16)"
cd /tmp
sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi
ok "Database '${DB_NAME}' ready."

# --- 4. Download + verify + extract artifacts -------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
log "Downloading Ravix ${RESOLVED_VERSION} artifacts…"
curl -fsSL "${auth_header[@]}" "$RELEASE_BASE/$BACKEND_ASSET"  -o "$TMP/$BACKEND_ASSET"
curl -fsSL "${auth_header[@]}" "$RELEASE_BASE/$FRONTEND_ASSET" -o "$TMP/$FRONTEND_ASSET"
if curl -fsSL "${auth_header[@]}" "$RELEASE_BASE/$CHECKSUM_ASSET" -o "$TMP/$CHECKSUM_ASSET" 2>/dev/null; then
  ( cd "$TMP" && sha256sum -c "$CHECKSUM_ASSET" --ignore-missing >/dev/null ) \
    && ok "Checksums verified." \
    || die "Checksum verification failed — refusing to install."
else
  warn "No SHA256SUMS published — skipping checksum verification."
fi

log "Deploying backend and frontend…"
systemctl stop ravix >/dev/null 2>&1 || true
rm -rf "$APP_DIR/quarkus-app"
tar -C "$APP_DIR" -xzf "$TMP/$BACKEND_ASSET"
rm -rf "${WEB_DIR:?}/"*
tar -C "$WEB_DIR" -xzf "$TMP/$FRONTEND_ASSET"
[ -f "$APP_DIR/quarkus-app/quarkus-run.jar" ] || die "Backend archive missing quarkus-run.jar."
[ -f "$WEB_DIR/index.html" ] || die "Frontend archive missing index.html."
ok "Artifacts deployed."

# --- 5. Environment file ----------------------------------------------------
[ -n "$RAVIX_ADMIN_PASSWORD" ] || RAVIX_ADMIN_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)"
cat > "$ENV_FILE" <<ENV
RAVIX_HTTP_PORT=${RAVIX_HTTP_PORT}
RAVIX_PANEL_PORT=${RAVIX_PANEL_PORT}
RAVIX_DB_URL=jdbc:postgresql://localhost:${DB_PORT}/${DB_NAME}
RAVIX_DB_USER=${DB_USER}
RAVIX_DB_PASSWORD=${DB_PASS}
RAVIX_ADMIN_EMAIL=${RAVIX_ADMIN_EMAIL}
RAVIX_ADMIN_PASSWORD=${RAVIX_ADMIN_PASSWORD}
RAVIX_PATH_CONFIG=${ETC_DIR}
RAVIX_PATH_DATA=${DATA_DIR}
ENV
chmod 600 "$ENV_FILE"
ok "Configuration written to $ENV_FILE."

# --- 6. systemd service -----------------------------------------------------
cat > /etc/systemd/system/ravix.service <<UNIT
[Unit]
Description=Ravix mail control panel
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
EnvironmentFile=${ENV_FILE}
ExecStart=${JAVA_BIN} -jar ${APP_DIR}/quarkus-app/quarkus-run.jar
Restart=on-failure
RestartSec=5
WorkingDirectory=${APP_DIR}

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ravix >/dev/null
ok "Service installed and started."

# --- 7. Nginx ---------------------------------------------------------------
log "Configuring Nginx…"
SERVER_NAME="${RAVIX_DOMAIN:-_}"
cat > /etc/nginx/sites-available/ravix <<NGINX
server {
    listen 80 default_server;
    server_name ${SERVER_NAME};
    root ${WEB_DIR};
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${RAVIX_HTTP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/ravix /etc/nginx/sites-enabled/ravix
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx
PANEL_URL="https://${RAVIX_DOMAIN:-$(hostname -I 2>/dev/null | awk '{print $1}')}:${RAVIX_PANEL_PORT}/"
ok "Nginx configured."

# --- 8. TLS (optional) ------------------------------------------------------
if [ -n "$RAVIX_DOMAIN" ]; then
  log "Requesting TLS certificate for ${RAVIX_DOMAIN}…"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  CERTBOT_EMAIL_ARG="--register-unsafely-without-email"
  [ -n "$RAVIX_TLS_EMAIL" ] && CERTBOT_EMAIL_ARG="--email $RAVIX_TLS_EMAIL"
  if certbot --nginx -d "$RAVIX_DOMAIN" --non-interactive --agree-tos --redirect $CERTBOT_EMAIL_ARG >/dev/null 2>&1; then
    systemctl enable certbot.timer >/dev/null 2>&1 || true
    PANEL_URL="https://${RAVIX_DOMAIN}/"
    ok "HTTPS enabled."
  else
    warn "Certbot failed; panel remains on HTTP."
  fi
fi

# --- 9. Firewall (optional) -------------------------------------------------
if [ "$RAVIX_FIREWALL" = "1" ]; then
  log "Configuring firewall and fail2ban…"
  apt-get install -y -qq ufw fail2ban >/dev/null
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  for p in 80 443 "${RAVIX_PANEL_PORT}" 25 465 587 993 995 110 143; do ufw allow ${p}/tcp >/dev/null 2>&1 || true; done
  ufw --force enable >/dev/null 2>&1 || true
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban >/dev/null 2>&1 || true
  ok "Firewall configured."
fi

# --- 10. Wait for readiness -------------------------------------------------
log "Waiting for Ravix to come up…"
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${RAVIX_HTTP_PORT}/api/auth/status" >/dev/null 2>&1 && break
  sleep 2
done

ELAPSED=$(( $(date +%s) - t0 ))
echo
ok "Ravix ${RESOLVED_VERSION} installed in ${ELAPSED}s."
echo "    URL:      ${PANEL_URL}"
echo "    Login:    ${RAVIX_ADMIN_EMAIL}"
echo "    Password: ${RAVIX_ADMIN_PASSWORD}"
echo
echo "    Next: open the panel → Платформа → Установка ПО to install the mail stack."
echo
