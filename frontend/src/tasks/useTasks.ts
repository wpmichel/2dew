import { useCallback, useEffect, useRef, useState } from "react";
import { api as defaultApi } from "../api/client";
import type { CreateTaskRequest, TaskResponse, UpdateTaskRequest } from "../api/types";
import { messageOf } from "../util/errors";
import { insertAt, makeTempTask, prepend, removeById, replaceById } from "./optimistic";

// The slice of the API client this hook depends on. Declaring it as an interface lets tests
// inject a fake (per the project's preference for fakes over mocks).
export interface TasksApi {
  listTasks: typeof defaultApi.listTasks;
  createTask: typeof defaultApi.createTask;
  updateTask: typeof defaultApi.updateTask;
  deleteTask: typeof defaultApi.deleteTask;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export type ListStatus = "loading" | "ready" | "error";

export interface UseTasks {
  tasks: TaskResponse[];
  status: ListStatus;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  pendingIds: Set<string>;
  search: string;
  setSearch: (term: string) => void;
  loadMore: () => void;
  createTask: (input: CreateTaskRequest) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskRequest) => Promise<void>;
  toggleComplete: (task: TaskResponse) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  dismissError: () => void;
}

export function useTasks(client: TasksApi = defaultApi): UseTasks {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ListStatus>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Mirrors the latest list so mutation handlers can snapshot a task for rollback without
  // depending on a possibly-stale render closure.
  const tasksRef = useRef<TaskResponse[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Guards against out-of-order first-page responses when the search term changes quickly.
  const requestId = useRef(0);

  const setPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Debounced first-page load; re-runs whenever the search term changes (and on mount).
  useEffect(() => {
    const handle = setTimeout(async () => {
      const id = ++requestId.current;
      setStatus("loading");
      setError(null);
      try {
        const page = await client.listTasks({ search, limit: PAGE_SIZE });
        if (id !== requestId.current) return;
        setTasks(page.items);
        setNextCursor(page.nextCursor);
        setStatus("ready");
      } catch (err) {
        if (id !== requestId.current) return;
        setError(messageOf(err));
        setStatus("error");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search, client]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await client.listTasks({ cursor: nextCursor, search, limit: PAGE_SIZE });
      setTasks((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, search, client]);

  const createTask = useCallback(
    async (input: CreateTaskRequest) => {
      const temp = makeTempTask(input);
      setError(null);
      setTasks((prev) => prepend(prev, temp));
      setPending(temp.id, true);
      try {
        const created = await client.createTask(input);
        setTasks((prev) => replaceById(prev, temp.id, created));
      } catch (err) {
        // Roll back the optimistic insert; the form surfaces the error inline.
        setTasks((prev) => removeById(prev, temp.id));
        throw err;
      } finally {
        setPending(temp.id, false);
      }
    },
    [client, setPending],
  );

  const updateTask = useCallback(
    async (id: string, input: UpdateTaskRequest) => {
      const snapshot = tasksRef.current.find((t) => t.id === id);
      if (!snapshot) return;
      const optimistic: TaskResponse = {
        ...snapshot,
        title: input.title,
        description: input.description ?? null,
        dueDateUtc: input.dueDateUtc ?? null,
        isCompleted: input.isCompleted ?? false,
        updatedAt: new Date().toISOString(),
      };
      setError(null);
      setTasks((prev) => replaceById(prev, id, optimistic));
      setPending(id, true);
      try {
        const updated = await client.updateTask(id, input);
        setTasks((prev) => replaceById(prev, id, updated));
      } catch (err) {
        // Roll back to the last server-confirmed state; the form surfaces the error inline.
        setTasks((prev) => replaceById(prev, id, snapshot));
        throw err;
      } finally {
        setPending(id, false);
      }
    },
    [client, setPending],
  );

  const toggleComplete = useCallback(
    async (task: TaskResponse) => {
      // No form backs the toggle, so surface any failure on the global banner.
      try {
        await updateTask(task.id, {
          title: task.title,
          description: task.description,
          dueDateUtc: task.dueDateUtc,
          isCompleted: !task.isCompleted,
        });
      } catch (err) {
        setError(messageOf(err));
      }
    },
    [updateTask],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const index = tasksRef.current.findIndex((t) => t.id === id);
      if (index === -1) return;
      const snapshot = tasksRef.current[index];
      setError(null);
      setTasks((prev) => removeById(prev, id));
      setPending(id, true);
      try {
        await client.deleteTask(id);
      } catch (err) {
        // No form backs delete, so fully handle the failure: restore the row at its original
        // position and surface the error on the global banner (do not rethrow).
        setTasks((prev) => insertAt(prev, Math.min(index, prev.length), snapshot));
        setError(messageOf(err));
      } finally {
        setPending(id, false);
      }
    },
    [client, setPending],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    tasks,
    status,
    loadingMore,
    error,
    hasMore: nextCursor !== null,
    pendingIds,
    search,
    setSearch,
    loadMore,
    createTask,
    updateTask,
    toggleComplete,
    deleteTask,
    dismissError,
  };
}
