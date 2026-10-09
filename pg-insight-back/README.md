# PG Insight — backend

NestJS API for [PG Insight](../README.en.md), an open-source multi-tenant PostgreSQL monitoring service. Users register their own PostgreSQL instances and get dashboards for connections, slow queries, locks, table bloat, vacuum/XID health, replication lag and threshold-based alerting.

## Stack

**Backend:** NestJS 11 · Prisma 7 (platform DB) · raw `pg` driver (target connections + TimescaleDB) · Socket.io · TimescaleDB (metrics history)
**Frontend:** Vite · React 18 · TypeScript · Tailwind CSS · Recharts · socket.io-client

## Architecture

Two Postgres databases:

- **Platform DB** (`pg_insight_platform`) — users, target credentials (AES-256-GCM encrypted), alert rules, alert events, audit logs. Managed via Prisma.
- **Metrics DB** (`pg_insight_metrics`, TimescaleDB) — collected time-series metrics as hypertables with compression and retention policies (`docker/init-platform.sql`, applied on the first boot of the metrics container).

For each monitored target, `TargetPoolManager` keeps a small `pg.Pool` (max 5 connections) open. Two ways this pool is used:

1. **Collectors** (`src/collector/collectors/*`) run on a schedule (3s for locks up to 5min for system info) and write snapshots into the metrics DB via `MetricsWriterService`. This powers the dashboard trend charts. `CollectorOrchestrator` starts in `onApplicationBootstrap`, after every pool has connected in `onModuleInit`, and reconnects a target with its stored password after 3 consecutive errors.
2. **Live queries** (`src/live/live-query.service.ts`) run on demand, straight against the target, for pages that need up-to-the-second data (Connections, Locks, Queries, Vacuum, Replication, Settings).

`RealtimeGateway` serves the `/metrics` Socket.io namespace. The handshake requires a valid JWT, `subscribe` checks target ownership, and events go only to the target's room.

## Prerequisites

The PostgreSQL user you connect with needs monitoring permissions:

```sql
CREATE ROLE insight_monitor LOGIN PASSWORD '...';
GRANT pg_monitor TO insight_monitor;
```

For query-level stats (Queries page), enable `pg_stat_statements` on the target database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

(Requires `shared_preload_libraries = 'pg_stat_statements'` in `postgresql.conf`, then a restart.)

## Running locally

```bash
docker compose up -d platform-db metrics-db

cp .env.example .env          # set ENCRYPTION_KEY and JWT_SECRET at minimum
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run start:dev             # http://localhost:3000/api/v1

cd ../pg-insight-ui
npm install
npm run dev                   # http://localhost:5173 — redirects to /login
```

Swagger API docs: `http://localhost:3000/api/docs` (basic auth with `SWAGGER_USER`/`SWAGGER_PASSWORD` in production).

## Authentication and tenancy

Every endpoint under `/api/v1` requires a `Bearer` JWT except `GET /auth/config`, `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh` and `POST /auth/register-first`.

- **First admin**: on an empty `users` table the login page offers to create the first account (`POST /auth/register-first`), which becomes `admin`. The endpoint stops working once any user exists.
- **Self sign-up**: `POST /auth/signup` is open only when `SIGNUP_ENABLED=true`, creates a `user` account, is limited to 5 requests per hour per IP and is audited with the client IP. Password length is 8–72 characters (the bcrypt limit). Extra fields such as `role` are rejected.
- **Admin invites**: `POST /auth/register` (admin only).
- **Tokens**: access tokens are short-lived (15 minutes, `JWT_EXPIRES_IN`). Refresh tokens are long-lived (7 days), stored as a SHA-256 hash and rotated on every use; `POST /auth/logout` revokes all of a user's refresh tokens.
- **Ownership**: `TargetAccessGuard` runs globally after `JwtAuthGuard`. Any route with `:targetId` is checked automatically; routes keyed by another ID declare it with `@TargetAccess('id', 'alertRule' | 'alertEvent' | 'backup')`. Admins can access every existing target; other users only targets they created. A missing or foreign target returns 404.
- **Quota and host policy**: non-admin users can have `TARGET_QUOTA_PER_USER` active targets (default 3). `TargetHostPolicy` resolves the host, rejects private/internal addresses unless `TARGET_ALLOW_PRIVATE_HOSTS=true`, and the pool connects to the checked IP with the original hostname as the TLS servername. New targets default to `sslMode=require`; node-postgres has no libpq-style `prefer`, so `prefer` and `allow` connect without TLS.
- **Audit log**: logins (success/failure), sign-ups, target create/update/delete and every `EXPLAIN` call (including rejected ones) are recorded in `audit_logs`. Audit failures never block the underlying action.

## EXPLAIN endpoint hardening

`POST /live/:targetId/queries/explain` runs user-submitted SQL against the user's own target. A keyword blocklist alone is bypassable (`DR/*x*/OP TABLE`), so the layers are:

1. Comments stripped before any check
2. Any embedded semicolon rejected (no multi-statement queries)
3. Only `SELECT` / `WITH` accepted
4. Keyword blocklist on the comment-stripped text
5. Denylist of side-effecting or slow functions (`pg_sleep*`, `pg_terminate_backend`, `pg_cancel_backend`, advisory locks, `set_config`, `dblink*`, `lo_*`, `pg_read_*file`, `pg_ls_*`, `*_to_xml`, …)
6. **Execution inside `BEGIN TRANSACTION READ ONLY`** with `SET LOCAL statement_timeout = '5s'` and `SET LOCAL lock_timeout = '1s'`. Postgres itself refuses writes, and a timeout (`57014`) is returned as 400.

## Testing

```bash
npx jest
TEST_TARGET_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npx jest
```

23 suites, 182 tests. Highlights:

- `auth/admin-routes.spec.ts` — reads controller metadata and fails if a mutating route has neither an ownership check nor the admin guard
- `auth/target-access.*.spec.ts` — guard unit tests and HTTP tests for 404 on foreign targets
- `auth/signup-throttle.http.spec.ts` — the sixth sign-up from one address gets 429; a smuggled `role` gets 400
- `targets/target-host.policy.spec.ts` — private, link-local, CGNAT, IPv6 and internal-name rejection
- `collector/collector.lifecycle.spec.ts` — reproduces the restart bug where collection started before pools connected
- `real-time/real-time.gateway.spec.ts` — handshake JWT, ownership on subscribe, room-only emits
- `live/live-query.explain.spec.ts`, `collector/collectors/lock.collector.spec.ts` — run against a real PostgreSQL when `TEST_TARGET_DATABASE_URL` is set, skipped otherwise

`@prisma/client` is mapped to `test-mocks/prisma-client.stub.js` in `jest.config.js`; `PrismaService` is always replaced with a mock in each spec. `moduleFileExtensions` lists `ts` before `js` so a stale compiled `.js` next to a `.ts` file is never picked up.

CI (`/.github/workflows/ci.yml` at the repository root) runs `prisma generate`, `tsc --noEmit`, the tests against a PostgreSQL 16 service container, `prisma migrate deploy` and the build.

## Health checks

`GET /api/v1/health` checks both databases and returns 503 if either is unreachable — use it as the readiness probe (the deploy scripts do). `GET /api/v1/health/live` is a plain liveness probe without database checks.

## Rotating the encryption key

If `ENCRYPTION_KEY` needs to change, stored target passwords must be re-encrypted:

```bash
OLD_ENCRYPTION_KEY=<old-key> npx ts-node src/scripts/rotate-encryption-key.ts <new-key>
```

Stop the app first so collectors do not write with the old key mid-rotation, then update `ENCRYPTION_KEY` in `.env` and restart. The script still constructs `PrismaClient` without the `@prisma/adapter-pg` driver adapter that `PrismaService` uses since the Prisma 7 upgrade, so try it on a copy of the platform DB before rotating a production key.

## Bugs found in production

Found while running the service against real databases and covered by tests since:

- The real-time broadcast read `server.sockets.adapter` on a Namespace, threw a `TypeError` on every tick and stalled collectors; reconnect then used an empty password.
- The lock collector's join used invalid `RENAME AS` syntax and failed on every monitored database every 3 seconds.
- After an API restart, collection started before the pools had connected (`Starting collection for 0 active target(s)`), leaving all targets unmonitored until the next restart.
- `connection_metrics.time` was set to a session's `query_start` instead of the collection time, which made the latest point look hours old.
- `GET /health` returned 500 instead of 503 when a database was down.

## Environment variables

See `.env.example`.

| Variable | Required | Description |
|---|---|---|
| `PLATFORM_DATABASE_URL` | yes | Platform DB (Prisma) |
| `TIMESCALE_URL` | yes | Metrics DB |
| `ENCRYPTION_KEY` | yes | Encrypts stored target passwords |
| `JWT_SECRET` | yes | At least 32 characters |
| `JWT_EXPIRES_IN` | no | Access token lifetime, default `15m` |
| `CORS_ORIGIN` | no | Allowed frontend origin |
| `SWAGGER_USER`, `SWAGGER_PASSWORD` | no | Basic auth for `/api/docs` in production |
| `SIGNUP_ENABLED` | no | `true` opens `POST /auth/signup`, default `false` |
| `TARGET_QUOTA_PER_USER` | no | Active targets per non-admin user, default `3` |
| `TARGET_ALLOW_PRIVATE_HOSTS` | no | `true` allows private/internal target hosts, default `false` |
| `PG_DUMP_PATH` | no | `pg_dump` binary for backups, default `pg_dump` |

## Project layout

```
src/
├── main.ts                     Bootstrap, Swagger, CORS, validation, trust proxy
├── app.module.ts               Root module, global guards (throttler → JWT → target access)
├── auth/                       JWT, sign-up, admin guard, target ownership guard
├── audit/                      Audit log
├── database/                   Prisma + TimescaleDB pool providers
├── targets/                    Targets CRUD, pool manager, host policy
├── collector/                  Orchestrator + 8 collectors
├── metrics/                    TimescaleDB writer and trend reader
├── live/                       On-demand queries and EXPLAIN
├── alerts/                     Threshold rules, cooldown, webhooks
├── maintenance/                VACUUM, DROP INDEX CONCURRENTLY
├── backup/                     pg_dump backups (admin only)
├── security/                   Security audit checks
├── health/                     Readiness and liveness probes
└── real-time/                  Socket.io /metrics namespace
```

## Why raw SQL, not an ORM, for target queries?

Every query in `live-query.service.ts` and the collectors runs against a database whose schema PG Insight doesn't own — it introspects arbitrary Postgres instances via system catalogs (`pg_stat_activity`, `pg_locks`, `pg_stat_user_tables`, …). An ORM adds no value there; Prisma is used only for the platform's own tables.

## Known limitations

- No email verification, password reset or account deletion.
- The encryption key rotation script has not been updated for the Prisma 7 driver adapter.
- ESLint configuration needs cleanup; no E2E tests.

## License

MIT — see [`LICENSE`](../LICENSE). Contributions welcome, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).
