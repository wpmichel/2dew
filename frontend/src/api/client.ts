import type {
  AuthResponse,
  CreateTaskRequest,
  LoginRequest,
  PagedTasks,
  RegisterRequest,
  TaskResponse,
  UpdateTaskRequest,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5088'
const TOKEN_KEY = 'todo.token'

// Thrown for any non-2xx response. `fieldErrors` carries server-side validation messages
// (from ASP.NET ValidationProblemDetails) so forms can show them inline.
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function toError(res: Response): Promise<ApiError> {
  let message = res.statusText
  let fieldErrors: Record<string, string[]> = {}
  try {
    const data = await res.json()
    if (data && typeof data === 'object') {
      if (data.errors && typeof data.errors === 'object') {
        fieldErrors = data.errors as Record<string, string[]>
        message = 'Please fix the highlighted fields.'
      } else if (typeof data.title === 'string') {
        message = data.title
      }
    }
  } catch {
    // Non-JSON error body; fall back to the status text.
  }
  if (res.status === 401 && !message) message = 'Your session has expired. Please log in again.'
  return new ApiError(res.status, message, fieldErrors)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface ListParams {
  cursor?: string | null
  limit?: number
  search?: string
}

function queryString(params: ListParams): string {
  const search = new URLSearchParams()
  if (params.cursor) search.set('cursor', params.cursor)
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.search) search.set('search', params.search)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  register: (body: RegisterRequest) => request<AuthResponse>('POST', '/api/auth/register', body),
  login: (body: LoginRequest) => request<AuthResponse>('POST', '/api/auth/login', body),
  listTasks: (params: ListParams = {}) =>
    request<PagedTasks>('GET', `/api/tasks${queryString(params)}`),
  createTask: (body: CreateTaskRequest) => request<TaskResponse>('POST', '/api/tasks', body),
  updateTask: (id: string, body: UpdateTaskRequest) =>
    request<TaskResponse>('PUT', `/api/tasks/${id}`, body),
  deleteTask: (id: string) => request<void>('DELETE', `/api/tasks/${id}`),
}
