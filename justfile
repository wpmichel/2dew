# Local task runner for working outside Docker.
#
# Docker is the zero-prerequisite path (`docker compose up`); these recipes are the
# convenience path for running directly on the host. Frontend recipes (frontend, dev,
# gen-api) are added alongside the frontend app.

# Show available recipes.
default:
    @just --list

# Restore backend dependencies.
setup:
    cd backend && dotnet restore

# Run the API (http://localhost:5088, Development environment).
backend:
    cd backend && dotnet run

# Run backend tests.
test:
    cd backend.Tests && dotnet test
