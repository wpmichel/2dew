import { useCallback, useEffect, useRef, useState } from "react";
import { api as defaultApi } from "../api/client";
import type { TaskResponse } from "../api/types";
import { messageOf } from "../util/errors";
import { insertAt, removeById } from "./optimistic";
import type { ListStatus } from "./useTasks";

// The slice of the API client the completed section needs. An interface so tests can inject a
// fake (matching the project's preference for fakes over mocks).
export interface CompletedTasksApi {
  listCompletedTasks: typeof defaultApi.listCompletedTasks;
  updateTask: typeof defaultApi.updateTask;
}

const PAGE_SIZE = 20;

// A burst of completions/deletes each bump reloadKey; coalesce them into one refetch.
const RELOAD_DEBOUNCE_MS = 400;

export interface UseCompletedTasksOptions {
  // Fired with the reopened task so the active list can re-insert it (as an optimistic overlay).
  onReopened?: (task: TaskResponse) => void;
  // Bumped by the active list when a task is completed or deleted, prompting a refetch.
  reloadKey?: number;
}

export interface UseCompletedTasks {
  tasks: TaskResponse[];
  status: ListStatus;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  pendingIds: Set<string>;
  loadMore: () => void;
  markIncomplete: (task: TaskResponse) => Promise<void>;
}

// Backs the collapsible completed/removed section: a server-paginated, TTL-bounded list whose
// only mutation is reopening a task back into the active list.
export function useCompletedTasks(
  client: CompletedTasksApi = defaultApi,
  options: UseCompletedTasksOptions = {},
): UseCompletedTasks {
  const { onReopened, reloadKey } = options;
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ListStatus>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const tasksRef = useRef<TaskResponse[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Guards against an out-of-order refetch superseding a newer one.
  const requestId = useRef(0);

  const setPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Load the first page on mount and whenever the active list signals a change (reloadKey),
  // debounced so a burst of completions/deletes coalesces into one refetch.
  useEffect(() => {
    const handle = setTimeout(() => {
      const id = ++requestId.current;
      setStatus("loading");
      setError(null);
      (async () => {
        try {
          const page = await client.listCompletedTasks({ limit: PAGE_SIZE });
          if (id !== requestId.current) return;
          setTasks(page.items);
          setNextCursor(page.nextCursor);
          setStatus("ready");
        } catch (err) {
          if (id !== requestId.current) return;
          setError(messageOf(err));
          setStatus("error");
        }
      })();
    }, RELOAD_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [client, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await client.listCompletedTasks({ cursor: nextCursor, limit: PAGE_SIZE });
      setTasks((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, client]);

  const markIncomplete = useCallback(
    async (task: TaskResponse) => {
      const index = tasksRef.current.findIndex((t) => t.id === task.id);
      if (index === -1) return;
      const snapshot = tasksRef.current[index];
      setError(null);
      setTasks((prev) => removeById(prev, task.id));
      setPending(task.id, true);
      try {
        const reopened = await client.updateTask(task.id, {
          title: task.title,
          description: task.description,
          dueDateUtc: task.dueDateUtc,
          isCompleted: false,
        });
        onReopened?.(reopened);
      } catch (err) {
        setTasks((prev) => insertAt(prev, Math.min(index, prev.length), snapshot));
        setError(messageOf(err));
      } finally {
        setPending(task.id, false);
      }
    },
    [client, setPending, onReopened],
  );

  return {
    tasks,
    status,
    loadingMore,
    error,
    hasMore: nextCursor !== null,
    pendingIds,
    loadMore,
    markIncomplete,
  };
}
