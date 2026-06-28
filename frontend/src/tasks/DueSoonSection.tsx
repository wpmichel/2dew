import { formatDueDate } from "../util/datetime";
import type { UseDueSoonTasks } from "./useDueSoonTasks";

interface DueSoonSectionProps {
  dueSoon: UseDueSoonTasks;
}

// A small rollup of tasks due within the next couple of days (and anything overdue). It is
// invisible whenever nothing qualifies - including while the first fetch is in flight - so it
// never adds empty chrome. Snoozing a task hides it here without touching the main list.
export function DueSoonSection({ dueSoon }: DueSoonSectionProps) {
  if (dueSoon.tasks.length === 0) return null;

  const now = Date.now();

  return (
    <section className="due-soon-section" aria-label="Due soon">
      <h2 className="due-soon-title">Due soon</h2>
      <ul className="due-soon-list">
        {dueSoon.tasks.map((task) => {
          const overdue = task.dueDateUtc != null && new Date(task.dueDateUtc).getTime() < now;
          return (
            <li key={task.id} className="due-soon-item">
              <div className="task-main">
                <p className="task-title">{task.title}</p>
                <p className={`due-soon-when${overdue ? " overdue" : ""}`}>
                  {overdue ? "Overdue · " : "Due "}
                  {formatDueDate(task.dueDateUtc)}
                </p>
              </div>
              <button
                type="button"
                className="due-soon-snooze"
                title="Snooze"
                aria-label={`Snooze ${task.title}`}
                onClick={() => dueSoon.snooze(task.id)}
              >
                <SnoozeIcon />
                Snooze
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SnoozeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 9v4l2.5 2M5 4 2 7m20 0-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
