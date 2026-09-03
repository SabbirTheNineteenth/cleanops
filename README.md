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
- [Security hardening](#security-hardening)
- [List queries, pagination and CSV export](#list-queries-pagination-and-csv-export)
- [SLA model](#sla-model)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Available scripts](#available-scripts)
- [Deployment (Vercel + Turso)](#deployment-vercel--turso)

---

## Key features

**Operations dashboard.** Live totals for sites, workers, open incidents, and resolved incidents, an SLA health panel (compliance rate, overdue, due soon, met, breached), a "needs attention now" queue of incidents about to miss their deadline, a 7-day incident trend line, severity and status breakdowns, and a recent-incidents feed with severity color rails. Critical open incidents and pending registrations each surface their own triage banner.

**Incident collaboration.** Every incident carries a comment thread, an automatic activity timeline, and a task checklist. The timeline records creation, AI grading, deadline changes, assignment, severity and status transitions, comments, and checklist progress with actor and timestamp, so an incident reads as a complete audit of itself. Checklist items show a progress bar and can be ticked off by the admin or the assigned worker.

**SLA tracking.** Each incident gets a real response deadline derived from the AI's recommended response window (falling back to a severity-based budget). Lists, detail pages, and the dashboard show live SLA state — on track, due soon, overdue, met, or breached — and the incident list can be filtered by any of those states.

**Reports and CSV export.** A reports page with five views: an overview (trend, severity split, status split, busiest sites), and per-site, per-worker and per-category tally tables with totals, open/resolved counts, high-severity counts, overdue counts, SLA compliance rate and average resolution time. An SLA view lists missed deadlines and at-risk incidents. Every view honours a date range (presets or explicit from/to) and can be exported as CSV; every list page has the same CSV export for its current filter set.

**Notification center.** In-app notifications for assignments, comments, resolutions, approvals, and deadline warnings, with unread filtering, mark-all-read, and a live unread badge in the sidebar.

**Audit trail.** An admin-only log of every privileged action — logins, failed logins and lockouts, registrations, email confirmations, creates, updates, assignments, deletes, password changes, session revocations and CSV exports — each with actor, target, detail, IP, and user agent, filterable by action, entity, actor, and date range.

**Site management.** Create, edit, and delete sites with a name, code, location, and active/inactive status. Each site has a detail page showing its assigned workers and its incident history.

**Worker management.** Maintain a roster of field workers, link them to login accounts, and assign them to the sites they cover.

**Incident lifecycle.** Report an incident against a site, then move it through `open → assigned → in_progress → resolved`. Every incident carries a category, severity, description, reporter, assigned worker, deadline, and resolution note.

**AI incident triage.** On report, each incident is sent to an OpenRouter model that returns a concise summary, a severity rating, a recommended role, a response window, and a suggested first action. If no API key is configured (or the call fails), a local keyword heuristic produces the same fields so the app never blocks.

**AI editor for incident text.** The description field carries an "Enhance with AI" panel with three modes. *Style* rewrites the note in one of six presets (Formal, Short, Detailed, Corporate, Simple, Urgent), *Translate* converts it to English, Bangla, Hindi, or Arabic, and *Fix* corrects only grammar, spelling, and punctuation. The prompt forbids inventing facts, one click restores the original text, and every result is labelled with whether it came from the model or from the local fallback.

**Authentication and RBAC.** JWT sessions in an httpOnly cookie, bcrypt-hashed passwords, and middleware that enforces admin-only routes. Role and account status are re-checked on every request, so bans and role changes take effect immediately on existing sessions.

**Hardened sign-in.** Per-email and per-IP brute-force limits with lockout, non-enumerating error messages, an enforced password policy, failed-login logging, and email confirmation on registration. See [Security hardening](#security-hardening).

**Session and device management.** Every sign-in creates a server-side session row keyed by a token id. The account page lists active devices with IP, user agent, first seen and last seen, and can revoke any one of them or sign out everywhere else. Changing a password revokes every other session.

**Self-registration with admin approval.** New users register from the public page, confirm their email address, and land in a `pending` state with no session issued. Admins see an approval queue on the dashboard and members page; approving an account activates it and automatically provisions a linked worker profile.

**Worker self-service.** When an admin assigns an incident to a worker, it appears on that worker's own dashboard under "My assigned work," where the worker can update status, tick off checklist items, comment, and record work details — scoped so a worker can only touch incidents assigned to them.

**Account controls.** Admins can create users with login credentials, ban and unban accounts, and reject pending registrations. Every user can edit their own name and phone and change their own password.

**Search, filter, sort, paginate everywhere.** Every list endpoint and page shares one query contract: debounced full-text search, typed filters, sortable columns, page size, and CSV export of exactly what is on screen. See [List queries, pagination and CSV export](#list-queries-pagination-and-csv-export).

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
                              ├─ auth middleware (JWT verify + session row + live DB status/role check)
                              ├─ rate limiter (per-email / per-IP windows on auth and AI routes)
                              ├─ route modules (auth, sites, workers, assignments, incidents,
                              │                 collaboration, notifications, reports, audit, stats, users)
                              ├─ shared helpers (list query + CSV, SLA clock, activity/audit/notify, mailer)
                              ├─ AI module (free-model discovery → OpenRouter → heuristic fallback)
                              └─ Drizzle ORM ──► libSQL (local file dev / Turso prod)
```

Authentication is a signed JWT stored in an httpOnly cookie. On each protected request the middleware verifies the token, looks up its session row, and then re-reads the account from the database, so a banned, downgraded, or remotely signed-out user loses access without needing to log out. Admin-only endpoints sit behind an additional `requireAdmin` guard.

Every list endpoint shares one query parser (`src/server/list.ts`), so search, filters, sorting, pagination, and CSV export behave identically across sites, workers, incidents, members, notifications, and the audit log. Every write that matters funnels through `src/server/activity.ts`, which appends the incident timeline event, the audit row, and the in-app notification in the same request — that is why the timeline and audit log are never out of step with the data.


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

The migration step is idempotent — it creates tables if missing and adds newer columns/indexes in place, so it is safe to re-run. To wipe and rebuild the local database from scratch, run `npm run db:reset`.

> `npm run db:seed` clears every table before inserting, and it runs against whatever `DATABASE_URL` is set to. Keep `DATABASE_URL=file:cleanops.db` while seeding locally — pointing it at a Turso URL will erase that database.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | libSQL connection string. Local dev uses `file:cleanops.db`; production uses a Turso URL like `libsql://<db>.turso.io`. |
| `DATABASE_AUTH_TOKEN` | Prod only | Turso auth token. Leave empty for a local file; required for a remote Turso URL. |
| `JWT_SECRET` | Yes | Secret used to sign session tokens. Use a long random string in production. |
| `RESEND_API_KEY` | No | Resend key used to email the registration confirmation link. If empty, the link is printed to the server console instead, so registration still completes locally. |
| `MAIL_FROM` | No | From address for confirmation mail. Defaults to `CleanOps <onboarding@resend.dev>`. |
| `APP_URL` | No | Base URL used to build links inside emails. Falls back to `NEXT_PUBLIC_APP_URL`, then `VERCEL_URL`, then `http://localhost:3000`. |
| `OPENROUTER_API_KEY` | No | OpenRouter API key. If empty, incident analysis uses the local heuristic. |
| `OPENROUTER_MODEL` | No | Optional preferred model id, or a comma-separated preference list. Leave empty and the app auto-selects from OpenRouter's free models. |

See `.env.example` for a ready-to-copy template.

---

## Demo accounts

Loaded by `npm run db:seed`.

| Email | Password | Role | Status | Notes |
|---|---|---|---|---|
| `admin@cleanops.dev` | `admin123` | admin | active | Full control, sees the audit log and approval queue. |
| `user@cleanops.dev` | `user123` | user | active | Reporter account, no worker profile. |
| `maria@cleanops.dev` | `worker123` | user | active | Lead Cleaner, has assigned incidents on her dashboard. |
| `john@cleanops.dev` | `worker123` | user | active | Field Technician with open and resolved work. |
| `priya@cleanops.dev` | `worker123` | user | active | Safety Officer, holds the critical incidents. |
| `tom@cleanops.dev` | `worker123` | user | active | Field Technician. |
| `nadia@cleanops.dev` | `member123` | user | active | Plain member. |
| `leo@cleanops.dev` | `member123` | user | active | Plain member. |
| `bob@cleanops.dev` | `member123` | user | banned | Login is rejected — demonstrates a suspended account. |
| `pat@cleanops.dev` | `member123` | user | pending | Email confirmed but not yet approved — sits in the approval queue. |

> Sign in as the admin and approve Pat to see the flow end to end: the account flips to `active` and a linked worker profile is created automatically. The roster also contains **Grace Okoye**, a worker with no login attached, so the "available / not linked" state is visible too.

The seed also loads 5 sites, 5 workers, 14 incidents spread across every status and severity, comment threads, activity timelines, checklists, 10 notifications, and 15 audit rows. Deadlines are positioned relative to the moment you run the seed, so the SLA panel lands on a realistic mix — roughly 75% compliance with a couple of overdue and due-soon incidents to triage.

---

## Roles and permissions

**Admin** has full control: manage sites and workers, assign workers to sites, report and triage incidents, assign incidents to workers, resolve or delete incidents, approve or reject registrations, create users, and ban or unban accounts.

**User (worker)** can sign in, view the dashboard, report incidents, and update the incidents assigned to them. Users cannot manage other accounts, reassign incidents, or reach admin-only pages and endpoints.

**Pending** accounts (freshly registered, not yet approved) cannot sign in until an admin approves them.

---

## Security hardening

Sign-in and registration are the most attacked surface in an app like this, so they are treated as a subsystem rather than two plain endpoints.

**Password policy.** At least 8 characters with one lowercase letter, one uppercase letter, and one digit, enforced by a single Zod schema shared by register, admin user creation, and password change. The forms show live strength hints derived from the same rules, so the client never disagrees with the server.

**Brute-force limits.** Every attempt is recorded in an `auth_attempts` table and counted inside a sliding window:

| Bucket | Limit | Window | Counts |
|---|---|---|---|
| `loginEmail` | 8 | 15 min | failures only |
| `loginIp` | 25 | 15 min | failures only |
| `register` | 5 | 60 min | every attempt |
| `verify` | 6 | 60 min | every attempt |
| `ai` | 30 | 60 min | every attempt |
| `comment` | 60 | 60 min | every attempt |

Exceeding a limit returns `429` with a retry-after message and writes a `login_locked` audit row. Attempt rows older than 24 hours are pruned opportunistically.

**No account enumeration.** A wrong password and an unknown email both return the same `401 Invalid email or password`, and an unknown email still runs a dummy bcrypt comparison so the response time does not reveal whether the address exists. Registration always answers with the same neutral "check your inbox" message whether or not the email was already taken.

**Email confirmation.** Registration issues a single-use token (24-hour expiry) and mails a confirmation link. Without `RESEND_API_KEY` the link is logged to the server console instead, so the flow still completes locally. Unconfirmed and unapproved accounts get distinct, non-leaking `403` messages and no session.

**Session cookies.** `httpOnly`, `sameSite=lax`, and `secure` in production. The JWT carries a token id that maps to a `sessions` row, so a revoked session dies immediately even though the JWT itself is still unexpired.

**Devices and revocation.** The account page lists every active session with IP, user agent, first seen and last seen, and can revoke one device or sign out everywhere else. Changing a password revokes all other sessions automatically.

**Live authorization.** Role and account status are re-read from the database on every protected request, so bans, role changes, and approvals apply to sessions that are already open.

**Audit trail.** Logins, failed logins, lockouts, registrations, confirmations, creates, updates, assignments, deletes, password changes, session revocations and CSV exports are all written with actor, target, detail, IP, and user agent, readable only by admins.

---

## List queries, pagination and CSV export

Every list endpoint parses its query string through one shared helper, so the contract is identical everywhere — sites, workers, assignments, incidents, comments, members, notifications, and the audit log.

| Parameter | Default | Notes |
|---|---|---|
| `page` | `1` | Clamped to the last available page. |
| `pageSize` | `10` | Maximum `100`. |
| `q` | — | Trimmed to 80 characters, matched against the meaningful text columns of that resource. |
| `sort` | per resource | Ignored unless the column is on that endpoint's allow-list. |
| `dir` | `desc` | `asc` or `desc`. |
| `format=csv` | — | Streams the same filtered rows as a CSV attachment, up to 2000 rows. |

Typed filters sit alongside those: `status`, `severity`, `siteId`, `workerId`, `category`, `sla` on incidents; `active` on sites; `role`, `status`, `linked` on workers and members; `type`, `unread` on notifications; `action`, `entity`, `actorId`, `from`, `to` on the audit log. Unknown values are dropped rather than trusted, so a hand-edited URL cannot widen a query.

Responses use one envelope:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 10, "total": 14, "totalPages": 2,
            "hasPrev": false, "hasNext": true, "sort": "createdAt", "dir": "desc", "q": "" }
}
```

Some endpoints add a sidecar next to `data` — `summary` on incidents and reports, `unread` on notifications, `progress` on checklists — so the header numbers on a page never require a second request.

On the client, one `useList` hook owns this contract: debounced search (350 ms), filter state, sortable headers, pagination, and an `exportUrl` that mirrors the current filters. That is why the CSV a page downloads always matches exactly what is on screen, including the search term.

Report views take a date range instead of a page — either a preset day count or explicit `from`/`to` dates (max 365 days) — and each of the five views has its own CSV export.

---

## SLA model

Each incident gets a real response deadline at creation time. The AI's recommended response window is preferred; if it is missing or unrecognised, the severity budget is used.

| Response window | Budget | | Severity | Fallback budget |
|---|---|---|---|---|
| immediate | 30 min | | critical | 1 hour |
| within 1 hour | 1 hour | | high | 4 hours |
| same day | 8 hours | | medium | 24 hours |
| next scheduled visit | 48 hours | | low | 72 hours |

`dueAt = createdAt + budget`. From there a single function derives the live state used by the list badge, the detail page, the dashboard panel, and the reports:

| State | Meaning |
|---|---|
| `on_track` | Open, with more than a quarter of the budget left. |
| `due_soon` | Open, inside the last 25% of the budget (never less than a 15-minute warning). |
| `overdue` | Open and past the deadline. |
| `met` | Resolved on or before the deadline. |
| `breached` | Resolved after the deadline. |

Compliance rate is `met / (met + breached)`, shown on the dashboard with a colour band at 90% and 70%. Changing a deadline writes a `due` event to the incident timeline, so the history shows who moved it and when.

---

## API reference

Every route is served under `/api`. Only register, verify, login and logout are reachable without a session cookie; everything else requires `requireAuth`, and routes marked **admin** additionally pass `requireAdmin`. All list endpoints accept the query contract described above.

### Auth and account

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Register an account (created pending, email token issued, no session). |
| POST | `/auth/verify` | public | Confirm an email address with the token from the link. |
| POST | `/auth/verify/resend` | public | Re-issue a confirmation link. |
| POST | `/auth/login` | public | Sign in — rate limited, starts a session row, sets the cookie. |
| POST | `/auth/logout` | public | Clear the cookie and close the current session. |
| GET | `/auth/me` | auth | Current account plus its linked worker profile. |
| GET | `/auth/sessions` | auth | Active devices with IP, user agent, first and last seen. |
| DELETE | `/auth/sessions/:id` | auth | Revoke one device. |
| POST | `/auth/sessions/revoke-others` | auth | Sign out everywhere except here. |
| POST | `/auth/password` | auth | Change password (revokes every other session). |
| PATCH | `/auth/profile` | auth | Update own name and phone. |

### Sites, workers and assignments

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/sites` | auth | List sites — search, `active` filter, sort, paginate, CSV. |
| GET | `/sites/:id` | auth | Site detail with its workers and incident history. |
| POST | `/sites` | admin | Create a site. |
| PATCH | `/sites/:id` | admin | Update a site. |
| DELETE | `/sites/:id` | admin | Delete a site. |
| GET | `/workers` | auth | List workers — search, `role`/`status`/`linked` filters, CSV. |
| GET | `/workers/roles` | auth | Distinct roles, for filter dropdowns. |
| GET | `/workers/:id` | auth | Worker detail with sites and assigned incidents. |
| POST | `/workers` | admin | Create a worker. |
| PATCH | `/workers/:id` | admin | Update a worker. |
| DELETE | `/workers/:id` | admin | Delete a worker. |
| GET | `/assignments` | auth | List worker–site assignments. |
| POST | `/assignments` | admin | Assign a worker to a site. |
| DELETE | `/assignments/:id` | admin | Remove an assignment. |

### Incidents

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/incidents` | auth | List incidents — search plus `status`, `severity`, `sla`, `siteId`, `workerId`, `category` filters, CSV. |
| GET | `/incidents/mine` | auth | Incidents assigned to the signed-in worker. |
| GET | `/incidents/meta` | auth | Categories, sites and workers for the filter dropdowns. |
| GET | `/incidents/:id` | auth | Incident detail with SLA state and AI fields. |
| POST | `/incidents` | auth | Report an incident — runs AI triage, sets the deadline, notifies admins. |
| POST | `/incidents/enhance` | auth | AI editor for incident text — restyle, translate, or fix grammar. |
| POST | `/incidents/:id/analyze` | admin | Re-run AI analysis. |
| PATCH | `/incidents/:id` | admin | Assign, change status or severity, move the deadline, resolve. |
| PATCH | `/incidents/:id/work` | auth | Assigned worker updates status and work details. |
| DELETE | `/incidents/:id` | admin | Delete an incident. |

### Incident collaboration

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/incidents/:id/comments` | auth | Paginated comment thread. |
| POST | `/incidents/:id/comments` | auth | Add a comment (rate limited, notifies the other party). |
| DELETE | `/incidents/:id/comments/:commentId` | auth | Delete own comment, or any comment as admin. |
| GET | `/incidents/:id/events` | auth | Activity timeline for the incident. |
| GET | `/incidents/:id/tasks` | auth | Checklist with a progress sidecar. |
| POST | `/incidents/:id/tasks` | auth | Add a checklist item. |
| PATCH | `/incidents/:id/tasks/:taskId` | auth | Tick, untick, or rename an item. |
| DELETE | `/incidents/:id/tasks/:taskId` | auth | Remove an item. |

### Notifications, reports, audit and stats

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/notifications` | auth | Own notifications — `type` and `unread` filters, unread sidecar. |
| GET | `/notifications/unread-count` | auth | Badge count for the sidebar. |
| POST | `/notifications/read` | auth | Mark one or all as read. |
| DELETE | `/notifications/read` | auth | Clear read notifications. |
| DELETE | `/notifications/:id` | auth | Delete one notification. |
| GET | `/reports/overview` | auth | Trend, severity split, status split, busiest sites for a date range. |
| GET | `/reports/sites` | auth | Per-site tallies with SLA compliance and average resolution time. |
| GET | `/reports/workers` | auth | Per-worker tallies. |
| GET | `/reports/categories` | auth | Per-category tallies. |
| GET | `/reports/sla` | auth | Missed deadlines and at-risk incidents. |
| GET | `/audit` | admin | Audit log — `action`, `entity`, `actorId`, date range, CSV. |
| GET | `/audit/meta` | admin | Distinct actions, entities and actors for filters. |
| GET | `/stats` | auth | Dashboard totals, SLA health, trend, attention queue, recent incidents. |
| GET | `/health` | public | Liveness probe. |

### Members (admin)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users` | admin | List accounts — search, `role`/`status` filters, CSV. |
| POST | `/users` | admin | Create an account with credentials. |
| PATCH | `/users/:id` | admin | Approve, ban, unban, or change role. |
| DELETE | `/users/:id` | admin | Reject or remove an account. |


---

## Project structure

```
src/
├─ app/
│  ├─ (app)/            Authenticated pages: dashboard, incidents (+ detail), sites (+ detail),
│  │                    workers, members, reports, notifications, audit, account
│  ├─ api/[[...route]]/ Hono app mounted into Next.js
│  ├─ login/            Public sign-in / registration
│  ├─ verify/           Email confirmation landing page
│  ├─ layout.tsx        Root layout and fonts
│  └─ globals.css       Tailwind layers and base styles
├─ components/
│  ├─ admin/            Site, user, and assignment modals
│  ├─ ai/               AIEditor (restyle / translate / fix)
│  ├─ incident/         CommentThread, Timeline, Checklist
│  ├─ worker/           MyWork (worker self-service)
│  ├─ ui.tsx            Shared primitives (Card, Button, badges, SlaBadge, Tone, …)
│  ├─ list.tsx          ListToolbar, FilterSelect, SortHeader, Pagination, TableShell
│  ├─ PasswordHints.tsx Live password policy feedback
│  ├─ Sidebar.tsx       Navigation rail with the unread badge
│  ├─ PageHeader.tsx
│  └─ Modal.tsx
├─ db/
│  ├─ schema.ts         Drizzle schema (14 tables)
│  ├─ index.ts          Database connection
│  ├─ migrate.ts        Idempotent migrations
│  └─ seed.ts           Demo data
├─ lib/                 auth, session, validation, sla, time, api client, useList, useSession
└─ server/
   ├─ app.ts            Hono app assembly
   ├─ middleware.ts     requireAuth / requireAdmin
   ├─ query.ts          Shared list query parser and meta builder
   ├─ csv.ts            CSV serialisation for exports
   ├─ sessions.ts       Session rows, revocation, device list
   ├─ ratelimit.ts      Sliding-window attempt limits
   ├─ tokens.ts         Single-use email tokens
   ├─ mailer.ts         Resend delivery with console fallback
   ├─ activity.ts       Timeline events, audit rows, notifications
   ├─ ai.ts             OpenRouter + heuristic fallback
   └─ routes/           auth, sites, workers, assignments, incidents, collab,
                        notifications, reports, audit, stats, users
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
| `npm run db:generate` | Generate Drizzle SQL artifacts from the schema. |
| `npm run db:migrate` | Create/upgrade the database schema. Idempotent, safe to re-run. |
| `npm run db:seed` | Load demo data. **Deletes every existing row first** — it always targets whatever `DATABASE_URL` points at. |
| `npm run db:reset` | Delete the local `cleanops.db` file, migrate, and re-seed. |

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
   - `APP_URL` = your deployed URL, so confirmation links point at production
   - `RESEND_API_KEY` / `MAIL_FROM` (optional — without a key, confirmation links only appear in the server logs)
   - `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (optional)

3. Provision the schema and demo data against Turso (run locally with the production env vars exported):

   ```bash
   DATABASE_URL="libsql://…turso.io" DATABASE_AUTH_TOKEN="…" npm run db:migrate
   DATABASE_URL="libsql://…turso.io" DATABASE_AUTH_TOKEN="…" npm run db:seed
   ```

   The migrate step is safe to re-run at any time. The seed step is not additive — it truncates every table first, so only run it on a database you are happy to reset, and skip it once the deployment holds real data.

4. Deploy. Because the middleware reads the account from the database on every protected request, make sure the Turso database has been migrated before the first login — otherwise authentication returns a 500.
