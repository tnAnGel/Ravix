<div align="center">

<img src="public/favicon.svg" alt="Ravix" width="88" height="88">

# Ravix

### Private mail infrastructure, under your control.

A self-hosted control panel for a real Linux mail server — Postfix, Dovecot,
Rspamd, OpenDKIM and Certbot, provisioned and supervised from one dashboard.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-2b6cb0.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tnAnGel/Ravix/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/tnAnGel/Ravix/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tnAnGel/Ravix?style=flat-square&color=6b46c1&include_prereleases)](https://github.com/tnAnGel/Ravix/releases)
[![Java 21](https://img.shields.io/badge/Java-21-e11d48?style=flat-square)](https://adoptium.net/)
[![React 18](https://img.shields.io/badge/React-18-0891b2?style=flat-square)](https://react.dev/)

**[Documentation](docs/README.md)** ·
**English** · [Русский](README.ru.md) · [中文](README.zh.md)

</div>

---

<div align="center">
  <img src="docs/assets/screenshots/dashboard.png" alt="Ravix dashboard" width="100%">
</div>

---

## What it is

Ravix is **not** a mail server. It is the control plane for one.

You bring a fresh Debian or Ubuntu host; Ravix installs Postfix, Dovecot, Rspamd
and OpenDKIM on it, renders their configuration from a database you edit through
a web UI, and then watches the things that actually determine whether your mail
arrives — DNS records, DKIM signatures, DMARC reports, blocklists, TLS posture
and sending reputation.

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

One command, ~30–60 seconds, and you have a panel. See
**[Installation](docs/en/installation.md)** for the full story.

> [!WARNING]
> **Ravix 0.1 is a pre-release.** Sessions are `HttpOnly` cookies, logins are
> rate-limited and CORS is same-origin — but **the backend still runs as root**,
> because it provisions the mail stack. Treat panel access as root access. Read
> **[Security](docs/en/security.md)** before pointing a public DNS name at the
> panel; the remaining weaknesses are documented, not hidden.

## Features

<table>
<tr>
<td width="50%" valign="top">

### 📮 Mail platform
- Domains, mailboxes, aliases and Sieve filters
- Postfix / Dovecot / Rspamd / OpenDKIM provisioning
- Package and service management over `apt` and `systemd`
- Postfix queue: inspect, retry, hold, delete
- Let's Encrypt certificates via Certbot
- Built-in webmail with folders, search and compose
- CalDAV / CardDAV through Radicale

</td>
<td width="50%" valign="top">

### 📈 Deliverability
- Live MX / SPF / DKIM / DMARC / PTR checks per domain
- 2048-bit DKIM key generation with DNS guidance
- DMARC aggregate report ingestion and per-source analytics
- MTA-STS, TLS-RPT and DANE / TLSA posture
- RBL / DNSBL monitoring with history
- 30-day rolling sending reputation
- IP warm-up daily caps and FBL complaint suppression

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔐 Access control
- BCrypt password hashing, session-based auth
- TOTP two-factor authentication
- `owner` / `admin` / `viewer` roles
- Organizations with tenant isolation
- API keys for automation (`rvx_live_…`)
- Audit log of every mutating action

</td>
<td width="50%" valign="top">

### 🛠 Operations
- Dashboard with live system and service health
- Log viewer across Postfix, Dovecot, Rspamd, Nginx
- Campaigns with throttling, templates and segments
- Transactional send API
- Cloudflare integration for DNS record push
- `ravixctl` CLI for the shell-inclined
- Russian, English and Chinese documentation

</td>
</tr>
</table>

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/assets/screenshots/domains.png" alt="Domains"><br><sub><b>Domains</b> — live MX / SPF / DKIM / DMARC / PTR status for every domain.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/webmail.png" alt="Webmail"><br><sub><b>Webmail</b> — folders, search, reading pane and compose, built in.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/screenshots/mailboxes.png" alt="Mailboxes"><br><sub><b>Mailboxes</b> — quotas, filters, signatures and password management.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/platform.png" alt="Platform"><br><sub><b>Platform</b> — install and supervise Postfix, Dovecot, Rspamd and the rest.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/screenshots/deliverability.png" alt="Reputation"><br><sub><b>Reputation</b> — 30-day sending score, warm-up ramp and complaint suppression.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/tls-security.png" alt="MTA-STS / TLS"><br><sub><b>MTA-STS / TLS</b> — MTA-STS, TLS-RPT and DANE posture per domain.</sub></td>
</tr>
</table>

## Architecture

```text
                    ┌──────────────────────────────────────────┐
   Browser ────────▶│  Nginx  :9162                            │
                    │    /       → /var/www/ravix  (Vite dist) │
                    │    /api/   → 127.0.0.1:8080              │
                    └───────────────────┬──────────────────────┘
                                        │
                             ┌──────────▼───────────┐
                             │  Quarkus backend     │
                             └──┬────────────────┬──┘
                                │                │
                  ┌─────────────▼──┐    ┌────────▼──────────────────────┐
                  │  PostgreSQL    │    │  The Linux host               │
                  │  Flyway-owned  │    │  systemd · apt · postmap      │
                  └────────────────┘    │  /etc/postfix · DNS · certbot │
                                        └───────────────────────────────┘
```

**PostgreSQL is the source of truth; the mail stack's config files are a rendered
artifact.** You edit data in the panel, hit **Apply**, and `ProvisioningService`
renders Postfix maps, the Dovecot user file, OpenDKIM key tables and Rspamd
overrides, then reloads the services.

| Layer | Stack |
| --- | --- |
| Frontend | React 18 · TypeScript · Vite · Tailwind · i18next |
| Backend | Java 21 · Quarkus 3 · Hibernate Panache · Flyway |
| Database | PostgreSQL 14+ |
| Managed | Postfix · Dovecot · Rspamd · Redis · OpenDKIM · Certbot · Nginx · Radicale |

Details in **[Architecture](docs/en/architecture.md)**.

## Requirements

| | Minimum | Recommended |
| --- | ---: | ---: |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB SSD | 80+ GB SSD |

Debian 12 is the primary target; Ubuntu 22.04/24.04 LTS works on the same
`apt` + `systemd` model. Both `amd64` and `arm64` are supported.

Two things decide whether this works at all, and neither is under Ravix's
control: **outbound port 25 must be open** (most cloud providers block it by
default) and **your IP needs a PTR record**. See
[DNS & deliverability](docs/en/dns-deliverability.md).

## Documentation

| | English | Русский | 中文 |
| --- | --- | --- | --- |
| Index | [docs/en](docs/en/README.md) | [docs/ru](docs/ru/README.md) | [docs/zh](docs/zh/README.md) |
| Installation | [Installation](docs/en/installation.md) | [Установка](docs/ru/installation.md) | [安装](docs/zh/installation.md) |
| Configuration | [Configuration](docs/en/configuration.md) | [Конфигурация](docs/ru/configuration.md) | [配置](docs/zh/configuration.md) |
| Architecture | [Architecture](docs/en/architecture.md) | [Архитектура](docs/ru/architecture.md) | [架构](docs/zh/architecture.md) |
| Mail stack | [Mail stack](docs/en/mail-stack.md) | [Почтовый стек](docs/ru/mail-stack.md) | [邮件栈](docs/zh/mail-stack.md) |
| Deliverability | [DNS](docs/en/dns-deliverability.md) | [DNS](docs/ru/dns-deliverability.md) | [DNS](docs/zh/dns-deliverability.md) |
| CLI | [ravixctl](docs/en/cli.md) | [ravixctl](docs/ru/cli.md) | [ravixctl](docs/zh/cli.md) |
| API | [REST API](docs/en/api.md) | [REST API](docs/ru/api.md) | [REST API](docs/zh/api.md) |
| Security | [Security](docs/en/security.md) | [Безопасность](docs/ru/security.md) | [安全](docs/zh/security.md) |
| Troubleshooting | [Troubleshooting](docs/en/troubleshooting.md) | [Диагностика](docs/ru/troubleshooting.md) | [故障排查](docs/zh/troubleshooting.md) |

## Development

```bash
# PostgreSQL (the default dev URL expects port 54322)
docker run -d --name ravix-pg -p 54322:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16

# Backend — :8080, Swagger UI at /api/swagger
cd backend && ./mvnw quarkus:dev

# Frontend — :5173, proxies /api to the backend
npm install && npm run dev
```

Tests:

```bash
npm run lint && npm test          # typecheck + vitest
cd backend && mvn verify          # units + integration (needs Docker)
```

CI runs all of it on every push and pull request. See
**[CONTRIBUTING.md](CONTRIBUTING.md)** before opening a pull request — Ravix has
a deliberate scope and a short list of non-goals.

## Roadmap

Honest about what is not done yet:

- [x] `HttpOnly` / `SameSite=Strict` session cookies
- [x] Login rate limiting with lockout
- [x] Same-origin CORS instead of a wildcard
- [x] No shipped default admin password
- [ ] Drop the backend from root to a narrow privileged helper + `sudoers`
- [ ] Dry-run, diff and rollback for generated mail-stack config
- [ ] Real Maildir/IMAP-backed webmail browsing
- [ ] Complete disaster-recovery restore flows
- [ ] Quota enforcement for organizations

## Security

Found a vulnerability? **Do not open a public issue** — report it privately
through [GitHub Security Advisories](https://github.com/tnAnGel/Ravix/security/advisories/new).
Full policy and the known-weakness list: **[SECURITY.md](SECURITY.md)**.

## License

Ravix is licensed under the **[GNU Affero General Public License v3.0](LICENSE)**.

In short: you may run, study, modify and share it freely. If you modify Ravix and
offer it to others **over a network**, you must also offer them the complete
corresponding source of your modified version, under the same license. That
network clause is the point — it is what keeps a hosted fork from becoming a
closed product.

Copyright © 2025–2026 **Maxim Belyakov**. See **[NOTICE](NOTICE)** for authorship,
trademark and commercial-licensing terms.

---

<div align="center">

**Built and maintained by Maxim Belyakov**

[GitHub](https://github.com/tnAnGel) · [Telegram @Namnes](https://t.me/Namnes) · [darkzeit00@gmail.com](mailto:darkzeit00@gmail.com)

</div>
