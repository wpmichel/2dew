# Local task runner for working outside Docker.
#
# Docker is the zero-prerequisite path (`docker compose up --build`); these recipes are the
# convenience path for running directly on the host (needs the .NET 10 SDK, Node, and pnpm).

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
