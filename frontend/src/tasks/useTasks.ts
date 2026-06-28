import { useCallback, useEffect, useRef, useState } from "react";
import { api as defaultApi } from "../api/client";
import type { CreateTaskRequest, TaskResponse, UpdateTaskRequest } from "../api/types";
import { messageOf } from "../util/errors";
import { playCompletionChime } from "../util/chime";
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

export interface UseTasksOptions {
  // Fired after a task leaves the active list (completed or deleted) so the completed section
  // can refetch and surface it.
  onCompleted?: () => void;
  // Fired after any successful mutation (create, edit, complete, delete) so derived views like
  // the due-soon rollup can refetch.
  onMutated?: () => void;
  // Bumped by the completed section when a task is reopened, prompting the active list to
  // refetch its first page so the task reappears.
  reloadKey?: number;
}

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
  completeTask: (task: TaskResponse) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  dismissError: () => void;
}

export function useTasks(client: TasksApi = defaultApi, options: UseTasksOptions = {}): UseTasks {
  const { onCompleted, onMutated, reloadKey } = options;
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
  }, [search, client, reloadKey]);

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
        onMutated?.();
      } catch (err) {
        // Roll back the optimistic insert; the form surfaces the error inline.
        setTasks((prev) => removeById(prev, temp.id));
        throw err;
      } finally {
        setPending(temp.id, false);
      }
    },
    [client, setPending, onMutated],
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
        onMutated?.();
      } catch (err) {
        // Roll back to the last server-confirmed state; the form surfaces the error inline.
        setTasks((prev) => replaceById(prev, id, snapshot));
        throw err;
      } finally {
        setPending(id, false);
      }
    },
    [client, setPending, onMutated],
  );

  // Completing a task removes it from the active list (active = not completed) and hands it to
  // the completed section. Mirrors delete's optimistic remove/restore; no form backs it, so
  // failures surface on the global banner.
  const completeTask = useCallback(
    async (task: TaskResponse) => {
      const index = tasksRef.current.findIndex((t) => t.id === task.id);
      if (index === -1) return;
      const snapshot = tasksRef.current[index];
      setError(null);
      setTasks((prev) => removeById(prev, task.id));
      setPending(task.id, true);
      try {
        await client.updateTask(task.id, {
          title: task.title,
          description: task.description,
          dueDateUtc: task.dueDateUtc,
          isCompleted: true,
        });
        playCompletionChime();
        onCompleted?.();
        onMutated?.();
      } catch (err) {
        setTasks((prev) => insertAt(prev, Math.min(index, prev.length), snapshot));
        setError(messageOf(err));
      } finally {
        setPending(task.id, false);
      }
    },
    [client, setPending, onCompleted, onMutated],
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
        // Soft-delete: the task now lives in the completed section.
        onCompleted?.();
        onMutated?.();
      } catch (err) {
        // No form backs delete, so fully handle the failure: restore the row at its original
        // position and surface the error on the global banner (do not rethrow).
        setTasks((prev) => insertAt(prev, Math.min(index, prev.length), snapshot));
        setError(messageOf(err));
      } finally {
        setPending(id, false);
      }
    },
    [client, setPending, onCompleted, onMutated],
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
    completeTask,
    deleteTask,
    dismissError,
  };
}
