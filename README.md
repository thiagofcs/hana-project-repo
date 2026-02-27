# HANA Project

A monorepo connecting **Next.js** (frontend) + **NestJS** (backend) + **SAP HANA** (database).

## Project Structure

```
hana-project/
├── frontend/              # Next.js 14 app (App Router)
│   └── src/
│       ├── app/           # Pages & layouts
│       ├── components/    # React components
│       └── lib/           # API helpers & utilities
├── backend/               # NestJS app
│   └── src/
│       ├── database/      # HANA connection service (global)
│       └── hana/          # HANA routes (controller + service)
├── .env.example           # Environment variable template
└── package.json           # Root (concurrently runner)
```

## Setup

### 1. Install all dependencies

Run these three installs — root (for `concurrently`), then each app:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` with your SAP HANA credentials:
```
HANA_HOST=your-host.hanacloud.ondemand.com
HANA_PORT=443
HANA_USER=your_username
HANA_PASSWORD=your_password
HANA_DATABASE=your_schema
```

### 3. Run in development
```bash
npm run dev
```
- Frontend: http://localhost:3000
- Backend:  http://localhost:3001
- Swagger:  http://localhost:3001/api/docs

> **Note:** If you prefer to run each app separately:
> ```bash
> # Terminal 1
> cd backend && npm run start:dev
>
> # Terminal 2
> cd frontend && npm run dev
> ```

## API Endpoints

| Method | Endpoint          | Description                      |
|--------|-------------------|----------------------------------|
| GET    | /api/hana/health  | Database connection health check |

## Adding New Features

- **New DB queries**: Add methods to `backend/src/hana/hana.service.ts`
- **New endpoints**: Add routes to `backend/src/hana/hana.controller.ts`
- **New modules**: Create a NestJS module under `backend/src/` and import it in `app.module.ts`
- **New pages**: Add under `frontend/src/app/`
- **New API calls**: Add to `frontend/src/lib/api.ts`

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, TypeScript
- **Backend**: NestJS 10, TypeScript, Swagger (OpenAPI)
- **Database**: SAP HANA (`@sap/hana-client`)
