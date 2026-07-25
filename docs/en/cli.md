# CLI — `ravixctl`

[← Docs index](README.md) · [Русский](../ru/cli.md) · [中文](../zh/cli.md)

---

`ravixctl` is installed to `/usr/local/bin/ravixctl` and controls a Ravix
installation from the shell. Every command needs root.

```bash
sudo ravixctl <command>
```

It reads `/etc/ravix/ravix.env` for credentials and ports; override the location
with `RAVIX_ENV_FILE`.

## Service control

| Command | Effect |
| --- | --- |
| `ravixctl status` | `systemctl status ravix`. |
| `ravixctl start` | Start the service. |
| `ravixctl stop` | Stop the service. |
| `ravixctl restart` | Restart — needed after editing `ravix.env`. |
| `ravixctl enable` | Start on boot. |
| `ravixctl disable` | Do not start on boot. |

## Logs

```bash
sudo ravixctl logs           # recent entries
sudo ravixctl logs -f        # follow
sudo ravixctl logs 500       # last 500 lines
```

For *mail* logs rather than panel logs, use the **Logs** page in the panel or
read `/var/log/mail.log` directly.

## `doctor`

The first thing to run when something is wrong.

```bash
sudo ravixctl doctor
```

Checks, in order:

- the `ravix` systemd service is active;
- the API answers on `http://127.0.0.1:8080/api/auth/status`;
- the PostgreSQL database is reachable;
- Nginx is active.

Nginx being inactive is reported as informational rather than a failure — the
backend can run without it, you just cannot reach the panel.

## `version`

```bash
sudo ravixctl version
```

Prints the running version. Include it in [bug reports](https://github.com/tnAnGel/Ravix/issues).

## `apply`

```bash
sudo ravixctl apply
```

Renders the mail-stack configuration from the database and reloads the affected
services — the CLI equivalent of **Platform → Apply**. See
[Mail stack](mail-stack.md).

There is no dry-run or rollback yet. Take a backup first.

## `recheck`

```bash
sudo ravixctl recheck
```

Re-runs the live MX / SPF / DKIM / DMARC / PTR checks for every domain. Useful
right after a DNS change, and as a cron job:

```cron
0 6 * * * /usr/local/bin/ravixctl recheck >/dev/null 2>&1
```

## `backup`

```bash
sudo ravixctl backup
```

Creates a backup and records it in the panel's backup list. Backups land under
`/var/lib/ravix/backups`.

> ⚠️ Backup *creation* works; full disaster-recovery restore flows should be
> treated as work in progress. Do not rely on this as your only copy — pull the
> backups off the host, and verify a restore before you need one.

## `update`

```bash
sudo ravixctl update
```

Only works on a **source** installation, where `/opt/ravix/src` is a git
checkout. It:

1. runs `git pull --ff-only` in `/opt/ravix/src`;
2. self-updates `/usr/local/bin/ravixctl` if it changed (atomically, so the
   running copy is not corrupted — new logic applies from the next invocation);
3. rebuilds the backend (`mvn -DskipTests package`);
4. rebuilds the frontend (`npm ci && npm run build`);
5. stops the service, replaces `/opt/ravix/quarkus-app` and `/var/www/ravix`
   wholesale, and starts it again.

Because the script runs under `set -euo pipefail`, **a failing build aborts
before anything is deployed** — a broken commit cannot replace a working
install. It prints the deployed commit at the end.

On a **release** installation, re-run the installer instead:

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

## `reset-admin`

```bash
sudo ravixctl reset-admin admin@example.com 'a-new-strong-password'
```

Recovery path when you are locked out of the panel. Both arguments are required.
Quote the password so the shell does not mangle it, and prefix the command with
a space if your shell records history.

This resets the password only. If 2FA is the thing locking you out, disable it
for the account in the database, or open an issue — a `--disable-2fa` flag is
not implemented yet.

## Typical sessions

**After a DNS change:**

```bash
sudo ravixctl recheck
```

**After adding domains or mailboxes in the panel:**

```bash
sudo ravixctl backup
sudo ravixctl apply
sudo ravixctl doctor
```

**Something is broken:**

```bash
sudo ravixctl doctor
sudo ravixctl logs 200
sudo journalctl -u ravix -n 200 --no-pager
sudo tail -200 /var/log/mail.log
```

**Routine upgrade:**

```bash
sudo ravixctl backup
sudo ravixctl update
sudo ravixctl doctor
```
