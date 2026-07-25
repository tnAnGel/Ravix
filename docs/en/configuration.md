# Configuration

[← Docs index](README.md) · [Русский](../ru/configuration.md) · [中文](../zh/configuration.md)

---

Ravix reads configuration from two places:

| File | Role |
| --- | --- |
| `/etc/ravix/ravix.env` | **Runtime settings and generated credentials.** Written by the installer, loaded by the systemd unit via `EnvironmentFile=`. This is the file you edit on a server. |
| `backend/src/main/resources/application.properties` | **Defaults, baked into the build.** Every value reads an environment variable with a fallback, so you normally override rather than edit it. |

After changing either one:

```bash
sudo systemctl restart ravix
```

## Environment variables

### Network

| Variable | Default | Notes |
| --- | --- | --- |
| `RAVIX_HTTP_PORT` | `8080` | Backend HTTP port. Nginx proxies `/api/` here. |
| `RAVIX_HTTP_HOST` | `127.0.0.1` | Bind address. **Keep it on loopback** — the panel is meant to sit behind Nginx. Only set `0.0.0.0` if you deliberately expose the API. |
| `RAVIX_PANEL_PORT` | `9162` | Public HTTPS port Nginx serves the panel on. Deliberately not 443, so a webmail or website vhost can coexist. |

### Database

| Variable | Default | Notes |
| --- | --- | --- |
| `RAVIX_DB_URL` | `jdbc:postgresql://localhost:54322/postgres` | The installer rewrites this to the `ravix` database on port 5432. |
| `RAVIX_DB_USER` | `postgres` | Installer sets `ravix`. |
| `RAVIX_DB_PASSWORD` | *(empty)* | Installer generates a random password. An empty default only makes sense for a local trust-auth development database. |

Ravix keeps everything in a dedicated `ravix` schema. Flyway runs the migrations
in `db/migration` at startup (`quarkus.flyway.migrate-at-start=true`) and
Hibernate only *validates* against the result — so the schema is owned by the
migrations, never by the entities.

### Admin account

| Variable | Default | Notes |
| --- | --- | --- |
| `RAVIX_ADMIN_EMAIL` | `admin@example.com` | Seeded **only if no admin exists**. The installer sets `admin@localhost`. |
| `RAVIX_ADMIN_PASSWORD` | *(empty → generated)* | Leave it unset and Ravix mints a random 20-character password, printing it **once** at startup. The installer sets one explicitly. |

> There is deliberately **no shipped default password**: a default password is a
> published password. If you deploy by hand or in a container without an env
> file, watch the startup log — the generated password appears there and nowhere
> else. Missed it? `sudo ravixctl reset-admin <email> <password>`.

Lost the password? `sudo ravixctl reset-admin <email> <password>`.

### Paths

| Variable | Default |
| --- | --- |
| `RAVIX_PATH_CONFIG` | `/etc/ravix` |
| `RAVIX_PATH_DATA` | `/var/lib/ravix` |
| `RAVIX_DMARC_INBOX` | `/var/lib/ravix/dmarc/inbox` |
| `RAVIX_FBL_INBOX` | `/var/lib/ravix/fbl/inbox` |

Files dropped into the DMARC and FBL inboxes are ingested automatically — see
[DNS & deliverability](dns-deliverability.md).

### Log sources

Ravix tails these files for the **Logs** page. Point them elsewhere if your
distribution differs.

| Variable | Default |
| --- | --- |
| `RAVIX_LOG_POSTFIX` | `/var/log/mail.log` |
| `RAVIX_LOG_DOVECOT` | `/var/log/mail.log` |
| `RAVIX_LOG_RSPAMD` | `/var/log/rspamd/rspamd.log` |
| `RAVIX_LOG_NGINX` | `/var/log/nginx/access.log` |
| `RAVIX_LOG_RAVIX` | `/var/log/ravix/ravix.log` |

### Mail-stack provisioning targets

Where Ravix writes the config it generates. Change these only if your mail stack
lives in non-standard locations.

| Variable | Default |
| --- | --- |
| `RAVIX_POSTFIX_DIR` | `/etc/postfix/ravix` |
| `RAVIX_DOVECOT_USERFILE` | `/etc/dovecot/ravix-users` |
| `RAVIX_DKIM_DIR` | `/etc/opendkim` |
| `RAVIX_RSPAMD_DIR` | `/etc/rspamd/local.d` |
| `RAVIX_VMAIL_BASE` | `/var/vmail` |
| `RAVIX_VMAIL_UID` | `5000` |
| `RAVIX_VMAIL_GID` | `5000` |

Ravix writes into its own `ravix/` subdirectories and `local.d/` overrides
rather than replacing the main config files, so hand-written settings survive an
apply. See [Mail stack](mail-stack.md).

### Installer-only variables

These affect installation and are not read at runtime.

| Variable | Default | Effect |
| --- | --- | --- |
| `RAVIX_DOMAIN` | – | Panel hostname. Set it to request a Let's Encrypt certificate. |
| `RAVIX_TLS_EMAIL` | – | Let's Encrypt contact address. |
| `RAVIX_FIREWALL` | `1` | Configure UFW and fail2ban. Set `0` to skip. |
| `RAVIX_INSTALL_MODE` | `auto` | `auto` / `release` / `source`. |
| `RAVIX_VERSION` | `latest` | Release tag to install. |
| `RAVIX_REPO` | GitHub repo URL | Source repository (fork or Gitea mirror). |
| `RAVIX_BRANCH` | `main` | Branch for source builds. |
| `RAVIX_RELEASE_TOKEN` | – | Token for private release assets. |
| `RAVIX_REINSTALL` | `0` | Source installer only: overwrite an existing install. |

### Authentication and CORS

| Variable | Default | Notes |
| --- | --- | --- |
| `RAVIX_AUTH_MAX_FAILURES` | `5` | Failed logins per **username** inside the window before lockout. |
| `RAVIX_AUTH_MAX_FAILURES_PER_IP` | `20` | Failed logins per **IP**. Much higher on purpose: admins often share one office IP, and a tight limit would let one person mistyping lock out everyone. |
| `RAVIX_AUTH_WINDOW_SECONDS` | `300` | Sliding window over which failures are counted. |
| `RAVIX_AUTH_LOCKOUT_SECONDS` | `900` | How long a locked key stays locked. Answered `429` with `Retry-After`. |
| `RAVIX_CORS_ORIGINS` | Vite dev server | Extra origins allowed to call the API **cross-origin**. Same-origin is always allowed, so a normal install needs nothing here. |
| `RAVIX_QUEUE_MAX_ITEMS` | `500` | Cap on queue entries returned in one request. Summary counters still cover the whole queue. |

## Hardening the shipped defaults

The defaults are already safe for the common shape — same-origin panel, cookie
sessions, throttled login, no built-in admin password. What is left is mostly
noise reduction. Override in `/etc/ravix/application.properties`, which Quarkus
reads from the working directory at startup:

```properties
# Quieten the backend log in production
quarkus.log.category."sh.ravix".level=INFO
```

Serve the frontend from a different host than the API? Then, and only then:

```bash
RAVIX_CORS_ORIGINS=https://panel.example.com
```

The remaining known weaknesses are in [Security](security.md).

## Ports

| Port | Service | Exposure |
| --- | --- | --- |
| `9162` | Ravix panel (HTTPS via Nginx) | **Restrict to your own IPs.** |
| `8080` | Backend API | Loopback only. |
| `5432` | PostgreSQL | Loopback only. |
| `80`, `443` | Nginx / ACME | Public. |
| `25` | SMTP | Public — inbound mail and ACME depend on it. |
| `465`, `587` | Submission | Public. |
| `993`, `995`, `143`, `110` | IMAP / POP3 | Public. |

The installer opens all of these in UFW when `RAVIX_FIREWALL=1`. The panel port
does **not** need to be world-reachable — narrowing it is the single highest-value
hardening step you can take.

## Verifying a change

```bash
sudo systemctl restart ravix
sudo ravixctl doctor      # service, API, database, nginx
sudo ravixctl logs 100
```
