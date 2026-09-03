"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, MailWarning, Radar, RefreshCw } from "lucide-react";
import { postJSON } from "@/lib/api";
import { Button, Card, Input, Label, Skeleton } from "@/components/ui";

type State = "idle" | "working" | "done" | "failed";

function VerifyBody() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("idle");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  const confirm = useCallback(async () => {
    if (!token) {
      setState("failed");
      setMessage("This link is missing its confirmation token.");
      return;
    }
    setState("working");
    try {
      const res = await postJSON<{ ok: boolean; pending: boolean; message: string }>(
        "/auth/verify",
        { token },
      );
      setPending(Boolean(res.pending));
      setMessage(res.message ?? "Email confirmed.");
      setState("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That confirmation link is not valid.");
      setState("failed");
    }
  }, [token]);

  useEffect(() => {
    confirm();
  }, [confirm]);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setResending(true);
    setResendMsg("");
    try {
      const res = await postJSON<{ message: string }>("/auth/verify/resend", { email });
      setResendMsg(res.message ?? "If that address needs confirming, a new link is on its way.");
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setResending(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
          <Radar size={22} />
        </div>
        <div>
          <p className="font-display text-lg font-bold leading-none text-ink-900">CleanOps</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-400">
            Email confirmation
          </p>
        </div>
      </div>

      {state === "working" || state === "idle" ? (
        <div className="mt-6 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-600">
            <RefreshCw size={16} className="animate-spin text-brand-600" /> Confirming your
            address…
          </p>
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : state === "done" ? (
        <div className="mt-6 space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {message}
          </p>
          {pending && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
              <Clock size={14} className="mt-0.5 shrink-0" />
              An administrator still has to approve the account before you can sign in.
            </p>
          )}
          <Link href="/login" className="block">
            <Button className="w-full">Go to sign in</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
            <MailWarning size={16} className="mt-0.5 shrink-0" />
            {message}
          </p>
          <form className="space-y-3" onSubmit={resend}>
            <div>
              <Label>Send a fresh link</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            {resendMsg && <p className="text-sm font-medium text-brand-700">{resendMsg}</p>}
            <Button type="submit" className="w-full" disabled={resending}>
              {resending ? "Sending…" : "Resend confirmation"}
            </Button>
          </form>
          <Link
            href="/login"
            className="block text-center text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
      <Suspense fallback={<Skeleton className="h-72 w-full max-w-md" />}>
        <VerifyBody />
      </Suspense>
    </div>
  );
}
