import { describe, expect, it } from "vitest";
import type { TaskResponse } from "../api/types";
import { insertAt, isTempId, makeTempTask, prepend, removeById, replaceById } from "./optimistic";

function task(id: string, title = id): TaskResponse {
  return {
    id,
    title,
    description: null,
    dueDateUtc: null,
    isCompleted: false,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("optimistic helpers", () => {
  it("makeTempTask creates a temp-id task from the input", () => {
    const temp = makeTempTask({ title: "Buy milk", description: "2%", dueDateUtc: null });
    expect(isTempId(temp.id)).toBe(true);
    expect(temp.title).toBe("Buy milk");
    expect(temp.description).toBe("2%");
    expect(temp.isCompleted).toBe(false);
  });

  it("prepend puts the new task at the front", () => {
    expect(prepend([task("a")], task("b")).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("replaceById swaps the matching task and leaves others", () => {
    const result = replaceById([task("a"), task("b")], "a", task("a", "renamed"));
    expect(result.map((t) => t.title)).toEqual(["renamed", "b"]);
  });

  it("removeById drops only the matching task", () => {
    expect(removeById([task("a"), task("b")], "a").map((t) => t.id)).toEqual(["b"]);
  });

  it("insertAt restores a task at a given index", () => {
    expect(insertAt([task("a"), task("c")], 1, task("b")).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
