import { useReducer } from "react";
import { useTasks } from "./useTasks";
import { useCompletedTasks } from "./useCompletedTasks";
import { TaskForm } from "./TaskForm";
import { TaskRow } from "./TaskRow";
import { CompletedSection } from "./CompletedSection";

export function TasksPage() {
  // Each section owns its own optimistic state; these counters let one nudge the other to
  // refetch when a task crosses between them (completed/deleted ⇄ reopened).
  const [activeReloadKey, reloadActive] = useReducer((n) => n + 1, 0);
  const [completedReloadKey, reloadCompleted] = useReducer((n) => n + 1, 0);

  const tasks = useTasks(undefined, { onCompleted: reloadCompleted, reloadKey: activeReloadKey });
  const completed = useCompletedTasks(undefined, {
    onReopened: reloadActive,
    reloadKey: completedReloadKey,
  });

  return (
    <>
      <section className="card create-panel">
        <h2>Add a task</h2>
        <TaskForm submitLabel="Add task" onSubmit={tasks.createTask} />
      </section>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search tasks…"
          value={tasks.search}
          onChange={(e) => tasks.setSearch(e.target.value)}
          aria-label="Search tasks"
        />
      </div>

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
