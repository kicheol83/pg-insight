# Contributing to PG Insight

Thanks for considering a contribution. The repository holds the NestJS backend (`pg-insight-back`) and the React frontend (`pg-insight-ui`).

## Getting set up

```bash
cd pg-insight-back
docker compose up -d platform-db metrics-db
cp .env.example .env
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run start:dev

cd ../pg-insight-ui
npm install
npm run dev
```

See the [README](./README.en.md) for first-admin setup and environment variables.

## Before opening a PR

```bash
cd pg-insight-back
npx tsc --noEmit
npx jest

cd ../pg-insight-ui
npx vitest run
npm run build
```

Set `TEST_TARGET_DATABASE_URL` to a disposable PostgreSQL database to also run the tests that execute real SQL (lock collector, `EXPLAIN` time limit). CI (`.github/workflows/ci.yml`) runs the same checks.

## Rules for new code

- **Tenancy**: every route that touches a target must be covered by `TargetAccessGuard`. Routes with `:targetId` are checked automatically; routes keyed by another ID need `@TargetAccess(...)`. `src/auth/admin-routes.spec.ts` fails if a mutating route has neither an ownership check nor `AdminGuard`.
- **Target connections**: connect only through `TargetPoolManager` / `TargetsService.testConnection`, which apply `TargetHostPolicy`. Never open a `pg` client to a user-supplied host directly.
- **Arbitrary SQL**: endpoints that run user-submitted SQL or touch target credentials must call `AuditService.record()`.
- **Raw SQL for targets**: no ORM for target-facing queries (`src/live/`, `src/collector/`) — they read system catalogs of databases PG Insight doesn't own. Prisma is only for the platform's own tables.
- **Collectors** return snapshots only; writing happens in `MetricsWriterService`.

## Adding a new collector

1. Create `src/collector/collectors/your-thing.collector.ts` extending `BaseCollector`.
2. Add a `writeYourThing()` method in `MetricsWriterService` and a hypertable with a retention policy in `docker/init-platform.sql`.
3. Register it in `CollectorOrchestrator` and `collector.module.ts`.
4. If the dashboard should show it, add a reader method in `MetricsReaderService` and an endpoint in `MetricsController`.

## Database changes

Edit `prisma/schema.prisma` and generate a migration with `npx prisma migrate dev --name <change>` against a local database.

Production rollbacks swap images but never revert migrations (`scripts/rollback.sh`), so a migration must keep working with the previous release: add columns or tables first, ship the code that uses them, and remove old ones in a later release.

## Reporting security issues

Do not open a public issue for vulnerabilities. See [SECURITY.md](./SECURITY.md).
