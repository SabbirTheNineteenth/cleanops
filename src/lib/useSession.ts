"use client";
import { useCallback, useEffect, useState } from "react";
import { getJSON } from "./api";
import type { SessionPayload } from "./auth";

export interface SessionAccount extends SessionPayload {
  id?: number;
  status?: string;
  emailVerified?: boolean;
  createdAt?: string;
}

export interface SessionWorker {
  id: number;
  role: string;
  phone: string;
  status: string;
}

export function useSession() {
  const [user, setUser] = useState<SessionAccount | null>(null);
  const [worker, setWorker] = useState<SessionWorker | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return getJSON<{ user: SessionAccount; worker: SessionWorker | null }>("/auth/me")
      .then((d) => {
        setUser(d.user);
        setWorker(d.worker ?? null);
      })
      .catch(() => {
        setUser(null);
        setWorker(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    user,
    worker,
    loading,
    reload: load,
    isAdmin: user?.role === "admin",
    userId: user?.sub ? Number(user.sub) : null,
  };
}
