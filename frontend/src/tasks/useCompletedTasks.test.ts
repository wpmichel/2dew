import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { PagedTasks, TaskResponse } from "../api/types";
import { useCompletedTasks, type CompletedTasksApi } from "./useCompletedTasks";

function task(id: string, overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id,
    title: id,
    description: null,
    dueDateUtc: null,
    isCompleted: true,
    completedAt: "2026-01-01T00:00:00Z",
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

function fakeApi(initial: TaskResponse[]): CompletedTasksApi {
  const page: PagedTasks = { items: initial, nextCursor: null };
  return {
    listCompletedTasks: vi.fn(async () => page),
    updateTask: vi.fn(async (id) => task(id, { isCompleted: false, completedAt: null })),
  };
}

async function renderReady(client: CompletedTasksApi, options = {}) {
  const hook = renderHook(() => useCompletedTasks(client, options));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

describe("useCompletedTasks", () => {
  it("reopens a task: removes it immediately and notifies the active list", async () => {
    const client = fakeApi([task("a"), task("b")]);
    const onReopened = vi.fn();
    const { result } = await renderReady(client, { onReopened });

    await act(async () => {
      await result.current.markIncomplete(task("b"));
    });

    expect(result.current.tasks.map((t) => t.id)).toEqual(["a"]);
    expect(onReopened).toHaveBeenCalledOnce();
  });

  it("restores a reopened task and surfaces an error when the update fails", async () => {
    const client = fakeApi([task("a"), task("b")]);
    const update = deferred<TaskResponse>();
    client.updateTask = vi.fn(() => update.promise);

    const { result } = await renderReady(client);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.markIncomplete(task("b"));
    });

    // Hidden from the completed list immediately.
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a"]);

    await act(async () => {
      update.reject(new ApiError(500, "Reopen failed"));
      await pending;
    });

    // Restored at its original position, with a visible error.
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.current.error).toBe("Reopen failed");
  });
});
