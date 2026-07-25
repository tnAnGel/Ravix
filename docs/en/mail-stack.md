# Mail stack

[← Docs index](README.md) · [Русский](../ru/mail-stack.md) · [中文](../zh/mail-stack.md)

---

Installing Ravix installs the *panel*. The mail server itself is installed
afterwards, from the panel, under **Platform → Software**.

## Components Ravix manages

| Component | Package(s) | Role |
| --- | --- | --- |
| **Postfix** | `postfix` | SMTP / mail transfer agent |
| **Dovecot** | `dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-sieve` | IMAP, POP3, LMTP delivery, Sieve filters |
| **Rspamd** | `rspamd` | Spam filtering and scoring |
| **Redis** | `redis` | Cache backend for Rspamd |
| **OpenDKIM** | `opendkim` | DKIM signing milter |
| **Certbot** | `certbot` | Let's Encrypt ACME client |
| **Nginx** | `nginx` | Reverse proxy, webmail |
| **PostgreSQL** | `postgresql` | Panel database |
| **fail2ban** | `fail2ban` | Brute-force protection for SSH / SMTP / IMAP |
| **Radicale** | `radicale` | Calendar and contacts (CalDAV / CardDAV) |

Each row shows its installed version, service state and whether an update is
available. Ravix installs through `apt`, so packages come from your
distribution's repositories.

## Recommended order

1. **Install the components** — Postfix, Dovecot, Rspamd, Redis and OpenDKIM at
   minimum. Add Radicale only if you want calendars.
2. **Add your first domain** under **Domains**, and publish the DNS records
   Ravix generates. See [DNS & deliverability](dns-deliverability.md).
3. **Generate a DKIM key** for the domain and publish the DNS record.
4. **Create mailboxes** under **Mailboxes**.
5. **Apply the configuration** — **Platform → Apply**.
6. **Verify** — send a message in and out, then check **Logs** and **Queue**.

Nothing you enter in the panel reaches Postfix or Dovecot until you apply.

## What "Apply" generates

`ProvisioningService` renders the database into config files and reloads the
affected services.

| Target | Contents |
| --- | --- |
| `/etc/postfix/ravix/virtual_domains` | Every active domain. |
| `/etc/postfix/ravix/virtual_mailboxes` | Mailbox → Maildir path map. |
| `/etc/postfix/ravix/virtual_aliases` | Alias → destination map. |
| `/etc/dovecot/ravix-users` | `passwd-file` entries with BCrypt hashes. |
| `/etc/opendkim/` | Key table, signing table, trusted hosts, generated private keys. |
| `/etc/rspamd/local.d/` | Score thresholds, allow/block lists, DKIM settings. |

The relevant Postfix settings:

```text
virtual_mailbox_domains = hash:/etc/postfix/ravix/virtual_domains
virtual_mailbox_maps    = hash:/etc/postfix/ravix/virtual_mailboxes
virtual_alias_maps      = hash:/etc/postfix/ravix/virtual_aliases
virtual_mailbox_base    = /var/vmail
virtual_transport       = lmtp:unix:private/dovecot-lmtp
```

Ravix runs `postmap` on the hash maps and reloads Postfix, Dovecot, OpenDKIM and
Rspamd as needed.

> **These files are generated.** Editing them by hand is pointless — the next
> apply overwrites them. Change the data in the panel instead. Settings you keep
> *outside* `/etc/postfix/ravix/`, `/etc/rspamd/local.d/` and
> `/etc/dovecot/ravix-users` are untouched.

## Mail storage

Mail is stored in Maildir format under `/var/vmail`, owned by the `vmail` user
(uid/gid `5000` by default). Delivery goes Postfix → Dovecot LMTP → Maildir, so
Dovecot owns the mailbox format and quota accounting.

Override the base path and ownership with `RAVIX_VMAIL_BASE`, `RAVIX_VMAIL_UID`
and `RAVIX_VMAIL_GID` — see [Configuration](configuration.md).

## Sieve filters and signatures

Per-mailbox filters (**Mailboxes → Filters**) are compiled into Sieve scripts by
`SieveService` and applied by Dovecot at delivery. Signatures are stored in the
database and applied by the panel's compose window, not by the MTA — a message
sent through an external IMAP client will not get one.

## TLS certificates

**Certificates** manages Let's Encrypt through Certbot: issuing, listing expiry
and renewing. Postfix and Dovecot are pointed at the resulting
`/etc/letsencrypt/live/<host>/` files.

Use your **mail hostname** (e.g. `mail.example.com`) for the mail certificate —
it must match the hostname your MX record points at, or TLS verification fails
for sending servers that check. The panel's own certificate is separate.

## Applying safely

There is no dry-run, diff or rollback yet — an apply writes and reloads
immediately. Until that lands:

```bash
sudo ravixctl backup                 # before an apply
sudo cp -a /etc/postfix /root/postfix.bak
sudo ravixctl apply                  # or the panel button
sudo ravixctl doctor
sudo ravixctl logs 200
```

If Postfix refuses to start after an apply, `postfix check` names the offending
line; restore your backup and open an [issue](https://github.com/tnAnGel/Ravix/issues).

## Queue

**Queue** wraps the Postfix queue: view deferred and held mail with the reason,
retry, hold or delete individual items, and read a summary by state. A queue
that keeps growing with `Connection timed out` on port 25 almost always means
your provider blocks outbound SMTP — see
[Troubleshooting](troubleshooting.md#mail-is-not-being-sent).
