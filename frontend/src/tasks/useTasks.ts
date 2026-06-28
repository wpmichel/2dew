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
  // Re-insert a task the completed section just reopened. An optimistic overlay rather than a
  // refetch, so it can't race with concurrent edits the way a full reload would.
  addReopenedTask: (task: TaskResponse) => void;
  dismissError: () => void;
}

export function useTasks(client: TasksApi = defaultApi, options: UseTasksOptions = {}): UseTasks {
  const { onCompleted, onMutated } = options;
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ListStatus>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [search, setSearchState] = useState("");

  // Mirrors the latest list so mutation handlers can snapshot a task for rollback without
  // depending on a possibly-stale render closure.
  const tasksRef = useRef<TaskResponse[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Every first-page load and every optimistic mutation claims a new id. A load only applies
  // its result if its id is still current, so a search refetch whose request was issued before a
  // later mutation (or a newer refetch) is ignored when it resolves and can't clobber it.
  const requestId = useRef(0);

  // Invalidate any first-page refetch currently in flight. Called before applying an optimistic
  // change so a stale server response (e.g. one issued before the change) can't overwrite it.
  const supersedeInFlightLoad = useCallback(() => {
    requestId.current++;
  }, []);

  const setPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Changing the search term resets pagination. Null the cursor synchronously — not just when the
  // debounced refetch lands — so Load more is disabled in the meantime and can't send a cursor
  // from the previous search.
  const setSearch = useCallback((term: string) => {
    setSearchState(term);
    setNextCursor(null);
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
      // Drop ids already present so an optimistically re-inserted task can't show up twice when
      // its real page is loaded.
      setTasks((prev) => [...prev, ...page.items.filter((p) => !prev.some((t) => t.id === p.id))]);
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
      supersedeInFlightLoad();
      setTasks((prev) => prepend(prev, temp));
      setPending(temp.id, true);
      try {
        const created = await client.createTask(input);
        setTasks((prev) => replaceById(prev, temp.id, created));
        onMutated?.();
      } catch (err) {
        // Roll back the optimistic insert and surface the error on the global banner. Rethrow so
        // the create row keeps the typed title and can re-enable its input.
        setTasks((prev) => removeById(prev, temp.id));
        setError(messageOf(err));
        throw err;
      } finally {
        setPending(temp.id, false);
      }
    },
    [client, setPending, onMutated, supersedeInFlightLoad],
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
      supersedeInFlightLoad();
      setTasks((prev) => replaceById(prev, id, optimistic));
      setPending(id, true);
      try {
        const updated = await client.updateTask(id, input);
        setTasks((prev) => replaceById(prev, id, updated));
        onMutated?.();
      } catch (err) {
        // Roll back to the last server-confirmed state and surface the error on the global banner,
        // matching completeTask/deleteTask (the inline edit has already blurred, so no rethrow).
        setTasks((prev) => replaceById(prev, id, snapshot));
        setError(messageOf(err));
      } finally {
        setPending(id, false);
      }
    },
    [client, setPending, onMutated, supersedeInFlightLoad],
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
      supersedeInFlightLoad();
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
    [client, setPending, onCompleted, onMutated, supersedeInFlightLoad],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const index = tasksRef.current.findIndex((t) => t.id === id);
      if (index === -1) return;
      const snapshot = tasksRef.current[index];
      setError(null);
      supersedeInFlightLoad();
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
    [client, setPending, onCompleted, onMutated, supersedeInFlightLoad],
  );

  // Surface a reopened task at the top of the active list (deduped). It carries the server's
  // confirmed state, so no reconciliation is needed; a later search/refetch restores true order.
  const addReopenedTask = useCallback(
    (task: TaskResponse) => {
      setError(null);
      supersedeInFlightLoad();
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : prepend(prev, task)));
    },
    [supersedeInFlightLoad],
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
    addReopenedTask,
    dismissError,
  };
}
