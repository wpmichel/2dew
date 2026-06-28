# Local task runner. Needs the .NET 10 SDK, Node, and pnpm (see the Brewfile on macOS).

# Show available recipes.
default:
    @just --list

# Install backend and frontend dependencies.
setup:
    cd backend && dotnet restore
    cd frontend && pnpm install

# Run the API (http://localhost:5088, Development environment).
backend:
    cd backend && dotnet run

# Run the Vite dev server (http://localhost:5173).
frontend:
    cd frontend && pnpm dev

# Run backend and frontend together, opening the app in your browser once Vite is ready.
dev:
    #!/usr/bin/env sh
    (cd backend && dotnet run) &
    (cd frontend && pnpm dev --open) &
    wait

# Regenerate the frontend API types from the backend's OpenAPI document.
gen-api:
    cd backend && dotnet build
    cd frontend && pnpm gen:api

# Run backend and frontend tests.
test:
    cd backend.Tests && dotnet test
    cd frontend && pnpm test

# Check backend code style without modifying files (fails on any violation).
lint-backend:
    cd backend && dotnet format --verify-no-changes

# Auto-fix backend code style (unused usings, formatting, etc.).
fix-backend:
    cd backend && dotnet format

# Seed a demo user (seed@example.com / password123) with active + completed tasks so the
# pagination/scroll behavior is observable. The API must be running (`just backend` or `just dev`).
seed active="50" completed="50":
    SEED_ACTIVE={{active}} SEED_COMPLETED={{completed}} python3 scripts/seed.py

# Delete the SQLite database so it is recreated with a fresh schema on next startup.
reset-db:
    rm -f backend/app.db
