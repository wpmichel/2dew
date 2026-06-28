# To-Do Task Management App — Specification

A small, full-stack to-do task management application: a .NET Core API backend, a
React + TypeScript frontend, and a SQLite database. The emphasis is a focused product
where every feature works end to end, not a broad feature surface.

## Goals

- A working multi-user to-do app: register/log in, then create, view, edit, complete,
  and delete your own tasks.
- Every feature is complete on both sides (UI action → API → database → UI update).
- Data persists across restarts.
- A UI that stays responsive under rapid edits: every change applies optimistically and the
  list reconciles to the server's confirmed state, rolling back with a visible error on failure.
- Task lists that scale: reads are paginated so the user can scroll through a large number
  of tasks, and search spans all of the user's tasks, not just those currently loaded.

## Non-Goals

The following are intentionally out of scope and noted as such in the README:

- Filtering and sorting UI (search is included; see Features).
- Tags, priorities, categories, or sub-tasks.
- Refresh-token rotation / advanced session management.
- CI/CD pipelines, deployment configuration, observability/monitoring.
- Visual polish beyond a clear, usable interface.

## Architecture

A deliberately flat structure matched to a single-entity CRUD app.

- **Backend:** one ASP.NET Core Web API project (.NET 10). Controllers run hand-written SQL via
  Dapper directly against the connection. No repository layer, no MediatR/CQRS, no multi-project
  split — one entity does not warrant those abstractions. Raw SQL is chosen over an ORM for
  transparency, index control, and predictable performance on a small schema.
- **Frontend:** one React + TypeScript app built with Vite. A small typed API client plus
  React hooks/context for state. No Redux. The API contract is generated from the backend's
  OpenAPI document (`openapi-typescript`) so the C#↔TypeScript types cannot silently drift.
- **Database:** SQLite, file-backed (e.g. `app.db`) via Dapper + Microsoft.Data.Sqlite, so data
  survives restarts. The schema is created at startup with idempotent `CREATE TABLE IF NOT EXISTS`
  so a fresh clone runs with no manual DB steps.
- **Task runner:** a top-level `justfile` ([casey/just](https://github.com/casey/just))
  provides the canonical local commands — installing dependencies, running each app, and
  running tests — so contributors use one consistent entry point instead of memorizing
  per-stack commands.

### Repository layout

```
/backend            ASP.NET Core Web API + Dapper (SQLite)
/frontend           React + TypeScript (Vite)
justfile            Local task runner (setup, run, test)
README.md           Setup, what was built, trade-offs, future work
```

### Task runner (`just`)

`just` is the entry point for local development. Planned recipes:

| Recipe          | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `just setup`    | Restore backend packages and install frontend deps |
| `just backend`  | Run the API locally                                |
| `just frontend` | Run the Vite dev server                            |
| `just dev`      | Run backend and frontend together                  |
| `just test`     | Run backend and frontend tests                     |

## Data Model

**User**

| Field        | Type     | Notes                         |
| ------------ | -------- | ----------------------------- |
| Id           | Guid     | Primary key                   |
| Email        | string   | Required, unique              |
| PasswordHash | string   | Hashed; never stored in plain |
| CreatedAt    | DateTime | UTC                           |

**Task**

| Field       | Type      | Notes                                    |
| ----------- | --------- | ---------------------------------------- |
| Id          | Guid      | Primary key                              |
| UserId      | Guid      | Owner; foreign key to User               |
| Title       | string    | Required, non-empty, max length enforced |
| Description | string?   | Optional                                 |
| DueDateUtc  | DateTime? | Optional; stored in UTC                  |
| CompletedAt | DateTime? | UTC; null = active, non-null = completed/removed. `IsCompleted` is derived from it |
| CreatedAt   | DateTime  | UTC                                      |
| UpdatedAt   | DateTime  | UTC; set on every modification           |

A task has no hard-delete: completing it (checkbox) and removing it (trash icon) both set
`CompletedAt`. Completed tasks surface in a separate "completed" section where they can be
reopened (clearing `CompletedAt`), and age out of that view after a fixed TTL (30 days).

## Authentication & Ownership

- `POST /api/auth/register` — accepts email + password, stores a hashed password, returns
  a JWT.
- `POST /api/auth/login` — validates credentials, returns a JWT.
- The JWT carries the `userId`. All task endpoints require `[Authorize]`.
- **Ownership is enforced on every task operation.** Each query is scoped to the `userId`
  from the token, so a user cannot read or modify another user's task even by guessing IDs.
  Requests for a task the caller does not own return **404 Not Found** (rather than 403) so
  the existence of other users' resources is not leaked.

## API

All task endpoints are owner-scoped and require a valid JWT.

| Method | Route                | Purpose                                              |
| ------ | -------------------- | ---------------------------------------------------- |
| POST   | `/api/auth/register` | Create account, return JWT                           |
| POST   | `/api/auth/login`    | Authenticate, return JWT                             |
| GET    | `/api/tasks`           | List the caller's active tasks (paginated; optional search) |
| GET    | `/api/tasks/completed` | List the caller's completed/removed tasks (paginated, TTL-bounded) |
| GET    | `/api/tasks/due-soon`  | List active tasks due within 2 days or overdue (unpaginated, ≤50) |
| POST   | `/api/tasks`           | Create a task                                        |
| GET    | `/api/tasks/{id}`      | Get one task (owner only)                            |
| PUT    | `/api/tasks/{id}`      | Update a task; `isCompleted` sets/clears `CompletedAt` (owner only) |
| DELETE | `/api/tasks/{id}`      | Soft-delete a task into the completed section (owner only) |

- **`GET /api/tasks` is paginated and searchable.** Query parameters:
    - `cursor` (optional) — opaque cursor for the next page; omitted for the first page.
    - `limit` (optional) — page size, with a sensible default and a server-enforced maximum.
    - `search` (optional) — case-insensitive match on title and description, applied before
      pagination so it spans all of the user's tasks.

    The response returns the page of tasks plus a `nextCursor` (null when there are no more
    results). Pagination is **keyset (cursor) based**, ordered by a stable key
    (`CreatedAt`, `Id`). Keyset is chosen over offset/limit so that creating or deleting tasks
    mid-scroll does not cause rows to be skipped or duplicated — important because this app
    expects frequent concurrent mutation.

- Validation runs server-side (empty title rejected, invalid due date rejected) and returns
  `400` with per-field errors in a consistent JSON error shape.

## Features

Each feature is complete end to end — UI action through to database and back to a visible UI
update.

1. **Register and log in.** Forms for both; on success the JWT is stored (localStorage) and
   attached to subsequent requests; the user lands on their task list. Logout clears the
   session.
2. **View tasks (paginated).** The list shows the logged-in user's tasks only — title,
   description, due date (rendered in the user's local timezone), and completion state.
   Reads are paginated; the user scrolls to load further pages (infinite scroll / "load
   more"), so the list scales to a large number of tasks.
3. **Search tasks.** A debounced search box queries the server for a case-insensitive match
   on title and description across all of the user's tasks (not just the loaded pages).
   Changing the search term resets pagination and refetches from the first page.
4. **Create a task.** Type a title into the blank "Add a task" row at the top of the stack and
   press Enter; the task appears immediately. Empty titles are ignored; the server still
   validates and surfaces errors.
5. **Edit a task.** Each field is edited in place — click the title, note, or due date (or the
   faint "+ Add note" / "+ Add due date" prompts) to edit just that field. Enter or blur saves;
   Escape cancels. No separate edit form.
6. **Complete / reopen a task.** Checking a task completes it and moves it to the completed
   section; reopening it from there returns it to the active list.
7. **Delete a task.** A trash icon soft-deletes the task into the completed section (no
   confirmation dialog); it can be restored from there by marking it not completed.
8. **Immediate, optimistic UI.** Every create, edit, complete, and delete updates the list
   immediately without a page refresh; the UI never blocks on the network. Each mutation fires
   its own request:
    - **Temp IDs:** a newly created task is rendered immediately with a client-side temporary id;
      when the server responds, the temp row is reconciled to the canonical server task.
    - **Overlay on paged data:** because the server owns which tasks appear on each page, optimistic
      changes are applied as an overlay on the loaded pages — a pending edit renders right away and
      a pending delete hides the row.
    - **Rollback on failure:** if a request fails, the affected item rolls back to its last
      server-confirmed state and a visible error is surfaced; the UI converges to a consistent state.
9. **Visible states.** Loading, empty list, validation errors, and failed-request errors all
   render to the user rather than failing silently.
10. **Due-soon rollup.** A small section surfaces active tasks due within 2 days (and anything
    overdue). It collapses to nothing when empty. Each item has a snooze control that hides it
    from the rollup; snoozes persist in `localStorage`. The rollup refetches (debounced) when the
    active list changes.

## Validation Rules

- Title is required and non-empty (trimmed); max length enforced.
- Due date, if provided, must be a valid date; it is stored in UTC.
- Email must be well-formed and unique at registration.
- All invalid input is rejected server-side with a `400` and a clear message; the frontend
  also validates before submitting and shows errors inline.

## Testing

Focused tests on the highest-risk areas, with real assertions:

- **Ownership enforcement.** User A cannot read, update, or delete User B's task; requests for a
  task the caller does not own return 404 and never leak another user's data.
- **Validation.** Empty title is rejected; invalid due date is rejected; unauthenticated
  requests are rejected.
- **Optimistic update/rollback.** The client applies a mutation immediately and, on a failed
  request, rolls back to the last server-confirmed state (unit-tested on the frontend).

Backend tests are integration tests against the API. Tests are scoped to what would be risky
to change, not exhaustive coverage.

## README (deliverable)

The README accompanies the submission and includes:

- Exact setup steps: the local (`just`) run instructions for both apps.
- What was built.
- What was deliberately left out and why (see Non-Goals).
- What would come next with more time (e.g. filtering/sorting UI, tags and priorities,
  refresh-token rotation, and a coalescing/batched sync endpoint to collapse rapid mutations
  into fewer round-trips).
