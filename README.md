# CleanOps

CleanOps is a two-application repository. The client and server are self-contained, use separate dependency manifests, and deploy independently from the same Git repository.

## Repository layout

```text
cleaning_management/
├─ client/                    Next.js user interface and browser API client
│  ├─ src/                    pages, components, hooks, local UI utilities
│  ├─ public/                 client assets
│  ├─ .env.local              local client configuration (ignored)
│  ├─ package.json            client-only dependencies and scripts
│  └─ vercel.json             client Vercel configuration
├─ server/                    Hono API, authentication, Drizzle, and database
│  ├─ src/db/                 schema, migrations, seed, database access
│  ├─ src/server/             routes, middleware, services, API implementation
│  ├─ api/                    Vercel serverless adapter
│  ├─ tests/                  server and architecture tests
│  ├─ .env                    local server configuration (ignored)
│  ├─ package.json            server-only dependencies and scripts
│  └─ vercel.json             server Vercel configuration
├─ .github/workflows/         separate client and server CI jobs
├─ .gitignore
└─ README.md
```

There is intentionally no root `package.json`, root lockfile, or shared runtime package. API contracts are defined by the server; the client contains only serializable UI types and HTTP API helpers. The client never imports database, authentication-secret, or server-route implementation.

## Local setup

### 1. Configure the server

```bash
cd server
cp .env.example .env
```

Set a unique `JWT_SECRET` of at least 32 characters in `server/.env`. Keep the local values for `PORT=3000`, `WEB_ORIGIN=http://localhost:3001`, and `DATABASE_URL=file:cleanops.db` unless your local topology differs.

### 2. Configure the client

```bash
cd ../client
cp .env.example .env.local
```

The local client uses the same-origin API proxy:

```env
NEXT_PUBLIC_API_URL=/api
CLEANOPS_API_INTERNAL_URL=http://localhost:3000/api
```

### 3. Install each application separately

```bash
cd ../server && npm ci
cd ../client && npm ci
```

### 4. Initialize local demo data

```bash
cd ../server
npm run db:migrate
npm run db:seed
```

`db:seed` resets the local demo database. Never run it against production data.

### 5. Start both applications

Use two terminals.

```bash
# Terminal 1
cd /d/cleaning_management/server
npm run dev
```

```bash
# Terminal 2
cd /d/cleaning_management/client
npm run dev
```

Open `http://localhost:3001`. Check the server at `http://localhost:3000/api/health`.

## Verification

Run each application’s checks from its own root:

```bash
cd server
npm run lint && npm run typecheck && npm test && npm run build

cd ../client
npm run lint && npm run typecheck && npm test && npm run build
```

## Deployment

Create two Vercel projects connected to this same repository:

- **CleanOps Client** — Root Directory: `client`; Framework: Next.js.
- **CleanOps Server** — Root Directory: `server`; Framework: Other.

Client production variables preserve browser same-origin requests while the Next.js server-side rewrite reaches the API deployment:

```env
NEXT_PUBLIC_API_URL=/api
CLEANOPS_API_INTERNAL_URL=https://<api-project>.vercel.app/api
```

For the deployed CleanOps projects, the internal origin is `https://cleanops-api-neon.vercel.app/api`; browsers call `https://cleanops-app.vercel.app/api/...` through the client proxy.

Server production variables include `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `JWT_SECRET`, optional `OPENROUTER_*`, and exact credentialed CORS values:

```env
WEB_ORIGIN=https://<client-project>.vercel.app
WEB_ORIGINS=https://<client-project>.vercel.app
```

Use an exact origin allowlist; never use `*` with credentialed requests. Keep database tokens, JWT secrets, cron secrets, and provider keys exclusively in the server deployment. For the separate Vercel-domain proxy topology, leave `SESSION_COOKIE_DOMAIN` unset so the client host owns the host-only session cookie.

### Manual production release

Deploy the server first, then the client:

```bash
cd server
npm run db:migrate
npx vercel --prod

cd ../client
npx vercel --prod
```

Run `db:migrate` only with the intended remote database credentials. The migration ledger is idempotent and fails closed if an already-applied migration changes. Never run `db:seed` in production.

### Background work on Vercel Hobby

Vercel Hobby cannot run the five-minute background schedule. The app deploys normally, but automatic triage and session cleanup do not run. If you later add a trusted external scheduler, set `CRON_SECRET` and `SESSION_RETENTION_BATCH=100` in the server project; never call `GET /api/internal/triage` from the browser.

`npm run db:seed` is deliberately restricted to local SQLite (`file:` or `:memory:`) targets and cannot seed a remote database.
