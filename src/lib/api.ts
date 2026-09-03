export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(errorMessage(data, res.status));
  }
  return data as T;
}

function errorMessage(data: any, status: number): string {
  const error = data?.error;
  if (typeof error === "string") return error;
  const form: string[] = error?.formErrors ?? [];
  const fields: string[] = Object.values(error?.fieldErrors ?? {})
    .flat()
    .filter((value): value is string => typeof value === "string");
  const all = [...form, ...fields];
  if (all.length) return all.join(", ");
  if (status === 401) return "Your session ended. Please sign in again.";
  if (status === 403) return "You do not have access to do that.";
  return `Request failed (${status})`;
}

export const getJSON = <T = any>(p: string) => api<T>(p);
export const postJSON = <T = any>(p: string, body: unknown) =>
  api<T>(p, { method: "POST", body: JSON.stringify(body) });
export const patchJSON = <T = any>(p: string, body: unknown) =>
  api<T>(p, { method: "PATCH", body: JSON.stringify(body) });
export const deleteJSON = <T = any>(p: string) =>
  api<T>(p, { method: "DELETE" });
