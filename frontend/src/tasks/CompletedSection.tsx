import { useRef, useState } from "react";
import { formatRelativeTime } from "../util/datetime";
import type { UseCompletedTasks } from "./useCompletedTasks";
import { useInfiniteScroll } from "./useInfiniteScroll";

interface CompletedSectionProps {
  completed: UseCompletedTasks;
}

// A collapsible roll-up of completed tasks. Hidden entirely when there is nothing
// completed, so it never adds empty chrome to the page.
export function CompletedSection({ completed }: CompletedSectionProps) {
  const [open, setOpen] = useState(false);

  // Bounded scroll area that auto-loads the next page; the observer only exists while the section
  // is open and there are more pages (the sentinel renders only then).
  const listRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useInfiniteScroll({
    onLoadMore: completed.loadMore,
    hasMore: completed.hasMore,
    loading: completed.loadingMore,
    root: listRef,
  });

  if (completed.tasks.length === 0 && !completed.error) return null;

  return (
    <section className="completed-section">
      {completed.error && (
        <p className="error-banner" role="alert">
          {completed.error}
        </p>
      )}

      {completed.tasks.length > 0 && (
        <>
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
            <span className="completed-count">
              {completed.tasks.length}
              {completed.hasMore ? "+" : ""}
            </span>
          </button>

          {open && (
            <ul className="task-list completed-list scroll-list" ref={listRef}>
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
                <li className="scroll-sentinel" ref={sentinelRef} aria-hidden="true">
                  {completed.loadingMore && <span className="muted">Loading more…</span>}
                </li>
              )}
            </ul>
          )}
        </>
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
