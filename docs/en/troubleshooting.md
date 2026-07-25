# Troubleshooting

[← Docs index](README.md) · [Русский](../ru/troubleshooting.md) · [中文](../zh/troubleshooting.md)

---

## Start here

```bash
sudo ravixctl doctor          # service, API, database, nginx
sudo ravixctl logs 200        # panel logs
sudo journalctl -u ravix -n 200 --no-pager
sudo tail -200 /var/log/mail.log
```

`doctor` tells you *which* layer is down; the logs tell you why.

---

## The panel is unreachable

**1. Is the backend running?**

```bash
sudo systemctl status ravix
sudo journalctl -u ravix -n 100 --no-pager
```

Common causes:

| Symptom in the log | Cause |
| --- | --- |
| `Connection refused` to PostgreSQL | PostgreSQL is down: `sudo systemctl start postgresql`. |
| `password authentication failed` | `RAVIX_DB_PASSWORD` in `/etc/ravix/ravix.env` no longer matches the role. |
| `Flyway ... validate failed` | The schema drifted from the migrations, usually after a manual edit. |
| `Address already in use` | Something else holds port 8080: `sudo ss -lptn 'sport = :8080'`. |

**2. Is the API answering locally?**

```bash
curl -i http://127.0.0.1:8080/api/auth/status
```

If this works but the browser does not, the problem is Nginx or the firewall.

**3. Nginx**

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo tail -50 /var/log/nginx/error.log
```

**4. Firewall**

```bash
sudo ufw status
```

The panel port is `9162` by default, not 443. If you narrowed it to your own IP
during hardening — correctly — and your IP has since changed, this is your
answer.

---

## I am locked out

```bash
sudo ravixctl reset-admin admin@example.com 'a-new-strong-password'
```

If 2FA is what is blocking you, clear the secret for the account directly:

```bash
sudo -u postgres psql -d ravix \
  -c "UPDATE ravix.admin_user SET two_factor_secret = NULL WHERE email = 'admin@example.com';"
```

---

## Mail is not being sent

### Check the queue first

```bash
sudo postqueue -p | tail -30
```

The deferral reason names the problem.

| Reason | Meaning | Fix |
| --- | --- | --- |
| `Connection timed out` to port 25 | **Outbound SMTP is blocked by your provider.** | Open a support ticket. Nearly every cloud provider blocks port 25 by default. This is the most common cause by a wide margin. |
| `550 ... no PTR` / `does not resolve` | Missing or mismatched reverse DNS. | Set PTR at your hosting provider; see [DNS](dns-deliverability.md#2-ptr--the-one-you-cannot-set-yourself). |
| `554 ... blocked using ...` | You are on a blocklist. | Check the **RBL** page, fix the cause, then request delisting. |
| `Relay access denied` | Postfix does not consider itself responsible for the domain. | The domain is missing from `virtual_domains` — apply the configuration. |
| `SASL authentication failed` | Client credentials are wrong. | Reset the mailbox password in the panel and re-apply. |

Confirm port 25 is actually open:

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

A timeout here is conclusive: it is your provider, not your configuration.

### Mail sends but lands in spam

Work through the [deliverability checklist](dns-deliverability.md#a-working-checklist).
In practice it is almost always PTR, SPF, DKIM or a brand-new IP with no
warm-up.

---

## Mail is not being received

**1. Does the outside world route mail to you?**

```bash
dig +short MX example.com
dig +short A mail.example.com
```

The MX must point at a hostname with an A record — not at an IP, not at a CNAME.

**2. Is port 25 accepting connections?**

```bash
nc -zv mail.example.com 25
```

**3. Does Postfix consider the domain its own?**

```bash
sudo postmap -q example.com hash:/etc/postfix/ravix/virtual_domains
```

Empty output means the domain never made it into the generated config — add it
in the panel and run `sudo ravixctl apply`.

**4. Does the mailbox exist in the map?**

```bash
sudo postmap -q user@example.com hash:/etc/postfix/ravix/virtual_mailboxes
```

**5. Watch a live delivery**

```bash
sudo tail -f /var/log/mail.log
```

---

## DNS checks fail in the panel but the record exists

- **Propagation.** A record is not visible everywhere immediately. Wait out the
  TTL of the record you replaced, then `sudo ravixctl recheck`.
- **Resolver disagreement.** Compare what Ravix sees against a public resolver:
  ```bash
  dig +short TXT example.com @1.1.1.1
  dig +short TXT example.com @8.8.8.8
  ```
- **JNDI disabled.** If *every* DNS check returns empty rather than failing,
  `quarkus.naming.enable-jndi` is off. Ravix uses the JDK's DNS provider, and
  Quarkus disables JNDI by default; the shipped `application.properties` turns
  it back on. This bites custom builds.
- **Two SPF records.** Two `v=spf1` TXT records is a permanent error, not a
  merge. Keep exactly one.

---

## Apply broke the mail stack

```bash
sudo postfix check
sudo systemctl status postfix dovecot rspamd opendkim
```

`postfix check` names the offending file and line. If you took the backup
recommended in [Mail stack](mail-stack.md):

```bash
sudo systemctl stop postfix
sudo rm -rf /etc/postfix && sudo cp -a /root/postfix.bak /etc/postfix
sudo systemctl start postfix
```

Then open an [issue](https://github.com/tnAnGel/Ravix/issues) with the generated
config that failed — a bad render is a bug worth fixing.

---

## The install failed

**"This installer targets Debian/Ubuntu"** — no `apt-get`. Ravix's provisioning
layer is Debian/Ubuntu-specific by design.

**"Run as root (sudo)."** — use `sudo`.

**"Checksum verification failed — refusing to install."** — the downloaded
artifacts do not match `SHA256SUMS`. Usually a truncated download or a proxy
rewriting the response. Retry; if it persists, report it — do not bypass the
check.

**"No installable release found (mode=release)."** — no published release
matches. Drop `RAVIX_INSTALL_MODE=release` to fall back to a source build, or
pin an existing tag with `RAVIX_VERSION`.

**Java 21 will not install.** The installer adds the Adoptium repository when
`openjdk-21-jre-headless` is unavailable. On an unusual distribution, install a
Java 21 JRE yourself first, then re-run.

**A source build runs out of memory.** Compiling Quarkus and bundling Vite on a
1 GB host is tight. Add swap, or use the release path.

---

## Getting help

Open an [issue](https://github.com/tnAnGel/Ravix/issues) with:

```bash
sudo ravixctl version
sudo ravixctl doctor
sudo ravixctl logs 200
```

Scrub domains, IPs and API keys — issues are public. For security problems, use
[SECURITY.md](../../SECURITY.md) instead, never a public issue.
