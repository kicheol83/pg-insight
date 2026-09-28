# PG Insight

**English** | [한국어](./README.md)

A real-time PostgreSQL monitoring platform. Register a connection and get live dashboards for connections, slow queries, locks, table bloat, VACUUM/XID health and replication lag, plus threshold-based alerting.

**Live Demo:** https://pginsight.javohir.dev

## Features

- **Real-time monitoring**: connection counts and lock alerts pushed over Socket.io
- **Query analysis**: slow query analysis based on `pg_stat_statements`, `EXPLAIN` plan viewer
- **Lock analysis**: blocking chain detection and deadlock risk detection
- **Tables / VACUUM**: bloat ratio, dead tuples, XID age tracking
- **Replication**: per-replica lag (bytes / ms), inactive slot detection
- **Maintenance actions**: `VACUUM (ANALYZE)`, `DROP INDEX CONCURRENTLY` for unused indexes
- **Backup automation**: `pg_dump`-based backup creation and download
- **Alerting**: threshold rules, cooldowns, webhooks
- **Health Score / Security audit**: configuration diagnostics and security checks

## Tech Stack

| Area | Technology |
|---|---|
| Backend | NestJS, Prisma, `pg`, Socket.io |
| Database | PostgreSQL 16 (platform DB), TimescaleDB (metrics time series) |
| Frontend | Vite, React 18, TypeScript, Tailwind CSS, Recharts |
| Infra | Docker Compose, Caddy (automatic HTTPS), Ubuntu 24.04 VPS, Cloudflare DNS |

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
              │ Platform DB  │  │ Metrics DB     │     │ Monitored     │
              │ (Prisma)     │  │ (TimescaleDB)  │     │ PostgreSQL    │
              └──────────────┘  └────────────────┘     └──────────────┘
```

- **Platform DB**: users, monitored targets (passwords encrypted with AES-256-GCM), alert rules, audit logs
- **Metrics DB**: collected metrics stored as hypertables with compression and retention policies
- **Collectors**: collect target metrics every 5s to 5min and write them to TimescaleDB
- **Live queries**: pages that need up-to-the-second data query the target directly

## Security

- JWT access tokens (15 min) with refresh token rotation (only SHA-256 hashes stored server-side)
- Target passwords encrypted with AES-256-GCM, with a key rotation script
- `EXPLAIN` endpoint hardened in four layers: comment stripping → multi-statement rejection → keyword blocklist → `READ ONLY` transaction
- The app refuses to start without required secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `TIMESCALE_URL`)
- In production, database ports are never exposed; all traffic goes through the reverse proxy
- The API container runs as the non-root `node` user
- Audit log for logins, target changes and `EXPLAIN` calls

## Running Locally

```powershell
cd pg-insight-back
docker compose up -d platform-db metrics-db
Copy-Item .env.example .env
npm install --legacy-peer-deps
npx prisma migrate deploy
npm run start:dev
```

`JWT_SECRET` (at least 32 characters) and `ENCRYPTION_KEY` must be set in `.env`.

```powershell
cd pg-insight-ui
npm install
npm run dev
```

Open http://localhost:5173 and create the first admin account on the login screen.

## Production Deployment

```bash
cp .env.prod.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

- Generate passwords and keys in `.env` with `openssl rand -hex 32` or similar.
- The `web` container joins the external Docker network `proxy`; an upstream Caddy routes `pginsight.javohir.dev` to it.
- Create the first admin account immediately after deployment.
- Back up `ENCRYPTION_KEY` safely; without it, stored target passwords cannot be decrypted.

## Preparing a Target Database

```sql
GRANT pg_monitor TO your_monitoring_user;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

`pg_stat_statements` requires `shared_preload_libraries = 'pg_stat_statements'` in `postgresql.conf` and a restart.

## Detailed Docs

- [Backend README](./pg-insight-back/README.md)
- [Frontend README](./pg-insight-ui/README.md)

## Known Limitations and Roadmap

- JWT authentication for the WebSocket `/metrics` namespace
- Role-based (admin / viewer) permissions for maintenance actions
- Restricting monitored target hosts from reaching internal networks
- No E2E tests (Playwright) yet

## License

MIT
