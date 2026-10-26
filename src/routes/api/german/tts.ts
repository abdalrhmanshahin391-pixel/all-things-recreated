import { createFileRoute } from "@tanstack/react-router";

const MAX_TTS_CHARS = 240;

// Every call spends paid AI credit, so one account cannot call it without limit.
// The counters live in this server instance's memory: a rough guard, not an exact one.
const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 20;
const calls = new Map<string, number[]>();

function tooMany(userId: string): boolean {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS_PER_WINDOW) {
    calls.set(userId, recent);
    return true;
  }
  recent.push(now);
  calls.set(userId, recent);
  if (calls.size > 5000) {
    for (const [id, times] of calls) if (!times.some((t) => now - t < WINDOW_MS)) calls.delete(id);
  }
  return false;
}

export const Route = createFileRoute("/api/german/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getCaller } = await import("@/lib/auth-guards.server");
        const { userId } = await getCaller();
        if (!userId) return new Response("Sign in required", { status: 401 });
        if (tooMany(userId)) return new Response("Too many requests, try again in a minute", { status: 429 });
        let payload: { text?: string; rate?: number } = {};
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid request", { status: 400 });
        }

        const text = String(payload.text ?? "").trim().slice(0, MAX_TTS_CHARS);
        if (!text) return new Response("Text required", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("High-quality voice is unavailable", { status: 503 });

        const speed = Math.max(0.65, Math.min(1.05, Number(payload.rate ?? 0.92)));

        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice: "coral",
              response_format: "mp3",
              stream_format: "audio",
              speed,
              instructions:
                "Speak as a calm native German woman from Germany. Clear standard Hochdeutsch accent, warm classroom tone, crisp consonants, natural short pauses, no English accent.",
            }),
            signal: request.signal,
          });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            console.error("German TTS failed", response.status, body.slice(0, 300));
            return new Response("High-quality voice failed", { status: response.status });
          }

          return new Response(response.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "private, max-age=86400",
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("German TTS error", err);
          return new Response("High-quality voice failed", { status: 500 });
        }
      },
    },
  },
});