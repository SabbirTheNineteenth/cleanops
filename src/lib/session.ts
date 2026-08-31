import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken, type SessionPayload } from "./auth";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifyToken(token);
}
