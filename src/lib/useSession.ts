"use client";
import { useEffect, useState } from "react";
import { getJSON } from "./api";
import type { SessionPayload } from "./auth";

export function useSession() {
  const [user, setUser] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJSON<{ user: SessionPayload }>("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, isAdmin: user?.role === "admin" };
}
