// Bridges the API's UTC ISO timestamps and the browser's local timezone. Due dates are stored
// and sent as UTC; the user always sees and edits them in their own local time.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// UTC ISO -> value for <input type="datetime-local"> (local "YYYY-MM-DDTHH:mm").
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local datetime-local value -> UTC ISO for the API (null when empty).
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// UTC ISO -> human-readable string in the user's local timezone.
export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
