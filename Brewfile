# Brewfile — macOS prerequisites for building and running 2dew.
#
# Install everything with:  brew bundle
# (No Homebrew yet? Install it first: https://brew.sh)
#
# After this, run `just setup` to install the project's own dependencies.

# .NET 10 SDK — backend API and tests.
brew "dotnet"

# Node.js (>= 20) — frontend runtime and build.
brew "node"

# pnpm — frontend package manager (version pinned via package.json "packageManager").
brew "pnpm"

# just — runs the repo's task recipes (just setup / dev / test).
brew "just"

# Docker Desktop — optional zero-toolchain path (docker compose up --build).
cask "docker-desktop"
