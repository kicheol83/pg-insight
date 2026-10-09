# PG Insight

**English** | [한국어](./README.md)

An open-source, multi-tenant PostgreSQL monitoring service. Anyone can sign up, register their own PostgreSQL connection and get dashboards for connections, slow queries, locks, table bloat, VACUUM/XID health and replication lag, plus threshold-based alerting. Each user sees only the targets they registered.

**Live:** https://pginsight.javohir.dev — sign up and start right away (3 targets per account, public addresses only).

## Features

- **Dashboard**: connection, cache hit ratio and lock wait trends from metrics stored in TimescaleDB
- **Query analysis**: slow query analysis based on `pg_stat_statements`, `EXPLAIN (ANALYZE)` plan viewer
- **Lock analysis**: blocking chain detection and deadlock risk detection
- **Tables / VACUUM**: bloat ratio, dead tuples, XID age tracking
- **Replication**: per-replica lag (bytes / ms), inactive slot detection
- **Maintenance actions**: `VACUUM (ANALYZE)`, `DROP INDEX CONCURRENTLY` for unused indexes
- **Backups**: `pg_dump`-based backup creation and download (admin only)
- **Alerting**: threshold rules, cooldowns, webhooks
- **Health Score / Security audit**: configuration diagnostics and security checks

## Tech Stack

| Area | Technology |
|---|---|
| Backend | NestJS 11, Prisma 7, `pg`, Socket.io |
| Database | PostgreSQL 16 (platform DB), TimescaleDB (metrics time series) |
| Frontend | Vite, React 18, TypeScript, Tailwind CSS, Recharts |
| Infra | Docker Compose, Caddy (automatic HTTPS), Ubuntu 24.04 VPS |

## Architecture

```
                 ┌──────────────────────────────┐
  Browser ──────▶│ Caddy (TLS, security headers) │
   HTTPS         └──────────────┬───────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ web (Caddy + React static)    │
                 │  /api/*, /socket.io/* → api   │
                 └──────────────┬───────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ api (NestJS)                  │
                 │  Collectors · Live · Alerts   │
                 └──────┬───────────────┬───────┘
                        ▼               ▼
              ┌──────────────┐  ┌────────────────┐     ┌──────────────┐
              │ Platform DB  │  │ Metrics DB     │     │ Users'        │
              │ (Prisma)     │  │ (TimescaleDB)  │     │ PostgreSQL    │
              └──────────────┘  └────────────────┘     └──────────────┘
```

- **Platform DB**: users, monitored targets (passwords encrypted with AES-256-GCM), alert rules, audit logs
- **Metrics DB**: collected metrics stored as hypertables (1-day chunks). `connection_metrics` and `query_metrics` are compressed after 7 days; each table is dropped after 7–30 days
- **Collectors**: collect per-target metrics every 3s (locks) to 5min (system) and write them to TimescaleDB. At most 5 pooled connections per target
- **Live queries**: pages that need up-to-the-second data query the target directly

## Users and Permissions

| Role | Can do |
|---|---|
| `admin` (first account) | See every target, invite users (`/auth/register`), create/download/delete backups. Not subject to the target quota or the host policy |
| `user` (self sign-up) | View, edit and delete only their own targets. Metrics, `EXPLAIN`, alert rules, `VACUUM`/`DROP INDEX`. Up to `TARGET_QUOTA_PER_USER` active targets (default 3), public addresses only |

- Ownership is `Target.createdByUserId`. A global guard checks it on every route with `:targetId` and on alert rule, alert event and backup ID routes.
- Another user's target returns **404**, not 403, so its existence is not revealed.
- Maintenance actions run with the registered monitoring account's privileges, so the target database's own GRANTs decide what is actually possible.
- Backup files are stored on the server's disk, so backups are admin-only.
- A test (`admin-routes.spec.ts`) reads controller metadata and fails if any mutating route is added without an ownership check or the admin guard.

## Security

**Authentication**
- JWT access tokens (15 min) with refresh token rotation (only SHA-256 hashes stored server-side)
- Sign-up is open only when `SIGNUP_ENABLED=true`, limited to 5 per hour per IP; login is limited to 10 per minute per IP
- A `role` field in the sign-up body is rejected with 400 (accounts are always created as `user`)
- `trust proxy` trusts only loopback and private-range proxies, so a spoofed `X-Forwarded-For` cannot bypass rate limits (verified in production)

**Target host restrictions (SSRF)**
- For regular users, **every** address a host resolves to is checked; private, loopback, link-local (including `169.254.169.254`), CGNAT, IPv6 ULA and other internal ranges are rejected
- Single-label names and internal suffixes such as `.local`, `.internal`, `.lan` are rejected (e.g. the Docker service name `platform-db`)
- The connection goes to the checked IP, with the original hostname used for TLS (SNI), so DNS rebinding after the check does not work
- Self-hosted or on-premises installs can lift this with `TARGET_ALLOW_PRIVATE_HOSTS=true`
- New targets default to SSL mode `require`. node-postgres has no libpq-style `prefer` (TLS with plaintext fallback), so `prefer` used to mean a plaintext connection

**`EXPLAIN` endpoint**
- Comment stripping → multi-statement rejection → `SELECT`/`WITH` only → keyword blocklist → dangerous function denylist (`pg_sleep`, `pg_terminate_backend`, `dblink`, `lo_*`, file-reading functions and more)
- Runs inside a `BEGIN READ ONLY` transaction with `statement_timeout = 5s` and `lock_timeout = 1s`; a timeout returns 400
- Verified in production: a `pg_sleep` call is blocked before execution (400 in 0.05s); `generate_series(1, 10000000000)` → 400 at 5.4s

**WebSocket**
- The `/metrics` namespace verifies the JWT during the handshake and checks ownership when a client subscribes to a target room
- Events are sent only to that target's room (no global broadcast)

**Other**
- The app refuses to start without required secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `TIMESCALE_URL`)
- In production, database ports are never exposed; all traffic goes through the reverse proxy
- The API container runs as the non-root `node` user
- Audit log for logins, sign-ups (with IP), target changes and `EXPLAIN` calls

Please report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## Monitoring Overhead (Measured)

Measured on 2026-10-09 against the LedgerCore database (PostgreSQL 16.15) on the production VPS (8 vCPU, 8 GB RAM), 10 minutes per window. Application load was the same in both windows (1,798 calls from the `ledger` role).

| Metric | Result |
|---|---|
| PG Insight queries | 2,430 calls (4.05 per second), 31 distinct statements |
| Total execution time | 353.4 ms / 600 s → about 0.06% of one CPU core |
| Mean / max execution time | 0.145 ms / 13.67 ms |
| Temp file writes | 0 blocks |
| Target container CPU | 4.59 s while collecting vs 2.82 s without → about +0.3% of one core |
| Connections on the target | 5 idle (`max_connections` 100) |

- The container CPU difference also includes connection and protocol handling beyond query execution.
- The most expensive statements are the blocking-chain query, the index size query (4 ms mean) and a `pg_settings` read repeated every 10 seconds. Caching settings and shrinking the pool to 2–3 connections are the next optimization candidates.
- Storage: `query_metrics` grew by about 4 MB per target per hour (uncompressed). This is a preliminary figure from a 22-minute window; a 24-hour re-measurement is pending.
- Measurement script: [`scripts/measure-overhead.sh`](./scripts/measure-overhead.sh). It resets the target's `pg_stat_statements` statistics, so run it with care on production databases.

## Running Locally

```powershell
cd pg-insight-back
docker compose up -d platform-db metrics-db
Copy-Item .env.example .env
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

`JWT_SECRET` (at least 32 characters) and `ENCRYPTION_KEY` must be set in `.env`.

```powershell
cd pg-insight-ui
npm install
npm run dev
```

Open http://localhost:5173 and create the first admin account on the login screen. The admin is not subject to the host policy, so `localhost` targets can be registered.

## Tests

```powershell
cd pg-insight-back
npx jest
cd ..\pg-insight-ui
npx vitest run
```

- 182 backend and 41 frontend tests
- Tests that need a real PostgreSQL (the lock collector query, the `EXPLAIN` time limit) run only when `TEST_TARGET_DATABASE_URL` is set.
- `.github/workflows/ci.yml` runs typecheck, tests, migrations and the build against a PostgreSQL 16 service container

## Production Deployment

First install:

```bash
cp .env.prod.example .env
./scripts/deploy.sh
```

- Generate passwords and keys in `.env` with `openssl rand -hex 32` or similar.
- The `web` container joins the external Docker network `proxy`; an upstream Caddy routes `pginsight.javohir.dev` to it.
- Create the first admin account immediately after deployment, then set `SIGNUP_ENABLED=true` to open public sign-up.
- Back up `ENCRYPTION_KEY` safely; without it, stored target passwords cannot be decrypted.

### Deploy and Rollback

```bash
./scripts/deploy.sh             # fast-forward from upstream → build tagged with the commit SHA → record after health check
./scripts/rollback.sh           # go back to the previous version in .deploy-history
./scripts/rollback.sh d587ce6   # go back to a specific version
```

- `deploy.sh` aborts if upstream contains merge conflict markers and updates only with `git merge --ff-only`.
- Images are tagged `pg-insight-api:<sha>` and `pg-insight-web:<sha>`. `APP_TAG` in `.env` and `.deploy-history` are updated only after `/api/v1/health` answers within 90 seconds.
- `rollback.sh` swaps containers to existing images without building. A rollback in both directions (71dceaf ↔ d587ce6) was rehearsed in production.
- **Migrations are not rolled back.** The API container runs `prisma migrate deploy` on start, so the newer schema stays after a rollback. Migrations must therefore stay compatible with the previous code (add the column → deploy the code → clean up later).
- Running `docker compose up -d --build` by hand breaks the `APP_TAG` record, so deploy only through the scripts.

### Environment Variables (service policy)

| Variable | Default | Description |
|---|---|---|
| `SIGNUP_ENABLED` | `false` | Allow public sign-up |
| `TARGET_QUOTA_PER_USER` | `3` | Active targets per regular user |
| `TARGET_ALLOW_PRIVATE_HOSTS` | `false` | Allow private and internal target addresses (for self-hosting) |
| `PG_DUMP_PATH` | `pg_dump` | Path to the `pg_dump` binary used for backups |
| `APP_TAG` | `latest` | Image tag to run (managed by `deploy.sh`/`rollback.sh`) |

## Preparing a Target Database

Use a dedicated monitoring account rather than a superuser.

```sql
CREATE ROLE insight_monitor LOGIN PASSWORD '...';
GRANT pg_monitor TO insight_monitor;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

- `pg_stat_statements` requires `shared_preload_libraries = 'pg_stat_statements'` in `postgresql.conf` and a restart.
- The target must be reachable from the PG Insight server. Allow only that server in your firewall and `pg_hba.conf`, and use `sslmode=require` or stricter.

## Detailed Docs

- [Backend README](./pg-insight-back/README.md)
- [Frontend README](./pg-insight-ui/README.md)
- [Contributing](./CONTRIBUTING.md)

## Known Limitations and Roadmap

- The UI does not subscribe to per-target WebSocket rooms yet; dashboards refresh by REST polling
- No email verification, password reset or account deletion
- UI text is in Uzbek (Korean and English planned)
- ESLint configuration needs cleanup; no E2E tests (Playwright) yet

## License

[MIT](./LICENSE)
