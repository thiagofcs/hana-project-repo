# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (from repo root)
```bash
npm run dev              # start both frontend and backend concurrently
npm run dev:backend      # backend only (NestJS watch mode)
npm run dev:frontend     # frontend only (Next.js dev server)
npm run build            # production build for both
npm run install:all      # install root + backend + frontend dependencies
```

### Per-service
```bash
# Backend
cd backend && npm run start:dev      # hot-reload dev server
cd backend && npm run start:debug    # debug mode
cd backend && npm run build          # compile TypeScript
cd backend && npm run lint           # ESLint with auto-fix

# Frontend
cd frontend && npm run dev           # Next.js dev server
cd frontend && npm run build         # production build
cd frontend && npm run lint          # Next.js ESLint
```

### Docker
```bash
docker compose up --build            # build and start both services
```

## Service URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Swagger: http://localhost:3001/api/docs

## Architecture

This is a monorepo of three layers: **Next.js frontend → NestJS backend → SAP HANA database**.

### Authentication & Session Model
Login creates a **per-user HANA connection pool** stored in an in-memory `Map<token, SessionEntry>` in `AuthService`. The token is a 32-byte random hex string returned on login.

- **Backend**: All `/api/hana/*` routes are protected by `SessionGuard` (`backend/src/auth/session.guard.ts`), which reads the `x-session-token` request header and attaches the session to `req.session`. The `@SessionPool()` param decorator then extracts the pool from the session — every `HanaService` method receives `pool` as its first argument.
- **Frontend**: Login stores `{ token, user, host, port }` in `localStorage` as `hana_session` and sets a `hana_token` cookie. The Next.js edge middleware (`frontend/src/middleware.ts`) reads the cookie to protect routes (localStorage is unavailable in edge runtime). `getAuthHeaders()` in `api.ts` reads localStorage to inject `x-session-token` into API calls.

### Adding New Backend Endpoints
1. Add a method to `HanaService` — signature: `async myMethod(pool: hana.ConnectionPool, ...): Promise<T>`
2. Use `this.runQuery<T>(pool, sql, params)` for queries; wrap with `withRetry` for transient network errors
3. Add a controller method in `HanaController` — annotate with `@SessionPool() pool`, `@UseGuards(SessionGuard)` is already applied at class level
4. `HanaModule` already imports `AuthModule`; no other imports needed

### Adding New NestJS Modules
- Create the module under `backend/src/`
- Import `AuthModule` in the new module to get access to `SessionGuard`
- Register the new module in `AppModule`

### Adding New Frontend API Calls
- Add functions to `frontend/src/lib/api.ts`; use `getAuthHeaders()` and `fetchWithTimeout()` helpers
- Add new pages under `frontend/src/app/` following Next.js App Router conventions

### HANA Connection Pool Parameters
```ts
// Connection params
encrypt: true, sslValidateCertificate: false,
communicationTimeout: 0, connectTimeout: 30000

// Pool options
min: 1, max: 10, maxWaitingRequests: 50,
requestTimeout: 30000, checkConnectTimeout: 10000
```

### SQL Safety
`HanaService` uses two patterns to prevent injection:
- View names validated against `SAFE_VIEW_PATTERN` (`"schema"."pkg/VIEW"` format only)
- Column names validated against `SAFE_COLUMN_PATTERN` (`[A-Za-z0-9_\-./]` only)
- All filter values passed as parameterized query `?` placeholders — never interpolated

### Key Files
| File | Purpose |
|------|---------|
| `backend/src/auth/auth.service.ts` | In-memory session Map; `login` creates pool, validates credentials, stores session |
| `backend/src/auth/session.guard.ts` | `SessionGuard` + `@SessionPool()` decorator |
| `backend/src/database/pool.utils.ts` | `withPoolConnection`, `withRetry` helpers |
| `backend/src/hana/hana.service.ts` | All HANA queries; no injected DB service — pool passed as param |
| `frontend/src/context/AuthContext.tsx` | React session state; wraps app |
| `frontend/src/lib/api.ts` | All backend API calls; `getAuthHeaders()`, `fetchWithTimeout()` |
| `frontend/src/lib/auth.ts` | `apiLogin`, `apiLogout` — manages localStorage + cookie |
| `frontend/src/middleware.ts` | Edge middleware; redirects to `/login` if `hana_token` cookie absent |
