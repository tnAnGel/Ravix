# Installation

[← Docs index](README.md) · [Русский](../ru/installation.md) · [中文](../zh/installation.md)

---

## Requirements

| | Minimum | Recommended small VPS |
| --- | ---: | ---: |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB SSD | 80+ GB SSD |

Disk is dominated by mailbox storage and backups, not by Ravix itself.

**Operating system.** Debian 12 (bookworm) is the primary target;
Ubuntu 22.04/24.04 LTS works on the same `apt` + `systemd` model. `amd64` and
`arm64` are both supported. The installer refuses to run without `apt-get`.

**Before you start:**

- A **fresh host.** Ravix rewrites Nginx, PostgreSQL and mail-stack config. Do
  not install it next to an existing mail server or web app you care about.
- **Root access.** The installer and the panel both need it.
- **Port 25 outbound must be open.** Most cloud providers (AWS, GCP, Azure,
  Oracle, DigitalOcean, Hetzner) block it by default and require a support
  ticket. Without it you can receive mail but never send any.
- **A static IP with a PTR record** you control. Mail from an IP with no reverse
  DNS is rejected or spam-foldered by nearly every large provider.
- **DNS you can edit** for every domain you intend to serve.

## Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

Or from a clone:

```bash
git clone https://github.com/tnAnGel/Ravix.git
cd Ravix
sudo ./install.sh
```

With a domain, so the panel gets a Let's Encrypt certificate immediately:

```bash
RAVIX_DOMAIN=panel.example.com RAVIX_TLS_EMAIL=you@example.com sudo ./install.sh
```

The installer prints the panel URL and the generated admin credentials when it
finishes. **Write the password down** — it is shown once, and also stored in
`/etc/ravix/ravix.env`.

## What the installer does

1. Installs runtime packages: PostgreSQL, Nginx, a Java 21 JRE (falling back to
   the Adoptium Temurin repository if `openjdk-21-jre-headless` is unavailable),
   plus `curl`, `openssl` and `tar`.
2. Creates the `ravix` system user and the directory layout below.
3. Creates a PostgreSQL role and database, both named `ravix`, with a randomly
   generated password written to `/etc/ravix/ravix.env`.
4. Downloads the pre-built backend and frontend artifacts for the latest
   release, **verifies them against `SHA256SUMS`**, and refuses to install if
   the checksums do not match.
5. Writes the systemd unit and starts the `ravix` service.
6. Configures Nginx as a reverse proxy: static frontend on `/`, the backend
   proxied on `/api/`.
7. If `RAVIX_DOMAIN` is set, requests a certificate through Certbot.
8. If `RAVIX_FIREWALL=1` (the default), opens the mail and panel ports in UFW
   and enables fail2ban.

Ravix itself is installed. **The mail stack is not** — Postfix, Dovecot, Rspamd
and OpenDKIM are installed afterwards from the panel, under
**Platform → Software**. See [Mail stack](mail-stack.md).

## Install modes

`install.sh` is the fast path: it downloads artifacts built once by CI, so a
cold install takes ~30–60 s instead of the ~5–8 min a source build needs. If no
release is published — or you ask for it — it transparently falls back to
building from source via `install-from-source.sh`.

| Variable | Default | Effect |
| --- | --- | --- |
| `RAVIX_INSTALL_MODE` | `auto` | `auto` — release if available, else source. `release` — fail if no release is found. `source` — always build from source. |
| `RAVIX_VERSION` | `latest` | Release tag to install, e.g. `v0.1.0`. |
| `RAVIX_RELEASE_TOKEN` | – | Access token, only needed to pull assets from a **private** fork. |
| `RAVIX_REPO` | `https://github.com/tnAnGel/Ravix.git` | Source repository. Point it at a fork or a self-hosted Gitea mirror; the installer detects which API to use from the host. |
| `RAVIX_BRANCH` | `main` | Branch to build from in source mode. |

```bash
# Force a source build
RAVIX_INSTALL_MODE=source sudo ./install.sh

# Pin an exact version
RAVIX_VERSION=v0.1.0 sudo ./install.sh
```

A source build additionally installs Maven, a JDK and Node.js, and compiles
Quarkus and the Vite bundle on the host — plan for ~2 GB of extra disk and
several minutes.

See [Configuration](configuration.md) for the ports, credentials and paths you
can override at install time.

## Installed layout

| Path | Purpose |
| --- | --- |
| `/opt/ravix` | Backend runtime (`quarkus-app/`). |
| `/opt/ravix/src` | Source checkout — only in source mode; required by `ravixctl update`. |
| `/var/www/ravix` | Static frontend served by Nginx. |
| `/etc/ravix/ravix.env` | Runtime configuration and generated credentials. |
| `/var/lib/ravix` | Data, DMARC/FBL inbox drops, backups. |
| `/var/log/ravix` | Ravix application logs. |
| `/usr/local/bin/ravixctl` | [CLI](cli.md). |

## First login

1. Open the panel URL the installer printed —
   `https://panel.example.com/` or `https://<ip>:9162/`.
2. Log in with the generated credentials.
3. **Change the password immediately** and enable 2FA under
   **Settings → Security**.
4. Work through the [hardening checklist](security.md#hardening-checklist).
5. Install the mail stack: [Mail stack](mail-stack.md).

The panel listens on port `9162` by default rather than 443, so it does not
collide with a webmail or website vhost on the same host.

## Upgrading

From a release:

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

Re-running the installer replaces the backend and frontend, keeps the database
and `/etc/ravix/ravix.env`, and lets Flyway migrate the schema on the next
start.

From a source checkout:

```bash
sudo ravixctl update    # git pull, rebuild, redeploy, restart
```

`ravixctl update` aborts before touching a working install if the build fails —
see [CLI](cli.md#update).

Always take a backup first:

```bash
sudo ravixctl backup
```

## Uninstalling

Ravix has no uninstall script — removal is deliberate and manual, because the
panel shares a host with a live mail stack.

```bash
sudo systemctl disable --now ravix
sudo rm -f /etc/systemd/system/ravix.service && sudo systemctl daemon-reload
sudo rm -rf /opt/ravix /var/www/ravix /var/log/ravix
sudo rm -f /etc/nginx/sites-enabled/ravix /etc/nginx/sites-available/ravix
sudo systemctl reload nginx
sudo -u postgres dropdb ravix && sudo -u postgres dropuser ravix
sudo rm -f /usr/local/bin/ravixctl
```

`/var/lib/ravix` holds your backups and inbox drops — review it before deleting.
This leaves Postfix, Dovecot, Rspamd and the mail data in `/var/vmail` in place;
remove those separately if you also want the mail server gone.

## Next steps

- [Configuration](configuration.md) — tune ports, paths and credentials.
- [Mail stack](mail-stack.md) — install and provision Postfix, Dovecot, Rspamd.
- [DNS & deliverability](dns-deliverability.md) — get mail actually delivered.
- [Troubleshooting](troubleshooting.md) — when the install did not go to plan.
