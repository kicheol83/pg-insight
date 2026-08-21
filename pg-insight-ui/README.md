# PG Insight — frontend

React SPA for [PG Insight](../pg-insight-v2) — real-time PostgreSQL monitoring. Talks to the NestJS backend over REST + WebSocket; requires the backend running (see its README for setup) before this is useful for anything beyond the login screen.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · React Router 6 · Recharts · socket.io-client · Axios · lucide-react

## Running locally

```bash
npm install
npm run dev   # http://localhost:5173, proxies /api and /socket.io to localhost:3000
```

The Vite dev server proxy (`vite.config.ts`) expects the backend on `http://localhost:3000`. On first run there are no users yet — the app redirects to `/login`, where "Birinchi admin yaratish" creates the first account (see backend README's Authentication section).

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

CI runs typecheck + tests + build on every push via `.github/workflows/frontend-ci.yml`.

## Project layout

```
src/
├── main.tsx / App.tsx      Entry point, router, protected routes
├── index.css                Design tokens (dark/light mode)
├── types/models.ts          All shared TypeScript interfaces
├── lib/                     format.ts, colors.ts — pure functions
├── api/                     http.ts (axios + auth interceptor), endpoints.ts, auth-endpoints.ts
├── hooks/useQuery.ts         Data fetching with auto-refresh
├── store/                   theme.tsx, app.tsx (websocket state), auth.tsx
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
- Never run end-to-end against a live backend + real PostgreSQL target in this project's development environment — only against typed mocks and the (also-untested-live) backend. See the backend README's "Known limitations" for the same caveat from that side.
- No dark-mode-only or accessibility-specific test coverage, though the design system (`index.css`) is built dark-mode-first.
