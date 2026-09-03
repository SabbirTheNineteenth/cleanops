# CleanOps — Operations Incident Management System

CleanOps is a full-stack web application for facilities and cleaning operations teams to manage sites, workers, and field incidents in one place. Supervisors report incidents, an AI assistant summarizes them and recommends a severity and next action, admins assign the right worker, and that worker updates the job through resolution — all tracked on a live operations dashboard.

Built as a single Next.js application with a Hono API layer, a typed libSQL/SQLite database via Drizzle ORM (a local file in development, Turso in production), JWT-based authentication with role-based access control, and an OpenRouter AI integration that degrades gracefully to a local heuristic when no API key is present.

---

## Table of contents

- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Demo accounts](#demo-accounts)
- [Roles and permissions](#roles-and-permissions)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Available scripts](#available-scripts)

---

## Key features

**Operations dashboard.** Live totals for sites, workers, open incidents, and resolved incidents, a 7-day incident trend line, severity and status breakdowns, and a recent-incidents feed with severity color rails. Critical open incidents surface a dedicated triage banner.

**Site management.** Create, edit, and delete sites with a name, code, location, and active/inactive status.

**Worker management.** Maintain a roster of field workers and assign them to the sites they cover.

**Incident lifecycle.** Report an incident against a site, then move it through `open → assigned → in_progress → resolved`. Every incident carries a category, severity, description, reporter, assigned worker, and resolution note.

**AI incident triage.** On report, each incident is sent to an OpenRouter model that returns a concise summary, a severity rating, and a suggested first action. If no API key is configured (or the call fails), a local keyword heuristic produces the same fields so the app never blocks.

**AI editor for incident text.** The description field carries an "Enhance with AI" panel with three modes. *Style* rewrites the note in one of six presets (Formal, Short, Detailed, Corporate, Simple, Urgent), *Translate* converts it to English, Bangla, Hindi, or Arabic, and *Fix* corrects only grammar, spelling, and punctuation. The prompt forbids inventing facts, one click restores the original text, and every result is labelled with whether it came from the model or from the local fallback.

**Authentication and RBAC.** JWT sessions in an httpOnly cookie, bcrypt-hashed passwords, and middleware that enforces admin-only routes. Role and account status are re-checked on every request, so bans and role changes take effect immediately on existing sessions.

**Self-registration with admin approval.** New users register from the public page and land in a `pending` state with no session issued. Admins see an approval queue on the dashboard and members page; approving an account activates it and automatically provisions a linked worker profile.

**Worker self-service.** When an admin assigns an incident to a worker, it appears on that worker's own dashboard under "My assigned work," where the worker can update status and record work details — scoped so a worker can only touch incidents assigned to them.

**Account controls.** Admins can create users with login credentials, ban and unban accounts, and reject pending registrations.

**No pinned AI model.** Nothing is hard-coded to one model id. The server fetches OpenRouter's catalogue, keeps only genuinely free text-chat models, ranks them, and tries them in order until one returns a usable answer — falling back to a built-in seed list if the catalogue is unreachable and to the local heuristic if every attempt fails. `OPENROUTER_MODEL` is optional and acts as a preference list, not a lock.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| API | Hono, mounted inside the Next.js route handler |
| Database | libSQL / SQLite via Drizzle ORM (`@libsql/client`) — local file in dev, Turso in production |
| Auth | jose (JWT / HS256), bcryptjs, httpOnly cookies |
| Validation | Zod |
| UI | Tailwind CSS, lucide-react icons, Recharts |
| AI | OpenRouter chat completions (auto-selected free models), with a local heuristic fallback |

---

## Architecture

CleanOps runs as one deployable Next.js app. The browser talks to React client components, which call a single Hono application mounted at `src/app/api/[[...route]]/route.ts` through the `hono/vercel` adapter. Hono owns routing, validation, auth middleware, and all database access via Drizzle.

```
Browser (React client components)
        │  fetch /api/*  (httpOnly JWT cookie)
        ▼
Next.js route handler  ──►  Hono app
                              ├─ auth middleware (JWT verify + live DB status/role check)
                              ├─ route modules (auth, sites, workers, assignments, incidents, users, stats)
                              ├─ AI module (free-model discovery → OpenRouter → heuristic fallback)
                              └─ Drizzle ORM ──► libSQL (local file dev / Turso prod)
```

Authentication is a signed JWT stored in an httpOnly cookie. On each protected request the middleware verifies the token and then re-reads the account from the database, so a banned or downgraded user loses access without needing to log out. Admin-only endpoints sit behind an additional `requireAdmin` guard.

Workers and user accounts are linked one-to-one: a worker row carries an optional `userId` pointing at the account that logs in as that worker. Approving a `user` account provisions or links its worker profile, which is how "the person who registered becomes a worker" is realized without disturbing the incident and assignment foreign keys.

---

## Getting started

Prerequisites: Node.js 20+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# then edit .env — at minimum set a JWT_SECRET

# 3. Create the database schema and load demo data
npm run db:migrate
npm run db:seed

# 4. Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`. Sign in with one of the [demo accounts](#demo-accounts).

The migration step is idempotent — it creates tables if missing and adds newer columns/indexes in place, so it is safe to re-run. To wipe and rebuild the database from scratch, run `npm run db:reset`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | libSQL connection string. Local dev uses `file:cleanops.db`; production uses a Turso URL like `libsql://<db>.turso.io`. |
| `DATABASE_AUTH_TOKEN` | Prod only | Turso auth token. Leave empty for a local file; required for a remote Turso URL. |
| `JWT_SECRET` | Yes | Secret used to sign session tokens. Use a long random string in production. |
| `OPENROUTER_API_KEY` | No | OpenRouter API key. If empty, incident analysis uses the local heuristic. |
| `OPENROUTER_MODEL` | No | Optional preferred model id, or a comma-separated preference list. Leave empty and the app auto-selects from OpenRouter's free models. |

See `.env.example` for a ready-to-copy template.

---

## Demo accounts

Loaded by `npm run db:seed`.

| Email | Password | Role | Status |
|---|---|---|---|
| `admin@cleanops.dev` | `admin123` | admin | active |
| `user@cleanops.dev` | `user123` | user | active |
| `nadia@cleanops.dev` | `member123` | user | active |
| `leo@cleanops.dev` | `member123` | user | active |
| `bob@cleanops.dev` | `member123` | user | banned |
| `pat@cleanops.dev` | `member123` | user | pending |

> `bob@cleanops.dev` demonstrates a banned account (login is rejected) and `pat@cleanops.dev` demonstrates the approval queue — sign in as the admin to approve Pat, which activates the account and creates a linked worker.

---

## Roles and permissions

**Admin** has full control: manage sites and workers, assign workers to sites, report and triage incidents, assign incidents to workers, resolve or delete incidents, approve or reject registrations, create users, and ban or unban accounts.

**User (worker)** can sign in, view the dashboard, report incidents, and update the incidents assigned to them. Users cannot manage other accounts, reassign incidents, or reach admin-only pages and endpoints.

**Pending** accounts (freshly registered, not yet approved) cannot sign in until an admin approves them.

---

## API reference

All routes are served under `/api`. Every route except register and login requires a valid session cookie; routes marked **admin** additionally require the admin role.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Register a new account (created as pending; no session issued). |
| POST | `/auth/login` | public | Sign in and receive a session cookie. |
| POST | `/auth/logout` | auth | Clear the session. |
| GET | `/auth/me` | auth | Current account. |
| GET | `/stats` | auth | Dashboard totals, trend, and recent incidents. |
| GET | `/sites` | auth | List sites. |
| POST | `/sites` | admin | Create a site. |
| PATCH | `/sites/:id` | admin | Update a site. |
| DELETE | `/sites/:id` | admin | Delete a site. |
| GET | `/workers` | auth | List workers. |
| POST | `/workers` | admin | Create a worker. |
| PATCH | `/workers/:id` | admin | Update a worker. |
| DELETE | `/workers/:id` | admin | Delete a worker. |
| GET | `/assignments` | auth | List worker–site assignments. |
| POST | `/assignments` | admin | Assign a worker to a site. |
| DELETE | `/assignments/:id` | admin | Remove an assignment. |
| GET | `/incidents` | auth | List incidents (filter by `status`, `severity`, `siteId`). |
| GET | `/incidents/mine` | auth | Incidents assigned to the signed-in worker. |
| GET | `/incidents/:id` | auth | Incident detail. |
| POST | `/incidents` | auth | Report an incident (runs AI analysis). |
| POST | `/incidents/enhance` | auth | AI editor for incident text — restyle, translate, or fix grammar. |
| POST | `/incidents/:id/analyze` | admin | Re-run AI analysis. |
| PATCH | `/incidents/:id` | admin | Assign, change status/severity, or resolve. |
| PATCH | `/incidents/:id/work` | auth | Assigned worker updates status and work details. |
| DELETE | `/incidents/:id` | admin | Delete an incident. |
| GET | `/users` | admin | List accounts. |
| POST | `/users` | admin | Create an account with credentials. |
| PATCH | `/users/:id` | admin | Approve, ban, or unban an account. |
| DELETE | `/users/:id` | admin | Reject or remove an account. |

---

## Project structure

```
src/
├─ app/
│  ├─ (app)/            Authenticated pages: dashboard, sites, workers, incidents, members
│  ├─ api/[[...route]]/ Hono app mounted into Next.js
│  ├─ login/            Public sign-in / registration
│  ├─ layout.tsx        Root layout and fonts
│  └─ globals.css       Tailwind layers and base styles
├─ components/
│  ├─ admin/            Site, user, and assignment modals
│  ├─ worker/           MyWork (worker self-service)
│  ├─ ui.tsx            Shared primitives (Card, Button, badges, etc.)
│  ├─ Sidebar.tsx       Navigation rail
│  ├─ PageHeader.tsx
│  └─ Modal.tsx
├─ db/
│  ├─ schema.ts         Drizzle schema
│  ├─ index.ts          Database connection
│  ├─ migrate.ts        Idempotent migrations
│  └─ seed.ts           Demo data
├─ lib/                 Auth, session, validation, API client, hooks
└─ server/
   ├─ app.ts            Hono app assembly
   ├─ middleware.ts     requireAuth / requireAdmin
   ├─ ai.ts             OpenRouter + heuristic fallback
   └─ routes/           auth, sites, workers, assignments, incidents, users, stats
```

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the development server. |
| `npm run build` | Production build. |
| `npm start` | Run the production build. |
| `npm run lint` | Lint the project. |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm run db:migrate` | Create/upgrade the database schema. |
| `npm run db:seed` | Load demo data. |
| `npm run db:reset` | Delete the database, migrate, and re-seed. |

---

## Deployment (Vercel + Turso)

Vercel's serverless runtime has an ephemeral, read-only filesystem, so a local SQLite file cannot be used in production. CleanOps uses [Turso](https://turso.tech) (hosted libSQL) as the production database; the same Drizzle code runs against a local file in development.

1. Create a Turso database and generate an auth token:

   ```bash
   turso db create cleanops
   turso db show cleanops --url        # → libsql://cleanops-<org>.turso.io
   turso db tokens create cleanops     # → the auth token
   ```

2. In the Vercel project settings, add the environment variables:

   - `DATABASE_URL` = the `libsql://…turso.io` URL
   - `DATABASE_AUTH_TOKEN` = the Turso token
   - `JWT_SECRET` = a long random string
   - `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (optional)

3. Provision the schema and demo data against Turso (run locally with the production env vars exported):

   ```bash
   DATABASE_URL="libsql://…turso.io" DATABASE_AUTH_TOKEN="…" npm run db:migrate
   DATABASE_URL="libsql://…turso.io" DATABASE_AUTH_TOKEN="…" npm run db:seed
   ```

4. Deploy. Because the middleware reads the account from the database on every protected request, make sure the Turso database has been migrated before the first login — otherwise authentication returns a 500.
