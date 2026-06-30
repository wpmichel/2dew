import { useCallback, useEffect, useRef, useState } from "react";
import { api as defaultApi } from "../api/client";
import type { TaskResponse } from "../api/types";

// The slice of the API client the due-soon rollup needs. An interface so tests can inject a fake.
export interface DueSoonApi {
    listDueSoonTasks: typeof defaultApi.listDueSoonTasks;
}

const SNOOZE_KEY = "2dew.snoozed";

// A burst of edits each bump reloadKey; coalesce them into one refetch once the burst settles.
const RELOAD_DEBOUNCE_MS = 400;

export interface UseDueSoonTasksOptions {
    // Bumped whenever the active list mutates so the rollup re-evaluates what is due soon.
    reloadKey?: number;
}

export interface UseDueSoonTasks {
    // Tasks due within the window, already filtered to exclude snoozed ones.
    tasks: TaskResponse[];
    loading: boolean;
    snooze: (id: string) => void;
}

function loadSnoozed(): Set<string> {
    try {
        const raw = localStorage.getItem(SNOOZE_KEY);
        const ids: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(ids) ? new Set(ids as string[]) : new Set();
    } catch {
        return new Set();
    }
}

function saveSnoozed(ids: Set<string>): void {
    try {
        localStorage.setItem(SNOOZE_KEY, JSON.stringify([...ids]));
    } catch {
        // localStorage unavailable (e.g. private mode); snooze simply won't persist.
    }
}

export function useDueSoonTasks(
    client: DueSoonApi = defaultApi,
    options: UseDueSoonTasksOptions = {},
): UseDueSoonTasks {
    const { reloadKey } = options;
    const [tasks, setTasks] = useState<TaskResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [snoozed, setSnoozed] = useState<Set<string>>(loadSnoozed);

    const requestId = useRef(0);

    useEffect(() => {
        const handle = setTimeout(() => {
            const id = ++requestId.current;
            setLoading(true);
            (async () => {
                try {
                    const items = await client.listDueSoonTasks();
                    if (id !== requestId.current) return;
                    setTasks(items);
                    // Drop snooze ids for tasks that are no longer due soon (completed, deleted, or rescheduled
                    // out of the window) so the set can't grow without bound. Only on a successful fetch - an
                    // empty list from a failed one must not wipe valid snoozes.
                    const live = new Set(items.map((task) => task.id));
                    setSnoozed((prev) => {
                        const next = new Set(
                            [...prev].filter((sid) => live.has(sid)),
                        );
                        if (next.size !== prev.size) saveSnoozed(next);
                        return next;
                    });
                } catch {
                    if (id !== requestId.current) return;
                    setTasks([]);
                } finally {
                    if (id === requestId.current) setLoading(false);
                }
            })();
        }, RELOAD_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [client, reloadKey]);

    const snooze = useCallback((id: string) => {
        setSnoozed((prev) => {
            const next = new Set(prev);
            next.add(id);
            saveSnoozed(next);
            return next;
        });
    }, []);

    return {
        tasks: tasks.filter((task) => !snoozed.has(task.id)),
        loading,
        snooze,
    };
}
