import { useReducer } from "react";
import { useTasks } from "./useTasks";
import { useCompletedTasks } from "./useCompletedTasks";
import { useDueSoonTasks } from "./useDueSoonTasks";
import { InlineCreateRow } from "./InlineCreateRow";
import { TaskRow } from "./TaskRow";
import { DueSoonSection } from "./DueSoonSection";
import { CompletedSection } from "./CompletedSection";

export function TasksPage() {
  // Each section owns its own optimistic state; these counters let one nudge the others when a
  // task crosses between them. Completing or deleting reloads the completed section; any active
  // mutation reloads the due-soon rollup. Reopening hands the task straight back to the active
  // list as an optimistic overlay (no reload), so it can't race a concurrent edit.
  const [completedReloadKey, reloadCompleted] = useReducer((n) => n + 1, 0);
  const [dueSoonReloadKey, reloadDueSoon] = useReducer((n) => n + 1, 0);

  const tasks = useTasks(undefined, {
    onCompleted: reloadCompleted,
    onMutated: reloadDueSoon,
  });
  const completed = useCompletedTasks(undefined, {
    onReopened: (task) => {
      tasks.addReopenedTask(task);
      reloadDueSoon();
    },
    reloadKey: completedReloadKey,
  });
  const dueSoon = useDueSoonTasks(undefined, { reloadKey: dueSoonReloadKey });

  return (
    <>
      <DueSoonSection dueSoon={dueSoon} />

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search tasks…"
          value={tasks.search}
          onChange={(e) => tasks.setSearch(e.target.value)}
          aria-label="Search tasks"
        />
      </div>

      <InlineCreateRow onCreate={tasks.createTask} />

      {tasks.error && tasks.status === "ready" && (
        <p className="error-banner" role="alert">
          {tasks.error}{" "}
          <button type="button" className="link" onClick={tasks.dismissError}>
            Dismiss
          </button>
        </p>
      )}

      {tasks.status === "loading" && <p className="muted state-row">Loading your tasks…</p>}

      {tasks.status === "error" && (
        <p className="error-banner" role="alert">
          Couldn't load your tasks. {tasks.error}
        </p>
      )}

      {tasks.status === "ready" && tasks.tasks.length === 0 && (
        <p className="empty state-row">
          {tasks.search.trim()
            ? "No tasks match your search."
            : "No tasks yet — add your first one above."}
        </p>
      )}

      {tasks.tasks.length > 0 && (
        <ul className="task-list">
          {tasks.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              pending={tasks.pendingIds.has(task.id)}
              onToggle={tasks.completeTask}
              onUpdate={tasks.updateTask}
              onDelete={tasks.deleteTask}
            />
          ))}
        </ul>
      )}

      {tasks.status === "ready" && tasks.hasMore && (
        <div className="load-more">
          <button
            type="button"
            className="secondary"
            disabled={tasks.loadingMore}
            onClick={tasks.loadMore}
          >
            {tasks.loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <CompletedSection completed={completed} />
    </>
  );
}
