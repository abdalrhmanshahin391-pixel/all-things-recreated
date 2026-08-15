import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

export type AdCopyVariant = {
  eyebrow_en: string;
  headline_en: string;
  subheadline_en: string;
  body_en: string;
  cta_en: string;
  eyebrow_ar: string;
  headline_ar: string;
  subheadline_ar: string;
  body_ar: string;
  cta_ar: string;
  caption_en: string;
  caption_ar: string;
};

/** Ask Lovable AI for a few bilingual ad-copy variants. */
export const generateAdCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { brief: string; tone?: string; kind?: string }) => {
    const brief = (data?.brief ?? "").toString().slice(0, 4000);
    if (!brief.trim()) throw new Error("Write a short brief first");
    return { brief, tone: (data.tone ?? "confident").slice(0, 60), kind: (data.kind ?? "promo").slice(0, 60) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You write short, punchy social-media ad copy for AquaQBank, a medical question bank and courses platform for medical students. " +
              "Always answer with JSON only. Headlines are max 6 words. Subheadlines max 14 words. Body is 2-4 short bullet lines separated by newlines, each starting with '• '. " +
              "Arabic must be natural Arabic, not a literal translation. Never invent prices, discounts, dates or claims that are not in the brief.",
          },
          {
            role: "user",
            content: `Ad type: ${data.kind}\nTone: ${data.tone}\nBrief:\n${data.brief}\n\nReturn JSON: {"variants":[{...},{...},{...}]} with 3 variants, each having keys eyebrow_en, headline_en, subheadline_en, body_en, cta_en, eyebrow_ar, headline_ar, subheadline_ar, body_ar, cta_ar, caption_en, caption_ar. The caption fields are ready-to-paste Telegram captions with a couple of emojis.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI is busy right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits in workspace settings.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const json = (await res.json()) as any;
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    const variants: AdCopyVariant[] = Array.isArray(parsed?.variants)
      ? parsed.variants
      : Array.isArray(parsed)
        ? parsed
        : parsed?.headline_en
          ? [parsed]
          : [];
    if (variants.length === 0) throw new Error("The AI reply could not be used. Try again.");
    return { variants: variants.slice(0, 5) };
  });

/** Generate a square background image and return it as base64 PNG. */
export const generateAdBackground = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { prompt: string }) => {
    const prompt = (data?.prompt ?? "").toString().slice(0, 1200);
    if (!prompt.trim()) throw new Error("Describe the background first");
    return { prompt };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch(`${GATEWAY}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [
          {
            role: "user",
            content:
              `Square 1:1 advertising BACKGROUND artwork. Absolutely no text, no letters, no words, no logos, no watermarks. ` +
              `Leave the composition calm and uncluttered so headline text can be placed on top. ` +
              `Style brief: ${data.prompt}`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (res.status === 429) throw new Error("AI is busy right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits in workspace settings.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const json = (await res.json()) as any;
    const b64: string | undefined = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("The AI returned no image. Try a different description.");
    return { b64 };
  });
