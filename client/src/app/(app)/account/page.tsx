"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Laptop,
  LogOut,
  Monitor,
  ShieldCheck,
  UserCheck,
  UserCog,
} from "lucide-react";
import { deleteJSON, getJSON, patchJSON, postJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { formatWhen, timeAgo } from "@/lib/time";
import { Badge, Button, Card, Input, Label, Skeleton, Tone } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { PasswordHints, passwordScore } from "@/components/PasswordHints";

interface DeviceSession {
  id: string;
  ip: string;
  userAgent: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  current: boolean;
  active: boolean;
}

export default function AccountPage() {
  const router = useRouter();
  const { user, worker, loading, reload } = useSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [sessionErr, setSessionErr] = useState("");
  const [sessionMsg, setSessionMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setName(user.name ?? "");
    if (worker) setPhone(worker.phone ?? "");
  }, [user, worker]);

  const loadSessions = useCallback(() => {
    getJSON<{ data: DeviceSession[] }>("/auth/sessions")
      .then((d) => setSessions(d.data ?? []))
      .catch((e) => setSessionErr(e.message));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErr("");
    setProfileMsg("");
    try {
      await patchJSON("/auth/profile", { name: name.trim(), phone: phone.trim() });
      setProfileMsg("Profile updated.");
      await reload();
      router.refresh();
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordErr("");
    setPasswordMsg("");
    try {
      const res = await postJSON<{ ok: boolean; revoked: number }>("/auth/password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMsg(
        res.revoked
          ? `Password changed. ${res.revoked} other session(s) were signed out.`
          : "Password changed.",
      );
      loadSessions();
    } catch (err) {
      setPasswordErr(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function revoke(session: DeviceSession) {
    if (!confirm(session.current ? "Sign out of this device?" : "Revoke this session?")) return;
    setBusy(true);
    setSessionErr("");
    try {
      const res = await deleteJSON<{ ok: boolean; signedOut: boolean }>(
        `/auth/sessions/${session.id}`,
      );
      if (res.signedOut) {
        router.push("/login");
        return;
      }
      setSessionMsg("Session revoked.");
      loadSessions();
    } catch (err) {
      setSessionErr(err instanceof Error ? err.message : "Could not revoke session");
    } finally {
      setBusy(false);
    }
  }

  async function revokeOthers() {
    if (!confirm("Sign out every other device?")) return;
    setBusy(true);
    setSessionErr("");
    try {
      const res = await postJSON<{ ok: boolean; revoked: number }>(
        "/auth/sessions/revoke-others",
        {},
      );
      setSessionMsg(
        res.revoked ? `${res.revoked} session(s) signed out.` : "No other sessions were active.",
      );
      loadSessions();
    } catch (err) {
      setSessionErr(err instanceof Error ? err.message : "Could not revoke sessions");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-64" />;

  const activeSessions = (sessions ?? []).filter((s) => s.active);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Profile &amp; security"
        subtitle="Your details, your password and every device signed in to this account."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Tone tone="neutral">{user?.role ?? "—"}</Tone>
            <Tone tone={user?.status === "active" ? "good" : "warn"}>
              {user?.status ?? "unknown"}
            </Tone>
            <Tone tone={activeSessions.length > 1 ? "warn" : "good"}>
              {activeSessions.length} active device(s)
            </Tone>
          </div>
        }
      />

      {user?.createdAt && (
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <UserCheck size={14} className="text-emerald-600" />
          <span>
            {user.email} · member since {formatWhen(user.createdAt)}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
            <UserCog size={18} className="text-brand-600" /> Profile
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Your name shows on comments, assignments and the activity feed.
          </p>
          <form className="mt-4 space-y-3" onSubmit={saveProfile}>
            <div>
              <Label>Full name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={80}
                required
                disabled={savingProfile}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled readOnly />
              <p className="mt-1 text-xs text-ink-400">
                Email changes are handled by an admin from the Members page.
              </p>
            </div>
            <div>
              <Label>Phone {worker ? "" : "(worker profile only)"}</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                placeholder={worker ? "01XXXXXXXXX" : "No worker profile linked"}
                disabled={savingProfile || !worker}
              />
            </div>
            {profileErr && <p className="text-sm font-medium text-red-600">{profileErr}</p>}
            {profileMsg && <p className="text-sm font-medium text-emerald-600">{profileMsg}</p>}
            <Button type="submit" disabled={savingProfile || name.trim().length < 2}>
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
            <KeyRound size={18} className="text-brand-600" /> Password
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Changing your password signs out every other device automatically.
          </p>
          <form className="mt-4 space-y-3" onSubmit={savePassword}>
            <div>
              <Label>Current password</Label>
              <Input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={savingPassword}
              />
              <button type="button" onClick={() => setShowCurrentPassword((value) => !value)} className="mt-1 text-xs text-brand-700">{showCurrentPassword ? "Hide password" : "Show password"}</button>
            </div>
            <div>
              <Label>New password</Label>
              <Input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={savingPassword}
              />
              <button type="button" onClick={() => setShowNewPassword((value) => !value)} className="mt-1 text-xs text-brand-700">{showNewPassword ? "Hide password" : "Show password"}</button>
              <PasswordHints value={newPassword} />
            </div>
            {passwordErr && <p className="text-sm font-medium text-red-600">{passwordErr}</p>}
            {passwordMsg && <p className="text-sm font-medium text-emerald-600">{passwordMsg}</p>}
            <Button
              type="submit"
              disabled={savingPassword || !currentPassword || passwordScore(newPassword) < 4}
            >
              <ShieldCheck size={16} /> {savingPassword ? "Updating…" : "Change password"}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
              <Monitor size={18} className="text-brand-600" /> Signed-in devices
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Every login gets its own session. Revoke anything you do not recognise.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy || activeSessions.length < 2}
            onClick={revokeOthers}
          >
            <LogOut size={16} /> Sign out everywhere else
          </Button>
        </div>

        {sessionErr && <p className="px-5 py-3 text-sm text-red-600">{sessionErr}</p>}
        {sessionMsg && <p className="px-5 py-3 text-sm text-emerald-600">{sessionMsg}</p>}

        {sessions === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">No sessions on record.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {sessions.map((session) => (
              <li
                key={session.id}
                className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${
                  session.current ? "bg-brand-50/40" : "bg-white"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    session.active
                      ? "bg-brand-50 text-brand-600"
                      : "bg-ink-100 text-ink-400"
                  }`}
                >
                  <Laptop size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-800">{session.device}</p>
                    {session.current && (
                      <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">
                        this device
                      </Badge>
                    )}
                    {!session.active && (
                      <Badge className="bg-ink-100 text-ink-500 ring-ink-500/20">revoked</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {session.ip || "unknown IP"} · last seen {timeAgo(session.lastSeenAt)} · signed
                    in {formatWhen(session.createdAt)}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {session.active
                      ? `Expires ${formatWhen(session.expiresAt)}`
                      : `Revoked ${formatWhen(session.revokedAt)}`}
                  </p>
                </div>
                {session.active && (
                  <Button variant="ghost" className="text-xs text-red-600" disabled={busy} onClick={() => revoke(session)}>
                    <LogOut size={14} /> {session.current ? "Sign out" : "Revoke"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
