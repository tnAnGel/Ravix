#!/usr/bin/env bash
#
# Ravix — source-build installer for Debian 12 (bookworm).
#
# This is the SLOW path: it installs the build chain (JDK, Maven, Node) and
# compiles Quarkus + bundles the frontend on the target host (~5-8 min cold).
# It is the fallback for install.sh when no pre-built release is available,
# and the explicit choice via `RAVIX_INSTALL_MODE=source`.
#
# For the fast (~30-60s) path, use ./install.sh, which downloads pre-built
# release artifacts. The mail stack (Postfix/Dovecot/Rspamd/…) is installed
# afterwards from the panel — "Платформа → Установка ПО".
#
# Usage:                        sudo ./install-from-source.sh
#
set -euo pipefail

# --- Configuration (override via env) --------------------------------------
RAVIX_REPO="${RAVIX_REPO:-https://github.com/tnAnGel/Ravix.git}"
RAVIX_BRANCH="${RAVIX_BRANCH:-main}"
RAVIX_HTTP_PORT="${RAVIX_HTTP_PORT:-8080}"
RAVIX_PANEL_PORT="${RAVIX_PANEL_PORT:-9162}"         # public HTTPS port for the panel (not 80/443)
RAVIX_ADMIN_EMAIL="${RAVIX_ADMIN_EMAIL:-admin@localhost}"
RAVIX_ADMIN_PASSWORD="${RAVIX_ADMIN_PASSWORD:-}"     # generated if empty
RAVIX_DOMAIN="${RAVIX_DOMAIN:-}"                     # set to enable HTTPS via certbot
RAVIX_TLS_EMAIL="${RAVIX_TLS_EMAIL:-}"               # Let's Encrypt contact (optional)
RAVIX_FIREWALL="${RAVIX_FIREWALL:-1}"               # 1 = configure ufw + fail2ban
RAVIX_REINSTALL="${RAVIX_REINSTALL:-0}"             # set to 1 to overwrite an existing install
RAVIX_PROFILE="${RAVIX_PROFILE:-production}"        # shown in the installation plan

APP_DIR=/opt/ravix
SRC_DIR=/opt/ravix/src
WEB_DIR=/var/www/ravix
ETC_DIR=/etc/ravix
DATA_DIR=/var/lib/ravix
LOG_DIR=/var/log/ravix
ENV_FILE="$ETC_DIR/ravix.env"
INSTALL_REPORT="$LOG_DIR/install-report.txt"

DB_NAME=ravix
DB_USER=ravix
DB_PORT="${RAVIX_DB_PORT:-5432}"

# --- Colours & progress UX --------------------------------------------------
# Auto-disabled when stdout isn't a TTY (e.g. piped to a log file).
if [ -t 1 ]; then
  C_DIM=$'\033[2m';   C_RESET=$'\033[0m'
  C_CYAN=$'\033[1;36m'; C_GREEN=$'\033[1;32m'
  C_YELLOW=$'\033[1;33m'; C_RED=$'\033[1;31m'
  C_BLUE=$'\033[1;34m'; C_MAGENTA=$'\033[1;35m'
  C_WHITE=$'\033[1;37m'; C_BOLD=$'\033[1m'
else
  C_DIM=""; C_RESET=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
  C_BLUE=""; C_MAGENTA=""; C_WHITE=""; C_BOLD=""
fi

TOTAL_STEPS=12
STEP=0
STEP_START=$(date +%s)
INSTALL_START=$(date +%s)
# Parallel arrays for the final summary table.
STAGE_NAMES=()
STAGE_TIMES=()
STAGE_DETAILS=()
CURRENT_STAGE_NAME=""
DISK_FREE_START_MIB=0   # captured just before stage 1 — see banner section
PREFLIGHT_WARNINGS=0
PREFLIGHT_FAILURES=0
OS_NAME="unknown"
OS_VERSION="unknown"
OS_CODENAME="unknown"
MEM_TOTAL_MIB=0
CPU_COUNT=0

log()   { printf '  %s▸%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die()   { printf '\n%s✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }
info()  { printf '  %s•%s %s\n' "$C_DIM" "$C_RESET" "$*"; }

# Format a duration in whole seconds as "Ns" (<60), "MmSSs" (<1h), or "HhMMmSSs".
# Used for both per-stage timers and the grand total so they read the same.
fmt_dur() {
  local s=$1
  if   [ "$s" -lt 60 ];   then printf '%ds' "$s"
  elif [ "$s" -lt 3600 ]; then printf '%dm%02ds' "$((s/60))" "$((s%60))"
  else                         printf '%dh%02dm%02ds' "$((s/3600))" "$(((s%3600)/60))" "$((s%60))"
  fi
}

# Free disk size in MiB on the install target — printed at start so the user
# sees what's being eaten by the install.
disk_free_mib() {
  df -Pm "${1:-/}" 2>/dev/null | awk 'NR==2 {print $4}'
}

term_width() {
  local cols=80
  if command -v tput >/dev/null 2>&1; then
    cols="$(tput cols 2>/dev/null || printf 80)"
  fi
  [ "$cols" -lt 72 ] && cols=72
  [ "$cols" -gt 120 ] && cols=120
  printf '%s' "$cols"
}

# Draw a filled-bar progress indicator for the current step number.
draw_bar() {
  local cur=$1 total=$2 cols width
  cols="$(term_width)"
  width=$(( cols / 3 ))
  [ "$width" -lt 24 ] && width=24
  [ "$width" -gt 38 ] && width=38
  local filled=$(( cur * width / total ))
  local empty=$(( width - filled ))
  local pct=$(( cur * 100 / total ))
  local bar="" i
  for ((i=0;i<filled;i++)); do bar="${bar}█"; done
  for ((i=0;i<empty;i++)); do bar="${bar}░"; done
  printf '%s[%s%s%s] %2d/%d %3d%%%s' "$C_BLUE" "$C_MAGENTA" "$bar" "$C_BLUE" "$cur" "$total" "$pct" "$C_RESET"
}

# Start a new numbered stage: "▶ [N/M] [bar] Title …"
stage() {
  STEP=$((STEP + 1))
  STEP_START=$(date +%s)
  CURRENT_STAGE_NAME="$*"
  printf '\n%s▶%s  ' "$C_BOLD" "$C_RESET"
  draw_bar "$STEP" "$TOTAL_STEPS"
  printf '  %s%s%s\n' "$C_BOLD" "$*" "$C_RESET"
}

stage_note() {
  printf '  %s│%s %s%s%s\n' "$C_DIM" "$C_RESET" "$C_WHITE" "$*" "$C_RESET"
}

# Close a stage with elapsed time. Optional argument: free-form detail
# (e.g. "147 jars · 48 MiB") rendered in the final summary table.
stage_done() {
  local now=$(date +%s)
  local elapsed=$(( now - STEP_START ))
  local detail="${1:-}"
  printf '  %s✓%s done in %s' "$C_GREEN" "$C_RESET" "$(fmt_dur "$elapsed")"
  [ -n "$detail" ] && printf '  %s(%s)%s' "$C_DIM" "$detail" "$C_RESET"
  printf '\n'
  STAGE_NAMES+=("$CURRENT_STAGE_NAME")
  STAGE_TIMES+=("$elapsed")
  STAGE_DETAILS+=("$detail")
}

# Render the final per-stage timing table.
summary_table() {
  local i max_name=0 name_len total=0
  for name in "${STAGE_NAMES[@]}"; do
    name_len=${#name}
    [ $name_len -gt $max_name ] && max_name=$name_len
  done
  # Cap stage-name column so very long titles wrap visually only at the right.
  [ $max_name -gt 60 ] && max_name=60
  printf '  %s┌─ Stage breakdown ─%s\n' "$C_DIM" "$C_RESET"
  for i in "${!STAGE_NAMES[@]}"; do
    local n=$((i + 1))
    local t=${STAGE_TIMES[$i]}
    local d=${STAGE_DETAILS[$i]}
    total=$((total + t))
    printf '  %s│%s  %s%2d.%s %-*s  %s%7s%s' \
      "$C_DIM" "$C_RESET" \
      "$C_DIM" "$n" "$C_RESET" \
      "$max_name" "${STAGE_NAMES[$i]:0:$max_name}" \
      "$C_CYAN" "$(fmt_dur "$t")" "$C_RESET"
    [ -n "$d" ] && printf '   %s%s%s' "$C_DIM" "$d" "$C_RESET"
    printf '\n'
  done
  printf '  %s└──%s\n' "$C_DIM" "$C_RESET"
}

write_install_report() {
  mkdir -p "$LOG_DIR"
  {
    printf 'Ravix installation report\n'
    printf 'Generated: %s\n' "$(date -Is 2>/dev/null || date)"
    printf '\nHost\n'
    printf '  hostname: %s\n' "$(hostname)"
    printf '  os: %s\n' "$OS_NAME"
    printf '  kernel: %s\n' "$(uname -sr)"
    printf '  cpu: %s\n' "$CPU_COUNT"
    printf '  memory_mib: %s\n' "$MEM_TOTAL_MIB"
    printf '  disk_used_mib: %s\n' "$DISK_USED"
    printf '\nInstall\n'
    printf '  profile: %s\n' "$RAVIX_PROFILE"
    printf '  source: %s\n' "$SRC_DIR"
    printf '  repo: %s\n' "$RAVIX_REPO"
    printf '  branch: %s\n' "$RAVIX_BRANCH"
    printf '  total_time: %s\n' "$(fmt_dur "$TOTAL_ELAPSED")"
    printf '  url: %s\n' "${PANEL_URL:-http://${IP:-<server-ip>}/}"
    printf '  admin_email: %s\n' "$RAVIX_ADMIN_EMAIL"
    printf '  config: %s\n' "$ENV_FILE"
    printf '\nRuntime\n'
    printf '  java: %s\n' "${JAVA_BIN:-unknown}"
    printf '  postgres: %s\n' "${PG_VER:-unknown}"
    printf '  backend_up: %s\n' "${BACKEND_UP:-unknown}"
    printf '  tls_domain: %s\n' "${RAVIX_DOMAIN:-none}"
    printf '  firewall: %s\n' "$RAVIX_FIREWALL"
    printf '\nStage timings\n'
    local i
    for i in "${!STAGE_NAMES[@]}"; do
      printf '  %02d. %s: %s' "$((i + 1))" "${STAGE_NAMES[$i]}" "$(fmt_dur "${STAGE_TIMES[$i]}")"
      [ -n "${STAGE_DETAILS[$i]}" ] && printf ' (%s)' "${STAGE_DETAILS[$i]}"
      printf '\n'
    done
  } > "$INSTALL_REPORT"
  chmod 600 "$INSTALL_REPORT"
}

banner() {
  printf '\n%s' "$C_BLUE"
  printf '  ╔════════════════════════════════════════════════════════════╗\n'
  printf '  ║              %sR a v i x%s   ·   M a i l   C o n t r o l%s       ║\n' "$C_BOLD$C_MAGENTA" "$C_RESET$C_BLUE" "$C_BLUE"
  printf '  ║            Enterprise bare-metal installation              ║\n'
  printf '  ║          Debian / Ubuntu · Java 21 · PostgreSQL            ║\n'
  printf '  ╚════════════════════════════════════════════════════════════╝%s\n' "$C_RESET"
}

kv() {
  printf '  %s%-13s%s %s\n' "$C_DIM" "$1" "$C_RESET" "$2"
}

plan_row() {
  local label=$1 value=$2
  printf '  %s│%s %-20s %s\n' "$C_DIM" "$C_RESET" "$label" "$value"
}

check_row() {
  local state=$1 label=$2 detail=$3
  case "$state" in
    ok)   printf '  %s✓%s %-18s %s\n' "$C_GREEN" "$C_RESET" "$label" "$detail" ;;
    warn) printf '  %s!%s %-18s %s\n' "$C_YELLOW" "$C_RESET" "$label" "$detail"; PREFLIGHT_WARNINGS=$((PREFLIGHT_WARNINGS + 1)) ;;
    fail) printf '  %s✗%s %-18s %s\n' "$C_RED" "$C_RESET" "$label" "$detail"; PREFLIGHT_FAILURES=$((PREFLIGHT_FAILURES + 1)) ;;
  esac
}

load_host_facts() {
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_NAME="${PRETTY_NAME:-${NAME:-unknown}}"
    OS_VERSION="${VERSION_ID:-unknown}"
    OS_CODENAME="${VERSION_CODENAME:-unknown}"
  fi
  MEM_TOTAL_MIB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || printf 0)"
  CPU_COUNT="$(nproc 2>/dev/null || printf 0)"
}

port_free() {
  local port=$1
  if command -v ss >/dev/null 2>&1; then
    ! ss -ltn "( sport = :${port} )" 2>/dev/null | awk 'NR>1 {found=1} END {exit found ? 0 : 1}'
  else
    return 0
  fi
}

resolve_domain_ip() {
  local domain=$1
  if command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$domain" 2>/dev/null | awk 'NR==1 {print $1}'
  fi
}

public_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

installation_plan() {
  local panel_host="${RAVIX_DOMAIN:-server IP}"
  local tls_mode="HTTP only"
  local firewall_mode="disabled"
  [ -n "$RAVIX_DOMAIN" ] && tls_mode="Let's Encrypt for ${RAVIX_DOMAIN}"
  [ "$RAVIX_FIREWALL" = "1" ] && firewall_mode="ufw + fail2ban"

  printf '\n%sInstallation plan%s\n' "$C_BOLD" "$C_RESET"
  printf '  %s┌─ Runtime ──────────────────────────────────────────────%s\n' "$C_DIM" "$C_RESET"
  plan_row "Profile" "$RAVIX_PROFILE"
  plan_row "Source" "${RAVIX_REPO} (${RAVIX_BRANCH})"
  plan_row "Backend" "Java 21 + Quarkus on :${RAVIX_HTTP_PORT}"
  plan_row "Database" "local PostgreSQL (${DB_NAME}/${DB_USER})"
  plan_row "Web" "Nginx reverse proxy for ${panel_host}"
  plan_row "TLS" "$tls_mode"
  plan_row "Security" "$firewall_mode"
  printf '  %s└────────────────────────────────────────────────────────%s\n' "$C_DIM" "$C_RESET"

  printf '  %s┌─ Filesystem ───────────────────────────────────────────%s\n' "$C_DIM" "$C_RESET"
  plan_row "Application" "$APP_DIR"
  plan_row "Web root" "$WEB_DIR"
  plan_row "Config" "$ETC_DIR"
  plan_row "Data" "$DATA_DIR"
  plan_row "Logs" "$LOG_DIR"
  printf '  %s└────────────────────────────────────────────────────────%s\n' "$C_DIM" "$C_RESET"
}

# Run a postgres psql command without depending on `sudo` (su works as root).
psql_postgres() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -u postgres psql "$@"
  else
    su - postgres -s /bin/sh -c "psql $(printf '%q ' "$@")"
  fi
}

# Same, for createdb.
createdb_postgres() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -u postgres createdb "$@"
  else
    su - postgres -s /bin/sh -c "createdb $(printf '%q ' "$@")"
  fi
}

banner
[ "$(id -u)" -eq 0 ] || die "Run as root (sudo ./install.sh or as the root user)."
command -v apt-get >/dev/null 2>&1 || die "This installer targets Debian/Ubuntu (apt-get not found)."
load_host_facts
DISK_FREE_START_MIB="$(disk_free_mib /)"

installation_plan

# --- 0. Preflight -----------------------------------------------------------
stage "Preflight checks"
stage_note "Verifying host capacity, OS support, network assumptions and install targets."

case "$OS_CODENAME" in
  bookworm|trixie|jammy|noble) check_row ok "Operating system" "$OS_NAME" ;;
  *) check_row warn "Operating system" "$OS_NAME (not in the tested matrix)" ;;
esac

[ "$CPU_COUNT" -ge 2 ] && check_row ok "CPU" "${CPU_COUNT} cores" || check_row warn "CPU" "${CPU_COUNT:-unknown} cores (2+ recommended)"
[ "$MEM_TOTAL_MIB" -ge 1900 ] && check_row ok "Memory" "${MEM_TOTAL_MIB} MiB" || check_row warn "Memory" "${MEM_TOTAL_MIB} MiB (2 GiB+ recommended)"
[ "${DISK_FREE_START_MIB:-0}" -ge 4096 ] && check_row ok "Disk" "${DISK_FREE_START_MIB} MiB free on /" || check_row warn "Disk" "${DISK_FREE_START_MIB} MiB free on / (4 GiB+ recommended)"

if port_free 80; then check_row ok "Port 80" "available for Nginx/ACME"; else check_row warn "Port 80" "already listening; Nginx reload may fail"; fi
if port_free "$RAVIX_HTTP_PORT"; then check_row ok "Backend port" "${RAVIX_HTTP_PORT} available"; else check_row warn "Backend port" "${RAVIX_HTTP_PORT} already listening"; fi

if [ -n "$RAVIX_DOMAIN" ]; then
  DOMAIN_IP="$(resolve_domain_ip "$RAVIX_DOMAIN" || true)"
  HOST_IP="$(public_ip || true)"
  if [ -n "$DOMAIN_IP" ] && { [ -z "$HOST_IP" ] || [ "$DOMAIN_IP" = "$HOST_IP" ]; }; then
    check_row ok "DNS" "${RAVIX_DOMAIN} -> ${DOMAIN_IP}"
  elif [ -n "$DOMAIN_IP" ]; then
    check_row warn "DNS" "${RAVIX_DOMAIN} -> ${DOMAIN_IP}; host reports ${HOST_IP:-unknown}"
  else
    check_row warn "DNS" "${RAVIX_DOMAIN} does not resolve yet"
  fi
else
  check_row warn "TLS domain" "RAVIX_DOMAIN is empty; panel will start in HTTP mode"
fi

command -v systemctl >/dev/null 2>&1 && check_row ok "systemd" "available" || check_row fail "systemd" "systemctl not found"
command -v git >/dev/null 2>&1 && check_row ok "git" "available" || check_row warn "git" "will be installed by apt"
command -v curl >/dev/null 2>&1 && check_row ok "curl" "available" || check_row warn "curl" "will be installed by apt"

if [ "$PREFLIGHT_FAILURES" -gt 0 ]; then
  die "Preflight failed with ${PREFLIGHT_FAILURES} blocking issue(s). Fix them and re-run the installer."
fi
stage_done "${PREFLIGHT_WARNINGS} warning(s), ${PREFLIGHT_FAILURES} failure(s)"

# --- Idempotency: detect an existing install --------------------------------
# Running install.sh twice on a working server is the #1 reported support
# issue (mvn FileSystemException because target/ is left behind by the prior
# build, services holding open files, admin password silently rotated and the
# user locked out). Be explicit about what to do.
if [ -f "$ETC_DIR/ravix.env" ]; then
  if [ "$RAVIX_REINSTALL" != "1" ]; then
    printf '\n%s!%s Ravix is already installed (config at %s).\n' "$C_YELLOW" "$C_RESET" "$ETC_DIR/ravix.env"
    printf '   To upgrade an existing install, run:\n'
    printf '       %sravixctl update%s\n' "$C_BOLD" "$C_RESET"
    printf '   To force a full reinstall (keeps admin creds + database), re-run with:\n'
    printf '       %sRAVIX_REINSTALL=1 ./install.sh%s\n' "$C_BOLD" "$C_RESET"
    printf '   To start over from scratch, first wipe:\n'
    printf '       %srm -rf %s %s /opt/ravix /var/www/ravix /var/lib/ravix && rm -f /etc/systemd/system/ravix.service%s\n\n' \
       "$C_DIM" "$ETC_DIR" "$ETC_DIR" "$C_RESET"
    exit 0
  fi
  # Reuse the existing admin email/password so the user keeps their login.
  log "Reinstall mode — preserving existing config from $ETC_DIR/ravix.env"
  # shellcheck disable=SC1090
  . "$ETC_DIR/ravix.env"
  # Stop the running service so we can replace the jar safely.
  systemctl stop ravix >/dev/null 2>&1 || true
fi

log "Host: $(hostname) · $(uname -sr) · ${CPU_COUNT} CPU · ${MEM_TOTAL_MIB} MiB RAM · ${DISK_FREE_START_MIB} MiB free on /"
log "Expected duration: cold install ~5-8 min (apt ~2m, mvn dep download ~2-4m), reinstall ~1-2 min."
log "A full diagnostic transcript is kept for long-running build stages when needed."

# --- 1. Packages ------------------------------------------------------------
stage "Installing system packages (Java 21, Maven, Node, PostgreSQL, Nginx)"
stage_note "Installing platform runtime, web proxy, database server, TLS tooling and build chain."
export DEBIAN_FRONTEND=noninteractive

# Some hosters (cloud-init, unattended-upgrades) run apt at boot on a fresh VM
# and hold the dpkg lock for the first few minutes. Wait for it to clear so
# our install doesn't die with "Could not get lock /var/lib/dpkg/lock-frontend".
if fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock >/dev/null 2>&1; then
  log "Waiting for another apt/dpkg process to finish (cloud-init / unattended-upgrades)…"
  while fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock >/dev/null 2>&1; do
    sleep 5
  done
  ok "apt is free."
fi

log "Refreshing apt index…"
apt-get update -qq
log "Installing Maven, Node, PostgreSQL, Nginx, Certbot and friends…"
apt-get install -y -qq \
  maven nodejs npm postgresql postgresql-client nginx \
  certbot python3-certbot-nginx \
  git curl wget gpg ca-certificates apt-transport-https openssl >/dev/null

# JDK 21: available directly on newer distros; on Debian 12 (bookworm) the base
# repos only ship JDK 17, so fall back to Adoptium Temurin 21.
if ! apt-get install -y -qq openjdk-21-jdk-headless >/dev/null 2>&1; then
  log "openjdk-21 not in base repos — adding Adoptium (Temurin 21)…"
  install -d -m 0755 /etc/apt/keyrings
  # --batch / --no-tty: required when stdin is a pipe (curl | bash),
  # otherwise gpg dies with "cannot open '/dev/tty'".
  wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public \
    | gpg --batch --yes --no-tty --dearmor -o /etc/apt/keyrings/adoptium.gpg
  echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(. /etc/os-release; echo "$VERSION_CODENAME") main" \
    > /etc/apt/sources.list.d/adoptium.list
  apt-get update -qq
  apt-get install -y -qq temurin-21-jdk >/dev/null
fi

# Resolve a Java 21 binary + home for the build (mvn) and the systemd service.
JAVA_BIN="$(command -v java)"
for j in /usr/lib/jvm/temurin-21-jdk-* /usr/lib/jvm/java-21-openjdk-*; do
  [ -x "$j/bin/java" ] && JAVA_BIN="$j/bin/java" && break
done
JAVA_HOME="$(dirname "$(dirname "$JAVA_BIN")")"
export JAVA_HOME
ok "Prerequisites installed (java: $JAVA_BIN)."
PKG_COUNT="$(dpkg-query -f '${binary:Package}\n' -W 2>/dev/null | wc -l)"
stage_done "${PKG_COUNT} pkgs installed total"

# --- 2. System user + directories ------------------------------------------
stage "Creating system user and directory layout"
stage_note "Creating the ravix service account and enterprise filesystem layout."
id ravix >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin ravix
mkdir -p "$APP_DIR" "$WEB_DIR" "$ETC_DIR" "$DATA_DIR" "$LOG_DIR" "$DATA_DIR/backups"
ok "Directories ready ($APP_DIR, $WEB_DIR, $ETC_DIR, $DATA_DIR)."
stage_done "user 'ravix' + 5 dirs"

# --- 3. Source --------------------------------------------------------------
stage "Fetching Ravix source"
stage_note "Using the current checkout when available, otherwise cloning the configured branch."
if [ -f "./backend/pom.xml" ] && [ -f "./package.json" ]; then
  log "Building from the current checkout."
  SRC_DIR="$(pwd)"
else
  log "Cloning $RAVIX_REPO (branch $RAVIX_BRANCH)…"
  rm -rf "$SRC_DIR"
  git clone --depth 1 --branch "$RAVIX_BRANCH" "$RAVIX_REPO" "$SRC_DIR"
fi
ok "Source ready at $SRC_DIR."
SRC_SIZE="$(du -sh "$SRC_DIR" 2>/dev/null | awk '{print $1}')"
SRC_FILES="$(find "$SRC_DIR" -type f 2>/dev/null | wc -l)"
stage_done "${SRC_FILES} files · ${SRC_SIZE}"

# --- 4. PostgreSQL role + database -----------------------------------------
stage "Configuring PostgreSQL"
stage_note "Provisioning a dedicated database, role and generated credential."
systemctl enable --now postgresql >/dev/null 2>&1 || true
log "Generating a unique DB password and creating role/database…"
DB_PASS="$(openssl rand -hex 16)"
# Run from a directory the postgres user can enter (avoids harmless cwd warnings).
cd /tmp
psql_postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
if ! psql_postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  createdb_postgres -O "$DB_USER" "$DB_NAME"
fi
ok "Database '${DB_NAME}' ready."
PG_VER="$(psql_postgres -tAc 'SHOW server_version' 2>/dev/null | head -1 | awk '{print $1}')"
stage_done "PostgreSQL ${PG_VER} · role+db ready"

# --- 5. Build ---------------------------------------------------------------
stage "Building the backend (Quarkus / Java 21)"
stage_note "Compiling the production backend package and deploying it atomically."
log "Compiling and packaging — this is the longest step on a cold machine (~2-5 min)…"
# Stop the running service before touching the jar so we don't race with a
# live process holding open files in $APP_DIR/quarkus-app.
systemctl stop ravix >/dev/null 2>&1 || true
# Force a clean target/ tree. Quarkus' buildRunnerJar uses Files.copy without
# REPLACE_EXISTING and dies with a NIO FileSystemException if a previous
# (partial) build left those files behind. `mvn clean` doesn't always wipe
# fast enough on retries; do it ourselves to be sure.
rm -rf "$SRC_DIR/backend/target"
# Maven build tuning:
#   -T 1C                       parallel build, one thread per CPU core
#   --no-transfer-progress      no per-byte spam, but keep INFO lines (key —
#                               -q hides everything and the install looks frozen)
#   aether.connector.basic.threads=10
#                               parallel dependency downloads (default is 5).
#                               On servers with high RTT to Cloudflare-fronted
#                               Maven mirrors this cuts cold-cache builds from
#                               ~20min down to ~3min.
#   aether.connector.{connect,request}Timeout
#                               bail on stuck mirrors instead of hanging in
#                               CLOSE_WAIT forever; Maven retries with backoff.
MVN_OPTS_BUILD=(
    -T 1C
    --no-transfer-progress
    -DskipTests
    -Daether.connector.basic.threads=10
    -Daether.connector.connectTimeout=15000
    -Daether.connector.requestTimeout=60000
)
# Stream mvn output live AND keep a full copy on disk for diagnostics. We
# DO NOT filter mvn through grep — an earlier version did, and when grep
# matched zero lines `pipefail` killed the script with no visible error
# (the `die` message inside the subshell raced with `set -e` and got dropped
# under `curl | sudo bash`). Show what the build is actually doing.
MVN_LOG="/tmp/ravix-mvn-$$.log"
trap 'rm -f "$MVN_LOG"' EXIT
# `set +e` locally so a non-zero mvn doesn't trigger the outer trap before
# we get a chance to print the failing tail of the log.
set +e
( cd "$SRC_DIR/backend" && mvn "${MVN_OPTS_BUILD[@]}" package ) 2>&1 \
  | tee "$MVN_LOG" \
  | sed -u 's/^\[INFO\] /  · /;s/^\[WARNING\] /  ! /;s/^\[ERROR\] /  ✗ /'
MVN_STATUS=${PIPESTATUS[0]}
set -e
if [ "$MVN_STATUS" -ne 0 ]; then
  printf '\n%s✗ Maven build failed (exit %d). Last 40 lines:%s\n' "$C_RED" "$MVN_STATUS" "$C_RESET" >&2
  tail -40 "$MVN_LOG" >&2
  printf '\n%sFull log:%s %s\n' "$C_DIM" "$C_RESET" "$MVN_LOG" >&2
  exit 1
fi
# Replace the deployed jar atomically: drop the old dir, copy the new one.
rm -rf "$APP_DIR/quarkus-app"
cp -r "$SRC_DIR/backend/target/quarkus-app" "$APP_DIR/quarkus-app"
JAR_SIZE="$(du -sh "$APP_DIR/quarkus-app" 2>/dev/null | awk '{print $1}')"
M2_JARS="$(find "${HOME:-/root}/.m2/repository" -name '*.jar' 2>/dev/null | wc -l)"
M2_SIZE="$(du -sh "${HOME:-/root}/.m2" 2>/dev/null | awk '{print $1}')"
ok "Backend jar deployed to $APP_DIR/quarkus-app (${JAR_SIZE})."
stage_done "${M2_JARS} deps · ${M2_SIZE} in .m2 · runtime ${JAR_SIZE}"

stage "Building the frontend (Vite / React)"
stage_note "Installing npm dependencies and publishing the optimized web console bundle."
log "Installing npm dependencies and producing the production bundle…"
# --prefer-offline lets npm reuse the cache when available without falling
# back to the network on every metadata lookup; --no-audit/--no-fund skip
# the post-install registry round-trips that add 30-90s on slow links.
( cd "$SRC_DIR" \
    && npm ci --no-audit --no-fund --prefer-offline --progress=false \
    && npm run build --silent )
rm -rf "${WEB_DIR:?}/"*
cp -r "$SRC_DIR/dist/." "$WEB_DIR/"
NM_PKGS="$(find "$SRC_DIR/node_modules" -maxdepth 2 -name package.json 2>/dev/null | wc -l)"
DIST_SIZE="$(du -sh "$WEB_DIR" 2>/dev/null | awk '{print $1}')"
ok "Frontend deployed to $WEB_DIR (${DIST_SIZE})."
stage_done "${NM_PKGS} npm pkgs · bundle ${DIST_SIZE}"

# --- 6. Environment file ----------------------------------------------------
stage "Writing configuration & admin credentials"
stage_note "Writing runtime configuration, generated secrets and first admin credentials."
log "Generating admin password and writing $ENV_FILE (chmod 600)…"
[ -n "$RAVIX_ADMIN_PASSWORD" ] || RAVIX_ADMIN_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)"
cat > "$ENV_FILE" <<ENV
# Ravix runtime configuration — managed by install.sh
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
ok "Configuration written."
stage_done "env file + admin password"

# --- 7. systemd service + Nginx -------------------------------------------
stage "Installing systemd service and Nginx reverse proxy"
stage_note "Registering the Ravix service and routing browser/API traffic through Nginx."
log "Writing /etc/systemd/system/ravix.service…"
cat > /etc/systemd/system/ravix.service <<UNIT
[Unit]
Description=Ravix mail control panel
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
# Runs as root: the panel manages system services, packages and mail config.
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

log "Configuring Nginx (site, /api proxy, SPA fallback)…"
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
    # Vite emits hashed filenames per build, so the actual JS/CSS can be
    # cached forever — the URL changes on every release.
    location ~* \.(js|css|woff2?|svg|png|jpg|jpeg|gif|ico)\$ {
        expires 1y;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    # index.html refers to the latest hashed bundle by name. If we let
    # browsers cache it, on the next deploy they keep loading the old
    # bundle and miss every new translation/feature. MUST be fresh.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires off;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/ravix /etc/nginx/sites-enabled/ravix
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx
ok "Nginx configured."
stage_done "systemd unit + nginx site"

# --- 8b. HTTPS (Let's Encrypt) ---------------------------------------------
stage "TLS / HTTPS (Let's Encrypt)"
stage_note "Requesting a certificate when RAVIX_DOMAIN is set; otherwise leaving HTTP available."
if [ -n "$RAVIX_DOMAIN" ]; then
  log "Requesting a TLS certificate for ${RAVIX_DOMAIN} via certbot…"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null

  CERTBOT_EMAIL_ARG="--register-unsafely-without-email"
  [ -n "$RAVIX_TLS_EMAIL" ] && CERTBOT_EMAIL_ARG="--email $RAVIX_TLS_EMAIL"
  if certbot --nginx -d "$RAVIX_DOMAIN" --non-interactive --agree-tos \
        --redirect $CERTBOT_EMAIL_ARG >/dev/null 2>&1; then
    systemctl enable certbot.timer >/dev/null 2>&1 || true   # auto-renewal
    ok "HTTPS enabled for ${RAVIX_DOMAIN} (auto-renewal active)."
    PANEL_URL="https://${RAVIX_DOMAIN}/"
  else
    warn "certbot failed — is ${RAVIX_DOMAIN} pointed at this server on :80? Panel stays on HTTP."
    PANEL_URL="http://${RAVIX_DOMAIN}/"
  fi
else
  log "Skipped — set RAVIX_DOMAIN=panel.example.com to enable HTTPS."
fi
stage_done "${RAVIX_DOMAIN:+HTTPS for $RAVIX_DOMAIN}${RAVIX_DOMAIN:-no domain set, HTTP only}"

# --- 8c. Firewall + brute-force protection ---------------------------------
stage "Firewall (ufw) and brute-force protection (fail2ban)"
stage_note "Applying host-level network policy for panel, SSH and mail service ports."
if [ "$RAVIX_FIREWALL" = "1" ]; then
  log "Installing ufw + fail2ban and opening only the required ports…"
  apt-get install -y -qq ufw fail2ban >/dev/null
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true                       # ACME challenges + redirect
  ufw allow 443/tcp >/dev/null 2>&1 || true                      # MTA-STS / reserved
  ufw allow "${RAVIX_PANEL_PORT}"/tcp >/dev/null 2>&1 || true    # the panel (HTTPS)
  for p in 25 465 587 993 995 110 143; do ufw allow ${p}/tcp >/dev/null 2>&1 || true; done
  ufw --force enable >/dev/null 2>&1 || true
  # Ban brute-force against SSH, the panel, SMTP and IMAP. Use the systemd
  # (journald) backend so jails don't fail when a service's log file is absent
  # — the mail stack is installed later from the panel.
  cat > /etc/fail2ban/jail.d/ravix.local <<F2B
[DEFAULT]
backend = systemd

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
backend = polling
logpath = /var/log/nginx/error.log

[postfix]
enabled = true

[dovecot]
enabled = true
F2B
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban >/dev/null 2>&1 || true
  ok "Firewall and fail2ban configured."
else
  log "Skipped — set RAVIX_FIREWALL=1 to enable."
fi
stage_done "${RAVIX_FIREWALL:+ufw + fail2ban active}${RAVIX_FIREWALL:-firewall skipped (RAVIX_FIREWALL=1 to enable)}"

# --- 9. CLI + startup wait --------------------------------------------------
stage "Installing CLI and waiting for the panel to come up"
stage_note "Installing ravixctl, polling backend health and preparing the final handoff."
if [ -f "$SRC_DIR/ravixctl" ]; then
  install -m 0755 "$SRC_DIR/ravixctl" /usr/local/bin/ravixctl
  ok "Installed 'ravixctl' CLI to /usr/local/bin/ravixctl."
fi

log "Polling http://127.0.0.1:${RAVIX_HTTP_PORT}/api/auth/status (up to 60s)…"
WAIT_START=$(date +%s)
BACKEND_UP="no"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${RAVIX_HTTP_PORT}/api/auth/status" >/dev/null 2>&1; then
    ok "Backend responding."
    BACKEND_UP="yes"
    break
  fi
  sleep 2
done
WAIT_ELAPSED=$(( $(date +%s) - WAIT_START ))
if [ "$BACKEND_UP" = "yes" ]; then
  stage_done "backend up after $(fmt_dur $WAIT_ELAPSED)"
else
  warn "Backend did not respond within 60s — check 'journalctl -u ravix' / 'ravixctl logs'."
  stage_done "backend did not respond — see journalctl -u ravix"
fi

# --- Final summary ---------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
# The panel is served as HTTPS on its dedicated port (the backend renders this
# on first boot; self-signed by default until a Let's Encrypt cert is issued).
PANEL_URL="https://${RAVIX_DOMAIN:-${IP:-<server-ip>}}:${RAVIX_PANEL_PORT}/"
TOTAL_ELAPSED=$(( $(date +%s) - INSTALL_START ))
DISK_FREE_END="$(disk_free_mib /)"
DISK_USED=$(( DISK_FREE_START_MIB - DISK_FREE_END ))   # may be negative on reinstall
write_install_report
printf '\n%s════════════════════════════════════════════════════════════════%s\n' "$C_GREEN" "$C_RESET"
printf '  %s✓  Ravix installed successfully in %s.%s\n' "$C_GREEN$C_BOLD" "$(fmt_dur "$TOTAL_ELAPSED")" "$C_RESET"
printf '%s════════════════════════════════════════════════════════════════%s\n\n' "$C_GREEN" "$C_RESET"

summary_table

# Bottom line: disk consumed and total wall time as one easy-to-read line.
printf '\n  %sDisk used%s    %s MiB%s\n' "$C_DIM" "$C_RESET" \
  "$([ "$DISK_USED" -gt 0 ] && echo "$DISK_USED" || echo "~0 (reinstall)")" "$C_RESET"
printf '  %sTotal time%s   %s%s%s\n\n' \
  "$C_DIM" "$C_RESET" "$C_BOLD" "$(fmt_dur "$TOTAL_ELAPSED")" "$C_RESET"

printf '   %sURL%s        %s%s%s\n'      "$C_DIM" "$C_RESET" "$C_BOLD" "${PANEL_URL:-http://${IP:-<server-ip>}/}" "$C_RESET"
printf '   %sLogin%s      %s%s%s\n'      "$C_DIM" "$C_RESET" "$C_CYAN"    "$RAVIX_ADMIN_EMAIL"    "$C_RESET"
printf '   %sPassword%s   %s%s%s\n'      "$C_DIM" "$C_RESET" "$C_YELLOW"  "$RAVIX_ADMIN_PASSWORD" "$C_RESET"
printf '   %sConfig%s     %s%s%s\n'      "$C_DIM" "$C_RESET" "$C_DIM"     "$ENV_FILE"             "$C_RESET"
printf '   %sReport%s     %s%s%s\n'      "$C_DIM" "$C_RESET" "$C_DIM"     "$INSTALL_REPORT"       "$C_RESET"
echo
printf '   %sManage%s     %sravixctl status | logs -f | restart | doctor%s\n' "$C_DIM" "$C_RESET" "$C_DIM" "$C_RESET"
printf '   %sNext%s       open the panel → %sПлатформа → Установка ПО%s\n'    "$C_DIM" "$C_RESET" "$C_BOLD" "$C_RESET"
printf '              to install Postfix / Dovecot / Rspamd, then add a domain.\n\n'
