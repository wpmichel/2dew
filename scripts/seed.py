#!/usr/bin/env python3
"""Seed a demo user with many tasks so pagination/scroll is observable in the UI.

Talks to the running API (start it with `just backend` or `just dev`) over HTTP, so it goes
through the real auth + validation path rather than poking the SQLite file directly. Re-running
adds another batch to the same user; use `just reset-db` first for a clean slate.

Configurable via environment variables:
  API_URL          (default http://localhost:5088)
  SEED_EMAIL       (default seed@example.com)
  SEED_PASSWORD    (default password123)
  SEED_ACTIVE      (default 50)   number of active tasks
  SEED_COMPLETED   (default 50)   number of completed tasks
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("API_URL", "http://localhost:5088").rstrip("/")
EMAIL = os.environ.get("SEED_EMAIL", "seed@example.com")
PASSWORD = os.environ.get("SEED_PASSWORD", "password123")
ACTIVE = int(os.environ.get("SEED_ACTIVE", "50"))
COMPLETED = int(os.environ.get("SEED_COMPLETED", "50"))


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, (json.loads(raw) if raw else None)
        except json.JSONDecodeError:
            return err.code, raw.decode(errors="replace")


def iso(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def authenticate():
    status, payload = call("POST", "/api/auth/register", body={"email": EMAIL, "password": PASSWORD})
    if status == 200:
        print(f"Registered {EMAIL}")
        return payload["token"]
    status, payload = call("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
    if status == 200:
        print(f"Logged in as existing {EMAIL}")
        return payload["token"]
    sys.exit(f"Could not register or log in {EMAIL}: {status} {payload}")


def main():
    try:
        token = authenticate()
    except urllib.error.URLError as err:
        sys.exit(f"Cannot reach the API at {BASE} ({err.reason}). Start it with `just backend` first.")

    for i in range(1, ACTIVE + 1):
        body = {"title": f"Active task {i:02d}"}
        # Sprinkle a few overdue and soon-due dates so the due-soon rollup has content too.
        if i <= 3:
            body["dueDateUtc"] = iso(-i)
        elif i <= 6:
            body["dueDateUtc"] = iso(i - 4)
        status, _ = call("POST", "/api/tasks", token, body)
        if status not in (200, 201):
            sys.exit(f"Failed to create active task {i}: {status}")
    print(f"Created {ACTIVE} active tasks")

    for i in range(1, COMPLETED + 1):
        status, task = call("POST", "/api/tasks", token, {"title": f"Completed task {i:02d}"})
        if status not in (200, 201):
            sys.exit(f"Failed to create task to complete {i}: {status}")
        status, _ = call("PUT", f"/api/tasks/{task['id']}", token,
                         {"title": task["title"], "isCompleted": True})
        if status != 200:
            sys.exit(f"Failed to complete task {i}: {status}")
    print(f"Created and completed {COMPLETED} tasks")

    print(f"\nDone. Log in at the frontend with {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    main()
