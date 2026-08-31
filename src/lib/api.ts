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
    const msg =
      typeof data?.error === "string"
        ? data.error
        : data?.error?.formErrors?.join(", ") ||
          `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const getJSON = <T = any>(p: string) => api<T>(p);
export const postJSON = <T = any>(p: string, body: unknown) =>
  api<T>(p, { method: "POST", body: JSON.stringify(body) });
export const patchJSON = <T = any>(p: string, body: unknown) =>
  api<T>(p, { method: "PATCH", body: JSON.stringify(body) });
export const deleteJSON = <T = any>(p: string) =>
  api<T>(p, { method: "DELETE" });
