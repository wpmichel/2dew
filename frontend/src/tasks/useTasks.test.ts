import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { PagedTasks, TaskResponse } from "../api/types";
import { isTempId } from "./optimistic";
import { useTasks, type TasksApi } from "./useTasks";

function task(id: string, overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id,
    title: id,
    description: null,
    dueDateUtc: null,
    isCompleted: false,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A fake API client seeded with an initial page; individual methods are overridden per test.
function fakeApi(initial: TaskResponse[]): TasksApi {
  const page: PagedTasks = { items: initial, nextCursor: null };
  return {
    listTasks: vi.fn(async () => page),
    createTask: vi.fn(async () => task("server")),
    updateTask: vi.fn(async (id) => task(id)),
    deleteTask: vi.fn(async () => undefined),
  };
}

async function renderReady(client: TasksApi) {
  const hook = renderHook(() => useTasks(client));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

describe("useTasks optimistic behavior", () => {
  it("shows a created task immediately, then reconciles to the server task", async () => {
    const client = fakeApi([]);
    const created = deferred<TaskResponse>();
    client.createTask = vi.fn(() => created.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.createTask({
        title: "New task",
        description: null,
        dueDateUtc: null,
      });
    });

    // Applied immediately with a temporary id, before the server responds.
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe("New task");
    expect(isTempId(result.current.tasks[0].id)).toBe(true);
    expect(result.current.pendingIds.has(result.current.tasks[0].id)).toBe(true);

    await act(async () => {
      created.resolve(task("server-id", { title: "New task" }));
      await pending;
    });

    // Reconciled to the canonical server task; no temp ids or pending state remain.
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe("server-id");
    expect(isTempId(result.current.tasks[0].id)).toBe(false);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("rolls a failed update back to the last server-confirmed state", async () => {
    const client = fakeApi([task("s1", { title: "Original", isCompleted: false })]);
    const update = deferred<TaskResponse>();
    client.updateTask = vi.fn(() => update.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    act(() => {
      pending = result.current
        .updateTask("s1", {
          title: "Changed",
          description: null,
          dueDateUtc: null,
          isCompleted: true,
        })
        .catch(() => {});
    });

    // Optimistic edit is visible right away.
    expect(result.current.tasks[0].title).toBe("Changed");
    expect(result.current.tasks[0].isCompleted).toBe(true);

    await act(async () => {
      update.reject(new ApiError(400, "Server rejected the edit"));
      await pending;
    });

    // Rolled back to the original values.
    expect(result.current.tasks[0].title).toBe("Original");
    expect(result.current.tasks[0].isCompleted).toBe(false);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("removes a completed task from the active list and restores it when the update fails", async () => {
    const client = fakeApi([task("a"), task("b")]);
    const update = deferred<TaskResponse>();
    client.updateTask = vi.fn(() => update.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.completeTask(task("b"));
    });

    // Leaves the active list immediately (active = not completed).
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a"]);

    await act(async () => {
      update.reject(new ApiError(500, "Complete failed"));
      await pending;
    });

    // Restored at its original position, with a visible error.
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.current.error).toBe("Complete failed");
  });

  it("notifies the completed section after a task is completed", async () => {
    const client = fakeApi([task("a")]);
    const onCompleted = vi.fn();
    const hook = renderHook(() => useTasks(client, { onCompleted }));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));

    await act(async () => {
      await hook.result.current.completeTask(task("a"));
    });

    expect(onCompleted).toHaveBeenCalledOnce();
    expect(hook.result.current.tasks).toHaveLength(0);
  });

  it("restores a deleted row and surfaces an error when the delete fails", async () => {
    const client = fakeApi([task("a"), task("b")]);
    const del = deferred<void>();
    client.deleteTask = vi.fn(() => del.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.deleteTask("b");
    });

    // Row hidden immediately.
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a"]);

    await act(async () => {
      del.reject(new ApiError(500, "Delete failed"));
      await pending;
    });

    // Restored at its original position, with a visible error.
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.current.error).toBe("Delete failed");
  });
});
