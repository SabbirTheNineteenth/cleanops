export type Severity = "low" | "medium" | "high" | "critical";

export interface IncidentAI {
  summary: string;
  severity: Severity;
  suggestedAction: string;
  recommendedRole: string;
  responseWindow: string;
  source: "openrouter" | "heuristic";
}

export interface IncidentContext {
  title: string;
  description: string;
  category: string;
  siteName?: string;
}

const SEVERITY_VALUES: Severity[] = ["low", "medium", "high", "critical"];

const RESPONSE_WINDOW: Record<Severity, string> = {
  critical: "Immediate (dispatch now)",
  high: "Within 1 hour",
  medium: "Same day",
  low: "Next scheduled visit",
};

function coerceSeverity(value: unknown): Severity {
  const v = String(value ?? "").toLowerCase().trim();
  return (SEVERITY_VALUES as string[]).includes(v)
    ? (v as Severity)
    : "medium";
}

function extractJson(content: string): Record<string, unknown> | null {
  if (!content) return null;
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

const CRITICAL_WORDS = ["fire", "gas", "electric", "flood", "injury", "injured", "collapse", "hazard", "chemical", "leak", "smoke", "shock"];
const HIGH_WORDS = ["broken", "danger", "unsafe", "blocked", "overflow", "burst", "spill", "power", "water damage", "mold"];
const LOW_WORDS = ["cosmetic", "minor", "smell", "dust", "spot", "light", "restock", "refill"];

const SAFETY_WORDS = ["fire", "gas", "electric", "shock", "hazard", "chemical", "injury", "injured", "collapse", "smoke", "unsafe", "danger"];
const TECH_WORDS = ["leak", "plumbing", "burst", "overflow", "power", "wiring", "hvac", "ac", "drain", "pipe"];

function recommendRole(text: string, severity: Severity): string {
  if (SAFETY_WORDS.some((w) => text.includes(w))) return "Safety Officer";
  if (TECH_WORDS.some((w) => text.includes(w))) return "Field Technician";
  if (severity === "critical" || severity === "high") return "Lead Cleaner";
  return "Field Technician";
}

function heuristic(ctx: IncidentContext): IncidentAI {
  const text = `${ctx.title} ${ctx.description} ${ctx.category}`.toLowerCase();
  let severity: Severity = "medium";
  if (CRITICAL_WORDS.some((w) => text.includes(w))) severity = "critical";
  else if (HIGH_WORDS.some((w) => text.includes(w))) severity = "high";
  else if (LOW_WORDS.some((w) => text.includes(w))) severity = "low";

  const shortDesc =
    ctx.description.trim().length > 0
      ? ctx.description.trim().replace(/\s+/g, " ").slice(0, 160)
      : ctx.title;
  const summary = `${ctx.title}${ctx.siteName ? ` at ${ctx.siteName}` : ""}: ${shortDesc}`.slice(0, 220);

  const actionBySeverity: Record<Severity, string> = {
    critical:
      "Escalate immediately to a supervisor, evacuate/secure the area if unsafe, and dispatch the nearest available worker now.",
    high: "Assign an experienced worker within the hour and notify the site contact.",
    medium: "Assign an available worker today and schedule a follow-up inspection.",
    low: "Add to the routine task queue and address during the next scheduled visit.",
  };

  return {
    summary,
    severity,
    suggestedAction: actionBySeverity[severity],
    recommendedRole: recommendRole(text, severity),
    responseWindow: RESPONSE_WINDOW[severity],
    source: "heuristic",
  };
}

export async function analyzeIncident(ctx: IncidentContext): Promise<IncidentAI> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return heuristic(ctx);

  const model =
    process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
  const prompt = `You are an operations dispatcher for a facilities/cleaning company.
Given an incident report, respond with STRICT JSON only, no markdown, no code fences, using this exact shape:
{"summary": string (max 2 sentences), "severity": one of "low"|"medium"|"high"|"critical", "suggestedAction": string (one actionable step), "recommendedRole": one of "Field Technician"|"Safety Officer"|"Lead Cleaner", "responseWindow": short phrase for how fast to respond (e.g. "Immediate", "Within 1 hour", "Same day", "Next scheduled visit")}

Incident:
- Title: ${ctx.title}
- Category: ${ctx.category}
- Site: ${ctx.siteName ?? "N/A"}
- Description: ${ctx.description || "(none provided)"}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You output only valid minified JSON. No prose, no markdown fences.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.warn(`[ai] OpenRouter ${res.status}; using heuristic fallback`);
      return heuristic(ctx);
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    if (!parsed) {
      console.warn("[ai] Could not parse model JSON; using heuristic fallback");
      return heuristic(ctx);
    }

    const fallback = heuristic(ctx);
    const severity = coerceSeverity(parsed.severity);
    return {
      summary: String(parsed.summary ?? fallback.summary).slice(0, 400),
      severity,
      suggestedAction: String(
        parsed.suggestedAction ?? fallback.suggestedAction,
      ).slice(0, 400),
      recommendedRole: String(
        parsed.recommendedRole ?? fallback.recommendedRole,
      ).slice(0, 60),
      responseWindow: String(
        parsed.responseWindow ?? RESPONSE_WINDOW[severity],
      ).slice(0, 60),
      source: "openrouter",
    };
  } catch (err) {
    console.warn("[ai] OpenRouter call failed; using heuristic fallback:", err);
    return heuristic(ctx);
  }
}
