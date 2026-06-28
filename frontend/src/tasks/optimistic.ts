import type { CreateTaskRequest, TaskResponse } from "../api/types";

// Pure helpers for applying optimistic mutations to a loaded task list. Kept free of React
// so the optimistic-update/rollback behavior can be unit-tested directly.

const TEMP_PREFIX = "temp-";

export function makeTempId(): string {
  return `${TEMP_PREFIX}${crypto.randomUUID()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

// A client-side stand-in for a not-yet-persisted task, rendered immediately on create and
// reconciled to the server's canonical task once the request resolves.
export function makeTempTask(input: CreateTaskRequest): TaskResponse {
  const now = new Date().toISOString();
  return {
    id: makeTempId(),
    title: input.title,
    description: input.description ?? null,
    dueDateUtc: input.dueDateUtc ?? null,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function prepend(list: TaskResponse[], task: TaskResponse): TaskResponse[] {
  return [task, ...list];
}

export function replaceById(list: TaskResponse[], id: string, task: TaskResponse): TaskResponse[] {
  return list.map((t) => (t.id === id ? task : t));
}

export function removeById(list: TaskResponse[], id: string): TaskResponse[] {
  return list.filter((t) => t.id !== id);
}

export function insertAt(list: TaskResponse[], index: number, task: TaskResponse): TaskResponse[] {
  const copy = list.slice();
  copy.splice(index, 0, task);
  return copy;
}
