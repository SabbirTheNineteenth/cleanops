"use client";
import { Check, X } from "lucide-react";

const RULES = [
  { label: "8+ characters", test: (value: string) => value.length >= 8 },
  { label: "lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "number", test: (value: string) => /\d/.test(value) },
];

export function passwordScore(value: string): number {
  return RULES.filter((rule) => rule.test(value)).length;
}

export function PasswordHints({ value }: { value: string }) {
  const score = passwordScore(value);
  const tone =
    score === RULES.length ? "bg-emerald-500" : score >= 2 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {RULES.map((rule, index) => (
          <span
            key={rule.label}
            className={`h-1 flex-1 rounded-full transition ${
              value && index < score ? tone : "bg-ink-200"
            }`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {RULES.map((rule) => {
          const ok = rule.test(value);
          return (
            <li
              key={rule.label}
              className={`inline-flex items-center gap-1 text-xs ${
                ok ? "text-emerald-600" : "text-ink-400"
              }`}
            >
              {ok ? <Check size={12} /> : <X size={12} />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
