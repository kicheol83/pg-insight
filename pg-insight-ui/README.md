# PG Insight — frontend

React SPA for [PG Insight](../README.en.md), an open-source multi-tenant PostgreSQL monitoring service. Talks to the NestJS backend over REST and an authenticated Socket.io connection; requires the backend running (see [its README](../pg-insight-back/README.md)) before this is useful for anything beyond the login screen.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · React Router 6 · Recharts · socket.io-client · Axios · lucide-react

## Running locally

```bash
npm install
npm run dev   # http://localhost:5173, proxies /api and /socket.io to localhost:3000
```

The Vite dev server proxy (`vite.config.ts`) expects the backend on `http://localhost:3000`. On first run there are no users yet — the app redirects to `/login`, where "Birinchi admin yaratish" creates the first admin account. When the backend reports `signupEnabled` (`GET /auth/config`), the login page also offers "Hisob yaratish" (create account) for self sign-up.

## Testing

```bash
npm test         # vitest run — 41 tests
npm run test:watch
```

Current coverage (`src/**/*.test.{ts,tsx}`):

- `lib/format.test.ts` — duration/byte/number formatting, relative timestamps, SQL truncation
- `lib/colors.test.ts` — the threshold logic behind connection-pool/XID-age/replication-lag color coding (getting these thresholds wrong means a critical state could render as green)
- `components/ui/Badge.test.tsx` — first component-level render test in the project

This is intentionally minimal — the bulk of this app is presentational (pages that fetch and display data), which is lower-value to unit test than the formatting/threshold logic that determines what color a number turns. E2E coverage (Cypress/Playwright) would catch more real bugs here than expanding unit tests further; that doesn't exist yet.

CI runs the tests and the production build via `/.github/workflows/ci.yml` at the repository root.

## Project layout

```
src/
├── main.tsx / App.tsx      Entry point, router, protected routes
├── index.css                Design tokens (dark/light mode)
├── types/models.ts          All shared TypeScript interfaces
├── lib/                     format.ts, colors.ts — pure functions
├── api/                     http.ts (axios + auth interceptor), endpoints.ts, auth-endpoints.ts
├── hooks/useQuery.ts         Data fetching with auto-refresh
├── store/                   theme.tsx, app.tsx (websocket state), auth.tsx (login, sign-up, tokens)
├── components/
│   ├── layout/               Sidebar, TopBar, AppLayout
│   └── ui/                   16 reusable components, barrel-exported
└── pages/
    ├── auth/LoginPage.tsx
    └── dashboard/ targets/ connections/ queries/ locks/
        tables/ vacuum/ replication/ alerts/ settings/
```

Each page folder holds its own subcomponents (e.g. `pages/queries/ExplainViewer.tsx`) rather than sharing a flat components directory — keeps page-specific UI from leaking into the general-purpose `components/ui` library.

## Known limitations

- No E2E tests yet.
- UI text is in Uzbek; Korean and English are planned.
- The socket connects only after login, but pages do not call `subscribeToTarget` yet, so dashboards refresh by REST polling (`hooks/useQuery.ts`) rather than per-target push.
- No dark-mode-only or accessibility-specific test coverage, though the design system (`index.css`) is built dark-mode-first.
