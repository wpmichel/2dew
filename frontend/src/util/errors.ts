import { ApiError } from '../api/client'

export function fieldErrorsOf(err: unknown): Record<string, string[]> {
  return err instanceof ApiError ? err.fieldErrors : {}
}

// ASP.NET validation keys may be PascalCase ("Title") or camelCase; match case-insensitively.
export function fieldError(errors: Record<string, string[]>, name: string): string | undefined {
  const key = Object.keys(errors).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? errors[key].join(' ') : undefined
}

export function messageOf(err: unknown): string {
  if (err instanceof ApiError || err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}
