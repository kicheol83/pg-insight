# PG Insight

Open source real-time PostgreSQL monitoring platform. Add any PostgreSQL instance with a connection string and get live dashboards for connections, slow queries, locks, table bloat, vacuum/XID health, replication lag, and threshold-based alerting.

## Stack

**Backend:** NestJS · Prisma (platform DB) · raw `pg` driver (target connections + TimescaleDB) · Socket.io · TimescaleDB (metrics history)
**Frontend:** Vite · React 18 · TypeScript · Tailwind CSS · Recharts · socket.io-client

## Architecture

Two Postgres databases:

- **Platform DB** (`pg_insight_platform`) — stores target credentials (AES-256-GCM encrypted), alert rules, alert events. Managed via Prisma.
- **Metrics DB** (`pg_insight_metrics`, TimescaleDB) — stores collected time-series metrics (connection counts, lock waits, cache hit ratio, etc.) as hypertables with compression and retention policies.

For each monitored target, `TargetPoolManager` keeps a small `pg.Pool` (max 5 connections) open. Two ways this pool is used:

1. **Collectors** (`src/collector/collectors/*`) run on a schedule (5s–5min depending on metric) and write snapshots into the metrics DB via `MetricsWriterService`. This powers the dashboard trend charts.
2. **Live queries** (`src/live/live-query.service.ts`) run on-demand, straight against the target, for pages that need up-to-the-second data (Connections, Locks, Queries, Vacuum, Replication, Settings).

Real-time push to the frontend (connection counts, lock alerts) goes through `RealtimeGateway` over a `/metrics` Socket.io namespace.

## Prerequisites

The PostgreSQL user you connect with needs monitoring permissions:

```sql
GRANT pg_monitor TO your_monitoring_user;
```

For query-level stats (Queries page), enable `pg_stat_statements` on the target database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

(Requires `shared_preload_libraries = 'pg_stat_statements'` in `postgresql.conf`, then a restart.)

## Running locally

```bash
# 1. Start platform DB + metrics DB (TimescaleDB)
docker compose up -d platform-db metrics-db
# metrics-db auto-runs docker/init-platform.sql on first boot (hypertables, compression, retention)

# 2. Backend
cp .env.example .env          # edit ENCRYPTION_KEY and JWT_SECRET at minimum
npm install
npx prisma migrate deploy     # applies prisma/migrations (targets/alerts tables + users table)
npx prisma generate           # regenerate client if you change schema.prisma later
npm run start:dev             # http://localhost:3000/api/v1

# 3. Frontend (separate terminal)
cd ../pg-insight-ui
npm install
npm run dev                   # http://localhost:5173 — redirects to /login
```

> The initial migration (`prisma/migrations/20260721000000_init/`) was hand-written to match `schema.prisma` exactly, since generating it requires Prisma's engine binaries. `prisma migrate deploy` applies it as-is — no live connection needed until this step. If you later edit `schema.prisma`, use `npm run prisma:migrate` (`prisma migrate dev`) to generate the next migration normally.

## Authentication

Every API endpoint under `/api/v1` requires a `Bearer` JWT token except `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/register-first`. On first run, the `users` table is empty, so open the frontend — it redirects to `/login`, where you can switch to "Birinchi admin yaratish" (create first admin). This calls `POST /auth/register-first`, which only succeeds while no users exist; after that, only an existing admin can invite new users via `POST /auth/register` (protected by `AdminGuard`).

**Tokens**: access tokens are short-lived (15 minutes, `JWT_EXPIRES_IN`) and signed with `JWT_SECRET`. Refresh tokens are long-lived (7 days), stored server-side as a SHA-256 hash (never in plaintext), and rotated on every use — `POST /auth/refresh` invalidates the token you just used and issues a new pair, so a stolen refresh token can only be replayed once before both the legitimate user and the attacker start getting "invalid token" errors, which is a workable tamper signal for a self-hosted tool. `POST /auth/logout` revokes all of a user's refresh tokens.

**Per-user access**: `admin` users see every target; `viewer` users only see targets they created (`Target.createdByUserId`). This is enforced in `TargetsService`, not just the controller, so it applies no matter where `findAll()` is called from.

**Audit log**: logins (success/failure), target create/update/delete, and every `EXPLAIN` call are recorded in `audit_logs` — including rejected `EXPLAIN` attempts, since that endpoint runs arbitrary SQL. Audit failures never block the underlying action; they're logged and swallowed.

## Testing

```bash
npm test          # run all unit tests
npm run test:cov  # with coverage
```

Current test suites (`src/**/*.spec.ts`, 39 tests):

- `common/crypto.util.spec.ts` — AES-256-GCM encrypt/decrypt round-trip, tampering detection, key validation
- `auth/auth.service.spec.ts` — login, refresh token rotation, logout, first-admin bootstrap (and its lockout once a user exists), user registration
- `live/live-query.service.spec.ts` — the `EXPLAIN` endpoint's 4-layer SQL safety filter, including the READ ONLY transaction enforcement and a comment-obfuscation bypass attempt

`@prisma/client` isn't generated in every environment (it needs Prisma's engine binaries, which some sandboxes can't download), so tests map `@prisma/client` to a minimal stub via `jest.config.js` — `PrismaService` is always replaced with a mock in each spec's DI container anyway, the stub only lets the module load.

CI runs typecheck + tests + build on every push via `.github/workflows/backend-ci.yml`.

## Health checks

`GET /health` checks both databases (platform + TimescaleDB) and returns 503 if either is unreachable — point your container orchestrator's readiness probe here. `GET /health/live` is a plain liveness probe (process is running, no DB check) — use this one if you don't want a flaky target DB connection to trigger container restarts.

## Rotating the encryption key

If `ENCRYPTION_KEY` needs to change (leak, rotation policy, etc.), stored target passwords must be re-encrypted — they don't update themselves:

```bash
# Stop the app first — collectors must not write with the old key mid-rotation
OLD_ENCRYPTION_KEY=<old-key> npm run rotate-key -- <new-key>
# Then update ENCRYPTION_KEY in .env and restart
```

See `scripts/rotate-encryption-key.ts` for details.

## Known bug fixed

`TargetPoolManager.onModuleInit()` used to pass the **encrypted** password straight to `pg.Pool` instead of decrypting it first — every target reconnect after an app restart would fail with "password authentication failed". Fixed by centralizing `encrypt`/`decrypt` in `src/common/crypto.util.ts` and decrypting before pool creation. Covered by `crypto.util.spec.ts`.

## EXPLAIN endpoint hardening

`POST /live/:targetId/queries/explain` runs arbitrary user-submitted SQL. The original implementation used a keyword blocklist alone, which is bypassable (e.g. `DR/*x*/OP TABLE` — comments hide the keyword from a naive regex, but Postgres still parses it as `DROP`). It's now four layers:

1. Comments stripped before any keyword check
2. Any embedded semicolon rejected outright (no multi-statement queries)
3. Keyword blocklist (now checked on the comment-stripped text)
4. **The query runs inside `BEGIN TRANSACTION READ ONLY`** — this is the layer that actually matters: even if a future Postgres command slips past the other three, Postgres itself refuses to execute a write inside a read-only transaction. Regex-based filters are guesswork; this one is not.

## License

MIT — see `LICENSE`. Contributions welcome, see `CONTRIBUTING.md`.

## Known limitations

Being upfront about what this project has _not_ had yet:

- **Never run against a live PostgreSQL instance in a full integration test.** Every query in `live-query.service.ts` and the collectors is unit-tested with mocked `pg` responses and passes `tsc --noEmit`, but no environment this project was built in has had outbound access to a real Postgres server. If you're the first to run `docker compose up` for real, please open an issue for anything that doesn't work — it's genuinely useful signal.
- No password-reset flow (self-hosted, single-admin-bootstrap tool — if you lose access, an admin with DB access can update `users.passwordHash` directly, or re-run migrations against a fresh `users` table).
- No E2E tests (Cypress/Playwright) — only unit tests exist on both sides.
- `docker/init-platform.sql`'s hypertable/compression/retention settings haven't been load-tested at scale.

Swagger API docs: `http://localhost:3000/api/docs`

## Full stack with Docker

```bash
docker compose up -d --build
```

This builds and runs the API container alongside both databases. Point the frontend's Vite proxy at `http://localhost:3000` (already configured in `vite.config.ts`).

## Project layout — backend

```
src/
├── main.ts                    Bootstrap, Swagger, CORS, validation
├── app.module.ts               Root module wiring
├── database/
│   ├── prisma.service.ts       Platform DB client
│   └── database.module.ts      Prisma + TimescaleDB pool providers
├── targets/                    Add/remove/test PostgreSQL targets
│   ├── target-pool.manager.ts  Per-target pg.Pool lifecycle
│   ├── targets.service.ts
│   ├── targets.controller.ts
│   └── targets.module.ts
├── collector/                  Scheduled background collection
│   ├── base.collector.ts
│   ├── collector.orchestrator.ts
│   ├── collectors/              8 collectors (connection, query, lock, table, vacuum, replication, io-buffer, system)
│   └── collector.module.ts
├── metrics/
│   ├── writer/metrics-writer.service.ts    Writes to TimescaleDB
│   ├── reader/metrics-reader.service.ts    Reads trends for dashboard
│   ├── metrics.controller.ts               REST: historical trends
│   └── metrics.module.ts
├── live/                       On-demand queries against the target DB
│   ├── live-query.service.ts   Connections, locks, tables, vacuum, replication, system info
│   ├── live.controller.ts      REST: /live/:targetId/*
│   └── live.module.ts
├── alerts/
│   ├── alert-engine.service.ts  Threshold evaluation, cooldown, webhooks
│   ├── alerts.controller.ts     REST: rules + event history
│   └── alerts.module.ts
└── realtime/
    ├── realtime.gateway.ts      Socket.io /metrics namespace
    └── realtime.module.ts
```

## Environment variables

See `.env.example`. At minimum you need `PLATFORM_DATABASE_URL`, `TIMESCALE_URL`, and a real `ENCRYPTION_KEY` in production (target passwords are encrypted with it).

## Why raw SQL, not an ORM, for target queries?

Every query in `live-query.service.ts` runs against a database whose schema PG Insight doesn't own — it's introspecting arbitrary user Postgres instances via system catalogs (`pg_stat_activity`, `pg_locks`, `pg_stat_user_tables`, etc.). An ORM adds no value here; Prisma is used only for the platform's own tables (targets, alert rules).
