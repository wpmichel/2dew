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

  it("re-inserts a reopened task at the top without duplicating", async () => {
    const client = fakeApi([task("a")]);
    const { result } = await renderReady(client);

    act(() => result.current.addReopenedTask(task("z")));
    expect(result.current.tasks.map((t) => t.id)).toEqual(["z", "a"]);

    // Idempotent: re-inserting the same id doesn't duplicate it.
    act(() => result.current.addReopenedTask(task("z")));
    expect(result.current.tasks.map((t) => t.id)).toEqual(["z", "a"]);
  });

  it("ignores an in-flight search refetch superseded by an optimistic delete", async () => {
    const firstPage: PagedTasks = { items: [task("a"), task("b")], nextCursor: null };
    const reload = deferred<PagedTasks>();
    const listTasks = vi
      .fn()
      .mockResolvedValueOnce(firstPage) // initial mount load
      .mockReturnValueOnce(reload.promise); // search-triggered reload, stays in flight
    const client: TasksApi = {
      listTasks,
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() => useTasks(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b"]);

    // A search change kicks off a refetch that stays pending.
    act(() => result.current.setSearch("x"));
    await waitFor(() => expect(listTasks).toHaveBeenCalledTimes(2));

    // Delete "a" while that refetch is still in flight.
    await act(async () => {
      await result.current.deleteTask("a");
    });
    expect(result.current.tasks.map((t) => t.id)).toEqual(["b"]);

    // The stale refetch resolves with the pre-delete list; it must not resurrect "a".
    await act(async () => {
      reload.resolve(firstPage);
      await reload.promise;
    });
    expect(result.current.tasks.map((t) => t.id)).toEqual(["b"]);
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

  it("does not notify the completed section after a delete", async () => {
    const client = fakeApi([task("a")]);
    const onCompleted = vi.fn();
    const onMutated = vi.fn();
    const hook = renderHook(() => useTasks(client, { onCompleted, onMutated }));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));

    await act(async () => {
      await hook.result.current.deleteTask("a");
    });

    // A deleted task is hidden from every view (it is not "completed"), so the completed section
    // must not refresh; the due-soon rollup still refreshes in case the task was due soon.
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onMutated).toHaveBeenCalledOnce();
    expect(hook.result.current.tasks).toHaveLength(0);
  });

  it("surfaces an error and rethrows when a create fails", async () => {
    const client = fakeApi([]);
    const created = deferred<TaskResponse>();
    client.createTask = vi.fn(() => created.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    let rejected = false;
    act(() => {
      pending = result.current
        .createTask({ title: "New task", description: null, dueDateUtc: null })
        .catch(() => {
          rejected = true;
        });
    });
    expect(result.current.tasks).toHaveLength(1); // optimistic insert

    await act(async () => {
      created.reject(new ApiError(500, "Create failed"));
      await pending;
    });

    // Rolled back, surfaced on the banner, and rethrown so the create row keeps its input.
    expect(rejected).toBe(true);
    expect(result.current.tasks).toHaveLength(0);
    expect(result.current.error).toBe("Create failed");
  });

  it("surfaces an error on the banner when an update fails (without rethrowing)", async () => {
    const client = fakeApi([task("s1", { title: "Original" })]);
    const update = deferred<TaskResponse>();
    client.updateTask = vi.fn(() => update.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.updateTask("s1", {
        title: "Changed",
        description: null,
        dueDateUtc: null,
        isCompleted: false,
      });
    });

    await act(async () => {
      update.reject(new ApiError(400, "Update failed"));
      await pending; // resolves (no rethrow), so no .catch needed
    });

    expect(result.current.tasks[0].title).toBe("Original");
    expect(result.current.error).toBe("Update failed");
  });

  it("appends the next page on loadMore and dedupes overlap", async () => {
    const page1: PagedTasks = { items: [task("a"), task("b")], nextCursor: "cursor-1" };
    const page2: PagedTasks = { items: [task("b"), task("c")], nextCursor: null };
    const listTasks = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const client: TasksApi = {
      listTasks,
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() => useTasks(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(listTasks).toHaveBeenLastCalledWith({ cursor: "cursor-1", search: "", limit: 20 });
    // "b" overlaps the first page and must not duplicate; "c" is appended; cursor exhausted.
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("disables Load more immediately when the search term changes", async () => {
    const page1: PagedTasks = { items: [task("a")], nextCursor: "cursor-1" };
    const reload = deferred<PagedTasks>();
    const listTasks = vi.fn().mockResolvedValueOnce(page1).mockReturnValueOnce(reload.promise);
    const client: TasksApi = {
      listTasks,
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() => useTasks(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.hasMore).toBe(true);

    // Changing the search nulls the cursor synchronously, before the debounced refetch resolves.
    act(() => result.current.setSearch("x"));
    expect(result.current.hasMore).toBe(false);

    // loadMore is now a no-op; it must not send the cursor from the previous search.
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(listTasks).toHaveBeenCalledTimes(2)); // mount + search refetch only
    expect(listTasks).not.toHaveBeenCalledWith({ cursor: "cursor-1", search: "x", limit: 20 });

    // Once the fresh first page lands, hasMore reflects the new cursor.
    await act(async () => {
      reload.resolve({ items: [task("a")], nextCursor: "cursor-2" });
    });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
  });
});
