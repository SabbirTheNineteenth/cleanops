"use client";
import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, ShieldAlert, Sparkles } from "lucide-react";
import { postJSON } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { PasswordHints, passwordScore } from "@/components/PasswordHints";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";

function pick(pool: string, count: number): string[] {
  const bytes = new Uint32Array(count);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => pool[n % pool.length]);
}

function generatePassword(): string {
  const chars = [
    ...pick(UPPER, 3),
    ...pick(LOWER, 5),
    ...pick(DIGITS, 3),
    ...pick(SYMBOLS, 1),
  ];
  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  return chars
    .map((char, i) => ({ char, key: order[i] }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.char)
    .join("");
}

export function ResetPasswordModal({
  target,
  onClose,
  onSaved,
}: {
  target: { id: number; name: string; email: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function copyPassword() { await navigator.clipboard.writeText(password); }

  useEffect(() => {
    if (target) {
      setPassword("");
      setShowPassword(false);
      setError("");
    }
  }, [target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError("");
    setSaving(true);
    try {
      await postJSON(`/users/${target.id}/password`, { password });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const weak = passwordScore(password) < 4;

  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Reset password">
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
          Setting a new password for{" "}
          <span className="font-semibold text-ink-800">{target?.name}</span>{" "}
          <span className="text-xs text-ink-400">({target?.email})</span>
        </p>

        <div>
          <div className="flex items-end justify-between gap-2">
            <Label>New password</Label>
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              <Sparkles size={12} /> Generate
            </button>
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="mb-1.5 text-brand-700">{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            <button type="button" aria-label="Copy password" disabled={!password} onClick={copyPassword} className="mb-1.5 text-brand-700"><Copy size={14} /></button>
          </div>
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Type or generate a password"
            autoComplete="off"
            required
          />
          <PasswordHints value={password} />
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          All of this member&apos;s active sessions are signed out, and they get a security
          notification. Share the password with them directly — it is shown only here.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || weak}>
            <KeyRound size={14} /> {saving ? "Resetting…" : "Reset password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
