import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { TaskResponse, UpdateTaskRequest } from "../api/types";
import { formatDueDate, fromLocalInputValue, toLocalInputValue } from "../util/datetime";

type EditField = "title" | "description" | "due";

interface TaskRowProps {
  task: TaskResponse;
  pending: boolean;
  onToggle: (task: TaskResponse) => void;
  onUpdate: (id: string, input: UpdateTaskRequest) => Promise<void>;
  onDelete: (id: string) => void;
}

// A task row in the MS To Do mold: the title, note, and due date are each edited in place by
// clicking them, and the only button is a trash icon. There is no separate edit mode or form.
export function TaskRow({ task, pending, onToggle, onUpdate, onDelete }: TaskRowProps) {
  const [editing, setEditing] = useState<EditField | null>(null);
  const [draft, setDraft] = useState("");
  // Set when an edit is abandoned via Escape so the ensuing blur does not also commit it.
  const cancelled = useRef(false);

  function startEdit(field: EditField) {
    if (pending) return;
    setDraft(
      field === "title"
        ? task.title
        : field === "description"
          ? (task.description ?? "")
          : toLocalInputValue(task.dueDateUtc),
    );
    setEditing(field);
  }

  function persist(changes: Partial<UpdateTaskRequest>) {
    void onUpdate(task.id, {
      title: task.title,
      description: task.description,
      dueDateUtc: task.dueDateUtc,
      isCompleted: task.isCompleted,
      ...changes,
    });
  }

  // Commit happens exactly once, from blur; Enter/Escape just blur the field.
  function handleBlur() {
    const field = editing;
    setEditing(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (field) commit(field);
  }

  function commit(field: EditField) {
    if (field === "title") {
      const next = draft.trim();
      if (next && next !== task.title) persist({ title: next });
    } else if (field === "description") {
      const next = draft.trim() ? draft.trim() : null;
      if (next !== (task.description ?? null)) persist({ description: next });
    } else if (draft !== toLocalInputValue(task.dueDateUtc)) {
      persist({ dueDateUtc: fromLocalInputValue(draft) });
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    multiline: boolean,
  ) {
    if (event.key === "Escape") {
      cancelled.current = true;
      event.currentTarget.blur();
    } else if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <li className={`task-row${task.isCompleted ? " completed" : ""}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={task.isCompleted}
        disabled={pending}
        onChange={() => onToggle(task)}
        aria-label={`Complete ${task.title}`}
      />

      <div className="task-main">
        {editing === "title" ? (
          <input
            type="text"
            className="task-field-edit task-title-edit"
            value={draft}
            maxLength={200}
            autoFocus
            aria-label="Title"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => handleKeyDown(e, false)}
          />
        ) : (
          <p className="task-title editable" onClick={() => startEdit("title")}>
            {task.title}
          </p>
        )}

        {editing === "description" ? (
          <textarea
            className="task-field-edit task-desc-edit"
            value={draft}
            rows={2}
            autoFocus
            aria-label="Description"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => handleKeyDown(e, true)}
          />
        ) : task.description ? (
          <p className="task-desc editable" onClick={() => startEdit("description")}>
            {task.description}
          </p>
        ) : (
          <button type="button" className="task-add-field" onClick={() => startEdit("description")}>
            + Add note
          </button>
        )}

        {editing === "due" ? (
          <input
            type="datetime-local"
            className="task-field-edit task-due-edit"
            value={draft}
            autoFocus
            aria-label="Due date"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => handleKeyDown(e, false)}
          />
        ) : task.dueDateUtc ? (
          <p className="task-due editable" onClick={() => startEdit("due")}>
            Due {formatDueDate(task.dueDateUtc)}
          </p>
        ) : (
          <button type="button" className="task-add-field" onClick={() => startEdit("due")}>
            + Add due date
          </button>
        )}
      </div>

      <div className="task-actions">
        {pending && (
          <span className="task-pending" aria-label="Saving">
            …
          </span>
        )}
        <button
          type="button"
          className="icon-button danger"
          title="Delete task"
          aria-label={`Delete ${task.title}`}
          disabled={pending}
          onClick={() => onDelete(task.id)}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6m4 5v6m6-6v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
