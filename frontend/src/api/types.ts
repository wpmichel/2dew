import type { components } from "./schema";

// Convenience aliases over the OpenAPI-generated schema so app code uses clean names.
// The backend is the source of truth; regenerate schema.ts with `npm run gen:api`.
export type TaskResponse = components["schemas"]["TaskResponse"];
export type CreateTaskRequest = components["schemas"]["CreateTaskRequest"];
export type UpdateTaskRequest = components["schemas"]["UpdateTaskRequest"];
export type AuthResponse = components["schemas"]["AuthResponse"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type LoginRequest = components["schemas"]["LoginRequest"];
export type PagedTasks = components["schemas"]["PagedResponseOfTaskResponse"];
