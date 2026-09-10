import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/auth";

export function serverApiOrigin(): string {
  const apiOrigin = process.env.CLEANOPS_API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiOrigin && process.env.NODE_ENV === "production") {
    throw new Error("CLEANOPS_API_INTERNAL_URL or NEXT_PUBLIC_API_URL must be configured in production");
  }
  return apiOrigin ?? "http://localhost:3000/api";
}

export async function serverApi<T>(path: string): Promise<T> {
  const cookie = (await cookies()).toString();
  const response = await fetch(`${serverApiOrigin()}${path}`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T | { error?: string };
  if (!response.ok) {
    const error = (payload as { error?: string }).error;
    throw new Error(error ?? "API request failed");
  }
  return payload as T;
}

export async function getLiveSession(): Promise<SessionPayload | null> {
  try {
    const payload = await serverApi<{ user?: SessionPayload }>("/auth/me");
    return payload.user ?? null;
  } catch {
    return null;
  }
}
