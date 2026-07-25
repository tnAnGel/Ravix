# REST API

[← Docs index](README.md) · [Русский](../ru/api.md) · [中文](../zh/api.md)

---

Everything the panel does is a REST call under `/api`. The same API is available
to your own tooling.

**Interactive documentation** is generated from the running backend:

| | URL |
| --- | --- |
| Swagger UI | `https://panel.example.com/api/swagger` |
| OpenAPI schema | `https://panel.example.com/api/openapi` |

The OpenAPI schema is authoritative — this page is the orientation.

## Authentication

Two credential types reach the same endpoints.

### Session tokens

```bash
curl -sX POST https://panel.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin@example.com","password":"…","code":"123456"}'
```

`code` is the TOTP code, required only when 2FA is enabled. The response carries
a token to send on every subsequent request:

```bash
curl https://panel.example.com/api/domains \
  -H "Authorization: Bearer $TOKEN"
```

Sessions live in the `auth_session` table and end at `/api/auth/logout`. They
are meant for the panel; use API keys for automation.

### API keys

Create one under **Settings → API keys**. The key looks like
`rvx_live_<random>` and is **shown exactly once** — only a BCrypt hash and the
last four characters are stored, so it cannot be recovered later.

```bash
curl https://panel.example.com/api/domains \
  -H "Authorization: Bearer rvx_live_…"
```

Rotate any key that has been pasted into a chat, ticket or screenshot.

### Public endpoints

These need no credentials: `/api/auth/login`, `/api/auth/status`, the tracking
pixel and click endpoints, and `/.well-known/*`. Everything else returns `401`
without a valid token.

## Sending transactional mail

The endpoint most people want. Authenticate with an API key:

```bash
curl -sX POST https://panel.example.com/api/send \
  -H "Authorization: Bearer rvx_live_…" \
  -H 'Content-Type: application/json' \
  -d '{
        "from":    "noreply@example.com",
        "to":      "recipient@example.org",
        "subject": "Your receipt",
        "html":    "<p>Thanks for your order.</p>",
        "text":    "Thanks for your order."
      }'
```

Provide `text` alongside `html`. A message with no plaintext alternative scores
worse with every spam filter that looks.

The sending domain must exist in Ravix and have DKIM configured, or the message
goes out unsigned — see [DNS & deliverability](dns-deliverability.md). Check the
exact request and response shapes in Swagger UI before wiring this into
production.

## Resource map

All paths are relative to `/api`.

### Identity and access

| Resource | Endpoints |
| --- | --- |
| Auth | `/auth/login`, `/auth/logout`, `/auth/status`, `/auth/me`, `/auth/password`, `/auth/2fa/*` |
| Admin users | `/admin-users` |
| API keys | `/api-keys` |
| Organizations | `/organizations` |
| Audit log | `/audit` |

### Mail objects

| Resource | Endpoints |
| --- | --- |
| Domains | `/domains`, `/domains/{id}`, `/domains/{id}/recheck` |
| Mailboxes | `/mailboxes`, `/mailboxes/{id}`, quota / toggle / password actions |
| Aliases | `/aliases` |
| Filters | `/mail-filters` |
| Signatures | `/mail-signatures` |
| Webmail | `/mailboxes/{id}/folders`, `/mailboxes/{id}/messages`, `/messages/{id}` actions |

### Deliverability

| Resource | Endpoints |
| --- | --- |
| DMARC | `/dmarc/*` |
| TLS security | `/tls-security/*` |
| RBL | `/rbl/*` |
| Reputation | `/reputation`, `/reputation/warmup`, `/reputation/complaints` |
| Inbox placement | `/inbox-placement/*` |
| Mail readiness | `/mail-readiness` |
| Deliverability reference | `/deliverability` |

### Operations

| Resource | Endpoints |
| --- | --- |
| Dashboard | `/dashboard` |
| Queue | `/queue`, `/queue/summary`, retry / hold / delete actions |
| Logs | `/logs` |
| Backups | `/backups` |
| System | `/system` |
| Platform | `/platform/components`, `/platform/apply`, `/platform/config` |
| Certificates | `/certificates`, renew actions |
| Doctor | `/doctor` |
| Tasks | `/tasks` |
| Settings | `/settings` |
| Services / events | `/services`, `/events` |

### Campaigns

| Resource | Endpoints |
| --- | --- |
| Campaigns | `/campaigns`, `/campaigns/{id}`, actions and recipients |
| Templates | `/templates` |
| Segments | `/segments` |
| Tracking | `/tracking/*` |

### Integrations

| Resource | Endpoints |
| --- | --- |
| Cloudflare | `/cloudflare/*` — token management and DNS record push |
| Providers | `/providers` |
| Relay | `/relay` |
| Radicale | `/radicale` |

## Multi-tenancy

Resources annotated `@OrgFiltered` are scoped to the calling user's organization
by `OrgFilterInterceptor`. A super-admin sees everything. See
[Multi-tenancy](multi-tenant.md).

## Things to know before you automate

- **Result sets are capped, not fully paginated.** `/messages` takes
  `offset`/`limit` (default 50) and `/audit` takes `limit` (default 200, max
  500). `/logs` and `/queue` return a bounded newest-first slice rather than
  accepting a page cursor — do not assume you can walk the whole queue.
- **`/auth/login` is rate-limited.** Five failures for one username, or twenty
  from one IP, inside five minutes trigger a 15-minute lockout answered with
  `429` and `Retry-After`. Honour that header rather than retrying blindly. A
  successful sign-in clears the counter.
- **Prefer API keys over session logins** for automation. Keys are not subject
  to the login throttle because they never hit `/auth/login`.
- **CORS allows same-origin plus a configured list.** If you call the API from a
  browser on another origin, add it to `RAVIX_CORS_ORIGINS`; see
  [Security](security.md).
- **This is a 0.1 pre-release.** Endpoint shapes may change between versions.
  Pin a version and read the release notes before upgrading anything that
  depends on the API.
