import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { CreateTaskRequest } from "../api/types";

interface InlineCreateRowProps {
  onCreate: (input: CreateTaskRequest) => Promise<void>;
}

// A blank task at the top of the stack: type a title, press Enter, and it is added. Details
// (note, due date) are filled in afterwards by clicking into the created row.
export function InlineCreateRow({ onCreate }: InlineCreateRowProps) {
  const [title, setTitle] = useState("");

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    void onCreate({ title: trimmed, description: null, dueDateUtc: null });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="task-row task-add-row">
      <span className="task-add-plus" aria-hidden="true">
        +
      </span>
      <input
        type="text"
        className="task-add-input"
        placeholder="Add a task"
        value={title}
        maxLength={200}
        aria-label="Add a task"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
