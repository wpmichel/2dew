import { useState, type FormEvent } from "react";
import type { CreateTaskRequest } from "../api/types";
import { fieldError, fieldErrorsOf, messageOf } from "../util/errors";
import { fromLocalInputValue, toLocalInputValue } from "../util/datetime";

export interface TaskFormInitial {
  title: string;
  description: string | null;
  dueDateUtc: string | null;
}

interface TaskFormProps {
  initial?: TaskFormInitial;
  submitLabel: string;
  onSubmit: (input: CreateTaskRequest) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function TaskForm({ initial, submitLabel, onSubmit, onCancel, autoFocus }: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueLocal, setDueLocal] = useState(toLocalInputValue(initial?.dueDateUtc));
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setServerErrors({});
    setFormError(null);

    if (!title.trim()) {
      setTitleError("Title is required.");
      return;
    }
    setTitleError(null);

    const input: CreateTaskRequest = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      dueDateUtc: fromLocalInputValue(dueLocal),
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
      if (!initial) {
        // Reset the create form for the next entry; the edit form is closed by its parent.
        setTitle("");
        setDescription("");
        setDueLocal("");
      }
    } catch (err) {
      // Preserve the user's input; surface server-side validation inline.
      setServerErrors(fieldErrorsOf(err));
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  const titleServerError = titleError ?? fieldError(serverErrors, "title");
  const dueServerError = fieldError(serverErrors, "dueDateUtc");

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      {formError && (
        <p className="error-banner" role="alert">
          {formError}
        </p>
      )}

      <label className="field">
        <span>Title</span>
        <input
          type="text"
          value={title}
          maxLength={200}
          autoFocus={autoFocus}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleServerError ? true : undefined}
          aria-label="Title"
        />
        {titleServerError && <span className="field-error">{titleServerError}</span>}
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          value={description}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Description"
        />
      </label>

      <label className="field">
        <span>Due date</span>
        <input
          type="datetime-local"
          value={dueLocal}
          onChange={(e) => setDueLocal(e.target.value)}
          aria-invalid={dueServerError ? true : undefined}
          aria-label="Due date"
        />
        {dueServerError && <span className="field-error">{dueServerError}</span>}
      </label>

      <div className="task-form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
