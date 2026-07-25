# Security Policy

## Supported versions

Ravix is at an early pre-release stage. Only the latest tagged release and
`main` receive security fixes.

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| `0.1.x` pre-release | ✅ |
| anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use one of these private channels:

1. **GitHub Security Advisories** (preferred) —
   [open a private report](https://github.com/tnAnGel/Ravix/security/advisories/new).
   This keeps the discussion private until a fix ships.
2. **Email** — `darkzeit00@gmail.com`, with `[Ravix security]` in the subject.
3. **Telegram** — [@Namnes](https://t.me/Namnes), for time-critical issues.

Please include:

- affected version or commit;
- a description of the issue and its impact;
- reproduction steps or a proof of concept;
- your environment (OS, Java version, deployment shape).

**Response targets:** acknowledgement within 72 hours, an initial assessment
within 7 days, and a fix or mitigation plan agreed with you before any public
disclosure. Credit is given in the release notes unless you prefer otherwise.

## ⚠️ Ravix is not production-hardened yet

Ravix manages a mail server, so it is inherently exposed. Read this before you
point a public DNS name at the panel.

### Fixed in the current release

These were weaknesses in earlier `0.1` builds and are now closed. They are listed
so you can tell which build you are looking at:

| Area | What it does now |
| --- | --- |
| **Session storage** | The panel authenticates with an **`HttpOnly`, `SameSite=Strict`** session cookie. It is unreadable from JavaScript, so an XSS bug can no longer lift a live admin session, and `SameSite=Strict` is what stands in for CSRF protection. The bearer header still works for API keys and scripted clients. |
| **Login rate limiting** | `/api/auth/login` is throttled: **5 failures per username** and **20 per IP** inside a 5-minute window trigger a 15-minute lockout, answered with `429` and `Retry-After`. The throttle is checked *before* the password is verified, so a locked key costs no BCrypt. The IP budget is deliberately much larger than the username budget so one colleague mistyping cannot lock out everyone behind a shared office IP. Tunable via `RAVIX_AUTH_*`. |
| **CORS** | No longer a wildcard. Same-origin — the production shape — is always allowed, and genuine cross-origin callers must be named in `RAVIX_CORS_ORIGINS` (by default, only the Vite dev server). |
| **Default admin password** | There is no shipped default any more. With `RAVIX_ADMIN_PASSWORD` unset, Ravix generates a random 20-character password and prints it **once** at startup. A forgotten config now yields an account nobody can guess instead of one everybody can. |
| **Queue result size** | The Postfix queue view is capped at `RAVIX_QUEUE_MAX_ITEMS` (default 500) newest entries. Summary counters still reflect the whole queue. |

### Known weaknesses that remain

| Area | Current state | Why it matters |
| --- | --- | --- |
| **Process privileges** | The backend runs as `User=root` in the systemd unit. | It needs root to install packages, write `/etc/postfix`, and reload services. Any RCE in the panel is immediately root on the mail host. This is architectural — the fix is a narrow privileged helper plus a `sudoers` profile, and it is the top roadmap item. Until then, **treat panel access as root access** and restrict the panel port. |
| **Config rollout** | Generated Postfix/Dovecot/Rspamd config is written without dry-run, diff or rollback. | A bad apply can take mail delivery down. Keep your own backup of `/etc/postfix` and run `ravixctl backup` before applying. |
| **Default DB password** | `RAVIX_DB_PASSWORD` defaults to empty (a local trust-auth PostgreSQL). | Fine for a loopback-only development database; `install.sh` always generates a real password. Never expose that database. |
| **Restore flows** | Backup *creation* works; full disaster-recovery restore is incomplete. | Do not treat Ravix backups as your only copy. Pull them off the host and test a restore. |

Pagination was previously listed here and that was wrong: audit is capped at 200
(max 500), messages take `offset`/`limit`, and the log view tails a bounded
number of lines per source. Only the queue was unbounded, and it is now capped.

### Hardening checklist before exposing a panel

- [ ] Put the panel behind HTTPS — `RAVIX_DOMAIN=panel.example.com sudo ./install.sh` provisions a Let's Encrypt certificate. The session cookie only gets its `Secure` flag over HTTPS.
- [ ] Restrict the panel port (`9162` by default) to your own IPs at the firewall. Ravix does not need to be reachable from the whole internet; the *mail* ports do.
- [ ] Change the admin password on first login and enable 2FA (**Settings → Security**).
- [ ] Keep `RAVIX_HTTP_HOST=127.0.0.1` (the default) so the API is only reachable through Nginx.
- [ ] Rotate any API key (`rvx_live_…`) that has ever been pasted into a chat, ticket or screenshot.
- [ ] Take a backup before every **Platform → Apply configuration**.

If you need a hardened deployment today, run Ravix on a management host that is
reachable only over a VPN or an SSH tunnel.

## Scope

**In scope:** authentication and session handling, tenant isolation
(`OrgFilterInterceptor`), privilege escalation through the provisioning layer,
command injection in generated mail-stack config, SSRF in the DNS/RBL checkers,
XSS in the panel or webmail, and the installer scripts.

**Out of scope:** the known weaknesses listed above (they are tracked and
documented, not news), vulnerabilities in Postfix/Dovecot/Rspamd themselves
(report those upstream), missing hardening headers without a demonstrated
impact, and findings from automated scanners without a working proof of concept.
