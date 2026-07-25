<div align="center">

# Ravix Documentation

**English** · [Русский](../ru/README.md) · [中文](../zh/README.md)

</div>

---

Ravix is a self-hosted control panel for a Linux mail server. It provisions and
supervises Postfix, Dovecot, Rspamd, OpenDKIM and Certbot on the host it runs
on, and gives you a dashboard for domains, mailboxes, DNS health, deliverability
and campaigns.

> ⚠️ **Ravix 0.1 is a pre-release and is not production-hardened.** The backend
> runs as root, CORS is open by default and there is no login rate limiting.
> Read [Security](security.md) before exposing a panel to the internet.

## Start here

| Guide | What it covers |
| --- | --- |
| **[Installation](installation.md)** | Requirements, the one-line installer, install modes, upgrading and uninstalling. |
| **[Configuration](configuration.md)** | Every environment variable, `ravix.env`, `application.properties`, ports and paths. |
| **[Architecture](architecture.md)** | How the frontend, backend, database and host mail stack fit together. |

## Running Ravix

| Guide | What it covers |
| --- | --- |
| **[Mail stack](mail-stack.md)** | Installing Postfix/Dovecot/Rspamd from the panel, generated config, applying changes. |
| **[DNS & deliverability](dns-deliverability.md)** | MX, SPF, DKIM, DMARC, PTR, MTA-STS, DANE, RBL monitoring and reputation. |
| **[CLI — `ravixctl`](cli.md)** | Service control, health checks, backups, updates, admin recovery. |
| **[REST API](api.md)** | Authentication, API keys, the transactional send endpoint, full resource map. |

## When things break

| Guide | What it covers |
| --- | --- |
| **[Troubleshooting](troubleshooting.md)** | Diagnosing a failed install, mail not arriving, DNS checks failing, panel unreachable. |
| **[Security](security.md)** | Threat model, known weaknesses, hardening checklist. |

## Design notes

| Document | Status |
| --- | --- |
| **[Multi-tenancy](multi-tenant.md)** | Organizations, roles and tenant isolation — partially implemented. |

## Conventions used in these docs

- Commands prefixed with `sudo` must run as root on the mail host.
- `example.com` is always a placeholder — substitute your own domain.
- `panel.example.com` refers to the hostname the *panel* is served on, which
  should normally **not** be the same as your mail hostname.
- Paths assume a default installation; see [Configuration](configuration.md) if
  you overrode them.
