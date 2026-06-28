# 2dew — To-Do Task Manager

A multi-user to-do app. .NET 10 Web API (Dapper + SQLite) and a React 19 + TypeScript
frontend on Vite. Register, log in, then create, edit inline, complete, search, and archive
your own tasks.

## Tech stack

| Layer    | Choices                                                                                 |
| -------- | --------------------------------------------------------------------------------------- |
| Backend  | .NET 10, ASP.NET Core, Dapper 2.1, Microsoft.Data.Sqlite, JWT bearer auth, OpenAPI on build |
| Frontend | React 19, TypeScript 5.9 (`tsgo`), Vite 8, Vitest                                        |
| Tooling  | `just` task runner, `oxlint` + `oxfmt`, `dotnet format`, `openapi-typescript` for the API contract |

## Quick start

Prerequisites: .NET 10 SDK, Node 20+, pnpm, and optionally
[`just`](https://github.com/casey/just) for the shortcuts below.

On macOS, install them via [Homebrew](https://brew.sh):

```sh
brew bundle      # reads the Brewfile: dotnet, node, pnpm, just
```

Then:

```sh
just setup       # restore backend packages, install frontend deps
just dev         # API on :5088, Vite on :5173, opens the browser
just test        # backend + frontend tests
```

- Frontend: http://localhost:5173
- API: http://localhost:5088

Without `just`:

```sh
cd backend && dotnet run                 # API  :5088
cd frontend && pnpm install && pnpm dev  # Vite :5173  (second terminal)

cd backend.Tests && dotnet test          # backend tests
cd frontend && pnpm test                 # frontend tests
```

The frontend reads its API base URL from `VITE_API_URL` (default `http://localhost:5088`); the
API's allowed origins come from `Cors:AllowedOrigins` in `appsettings.json`. `just reset-db`
deletes `app.db` so the schema is recreated on the next start.

## What's built

- **Auth and ownership.** Register and login return a JWT (24h, stored in `localStorage`). Every
  task endpoint requires it and scopes each query to the caller. A request for another user's task
  returns 404, not 403, so I don't leak whether that id exists.
- **Task CRUD:** create, edit, complete/reopen, delete.
- **Inline editing.** Click a title, note, or due date to edit that field in place; Enter or blur
  saves, Escape cancels. No edit modal.
- **Soft-delete and a completed section.** Completing a task (checkbox) and removing it (trash
  icon) both set `CompletedAt`, and both land in the completed section, where a task can be
  reopened. Items age out of that view after 30 days.
- **Optimistic UI.** Every change renders immediately. New tasks get a temporary id reconciled on
  the server response, and a failed request rolls the row back to its last confirmed state and
  surfaces the error.
- **Keyset pagination and search.** The list pages by a `(CreatedAt, Id)` cursor; a debounced
  search box matches title and description server-side across all of your tasks, not just the
  loaded pages.
- **Due-soon rollup.** A collapsible section shows tasks due within two days or overdue, each with
  a snooze that persists in `localStorage`.
- **Timezone-correct due dates.** Stored and sent as UTC, shown and edited in local time.
- **Completion chime** on complete, plus visible loading, empty, and error states.

## Architecture

- **Backend (`/backend`).** One ASP.NET Core project; controllers run SQL through Dapper. I chose
  Dapper over EF Core because the schema is two tables, so hand-written SQL is less work than an
  ORM here and keeps the indexes and keyset queries under my control. The schema is created at
  startup with `CREATE TABLE IF NOT EXISTS`, so a fresh clone runs with no migration step.
  Ownership scoping (`WHERE UserId = @userId`) and parameterized queries live in each query.
- **Frontend (`/frontend`).** React + TypeScript on Vite. A typed API client and a `useTasks` hook
  hold pagination, search, and the optimistic-mutation logic. No Redux.
- **API contract.** The backend emits an OpenAPI document on build; the frontend generates
  `src/api/schema.ts` from it (`just gen-api`), so the C# and TypeScript types can't drift.

### Layout

```
/backend         ASP.NET Core Web API + Dapper (SQLite)
/backend.Tests   xUnit integration tests
/frontend        React + TypeScript (Vite)
justfile         setup / dev / test / lint
SPEC.md          full feature + API spec
```

### Data model

- **User** — `Id`, `Email` (unique), `PasswordHash` (ASP.NET `PasswordHasher`), `CreatedAt`.
- **Task** — `Id`, `UserId`, `Title` (≤200), `Description?`, `DueDateUtc?`, `CompletedAt?`,
  `CreatedAt`, `UpdatedAt`. `CompletedAt` is the completion/soft-delete marker: null is active,
  non-null is completed or removed, and `IsCompleted` derives from it. Two indexes back the lists:
  `(UserId, CreatedAt, Id)` for the active list and `(UserId, CompletedAt)` for the completed
  section.

### API

All task routes require a JWT and are owner-scoped. Full request/response detail is in `SPEC.md`.

| Method | Route                  | Purpose                                       |
| ------ | ---------------------- | --------------------------------------------- |
| POST   | `/api/auth/register`   | Create account, return JWT                    |
| POST   | `/api/auth/login`      | Authenticate, return JWT                      |
| GET    | `/api/tasks`           | Active tasks (paginated, optional `search`)   |
| GET    | `/api/tasks/completed` | Completed/removed tasks (paginated, TTL-bound)|
| GET    | `/api/tasks/due-soon`  | Active tasks due ≤2 days or overdue (≤50)      |
| GET    | `/api/tasks/{id}`      | One task                                       |
| POST   | `/api/tasks`           | Create                                        |
| PUT    | `/api/tasks/{id}`      | Update; `isCompleted` sets/clears `CompletedAt`|
| DELETE | `/api/tasks/{id}`      | Soft-delete into the completed section         |

## Tests

- **Backend** (xUnit, real API over a throwaway SQLite file): a user can't read, update, or delete
  another user's task (404) and never sees it in their list; empty titles and invalid due dates are
  rejected with 400; unauthenticated requests get 401.
- **Frontend** (Vitest): the optimistic mutations apply immediately and roll back to the last
  confirmed state on failure; the completed and due-soon hooks behave under pagination and snooze.

Run both with `just test`.

---

**Engineering notes — the take-home write-up.** Assumptions, trade-offs, and how I'd take this
from a take-home to production.

## Assumptions

- A user's tasks are private; there's no sharing, so each task has a single owner.
- Email + password is the only identity. No SSO and no email verification yet.
- Per-user task counts are modest (thousands, not millions); pagination and indexes are sized for that.
- Clients are current browsers with JavaScript; the frontend is a SPA, not server-rendered.
- "Delete" means archive, not destroy — the row stays for a 30-day window so it can be reopened.
- The deployment is single-region and the network is trusted enough that I haven't added rate limiting.
- The JWT key in `appsettings.json` and the file-backed SQLite database are development placeholders.

## Trade-offs

- **Dapper over EF Core.** Two tables don't warrant an ORM; I traded migrations and change-tracking
  for direct control of the SQL and indexes. The cost surfaces when the schema grows (see below).
- **SQLite over a server database.** Zero setup, which fits a take-home. It's single-writer, so
  it's the first thing to replace for production.
- **Soft-delete over hard delete.** Easier undo and a completed section, at the cost of rows that
  need a purge job eventually.
- **One 24h JWT, no refresh rotation.** Fewer moving parts; the token can't be revoked before it
  expires.
- **Substring search (`instr`), not full-text.** Fine at this scale, but it can't use an index or
  rank results.
- **Left out:** tags, priorities, categories, sub-tasks, filtering/sorting beyond search, CI/CD, and
  observability. Each is addressed below rather than left as a silent gap.

## With more time (near term)

- A batched, coalescing sync endpoint so rapid inline edits collapse into fewer round-trips.
- Filtering and sorting in the UI, plus tags and priority on the task.
- Refresh-token rotation with short-lived access tokens.
- End-to-end tests (Playwright) over the main flows.

## Development environment

What I'd add to make the project easy to pick up and consistent across machines:

- `docker-compose` to bring up API, frontend, and a database in one command.
- A devcontainer so a new contributor gets the toolchain without installing .NET/Node/pnpm by hand.
- Seed data and a demo login for a populated app on first run.
- Pre-commit/pre-push hooks running lint, format, typecheck, and tests, so local gates match CI.
- A committed `.env.example` and a documented path for local secrets.
- Swagger/Scalar UI served in Development against the existing OpenAPI document.

## Toward a production MVP

What I'd require before calling this production-ready, roughly in order:

1. **Data layer.** Move from SQLite to managed Postgres and adopt a migration tool (EF Core
   migrations or a SQL migration runner) instead of create-if-not-exists.
2. **Secrets and transport.** JWT key and connection string from a secret manager, never committed;
   HTTPS end to end with a redirect and security headers; CORS narrowed to known origins.
3. **Auth hardening.** Refresh-token rotation with short-lived access tokens, password reset, email
   verification, and login throttling/account lockout.
4. **Abuse protection.** Rate limiting on auth and write endpoints.
5. **Operability.** Structured logging, error tracking, request tracing, and `/health` + readiness
   endpoints.
6. **Durability.** Automated backups with periodic restore drills.

How I'd get there: Postgres and migrations first (everything else assumes a real database), then
auth hardening, then logging and health, then the CI/CD and infrastructure below.

## Phased roadmap

- **Phase 1 — Productionize.** The MVP list above: Postgres, secrets, auth hardening, observability,
  CI/CD.
- **Phase 2 — Product depth.** Tags, priorities, filtering/sorting, recurring tasks, reminders and
  notifications, bulk actions.
- **Phase 3 — Scale and collaboration.** Shared lists and teams, real-time sync, an integration and
  API-key surface, a mobile/PWA client, and multi-region if traffic warrants.

## CI/CD

A GitHub Actions pipeline:

- **On pull request:** `oxlint` and `dotnet format --verify-no-changes`, typecheck (`tsgo`), backend
  xUnit and frontend Vitest, a build of both apps, a dependency/secret scan, and a check that the
  generated OpenAPI types match the backend.
- **On merge to main:** build a backend container image and the static frontend bundle, run database
  migrations against the target environment, deploy to staging, then promote to production behind a
  manual gate, with rollback to the previous image.

## Infrastructure

- **Backend** as a container: Fly.io, Render, or Cloud Run for the simple path; container
  orchestration behind a load balancer for the scaled path.
- **Frontend** built to static assets and served from a CDN.
- **Database:** managed Postgres with automated backups.
- **Cross-cutting:** a secrets manager, TLS termination at the ingress/reverse proxy, and
  per-environment configuration (staging, production).

## Scaling

What already scales:

- Auth is a stateless JWT, so the API scales horizontally behind a load balancer with no shared
  session store.
- Reads use keyset pagination and per-user indexes, so list performance holds as a user's task
  count grows.

Where it would bottleneck, and the fix:

- **SQLite's single writer** → Postgres with connection pooling once writes are concurrent across
  instances.
- **Substring search** → Postgres full-text (tsvector/GIN) or a dedicated search service when result
  quality or volume matters.
- **Request-time due-soon/reminders** → a background worker and queue once reminders become push or
  email rather than a polled section.
- **Read-heavy load** → caching and read replicas.
- **Many tenants** → partition task data by user and revisit indexing.
