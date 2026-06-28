import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskResponse } from "../api/types";
import { useDueSoonTasks, type DueSoonApi } from "./useDueSoonTasks";

// jsdom's localStorage is shadowed by Node's stub global here, so back it with a simple
// in-memory implementation for these tests.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

function task(id: string): TaskResponse {
  return {
    id,
    title: id,
    description: null,
    dueDateUtc: "2026-01-02T00:00:00Z",
    isCompleted: false,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function fakeApi(items: TaskResponse[]): DueSoonApi {
  return { listDueSoonTasks: vi.fn(async () => items) };
}

describe("useDueSoonTasks", () => {
  it("loads the tasks that are due soon", async () => {
    const { result } = renderHook(() => useDueSoonTasks(fakeApi([task("a"), task("b")])));
    await waitFor(() => expect(result.current.tasks.map((t) => t.id)).toEqual(["a", "b"]));
  });

  it("snoozing hides a task from the rollup and persists it", async () => {
    const { result } = renderHook(() => useDueSoonTasks(fakeApi([task("a"), task("b")])));
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    act(() => result.current.snooze("a"));

    expect(result.current.tasks.map((t) => t.id)).toEqual(["b"]);
    expect(JSON.parse(localStorage.getItem("2dew.snoozed") ?? "[]")).toContain("a");
  });

  it("does not show tasks snoozed in a previous session", async () => {
    localStorage.setItem("2dew.snoozed", JSON.stringify(["a"]));
    const { result } = renderHook(() => useDueSoonTasks(fakeApi([task("a"), task("b")])));
    await waitFor(() => expect(result.current.tasks.map((t) => t.id)).toEqual(["b"]));
  });
});
