# Contributing to Ravix

Thanks for taking an interest. Ravix is a small, opinionated project maintained
by one person, so a short heads-up before you invest time saves everyone effort.

## Before you write code

- **Open an issue first** for anything larger than a bug fix or a typo. Ravix has
  a deliberate scope (see [Non-goals](#non-goals)); an issue is the cheapest way
  to find out whether a feature fits before you build it.
- **Security problems do not go in issues.** Follow [SECURITY.md](SECURITY.md).
- **Licensing.** Ravix is AGPL-3.0-only. By submitting a pull request you agree
  that your contribution is licensed under the AGPL-3.0 and that you have the
  right to submit it. There is no CLA and copyright stays with you.

## Development setup

Ravix is a Vite/React frontend plus a Quarkus backend against PostgreSQL. You do
**not** need a real mail stack to work on the panel — only the DNS checks and the
provisioning layer need a Linux host.

```bash
# 1. PostgreSQL (any 14+ instance; the default URL expects port 54322)
docker run -d --name ravix-pg -p 54322:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16

# 2. Backend — http://localhost:8080, Swagger UI at /api/swagger
cd backend && ./mvnw quarkus:dev

# 3. Frontend — http://localhost:5173, proxies /api to the backend
npm install && npm run dev
```

Defaults live in [`backend/src/main/resources/application.properties`](backend/src/main/resources/application.properties);
every value is overridable via an environment variable. Flyway runs the
migrations in `db/migration` at startup, and Hibernate only *validates* against
the resulting schema — so schema changes belong in a new `V<n>__*.sql`
migration, never in an entity alone.

## Before you open a pull request

```bash
npm run lint     # tsc --noEmit
npm test         # vitest
cd backend && mvn verify
```

The backend integration tests start a throwaway PostgreSQL through
Testcontainers, so Docker needs to be running. CI runs all of the above on every
pull request — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## House style

- **Match the surrounding code.** Ravix has consistent naming, comment density
  and structure; a patch that reads like the file it lands in is easier to
  review than a technically superior one that does not.
- **Comments explain *why*, not *what*.** The existing code does this fairly
  strictly — keep it up.
- **Both locales, always.** Any user-facing string goes in *both*
  [`src/i18n/ru.ts`](src/i18n/ru.ts) and [`src/i18n/en.ts`](src/i18n/en.ts).
  There is a test that fails on key drift between them.
- **Schema changes** need a Flyway migration; never edit an applied one.
- **Anything that touches the host** (packages, `/etc`, systemd) belongs in
  `platform/ProvisioningService` and needs a matching test.
- **Commits** follow Conventional Commits: `fix(webmail): …`, `feat(dns): …`,
  `docs(ru): …`. Keep them scoped to one change.

## Documentation

Docs live in [`docs/`](docs/) and are maintained in three languages — English,
Russian and Chinese. If your change alters behaviour that the docs describe,
update **[`docs/en/`](docs/en/)** at minimum and say so in the PR; a maintainer
can carry the translation if you do not speak the other two.

## Non-goals

These have been considered and deliberately left out. A PR implementing one is
unlikely to be merged without a prior discussion:

- Support for non-`systemd` / non-`apt` distributions in the provisioning layer.
- Replacing Postfix/Dovecot/Rspamd with a bundled MTA.
- Running Ravix and the mail stack in separate containers (the panel needs
  host-level control of the mail stack by design).
- A hosted/SaaS control plane.

## Reporting bugs

Use the issue templates. The single most useful thing you can include is the
output of:

```bash
sudo ravixctl doctor
sudo ravixctl version
sudo ravixctl logs 200
```

Scrub domains, IPs and API keys you would rather not publish.
