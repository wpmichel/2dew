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

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

// UTC ISO -> coarse relative phrase ("2 hours ago", "yesterday"). Used for completion times,
// where the exact timestamp matters less than roughly how long ago it happened.
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffSeconds = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSeconds);
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (abs >= secs) return RELATIVE.format(Math.round(diffSeconds / secs), unit);
  }
  return RELATIVE.format(Math.round(diffSeconds), "second");
}
