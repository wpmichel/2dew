# 2dew - To-Do Task Manager

A multi-user to-do app. .NET 10 Web API (Dapper + SQLite) and a React 19 + TypeScript
frontend on Vite. Register, log in, then create, edit inline, complete, search, and archive
your own tasks.

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

To populate the app with sample data (requires the API to be running). Defaults to seed@example.com, password123

```sh
just seed        # 50 active + 20 completed tasks, including overdue and due-soon entries
# or: python3 scripts/seed.py
```

## What's built

- **Auth and ownership.** Register (email + password ≥ 8 chars) and login return a JWT (24h,
  stored in `localStorage`). Every task endpoint requires it and scopes each query to the caller.
  A request for another user's task returns 404.
- **Task CRUD:** create, edit, complete/reopen, delete.
- **Inline editing.** Click a title, note, or due date to edit that field in place; Enter or blur
  saves, Escape cancels. No edit modal.
- **Completed section.** Checking a task moves it to the completed section (sets `CompletedAt`),
  where it can be reopened. Items age out after 30 days. The trash icon soft-deletes a task (stamps
  `DeletedAt`); it is hidden from every view, including the completed section.
- **Optimistic UI.** Every change renders immediately. New tasks get a temporary id reconciled on
  the server response, and a failed request rolls the row back to its last confirmed state and
  surfaces the error.
- **Keyset pagination and search.** The list pages by a `(CreatedAt, Id)` cursor; a debounced
  search box matches title and description server-side across all of a user's tasks
- **Due-soon rollup.** A collapsible section shows tasks due within two days or overdue, each with
  a snooze that persists in `localStorage`.
- **Timezone-correct due dates.** Stored and sent as UTC, shown and edited in local time.
- **Completion chime** on complete, plus visible loading, empty, and error states.

### Data model

- **User** - `Id`, `Email` (unique), `PasswordHash` (ASP.NET `PasswordHasher`), `CreatedAt`.
- **Task** - `Id`, `UserId`, `Title` (≤200), `Description?`, `DueDateUtc?`, `CompletedAt?`,
  `DeletedAt?`, `CreatedAt`, `UpdatedAt`. `CompletedAt` marks completion: null is active, non-null
  is completed. `DeletedAt` is a soft-delete marker: null is live, non-null means the row is
  retained but filtered out of every read query (so a deleted task never resurfaces - not even as
  completed). The schema bootstrap adds the column to existing DBs idempotently.
- **Indexes**
  `(UserId, CreatedAt, Id)` for the active list, `(UserId, CompletedAt)` for the completed
  section, and `(UserId, DeletedAt)` backing the soft-delete filter.

### API

All task routes require a JWT and are owner-scoped. Full request/response detail is in `SPEC.md`.

| Method | Route                  | Purpose                                         |
| ------ | ---------------------- | ----------------------------------------------- |
| POST   | `/api/auth/register`   | Create account, return JWT                      |
| POST   | `/api/auth/login`      | Authenticate, return JWT                        |
| GET    | `/api/tasks`           | Active tasks (paginated, optional `search`)     |
| GET    | `/api/tasks/completed` | Completed tasks (paginated, TTL-bound)          |
| GET    | `/api/tasks/due-soon`  | Active tasks due ≤2 days or overdue (≤50)       |
| GET    | `/api/tasks/{id}`      | One task                                        |
| POST   | `/api/tasks`           | Create                                          |
| PUT    | `/api/tasks/{id}`      | Update; `isCompleted` sets/clears `CompletedAt` |
| DELETE | `/api/tasks/{id}`      | Soft-delete; hidden from every view, row kept   |

---

**Notes** Assumptions, trade-offs, and how I'd take this
from a take-home to production.

## Assumptions

- A user's tasks are private; there's no sharing, so each task has a single owner.
- Per-user task counts are modest. On the order of thousands.
- Users live in the US.

## Trade-offs

- **Dapper over EF Core.** Two tables don't warrant an ORM; I traded migrations and change-tracking
  for direct control of the SQL and indexes. The cost surfaces when the schema grows (see below).
- **SQLite over a server database.** Zero setup, which fits a take-home. It's single-writer, so
  it's the first thing to replace for production.
- Both completion and deletion are soft state. Completing a task stamps `CompletedAt` and keeps
  the row reopenable; the trash icon stamps `DeletedAt` and the row is retained but filtered out of
  every view. Nothing is physically removed at request time, so deleted and aged-out completed
  rows accumulate until a cleanup job reclaims them.
- One 24h JWT, no refresh rotation. Fewer moving parts; the token can't be revoked before it
  expires.
- Substring search. Fine at this scale, but it can't use an index or
  rank results.
- Left out: tags, priorities, categories, sub-tasks, filtering/sorting beyond search, CI/CD, and
  observability.

## With more time

- case-insensitive email handling.
- Cleanup job for deleted and completed tasks.
- Filtering and sorting in the UI, plus tags and priority on the task.
- Refresh-token rotation with short-lived access tokens.
- End-to-end tests (Playwright) over the main flows.
- Sharing tasks between users
- Lists

## Development environment

What I'd add to make the project easy to pick up and consistent across machines:

- Containerize: `docker-compose` to bring up API, frontend, and a database in one command.
- A devcontainer (or environment tooling like Nix) so a new contributor gets the toolchain without installing .NET/Node/pnpm by hand.
- Pre-commit/pre-push hooks running lint, format, typecheck, and tests, so local gates match CI.
- A committed `.env.example` and a documented path for local secrets.
- Swagger/Scalar UI served in Development against the existing OpenAPI document.

## Toward a production MVP

What I'd require before calling this production-ready, roughly in order:

1. **Data layer.** Move from SQLite to managed Postgres and adopt a migration tool
2. Containerization
3. **Secrets and transport.** JWT key and connection string from a secret manager, never committed;
   HTTPS; CORS narrowed to known origins.
4. **Auth hardening.** Refresh-token rotation with short-lived access tokens, password reset, email
   verification, and login throttling/account lockout.
5. **Abuse protection.** Rate limiting on auth and write endpoints.
6. **Operability.** Add Datadog / OTEL + structured logging, error tracking, request tracing, and `/health` + readiness
   endpoints.
7. **Durability.** Automated backups

- **Phase 1 - Productionize.** Postgres, secrets, auth hardening, observability,
  CI/CD.
- **Phase 2 - Product depth.** Tags, priorities, filtering/sorting, recurring tasks, reminders and
  notifications, bulk actions.
- **Phase 3 - Scale and collaboration.** Shared lists and teams, real-time sync, an integration and
  API-key surface, a mobile/PWA client, and multi-region if traffic warrants.

## Infrastructure

- **Backend** To start, containerized serverless with built in load balancing (Fargate / Cloud Run / Containerized apps)
- **Frontend** built to static assets and served from a CDN.
- **Database:** managed Postgres with automated backups.

## Scaling

Bottlenecks:

- **Substring search** → Postgres full-text (tsvector/GIN) or a dedicated search service when result
- **SQLite's single writer** → Postgres with connection pooling. If we needed to handle a global audience, move to a distributed multi-primary like Cockroach DB, Spanner, etc. or support multiple distinct postgres instances.
  quality or volume matters.
- **Request-time due-soon/reminders** → a background worker and queue once reminders become push or
  email rather than a polled section.
- **Many tenants** → partition task data by user and revisit indexing.
