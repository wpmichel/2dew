import { describe, expect, it } from "vitest";
import { nowLocalInputValue, toLocalInputValue } from "./datetime";

describe("nowLocalInputValue", () => {
  it("formats the given local date as a datetime-local value", () => {
    // Local time, so this round-trips through toLocalInputValue rather than UTC.
    const d = new Date(2026, 5, 29, 9, 5); // 2026-06-29 09:05 local
    expect(nowLocalInputValue(d)).toBe("2026-06-29T09:05");
  });

  it("defaults to the current time and matches the input format", () => {
    expect(nowLocalInputValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("agrees with toLocalInputValue for the same instant", () => {
    const d = new Date(2026, 11, 1, 23, 59);
    expect(nowLocalInputValue(d)).toBe(toLocalInputValue(d.toISOString()));
  });
});
