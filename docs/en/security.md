# Security

[← Docs index](README.md) · [Русский](../ru/security.md) · [中文](../zh/security.md)

---

> To **report** a vulnerability, see [SECURITY.md](../../SECURITY.md). This page
> is about running Ravix safely.

## Threat model

Ravix is a control plane with root on a mail host. That means:

- **Panel access is root access.** The backend runs as `User=root` because it
  installs packages, writes `/etc/postfix`, and reloads services. An admin
  session is equivalent to a root shell.
- **The mail ports must be public.** Port 25 has to accept connections from
  anywhere, or you cannot receive mail. That is not true of the panel.
- **The panel port does not need to be public.** This asymmetry is the single
  most useful thing to exploit when hardening.

## What is already hardened

| Area | Behaviour |
| --- | --- |
| **Sessions** | An `HttpOnly`, `SameSite=Strict` cookie. Unreadable from JavaScript, so XSS cannot lift a session; `SameSite=Strict` is what stands in for CSRF protection. The `Secure` flag is added when the panel is served over HTTPS. Bearer tokens still work for API keys and scripts. |
| **Login throttling** | 5 failures per username or 20 per IP inside 5 minutes → a 15-minute lockout, answered `429` with `Retry-After`. Checked before the password is verified. Tunable via `RAVIX_AUTH_MAX_FAILURES`, `RAVIX_AUTH_MAX_FAILURES_PER_IP`, `RAVIX_AUTH_WINDOW_SECONDS`, `RAVIX_AUTH_LOCKOUT_SECONDS`. |
| **CORS** | Same-origin is always allowed; other origins must be listed in `RAVIX_CORS_ORIGINS` (default: the Vite dev server only). No wildcard. |
| **First-run admin** | No shipped default password. If `RAVIX_ADMIN_PASSWORD` is unset, a random 20-character password is generated and printed once at startup. |
| **Result sizes** | Audit capped at 200 (max 500), messages paginated with `offset`/`limit`, logs tail a bounded number of lines per source, queue capped at `RAVIX_QUEUE_MAX_ITEMS` (500). |

## Known weaknesses that remain

Documented, not secret:

| Area | State | Consequence |
| --- | --- | --- |
| **Process privileges** | `User=root` | RCE in the panel is root on the mail host. Architectural — the backend installs packages and writes `/etc/postfix`. The planned fix is a narrow privileged helper plus `sudoers`. **Treat panel access as root access.** |
| **Config rollout** | No dry-run, diff or rollback | A bad apply can break mail delivery. Back up `/etc/postfix` first. |
| **Restore flows** | Backup creation works; restore is incomplete | Do not rely on Ravix backups as your only copy. |
| **Default DB password** | Empty by default | Only affects a loopback trust-auth dev database; `install.sh` generates a real one. |

## Hardening checklist

Work through this before pointing a public DNS name at the panel.

### Network

- [ ] **Restrict the panel port.** `9162` should be reachable from your IPs
      only — not the internet:
      ```bash
      sudo ufw delete allow 9162/tcp
      sudo ufw allow from 203.0.113.5 to any port 9162 proto tcp
      ```
      Better still, do not expose it at all and reach it over a VPN or an SSH
      tunnel:
      ```bash
      ssh -L 9162:127.0.0.1:9162 you@mail.example.com
      ```
- [ ] **Keep the API on loopback.** `RAVIX_HTTP_HOST=127.0.0.1` is the default;
      leave it there so the backend is only reachable through Nginx.
- [ ] **Serve the panel over HTTPS.** `RAVIX_DOMAIN=panel.example.com` at
      install time provisions a certificate. The session cookie only gets its
      `Secure` flag over HTTPS.
- [ ] **Keep the panel hostname separate** from the mail hostname, so the two
      certificates and vhosts stay independent.

### Application

- [ ] **Leave CORS alone unless you split the origins.** Same-origin is already
      allowed and that is the normal deployment. Only if you serve the frontend
      from a different host do you need to name it:
      ```bash
      RAVIX_CORS_ORIGINS=https://panel.example.com
      ```
- [ ] **Change the admin password on first login** and enable TOTP 2FA under
      **Settings → Security**.
- [ ] **One admin account per person.** Shared logins make the audit log
      useless.
- [ ] **Use the least-privileged role** that works — see
      [Multi-tenancy](multi-tenant.md).
- [ ] **Rotate any API key** that has ever appeared in a chat, ticket or
      screenshot. Keys are `rvx_live_…` and cannot be recovered after creation,
      only replaced.
- [ ] **Read the audit log** occasionally. Everything mutating is recorded.

### Host

- [ ] **Keep fail2ban enabled** (the installer does this when
      `RAVIX_FIREWALL=1`). It covers SSH, SMTP and IMAP; the panel login has its
      own throttle.
- [ ] **Apply security updates**, both for Ravix and for Postfix/Dovecot/Rspamd.
- [ ] **Restrict PostgreSQL to loopback.** It has no reason to listen publicly.
- [ ] **Protect the env file** — `/etc/ravix/ravix.env` holds the database
      password and the initial admin password:
      ```bash
      sudo chmod 600 /etc/ravix/ravix.env
      ```

### Mail

- [ ] **Do not run an open relay.** Ravix's generated Postfix config does not
      create one; verify after any manual change:
      ```bash
      sudo postconf -n | grep -E 'mynetworks|relay_domains|smtpd_relay_restrictions'
      ```
- [ ] **Require authentication for submission** on ports 465/587, and TLS with
      it.
- [ ] **Use strong mailbox passwords.** A compromised mailbox becomes a spam
      relay, and your IP is on a blocklist within hours.
- [ ] **Watch the queue and the RBL page.** A sudden queue spike is usually the
      first sign of a compromised account.

### Backups

- [ ] **Take a backup before every apply** — `sudo ravixctl backup`.
- [ ] **Copy backups off the host.** A backup that lives only on the machine it
      protects is not a backup.
- [ ] **Test a restore** before you need one. Restore flows are work in progress
      in 0.1.

## If a mailbox is compromised

1. Disable the mailbox in the panel, or change its password, then
   `sudo ravixctl apply`.
2. Flush the malicious mail out of the queue:
   ```bash
   sudo postqueue -p | grep -c '^[A-F0-9]'
   sudo postsuper -d ALL          # deletes the WHOLE queue, legitimate mail included
   ```
3. Check the **RBL** page and start delisting where needed.
4. Review the audit log and `/var/log/mail.log` for what else the account did.
5. Rotate any API key that account could reach.

## A reasonable deployment

For a production mail server today:

- Panel reachable over VPN or SSH tunnel only.
- HTTPS with a real certificate, CORS restricted to that origin.
- 2FA on every admin account, one account per person.
- Backups copied off-host nightly, restore tested.
- Fail2ban on, security updates automatic.
- Alerting on queue depth and RBL listings.

Treat the panel like a root shell, because it is one.
