"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, ShieldCheck, Sparkles, Activity, MapPin, MailCheck } from "lucide-react";
import { postJSON } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui";

const FEATURES = [
  { icon: Activity, title: "Real-time incident triage", desc: "Report, assign, and resolve issues across every site from one console." },
  { icon: Sparkles, title: "AI-assisted analysis", desc: "Automatic summaries, severity scoring, and suggested next actions." },
  { icon: MapPin, title: "Sites & workforce", desc: "Manage client locations and assign the right field staff instantly." },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "login") {
        await postJSON("/auth/login", { email, password });
        router.push("/dashboard");
        router.refresh();
      } else {
        const res = await postJSON<{ pending?: boolean; message?: string }>(
          "/auth/register",
          { name, email, password },
        );

        setNotice(
          res.message ??
            "Registration received. An administrator will review your account shortly.",
        );
        setMode("login");
        setName("");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">

      <div className="relative hidden overflow-hidden bg-rail-950 p-10 text-ink-300 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
            <Radar size={22} />
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none text-white">CleanOps</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-500">Ops Console</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-3xl font-bold leading-tight text-white">
            Operations, under control.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            One place to run incident management across all your sites — from the
            first report to a documented resolution.
          </p>

          <div className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-brand-300">
                  <f.icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs leading-relaxed text-ink-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-ink-500">
          © {new Date().getFullYear()} CleanOps · Operations Incident Console
        </p>
      </div>

      <div className="flex items-center justify-center bg-ink-50 p-6">
        <div className="w-full max-w-sm">

          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
              <Radar size={22} />
            </div>
            <div>
              <p className="font-display text-lg font-bold leading-none text-ink-900">CleanOps</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-400">Ops Console</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-ink-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {mode === "login"
              ? "Sign in to continue to your console."
              : "Register and an admin will approve your account."}
          </p>

          <div className="mt-6 flex rounded-lg bg-ink-100 p-1 text-sm font-medium">
            <button
              onClick={() => { setMode("login"); setError(""); setNotice(""); }}
              className={`flex-1 rounded-md py-1.5 transition ${mode === "login" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); setNotice(""); }}
              className={`flex-1 rounded-md py-1.5 transition ${mode === "register" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {notice && (
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <MailCheck size={16} className="mt-0.5 shrink-0" />
                {notice}
              </p>
            )}
            {mode === "register" && (
              <div>
                <Label>Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
