# Multi-tenancy

[← Docs index](README.md) · [Русский](../ru/multi-tenant.md) · [中文](../zh/multi-tenant.md)

---

> **Status: implemented, not yet battle-tested.** The backend model, the
> Hibernate filter and the persistence-layer isolation test are in place. The
> frontend surface is partial, and the model has not been exercised by a real
> multi-customer deployment. Treat tenant isolation as a security boundary you
> should verify yourself before selling hosting on it.

## The model

One Ravix installation, **one mail stack**, many independent organizations.

This matters: the OS-level mail plane is shared by design. Postfix routes purely
by recipient domain and has no concept of who owns a domain, so there is one set
of `virtual_domains` maps, one Dovecot user file and one OpenDKIM key table
covering every tenant. Domains are globally unique across the installation.

**Isolation is logical, enforced at the application layer** — not by separate
Postfix or Dovecot instances. An organization sees only its own rows; the mail
stack itself remains operator-controlled.

## Entities

| Entity | Purpose |
| --- | --- |
| `Organization` | A tenant: name, slug, status, and quotas for domains, mailboxes and storage. |
| `OrgMembership` | Joins an `AdminUser` to an `Organization` with a role. |
| `AdminUser.superadmin` | Platform operator flag — bypasses all org scoping. |

A user can belong to several organizations (operator staff); the common case is
one user in one org.

### Tenant-scoped

These carry an `org_id` and are filtered on every query:

`domain`, `mailbox`, `alias`, `campaign`, `campaign_recipient`, `segment`,
`contact`, `email_template`, `mail_filter`, `mail_signature`, `inbox_seed`,
`inbox_test`, `api_key`

### Operator-global

Infrastructure and observability belong to the operator, not a tenant:

`app_setting`, `service_status`, `package_status`, `queue_item`, `log_line`,
`install_log`, `certificate`, `dns_record`, `rbl_check`, `dmarc_report`,
`fbl_complaint`, `audit_log`, `background_task`, `warmup_config`, `backup`

Some of these could be *displayed* per tenant — a customer's own queue items or
DMARC reports — but they are not owned by one.

## Roles

Roles are per-user and enforced in `AuthFilter`:

| Role | Can do |
| --- | --- |
| `owner` | Everything, including managing other team members. |
| `admin` | Full control of the mail platform; **cannot** add, remove or re-role other admins. |
| `viewer` | Read-only. May change only their own password and 2FA. |

`Roles.normalize()` folds legacy and free-text values (`Administrator`,
`read-only`, mixed case) into this canonical set; anything unrecognised becomes
`admin`.

Orthogonal to all three is `superadmin`, which is a *platform* flag rather than
a role: it bypasses org scoping entirely.

## How isolation is enforced

Four mechanisms, deliberately layered so no single mistake leaks data:

1. **`TenantContext`** — a request-scoped bean resolving the caller's effective
   organization, populated by `AuthFilter.resolveTenant()`.
2. **A Hibernate `@Filter("orgFilter")`** on every tenant-scoped entity,
   enabled per request, appending `org_id = :orgId` to queries.
3. **`OrgStamp`, an `@PrePersist` listener**, stamps `org_id` from the context
   on create — so no write path can forget it.
4. **HQL for by-id lookups.** REST resources use
   `find("id", …).firstResult()` rather than `findById()`, because a primary-key
   load bypasses Hibernate filters entirely. This is the subtle one: it is what
   makes `GET /api/domains/<other-org-id>` return 404 instead of the row.

A super-admin runs unscoped by default and can act inside one tenant by passing
the `X-Ravix-Org` header or an `org` query parameter.

Cross-organization reads and writes return **404, not 403** — a 403 confirms the
row exists.

## Verifying isolation yourself

`TenantFilterTest` covers the persistence layer against a real PostgreSQL:
three domains across two orgs, asserting each org sees only its own and that all
rows still exist unfiltered.

That proves the filter works on the session. It does **not** prove every one of
the ~39 REST resources engages it correctly. Before trusting this in production,
verify end-to-end on a running server:

1. Create organization B; put one domain in Default and one in B.
2. Add a non-super-admin user to B only.
3. Log in as that user — `GET /api/domains` must return **only** B's domain.
4. `GET /api/domains/<default-domain-id>` must return **404**.
5. A super-admin with no `X-Ravix-Org` sees both; with `X-Ravix-Org: <B>` sees
   only B's.

If steps 3 or 4 leak, the filter is not engaging on the query session — the fix
is to enable it inside the transaction via a CDI interceptor on the tenant
resources, rather than in the JAX-RS filter. Please
[report it](https://github.com/tnAnGel/Ravix/issues) if you hit that.

## Quotas

`Organization` carries `quota_domains`, `quota_mailboxes` and
`quota_storage_mb`. `0` means unlimited. Enforcement is incomplete — treat the
quota fields as advisory in 0.1 rather than a hard limit.

## Migration and upgrades

`V13__multi_tenant.sql` is backward-compatible. Upgrading a single-tenant
install creates one `Default` organization, backfills every tenant-scoped row
into it, and makes the existing admin its owner with the `superadmin` flag. The
behaviour is identical to before the migration — you only notice
multi-tenancy once you create a second organization.

## API

| Endpoint | Purpose |
| --- | --- |
| `/api/organizations` | Super-admin CRUD for organizations and their members. |
| `/api/auth/me` | Returns `superadmin` and the caller's `orgs`. |
| `X-Ravix-Org: <id>` | Header a super-admin sends to act within one tenant. |

## Honest limitations

- **Frontend coverage is partial** — the org switcher and members management are
  not fully surfaced across every page.
- **Quotas are not enforced.**
- **The mail stack is shared.** A tenant cannot have its own Postfix tuning,
  its own IP, or its own TLS policy.
- **Operator-global data is not per-tenant filtered for display** — a tenant
  does not get a scoped view of the queue or of DMARC reports.
- **No invite flow.** Members are added by a super-admin.

If you are considering Ravix for reseller hosting, budget time to review the
isolation yourself. The mechanism is sound and tested at the persistence layer,
but it has not yet had the adversarial review a real multi-customer product
deserves.
