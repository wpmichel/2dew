import { useState } from "react";
import { formatRelativeTime } from "../util/datetime";
import type { UseCompletedTasks } from "./useCompletedTasks";

interface CompletedSectionProps {
  completed: UseCompletedTasks;
}

// A collapsible roll-up of completed and removed tasks. Hidden entirely when there is nothing
// completed, so it never adds empty chrome to the page.
export function CompletedSection({ completed }: CompletedSectionProps) {
  const [open, setOpen] = useState(false);

  if (completed.tasks.length === 0) return null;

  return (
    <section className="completed-section">
      <button
        type="button"
        className="completed-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true">
          ›
        </span>
        Completed
        <span className="completed-count">{completed.tasks.length}</span>
      </button>

      {open && (
        <ul className="task-list completed-list">
          {completed.tasks.map((task) => (
            <li key={task.id} className="task-row completed">
              <div className="task-main">
                <p className="task-title">{task.title}</p>
                {task.completedAt && (
                  <p className="task-due">Completed {formatRelativeTime(task.completedAt)}</p>
                )}
              </div>
              <div className="task-actions">
                <button
                  type="button"
                  className="icon-button"
                  title="Mark as not completed"
                  aria-label={`Mark ${task.title} as not completed`}
                  disabled={completed.pendingIds.has(task.id)}
                  onClick={() => completed.markIncomplete(task)}
                >
                  <ReopenIcon />
                </button>
              </div>
            </li>
          ))}

          {completed.hasMore && (
            <li className="load-more">
              <button
                type="button"
                className="secondary"
                disabled={completed.loadingMore}
                onClick={completed.loadMore}
              >
                {completed.loadingMore ? "Loading…" : "Load more"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function ReopenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12a9 9 0 1 0 3-6.7L3 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 4v4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
