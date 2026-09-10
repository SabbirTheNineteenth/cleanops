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

export function coerceSeverity(value: unknown): Severity {
  const v = String(value ?? "").toLowerCase().trim();
  return (SEVERITY_VALUES as string[]).includes(v)
    ? (v as Severity)
    : "medium";
}

export function extractJson(content: string): Record<string, unknown> | null {
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

interface OpenRouterModel {
  id?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { output_modalities?: string[] };
}

const MODEL_TTL_OK_MS = 30 * 60 * 1000;
const MODEL_TTL_FAIL_MS = 2 * 60 * 1000;
const MAX_MODEL_ATTEMPTS = 4;
const TOTAL_AI_BUDGET_MS = 24000;
const PER_CALL_TIMEOUT_MS = 12000;

const SEED_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "google/gemma-2-9b-it:free",
  "mistralai/mistral-7b-instruct:free",
];

const FAMILY_PREFERENCE = [
  "llama-3.3",
  "deepseek",
  "qwen",
  "gemma",
  "mistral",
  "phi",
  "llama-3.1",
];

const MODEL_DENY = [
  "guard",
  "embed",
  "rerank",
  "moderation",
  "whisper",
  "tts",
  "sdxl",
  "flux",
  "dall-e",
  "stable-diffusion",
];

let modelCache: { ids: string[]; expires: number } | null = null;

function isFreePrice(price?: string): boolean {
  if (price === undefined || price === null) return false;
  const n = Number(price);
  return Number.isFinite(n) && n === 0;
}

function isFreeChatModel(m: OpenRouterModel): boolean {
  const id = (m.id ?? "").toLowerCase();
  if (!id) return false;
  if (MODEL_DENY.some((bad) => id.includes(bad))) return false;
  const out = m.architecture?.output_modalities;
  if (out && out.length > 0 && !out.includes("text")) return false;
  return isFreePrice(m.pricing?.prompt) && isFreePrice(m.pricing?.completion);
}

function rankModel(m: OpenRouterModel): number {
  const id = (m.id ?? "").toLowerCase();
  const idx = FAMILY_PREFERENCE.findIndex((f) => id.includes(f));
  const family = idx === -1 ? FAMILY_PREFERENCE.length : idx;
  const ctx = Math.min(m.context_length ?? 0, 999999);
  return family * 1000000 - ctx;
}

function preferredModels(): string[] {
  return (process.env.OPENROUTER_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function freeModelIds(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (modelCache && now < modelCache.expires) return modelCache.ids;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const list: OpenRouterModel[] = Array.isArray(data?.data) ? data.data : [];
    const ids = list
      .filter(isFreeChatModel)
      .sort((a, b) => rankModel(a) - rankModel(b))
      .map((m) => String(m.id));
    if (ids.length === 0) throw new Error("no free models in catalogue");

    modelCache = { ids, expires: now + MODEL_TTL_OK_MS };
    console.info(`[ai] ${ids.length} free models available; first choice ${ids[0]}`);
    return ids;
  } catch (err) {
    console.warn(
      "[ai] free-model discovery failed; using seed list:",
      err instanceof Error ? err.message : err,
    );
    modelCache = { ids: SEED_FREE_MODELS, expires: now + MODEL_TTL_FAIL_MS };
    return SEED_FREE_MODELS;
  }
}

interface ChatRequest {
  system: string;
  user: string;
  temperature: number;
  validate?: (content: string) => boolean;
}

interface ChatResult {
  content: string;
  model: string;
}

async function chatOnce(
  apiKey: string,
  model: string,
  req: ChatRequest,
  timeoutMs: number,
): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: req.temperature,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    console.warn(`[ai] ${model}: HTTP ${res.status}`);
    return null;
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return content.trim() ? content : null;
}

async function chatWithFreeModel(req: ChatRequest): Promise<ChatResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const key = apiKey;

  const deadline = Date.now() + TOTAL_AI_BUDGET_MS;
  const tried = new Set<string>();
  let attempts = 0;

  const tryList = async (ids: string[]): Promise<ChatResult | null> => {
    for (const model of ids) {
      if (!model || tried.has(model)) continue;
      const remaining = deadline - Date.now();
      if (attempts >= MAX_MODEL_ATTEMPTS || remaining < 2000) return null;
      tried.add(model);
      attempts += 1;
      try {
        const content = await chatOnce(
          key,
          model,
          req,
          Math.min(PER_CALL_TIMEOUT_MS, remaining),
        );
        if (content && (!req.validate || req.validate(content))) {
          return { content, model };
        }
        if (content) {
          console.warn(`[ai] ${model}: unusable response, trying the next model`);
        }
      } catch (err) {
        console.warn(
          `[ai] ${model}: call failed,`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return null;
  };

  const fromPreference = await tryList(preferredModels());
  if (fromPreference) return fromPreference;
  if (attempts >= MAX_MODEL_ATTEMPTS || Date.now() > deadline - 3000) return null;

  return tryList(await freeModelIds(key));
}

export function cleanupModelText(raw: string): string {
  return raw
    .replace(/```/g, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim()
    .slice(0, 1000);
}

const CRITICAL_WORDS = ["fire", "gas", "electric", "flood", "injury", "injured", "collapse", "hazard", "chemical", "leak", "smoke", "shock"];
const HIGH_WORDS = ["broken", "danger", "unsafe", "blocked", "overflow", "burst", "spill", "power", "water damage", "mold"];
const LOW_WORDS = ["cosmetic", "minor", "smell", "dust", "spot", "light", "restock", "refill"];

const SAFETY_WORDS = ["fire", "gas", "electric", "shock", "hazard", "chemical", "injury", "injured", "collapse", "smoke", "unsafe", "danger"];
const TECH_WORDS = ["leak", "plumbing", "burst", "overflow", "power", "wiring", "hvac", "ac", "drain", "pipe"];

export function recommendRole(text: string, severity: Severity): string {
  if (SAFETY_WORDS.some((w) => text.includes(w))) return "Safety Officer";
  if (TECH_WORDS.some((w) => text.includes(w))) return "Field Technician";
  if (severity === "critical" || severity === "high") return "Lead Cleaner";
  return "Field Technician";
}

export function heuristic(ctx: IncidentContext): IncidentAI {
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

export type EnhanceMode = "style" | "translate" | "fix";

export type StylePreset =
  | "formal"
  | "short"
  | "detailed"
  | "corporate"
  | "simple"
  | "urgent";

export type TranslateLanguage = "english" | "bangla" | "hindi" | "arabic";

export interface EnhanceContext {
  text: string;
  mode?: EnhanceMode;
  preset?: StylePreset;
  language?: TranslateLanguage;
  title?: string;
  category?: string;
  siteName?: string;
}

export interface EnhancedText {
  text: string;
  source: "openrouter" | "heuristic" | "unavailable";
  mode: EnhanceMode;
  label: string;
  model?: string;
}

const STYLE_RULES: Record<StylePreset, { label: string; rule: string }> = {
  formal: {
    label: "Formal",
    rule: "Rewrite it in formal, professional operations-report language. Full sentences, no slang, no contractions.",
  },
  short: {
    label: "Short",
    rule: "Compress it to the shortest form that still carries every fact. One or two sentences maximum, no filler.",
  },
  detailed: {
    label: "Detailed",
    rule: "Organise it into a fuller report using ONLY the facts already present: what happened, where, and the visible impact.",
  },
  corporate: {
    label: "Corporate",
    rule: "Rewrite it as a measured corporate incident update suitable for a client or management email.",
  },
  simple: {
    label: "Simple",
    rule: "Rewrite it in very plain language a field worker can read instantly. Short words, short sentences.",
  },
  urgent: {
    label: "Urgent",
    rule: "Rewrite it as an urgent escalation note that leads with the risk and the action needed, staying strictly factual.",
  },
};

const LANGUAGE_NAMES: Record<TranslateLanguage, string> = {
  english: "English",
  bangla: "Bengali (Bangla)",
  hindi: "Hindi",
  arabic: "Arabic",
};

export function tidyText(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  const joined = sentences.join(" ");
  return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

export function shorten(input: string): string {
  const tidy = tidyText(input);
  const sentences = tidy.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.slice(0, 2).join(" ");
  if (!kept) return tidy;
  return kept.length > 220 ? `${kept.slice(0, 217).trimEnd()}...` : kept;
}

function enhanceLabel(
  mode: EnhanceMode,
  preset: StylePreset,
  language: TranslateLanguage,
): string {
  if (mode === "translate") return LANGUAGE_NAMES[language];
  if (mode === "fix") return "Grammar & spelling";
  return STYLE_RULES[preset].label;
}

function localFallback(
  ctx: EnhanceContext,
  mode: EnhanceMode,
  preset: StylePreset,
  label: string,
): EnhancedText {
  if (mode === "translate") {
    return { text: ctx.text, source: "unavailable", mode, label };
  }
  const text =
    mode === "style" && preset === "short" ? shorten(ctx.text) : tidyText(ctx.text);
  return { text, source: "heuristic", mode, label };
}

function enhanceInstruction(
  mode: EnhanceMode,
  preset: StylePreset,
  language: TranslateLanguage,
): string {
  if (mode === "translate") {
    const name = LANGUAGE_NAMES[language];
    return `Translate the following facilities-operations incident note into ${name}. If it is already in ${name}, correct it and return it in ${name}. Keep site names, codes and numbers exactly as written.`;
  }
  if (mode === "fix") {
    return "Fix only the grammar, spelling and punctuation of the following incident note. Keep the original wording, language, tone and length as close as possible. Do not restyle it and do not translate it.";
  }
  return `Rewrite the following facilities-operations incident note. ${STYLE_RULES[preset].rule} Keep it in the same language as the original.`;
}

export async function enhanceIncidentText(
  ctx: EnhanceContext,
): Promise<EnhancedText> {
  const mode: EnhanceMode = ctx.mode ?? "style";
  const preset: StylePreset = ctx.preset ?? "formal";
  const language: TranslateLanguage = ctx.language ?? "english";
  const label = enhanceLabel(mode, preset, language);
  const fallback = localFallback(ctx, mode, preset, label);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fallback;

  const temperature = mode === "fix" ? 0.1 : mode === "translate" ? 0.2 : 0.35;
  const prompt = `${enhanceInstruction(mode, preset, language)}

Rules:
- Keep every fact from the original. Do NOT invent details, causes, names, times, quantities or measurements.
- Plain prose only: no bullet points, no headings, no quotes, no preamble, no explanation.
- Reply with the resulting note only, nothing else.

Context (for tone only): title "${ctx.title || "N/A"}", category "${ctx.category || "N/A"}", site "${ctx.siteName || "N/A"}".

Note:
${ctx.text}`;

  const result = await chatWithFreeModel({
    system:
      "You are a text editing engine for an operations app. Output only the resulting note as plain text.",
    user: prompt,
    temperature,
    validate: (content) => cleanupModelText(content).length > 0,
  });
  if (!result) return fallback;

  const text = cleanupModelText(result.content);
  if (!text) return fallback;

  return { text, source: "openrouter", mode, label, model: result.model };
}

export async function analyzeIncident(ctx: IncidentContext): Promise<IncidentAI> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return heuristic(ctx);

  const prompt = `You are an operations dispatcher for a facilities/cleaning company.
Given an incident report, respond with STRICT JSON only, no markdown, no code fences, using this exact shape:
{"summary": string (max 2 sentences), "severity": one of "low"|"medium"|"high"|"critical", "suggestedAction": string (one actionable step), "recommendedRole": one of "Field Technician"|"Safety Officer"|"Lead Cleaner", "responseWindow": short phrase for how fast to respond (e.g. "Immediate", "Within 1 hour", "Same day", "Next scheduled visit")}

Incident:
- Title: ${ctx.title}
- Category: ${ctx.category}
- Site: ${ctx.siteName ?? "N/A"}
- Description: ${ctx.description || "(none provided)"}`;

  const result = await chatWithFreeModel({
    system: "You output only valid minified JSON. No prose, no markdown fences.",
    user: prompt,
    temperature: 0.2,
    validate: (content) => extractJson(content) !== null,
  });
  if (!result) return heuristic(ctx);

  const parsed = extractJson(result.content);
  if (!parsed) return heuristic(ctx);

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
}
