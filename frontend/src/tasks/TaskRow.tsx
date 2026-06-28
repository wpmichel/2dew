import { useState } from "react";
import type { TaskResponse, UpdateTaskRequest } from "../api/types";
import { formatDueDate } from "../util/datetime";
import { TaskForm } from "./TaskForm";

interface TaskRowProps {
  task: TaskResponse;
  pending: boolean;
  onToggle: (task: TaskResponse) => void;
  onUpdate: (id: string, input: UpdateTaskRequest) => Promise<void>;
  onDelete: (id: string) => void;
}

export function TaskRow({ task, pending, onToggle, onUpdate, onDelete }: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <li className="task-row task-row-editing">
        <TaskForm
          initial={{
            title: task.title,
            description: task.description,
            dueDateUtc: task.dueDateUtc,
          }}
          submitLabel="Save"
          autoFocus
          onSubmit={async (input) => {
            await onUpdate(task.id, { ...input, isCompleted: task.isCompleted });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={`task-row${task.isCompleted ? " completed" : ""}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={task.isCompleted}
        disabled={pending}
        onChange={() => onToggle(task)}
        aria-label={task.isCompleted ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />

      <div className="task-main">
        <p className="task-title">{task.title}</p>
        {task.description && <p className="task-desc">{task.description}</p>}
        {task.dueDateUtc && <p className="task-due">Due {formatDueDate(task.dueDateUtc)}</p>}
      </div>

      <div className="task-actions">
        {pending && (
          <span className="task-pending" aria-label="Saving">
            …
          </span>
        )}
        {confirmingDelete ? (
          <>
            <span className="confirm-label">Delete?</span>
            <button
              type="button"
              className="danger"
              disabled={pending}
              onClick={() => onDelete(task.id)}
            >
              Yes
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>
              No
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="danger"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}
