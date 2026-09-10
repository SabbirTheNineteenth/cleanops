export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

const defaultApiOrigin = "/api";

export function resolveApiOrigin(configuredOrigin = process.env.NEXT_PUBLIC_API_URL): string {
  return configuredOrigin ?? defaultApiOrigin;
}

export function resolveApiUrl(path: string, apiOrigin = resolveApiOrigin()): string {
  const normalizedOrigin = apiOrigin.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedOrigin}${normalizedPath}`;
}

export async function api<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, ...request } = options;
  const response = await fetch(resolveApiUrl(path), {
    ...request,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    credentials: "include",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

function errorMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  if (isRecord(payload) && isRecord(payload.error)) {
    const formErrors = stringValues(payload.error.formErrors);
    const fieldErrors = isRecord(payload.error.fieldErrors)
      ? Object.values(payload.error.fieldErrors).flatMap(stringValues)
      : [];
    const messages = [...formErrors, ...fieldErrors];
    if (messages.length > 0) return messages.join(", ");
  }
  if (status === 401) return "Your session ended. Please sign in again.";
  if (status === 403) return "You do not have access to do that.";
  return `Request failed (${status})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export const getJSON = <T = unknown>(path: string, options?: Omit<ApiRequestOptions, "body" | "method">) => api<T>(path, options);
export const postJSON = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "POST", body });
export const patchJSON = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const deleteJSON = <T = unknown>(path: string) => api<T>(path, { method: "DELETE" });
