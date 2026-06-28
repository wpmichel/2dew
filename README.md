# 2dew — To-Do Task Manager

A small, multi-user to-do app built end to end: a .NET 10 Web API, a React + TypeScript
(Vite) frontend, and SQLite for storage. Register, log in, then create, edit, complete,
search, and delete your own tasks. Data persists across restarts, and every feature works
from the UI through the API into the database and back.

## Quick start

### Option A — Docker (no toolchain required)

```sh
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:5088

The SQLite file lives on a named volume, so your tasks survive `docker compose down` / `up`.

### Option B — Run on the host

Prerequisites: **.NET 10 SDK**, **Node 20+**, and **pnpm** (`corepack enable` will provide the
pinned version). Optionally [`just`](https://github.com/casey/just) for the shortcuts below.

```sh
just setup     # restore backend packages + install frontend deps
just dev       # run API (:5088) and Vite dev server (:5173) together
just test      # run backend and frontend tests
```

Without `just`, the same commands directly:

```sh
# Backend  (http://localhost:5088)
cd backend && dotnet run

# Frontend (http://localhost:5173) — in a second terminal
cd frontend && pnpm install && pnpm dev

# Tests
cd backend.Tests && dotnet test
cd frontend && pnpm test
```

## What's built

- **Auth & ownership.** Register / log in return a JWT (stored in `localStorage`). Every task
  endpoint requires the token, and **every query is scoped to the caller's user id** — a user
  cannot read or modify another user's task even with its exact id (those requests get a `404`
  so the existence of other users' data isn't leaked).
- **Full task CRUD**, each complete on both sides: create (with validation + preserved input),
  edit (form pre-populated with current values), complete/reopen toggle, and delete with a
  confirmation step.
- **Optimistic UI.** Every change shows immediately without a page refresh; a failed request
  rolls the row back to its last server-confirmed state and surfaces a visible error.
- **Pagination + search.** The list loads in pages via keyset (cursor) pagination and scales to
  many tasks; a debounced search box matches title/description across *all* of your tasks,
  case-insensitively, server-side.
- **Timezone-correct due dates.** Stored and sent as UTC; displayed and edited in your local
  timezone.
- **Visible states** for loading, empty list, validation errors, and failed syncs.

## Architecture & decisions

Deliberately flat, matched to a single-entity CRUD app — no repository layer, no
MediatR/CQRS, no multi-project split.

- **Backend (`/backend`).** One ASP.NET Core (.NET 10) project. Controllers run **hand-written
  SQL via Dapper** against SQLite — chosen over an ORM for transparency (you see exactly what
  runs), control over indexes, and predictable performance on a two-table schema. The schema is
  created on startup with idempotent `CREATE TABLE IF NOT EXISTS`, so a fresh clone runs with no
  manual DB steps. Ownership scoping (`WHERE UserId = @userId`) and parameterized queries are
  right there in each query.
- **Frontend (`/frontend`).** React + TypeScript on Vite. A small typed API client plus a
  `useTasks` hook holding pagination, search, and the optimistic-mutation logic; no Redux.
- **Shared API contract.** The backend emits an OpenAPI document on build; the frontend
  generates `src/api/schema.ts` from it (`pnpm gen:api` / `just gen-api`) and a small
  hand-written client imports those types — so the C#↔TypeScript contract can't silently drift.
- **Toolchain.** Type-checking uses `tsgo` (the native TypeScript compiler); formatting uses
  `oxfmt`; linting uses `oxlint`.

### Data model

- **User** — `Id`, `Email` (unique), `PasswordHash` (hashed via ASP.NET `PasswordHasher`),
  `CreatedAt`.
- **Task** — `Id`, `UserId`, `Title` (required, max 200), `Description?`, `DueDateUtc?`,
  `IsCompleted`, `CreatedAt`, `UpdatedAt`.

## Tests

Focused on the two highest-risk areas (plus the trickiest frontend logic):

- **Backend integration** (`backend.Tests`, real API over a throwaway SQLite file): a user
  cannot read/update/delete another user's task (`404`) and never sees it in their list; empty
  titles and invalid due dates are rejected with `400`; unauthenticated requests get `401`.
- **Frontend unit** (Vitest): the optimistic-mutation logic applies a change immediately and
  **rolls back to the last confirmed state** when the request fails.

## Deliberately left out

To keep scope matched to the problem (and noted here rather than left as silent gaps):

- Filtering/sorting UI (search is included).
- Tags, priorities, categories, or sub-tasks.
- Refresh-token rotation / advanced session management — the JWT is a single long-lived token.
- CI/CD, deployment config, and observability/monitoring.

The JWT signing key in `appsettings.json` / `docker-compose.yml` is a **development placeholder**;
a real deployment would supply a secret via configuration/environment.

## What's next with more time

- A coalescing, batched sync endpoint to collapse rapid edits into fewer round-trips.
- Filtering/sorting UI and the richer task fields above.
- Refresh-token rotation and shorter-lived access tokens.
