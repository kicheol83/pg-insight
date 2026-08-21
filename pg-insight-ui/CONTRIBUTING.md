# Contributing to PG Insight

Thanks for considering a contribution. This is a two-repo project: `pg-insight-v2` (NestJS backend) and `pg-insight-ui` (React frontend), meant to be developed side by side.

## Getting set up

```bash
docker compose -f pg-insight-v2/docker-compose.yml up -d platform-db metrics-db

cd pg-insight-v2 && cp .env.example .env && npm install
npx prisma migrate deploy
npm run start:dev

cd ../pg-insight-ui && npm install && npm run dev
```

See each project's `README.md` for full details, including first-admin setup.

## Before opening a PR

```bash
# backend
cd pg-insight-v2
npx tsc --noEmit
npm test

# frontend
cd pg-insight-ui
npx tsc --noEmit
npm test
```

Both CI workflows (`.github/workflows/*.yml`) run these same checks automatically — a red CI check means one of the above failed.

## Code style

- No ORM for target-facing queries (`src/live/`, `src/collector/`) — those run against arbitrary user Postgres instances via system catalogs, where an ORM adds nothing. Prisma is only used for PG Insight's own platform tables.
- Every file that talks to a target database directly should have a comment explaining _why_ (performance, real-time need, or system-catalog access).
- New endpoints that touch target credentials or run arbitrary SQL (like `/live/:targetId/queries/explain`) must call `AuditService.record()`.
- Keep collectors (`src/collector/collectors/*.ts`) side-effect-free beyond returning their snapshot — writing happens in `MetricsWriterService`, not in the collector itself.

## Adding a new collector

1. Create `src/collector/collectors/your-thing.collector.ts` extending `BaseCollector`.
2. Add a matching `writeYourThing()` method in `MetricsWriterService` and a hypertable in `docker/init-platform.sql`.
3. Register it in `CollectorOrchestrator` and `collector.module.ts`.
4. If the dashboard should show it, add a reader method in `MetricsReaderService` and wire a new endpoint in `MetricsController`.

## Database changes

Edit `prisma/schema.prisma`, then either:

- Locally with a running Postgres: `npm run prisma:migrate` (generates the migration for you), or
- Without a live DB: hand-write the migration SQL under `prisma/migrations/<timestamp>_<name>/migration.sql`, matching the schema exactly. Cross-check every field name and type against the schema before committing — there's no automated diff check in this repo yet.

## Reporting security issues

If you find a way to bypass the EXPLAIN endpoint's read-only enforcement (`src/live/live-query.service.ts`), or any other path that could let an authenticated viewer write to a monitored database, please open an issue directly rather than a PR with the exploit — that endpoint is the most sensitive part of the codebase.
