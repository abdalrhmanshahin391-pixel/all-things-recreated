// Speech recognition + TTS + scoring helpers for Smart Review (Shadowing)

export type ShadowScore = {
  score: number; // 0-100
  band: "great" | "good" | "try";
  transcript: string;
};

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Levenshtein-based fuzzy similarity, 0..1
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function wordSim(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = lev(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

export function scoreUtterance(target: string, heard: string): ShadowScore {
  const a = normalize(target);
  const b = normalize(heard);
  if (a.length === 0) return { score: 0, band: "try", transcript: heard };
  if (b.length === 0) return { score: 0, band: "try", transcript: heard };

  // For each target word, find best fuzzy match in heard words
  let total = 0;
  const used = new Set<number>();
  for (const w of a) {
    let bestSim = 0;
    let bestIdx = -1;
    for (let i = 0; i < b.length; i++) {
      if (used.has(i)) continue;
      const s = wordSim(w, b[i]);
      if (s > bestSim) { bestSim = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestSim >= 0.5) used.add(bestIdx);
    total += bestSim;
  }
  let raw = (total / a.length) * 100;
  // Generous boost so casual speakers feel rewarded
  raw = Math.min(100, raw * 1.15 + 8);
  const score = Math.round(raw);
  const band: ShadowScore["band"] = score >= 75 ? "great" : score >= 50 ? "good" : "try";
  return { score, band, transcript: heard };
}

// ---------- TTS with voice selection ----------------------------------------

let cachedVoices: SpeechSynthesisVoice[] = [];
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeTtsAbort: AbortController | null = null;
const ttsCache = new Map<string, Blob>();

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing && existing.length) { cachedVoices = existing; return resolve(existing); }
    const handler = () => {
      cachedVoices = window.speechSynthesis.getVoices() ?? [];
      resolve(cachedVoices);
    };
    window.speechSynthesis.onvoiceschanged = handler;
    // Fallback timeout
    setTimeout(() => resolve(cachedVoices), 800);
  });
}

const FEMALE_HINTS = [
  "samantha", "victoria", "karen", "moira", "tessa", "fiona", "serena", "allison",
  "ava", "susan", "kate", "zira", "aria", "jenny", "michelle", "nicky",
  "google us english", "google uk english female",
  "anna", "petra", "marlene", "hedda", "katja", "amala", "seraphina", "google deutsch",
  "microsoft katja", "microsoft hedda", "apple anna",
  "female",
];

function pickBestVoice(lang: string): SpeechSynthesisVoice | null {
  if (!cachedVoices.length) return null;
  const langLow = lang.toLowerCase();
  const langBase = langLow.split("-")[0];
  const matches = cachedVoices.filter((v) => v.lang?.toLowerCase().startsWith(langBase));
  if (!matches.length) return null;
  // Score by female-name hint + exact-lang preference + non-eSpeak
  const scored = matches.map((v) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (v.lang.toLowerCase() === langLow) s += 5;
    if (FEMALE_HINTS.some((h) => n.includes(h))) s += 10;
    if (n.includes("espeak")) s -= 5;
    if ((v as any).localService) s += 1;
    return { v, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].v;
}

export async function speak(text: string, opts?: { rate?: number; lang?: string }) {
  if (typeof window === "undefined") return;
  try {
    const lang = opts?.lang ?? "en-US";
    stopSpeaking();
    if (lang.toLowerCase().startsWith("de") && await speakWithHighQualityGerman(text, opts?.rate ?? 0.92)) return;
    if (!("speechSynthesis" in window)) return;
    await loadVoices();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts?.rate ?? 1;
    u.pitch = lang.toLowerCase().startsWith("de") ? 1.02 : 1.05;
    u.lang = lang;
    const v = pickBestVoice(lang);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

async function speakWithHighQualityGerman(text: string, rate: number): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    const cacheKey = `${rate.toFixed(2)}:${trimmed}`;
    const cached = ttsCache.get(cacheKey);
    if (cached) {
      activeAudioUrl = URL.createObjectURL(cached);
      activeAudio = new Audio(activeAudioUrl);
      activeAudio.onended = () => cleanupAudio();
      activeAudio.onerror = () => cleanupAudio();
      await activeAudio.play();
      return true;
    }
    activeTtsAbort = new AbortController();
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sess } = await supabase.auth.getSession();
    const response = await fetch("/api/german/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {}) },
      body: JSON.stringify({ text: trimmed, rate }),
      signal: activeTtsAbort.signal,
    });
    if (!response.ok) { cleanupAudio(); return false; }
    const blob = await response.blob();
    if (ttsCache.size > 80) {
      const oldest = ttsCache.keys().next().value;
      if (oldest) ttsCache.delete(oldest);
    }
    ttsCache.set(cacheKey, blob);
    activeAudioUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeAudioUrl);
    activeAudio.onended = () => cleanupAudio();
    activeAudio.onerror = () => cleanupAudio();
    await activeAudio.play();
    return true;
  } catch {
    cleanupAudio();
    return false;
  }
}

function cleanupAudio() {
  if (activeAudio) {
    try { activeAudio.pause(); } catch { /* noop */ }
    activeAudio = null;
  }
  if (activeAudioUrl) {
    try { URL.revokeObjectURL(activeAudioUrl); } catch { /* noop */ }
    activeAudioUrl = null;
  }
  activeTtsAbort = null;
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  try { activeTtsAbort?.abort(); } catch { /* noop */ }
  cleanupAudio();
  if (!("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}

export function hasSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export type RecognitionHandle = {
  stop: () => void;
};

export function recognizeOnce(opts: {
  lang?: string;
  onResult: (transcript: string) => void;
  onError?: (e: string) => void;
  onEnd?: () => void;
}): RecognitionHandle | null {
  if (!hasSpeechRecognition()) {
    opts.onError?.("Speech recognition not supported in this browser.");
    return null;
  }
  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = opts.lang ?? "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let final = "";
  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      final += e.results[i][0].transcript + " ";
    }
  };
  rec.onerror = (e: any) => opts.onError?.(String(e?.error || "error"));
  rec.onend = () => {
    opts.onResult(final.trim());
    opts.onEnd?.();
  };
  try {
    rec.start();
  } catch (e: any) {
    opts.onError?.(e?.message || "start failed");
  }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}
