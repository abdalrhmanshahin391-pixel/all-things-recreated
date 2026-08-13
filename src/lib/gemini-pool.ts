// Shared Gemini helper: pool of keys + automatic model fallback + client-side
// rate limiter (RPM / RPD) so we NEVER send a request that would 429.
//
// Limits are loaded from the `admin_ai_model_limits` table so you can edit
// them whenever Google changes their free-tier numbers.

export type ModelLimit = {
  rpm: number;
  rpd: number;
  supportsVision: boolean;
  enabled: boolean;
  smoothPacing: boolean;
  cooldownSeconds: number;
  sortOrder: number;
  label: string;
  maxConcurrent: number;
  apiModelId: string;     // exact id sent to Google
  useJsonMime: boolean;   // some models reject responseMimeType:application/json
};

export type GeminiPool = {
  keys: string[];
  preferredModel: string;
  limits: Record<string, ModelLimit>;
};

// Hard-coded SAFE fallback used only when the DB read fails. The real source
// of truth is `admin_ai_model_limits`. Numbers are intentionally CONSERVATIVE.
const FALLBACK_LIMITS: Record<string, ModelLimit> = {
  "gemini-2.5-flash-lite": { rpm: 15, rpd: 1000, supportsVision: true,  enabled: true, smoothPacing: false, cooldownSeconds: 30, sortOrder: 10, label: "Gemini 2.5 Flash-Lite", maxConcurrent: 4, apiModelId: "gemini-flash-lite-latest", useJsonMime: true },
  "gemini-2.0-flash-lite": { rpm: 30, rpd: 200,  supportsVision: true,  enabled: true, smoothPacing: true,  cooldownSeconds: 30, sortOrder: 20, label: "Gemini 2.0 Flash-Lite", maxConcurrent: 3, apiModelId: "gemini-2.0-flash-lite-001", useJsonMime: false },
  "gemini-2.0-flash":      { rpm: 15, rpd: 200,  supportsVision: true,  enabled: true, smoothPacing: true,  cooldownSeconds: 30, sortOrder: 30, label: "Gemini 2.0 Flash",      maxConcurrent: 2, apiModelId: "gemini-2.0-flash-001", useJsonMime: true },
  "gemini-2.5-flash":      { rpm: 10, rpd: 250,  supportsVision: true,  enabled: true, smoothPacing: true,  cooldownSeconds: 30, sortOrder: 40, label: "Gemini 2.5 Flash",      maxConcurrent: 1, apiModelId: "gemini-2.5-flash", useJsonMime: true },
  "gemini-1.5-flash":      { rpm: 15, rpd: 50,   supportsVision: true,  enabled: true, smoothPacing: true,  cooldownSeconds: 30, sortOrder: 50, label: "Gemini 1.5 Flash",      maxConcurrent: 2, apiModelId: "gemini-1.5-flash-latest", useJsonMime: true },
  "gemini-3-pro-preview":  { rpm: 5,  rpd: 100,  supportsVision: true,  enabled: true, smoothPacing: true,  cooldownSeconds: 30, sortOrder: 60, label: "Gemini 3 Pro Preview",  maxConcurrent: 1, apiModelId: "gemini-3-pro-preview", useJsonMime: true },
  "gemma-3-27b-it":        { rpm: 30, rpd: 14400, supportsVision: false, enabled: true, smoothPacing: false, cooldownSeconds: 30, sortOrder: 70, label: "Gemma 3 27B",          maxConcurrent: 2, apiModelId: "gemma-3-27b-it", useJsonMime: false },
};
const HARD_DEFAULT: ModelLimit = { rpm: 5, rpd: 50, supportsVision: false, enabled: true, smoothPacing: true, cooldownSeconds: 30, sortOrder: 999, label: "(unknown)", maxConcurrent: 1, apiModelId: "", useJsonMime: true };

export async function loadModelLimits(supabase: any): Promise<Record<string, ModelLimit>> {
  try {
    const { data, error } = await (supabase.from as any)("admin_ai_model_limits")
      .select("model_id,label,rpm,rpd,supports_vision,enabled,smooth_pacing,cooldown_seconds,sort_order,max_concurrent,api_model_id,use_json_mime")
      .order("sort_order", { ascending: true });
    if (error || !data || !data.length) return { ...FALLBACK_LIMITS };
    const out: Record<string, ModelLimit> = {};
    for (const r of data as any[]) {
      out[r.model_id] = {
        rpm: Number(r.rpm) || 5,
        rpd: Number(r.rpd) || 50,
        supportsVision: !!r.supports_vision,
        enabled: r.enabled !== false,
        smoothPacing: r.smooth_pacing !== false,
        // Honor 0 — admin "no cooldown" must actually mean no cooldown.
        cooldownSeconds: Number.isFinite(Number(r.cooldown_seconds)) ? Number(r.cooldown_seconds) : 30,
        sortOrder: Number(r.sort_order) || 100,
        label: String(r.label || r.model_id),
        maxConcurrent: Math.max(1, Number(r.max_concurrent) || 1),
        apiModelId: String(r.api_model_id || r.model_id),
        useJsonMime: r.use_json_mime !== false,
      };
    }
    return out;
  } catch {
    return { ...FALLBACK_LIMITS };
  }
}

export async function getGeminiPool(supabase: any): Promise<GeminiPool> {
  const { data, error } = await supabase
    .from("admin_ai_keys")
    .select("api_key, slot, preferred_model")
    .eq("provider", "gemini")
    .order("slot", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { api_key: string; slot: number; preferred_model: string | null }[];
  const keys = rows.map((r) => r.api_key).filter((k) => !!k && k.length > 8);
  const limits = await loadModelLimits(supabase);
  const preferredFromDb = rows.find((r) => r.preferred_model)?.preferred_model;
  const enabledIds = Object.entries(limits).filter(([, l]) => l.enabled).map(([id]) => id);
  // Default to Flash-Lite (best balance of speed + free quota), NOT the highest RPD
  // which would otherwise pick Gemma (text-only) and silently break PDFs.
  let preferredModel = preferredFromDb && limits[preferredFromDb]?.enabled
    ? preferredFromDb
    : (limits["gemini-2.5-flash-lite"]?.enabled
        ? "gemini-2.5-flash-lite"
        : (enabledIds.sort((a, b) => (limits[a].sortOrder - limits[b].sortOrder))[0] || "gemini-2.5-flash-lite"));
  return { keys, preferredModel, limits };
}

function limitFor(pool: GeminiPool, model: string): ModelLimit {
  return pool.limits[model] ?? HARD_DEFAULT;
}

function fallbackOrder(pool: GeminiPool, allowTextOnly: boolean): string[] {
  const ids = Object.entries(pool.limits)
    .filter(([, l]) => l.enabled && (allowTextOnly || l.supportsVision))
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([id]) => id);
  const front = pool.preferredModel && ids.includes(pool.preferredModel) ? [pool.preferredModel] : [];
  return [...front, ...ids.filter((id) => id !== pool.preferredModel)];
}

// ─── Bucket state (per server instance) ──────────────────────────────────────
type Bucket = {
  minuteWindow: number[];
  dayCount: number;
  dayResetAt: number;
  dailyExhaustedUntil: number;
  cooldownUntil: number;
  lastSendAt: number;
  unavailableUntil: number;   // soft retry every ~10min instead of full day
  lastError: string;
  lastErrorAt: number;
  inFlight: number;
  transientStreak: number;    // consecutive 5xx/UNAVAILABLE — drives exp backoff
};
const buckets = new Map<string, Bucket>();
const UNAVAILABLE_RETRY_MS = 10 * 60_000;

function fingerprint(key: string, model: string) { return `${key.slice(0, 8)}:${model}`; }
function getBucket(key: string, model: string): Bucket {
  const fp = fingerprint(key, model);
  let b = buckets.get(fp);
  const now = Date.now();
  if (!b) {
    b = { minuteWindow: [], dayCount: 0, dayResetAt: now + 24 * 3600_000, dailyExhaustedUntil: 0, cooldownUntil: 0, lastSendAt: 0, unavailableUntil: 0, lastError: "", lastErrorAt: 0, inFlight: 0, transientStreak: 0 };
    buckets.set(fp, b);
  }
  if (now >= b.dayResetAt) {
    b.dayCount = 0;
    b.dayResetAt = now + 24 * 3600_000;
    b.dailyExhaustedUntil = 0;
  }
  const cutoff = now - 60_000;
  while (b.minuteWindow.length && b.minuteWindow[0] < cutoff) b.minuteWindow.shift();
  return b;
}

export function resetModelBuckets(modelId: string) {
  for (const [fp, b] of buckets.entries()) {
    if (fp.endsWith(`:${modelId}`)) {
      b.unavailableUntil = 0;
      b.cooldownUntil = 0;
      b.dailyExhaustedUntil = 0;
      b.lastError = "";
      b.lastErrorAt = 0;
    }
  }
}

// Returns ms until this (key, model) can send. 0 = ready now.
function nextSlotMs(pool: GeminiPool, key: string, model: string): number {
  const b = getBucket(key, model);
  const lim = limitFor(pool, model);
  const now = Date.now();
  if (b.unavailableUntil > now) return b.unavailableUntil - now;
  if (b.dailyExhaustedUntil > now) return b.dailyExhaustedUntil - now;
  if (b.dayCount >= lim.rpd) return Math.max(1000, b.dayResetAt - now);
  if (b.cooldownUntil > now) return b.cooldownUntil - now;
  if (b.inFlight >= lim.maxConcurrent) return 75;
  if (b.minuteWindow.length >= lim.rpm) {
    return Math.max(250, 60_000 - (now - b.minuteWindow[0]) + 250);
  }
  if (lim.smoothPacing && b.lastSendAt) {
    const minInterval = Math.floor(60_000 / Math.max(1, lim.rpm));
    const waitSmooth = b.lastSendAt + minInterval - now;
    if (waitSmooth > 0) return waitSmooth;
  }
  return 0;
}

// ─── Status snapshot for the admin UI ────────────────────────────────────────
export type PoolStatusRow = {
  keyLabel: string;
  model: string;
  modelLabel: string;
  minuteUsed: number;
  minuteLimit: number;
  dailyUsed: number;
  dailyLimit: number;
  inFlight: number;
  maxConcurrent: number;
  nextSlotInMs: number;
  cooldownMs: number;
  exhaustedToday: boolean;
  unavailable: boolean;
  unavailableMs: number;
  smoothPacing: boolean;
  lastError: string;
  lastErrorAt: number;
};

export function getPoolStatus(pool: GeminiPool, allowTextOnly = true): PoolStatusRow[] {
  const models = fallbackOrder(pool, allowTextOnly);
  const out: PoolStatusRow[] = [];
  const now = Date.now();
  pool.keys.forEach((key, i) => {
    for (const model of models) {
      const b = getBucket(key, model);
      const lim = limitFor(pool, model);
      out.push({
        keyLabel: `Key ${i + 1}`,
        model,
        modelLabel: lim.label,
        minuteUsed: b.minuteWindow.length,
        minuteLimit: lim.rpm,
        dailyUsed: b.dayCount,
        dailyLimit: lim.rpd,
        inFlight: b.inFlight,
        maxConcurrent: lim.maxConcurrent,
        nextSlotInMs: nextSlotMs(pool, key, model),
        cooldownMs: Math.max(0, b.cooldownUntil - now),
        exhaustedToday: b.dayCount >= lim.rpd || b.dailyExhaustedUntil > now,
        unavailable: b.unavailableUntil > now,
        unavailableMs: Math.max(0, b.unavailableUntil - now),
        smoothPacing: lim.smoothPacing,
        lastError: b.lastError,
        lastErrorAt: b.lastErrorAt,
      });
    }
  });
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CallOpts = {
  pool: GeminiPool;
  systemPrompt: string;
  userParts: any[];
  allowTextOnly?: boolean;
  timeoutMs?: number;
  generationConfig?: Record<string, any>;
  waitForSlot?: boolean;
  /** Force this model id to be tried FIRST (still falls back if it errors). */
  forceModel?: string;
  /** Only allow this exact model — no fallback to others. */
  onlyModel?: string;
};

export async function callGeminiJSON(opts: CallOpts): Promise<string> {
  if (!opts.pool.keys.length) {
    throw new Error("No Gemini API keys configured. Add at least one key in /admin/ai-keys.");
  }
  const waitForSlot = opts.waitForSlot ?? true;
  const allowText = opts.allowTextOnly ?? true;
  const hasNonText = opts.userParts.some((p) => p?.inline_data);
  let models = fallbackOrder(opts.pool, allowText).filter((m) => {
    const lim = limitFor(opts.pool, m);
    if (!hasNonText) return true;
    return lim.supportsVision;
  });
  if (opts.onlyModel) {
    // A locked Jarvis call must never silently fall back to a higher-cost model
    // just because the admin limits row was deleted or disabled during remix.
    // `limitFor` below has safe defaults and sends `opts.onlyModel` as the API id.
    models = [opts.onlyModel];
  } else if (opts.forceModel && opts.pool.limits[opts.forceModel]) {
    models = [opts.forceModel, ...models.filter((m) => m !== opts.forceModel)];
  }

  const controller = new AbortController();
  const totalTimeout = opts.timeoutMs ?? 90_000;
  const deadline = Date.now() + totalTimeout;
  const timeout = setTimeout(() => controller.abort(), totalTimeout);
  let lastErr = "";

  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (Date.now() >= deadline) {
        throw new Error(`Gemini timed out after ${Math.round(totalTimeout / 1000)}s`);
      }
      let soonestWait = Infinity;
      let anyUsable = false;

      for (const model of models) {
        for (const key of opts.pool.keys) {
          const b = getBucket(key, model);
          const lim = limitFor(opts.pool, model);
          if (b.unavailableUntil > Date.now()) continue;
          if (b.dayCount >= lim.rpd) continue;
          anyUsable = true;
          const wait = nextSlotMs(opts.pool, key, model);
          if (wait > 0) { soonestWait = Math.min(soonestWait, wait); continue; }

          // Reserve slot
          const now = Date.now();
          b.minuteWindow.push(now);
          b.dayCount++;
          b.lastSendAt = now;
          b.inFlight++;

          const apiModel = lim.apiModelId || model;
          const isGemma = apiModel.startsWith("gemma-");
          const includeJsonMime = lim.useJsonMime && !isGemma;
          const body = isGemma
            ? {
                contents: [{ role: "user", parts: [{ text: opts.systemPrompt + "\n\n" + opts.userParts.filter((p) => typeof p?.text === "string").map((p) => p.text).join("\n") }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 8192, ...(opts.generationConfig ?? {}), responseMimeType: undefined },
              }
            : {
                systemInstruction: { parts: [{ text: opts.systemPrompt }] },
                contents: [{ role: "user", parts: opts.userParts }],
                generationConfig: {
                  ...(includeJsonMime ? { responseMimeType: "application/json" } : {}),
                  temperature: 0.3,
                  maxOutputTokens: 8192,
                  ...(opts.generationConfig ?? {}),
                },
              };

          let r: Response;
          try {
            r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${key}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(body) },
            );
          } catch (e: any) {
            b.inFlight = Math.max(0, b.inFlight - 1);
            if (e?.name === "AbortError") throw new Error(`Gemini timed out after ${Math.round(totalTimeout / 1000)}s`);
            lastErr = e?.message || String(e);
            b.lastError = lastErr; b.lastErrorAt = Date.now();
            continue;
          }

          b.inFlight = Math.max(0, b.inFlight - 1);

          if (r.ok) {
            const j = await r.json();
            const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (!text) { lastErr = `Gemini empty (${j.candidates?.[0]?.finishReason || "?"})`; b.lastError = lastErr; b.lastErrorAt = Date.now(); continue; }
            b.transientStreak = 0;
            return text;
          }

          const bodyText = await r.text();
          let msg = bodyText;
          try { msg = JSON.parse(bodyText)?.error?.message || bodyText; } catch {}
          lastErr = `Gemini ${r.status} (${apiModel}, ${key.slice(0, 8)}…): ${String(msg).slice(0, 240)}`;
          b.lastError = lastErr; b.lastErrorAt = Date.now();

          if (r.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) {
            if (/per\s*day|daily|GenerateRequestsPerDay/i.test(msg)) {
              b.dayCount = lim.rpd;
              b.dailyExhaustedUntil = b.dayResetAt;
            } else {
              // Admin "cooldown_seconds" is the authoritative cap. 0 = no cooldown.
              const adminCool = Math.max(0, lim.cooldownSeconds) * 1000;
              const m = /retry.*?(\d+(?:\.\d+)?)\s*s/i.exec(bodyText);
              const retryMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : 0;
              const coolMs = adminCool === 0 ? 0 : (retryMs > 0 ? Math.min(retryMs, adminCool) : adminCool);
              b.cooldownUntil = Date.now() + coolMs;
            }
            b.transientStreak = 0;
            continue;
          }
          if (r.status === 404 || (r.status === 400 && /model|not found|unsupported|not supported/i.test(msg))) {
            // Soft unavailable: retry in 10 min instead of locking until tomorrow.
            b.unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
            b.transientStreak = 0;
            break;
          }
          // Transient upstream: 500/502/503/504 + UNAVAILABLE / "currently experiencing".
          // Escalating cooldown so the outer attempt loop keeps retrying within
          // the deadline instead of giving up on the only available model.
          if (
            r.status === 500 || r.status === 502 || r.status === 503 || r.status === 504 ||
            /UNAVAILABLE|currently experiencing|overloaded|temporarily/i.test(msg)
          ) {
            b.transientStreak = Math.min(8, (b.transientStreak || 0) + 1);
            const backoff = Math.min(20_000, 2000 * Math.pow(2, b.transientStreak - 1));
            b.cooldownUntil = Date.now() + backoff;
            continue;
          }
          b.cooldownUntil = Date.now() + 1_500;
          continue;
        }
      }

      if (!anyUsable) break;
      if (!waitForSlot) break;
      if (soonestWait === Infinity) break;
      const remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs <= 0) {
        throw new Error(`Gemini timed out after ${Math.round(totalTimeout / 1000)}s`);
      }
      const napMs = Math.min(soonestWait, 60_000, remainingMs);
      if (napMs > 0) await sleep(napMs);
    }

    throw new Error(lastErr || "All Gemini keys are rate-limited or daily-exhausted. Add more keys in /admin/ai-keys or wait for the daily reset.");
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Batch API helper
//
// Google's Batch endpoint (`:batchGenerateContent`) does NOT accept moving
// aliases such as `gemini-flash-lite-latest` — it rejects them up front with
// 400 FAILED_PRECONDITION. Interactive generateContent calls DO accept the
// alias, so we keep the two names apart: aliases for live calls, concrete
// versioned ids for batch submits.
const BATCH_ALIAS_MAP: Record<string, string> = {
  "gemini-flash-lite-latest": "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "gemini-1.5-flash-latest": "gemini-1.5-flash-002",
  "gemini-2.0-flash-lite": "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash": "gemini-2.0-flash-001",
};

/** Concrete versioned model id to use on the Batch endpoint. */
export function batchModelFor(model: string): string {
  return BATCH_ALIAS_MAP[model] ?? model;
}

export type BatchSubmitResult =
  | { ok: true; json: any; modelUsed: string }
  | { ok: false; status: number; message: string };

/**
 * Submit a batch job, trying the versioned model first and falling back once to
 * the name we were given if Google answers FAILED_PRECONDITION.
 */
export async function submitGeminiBatch(opts: {
  apiKey: string;
  model: string;
  body: unknown;
}): Promise<BatchSubmitResult> {
  const primary = batchModelFor(opts.model);
  const candidates = primary === opts.model ? [primary] : [primary, opts.model];

  let lastStatus = 0;
  let lastBody = "";
  for (const model of candidates) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify(opts.body),
      },
    );
    const json = await res.json().catch(() => ({}) as any);
    if (res.ok) return { ok: true, json, modelUsed: model };
    lastStatus = res.status;
    lastBody = JSON.stringify(json).slice(0, 300);
    const precondition = res.status === 400 && lastBody.includes("FAILED_PRECONDITION");
    if (!precondition) break;
  }

  const message = lastBody.includes("FAILED_PRECONDITION")
    ? `Batch submit rejected (${lastStatus}): Google refused the batch job. Batch mode needs a Gemini API key on a billing-enabled Google Cloud project — check billing for this key, then retry. Raw: ${lastBody}`
    : `Batch submit failed (${lastStatus}): ${lastBody}`;
  return { ok: false, status: lastStatus, message };
}
