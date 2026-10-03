import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSignedInCaller } from "@/lib/auth-guards.server";

const Input = z.object({
  pairs: z
    .array(z.object({ german: z.string().min(1), english: z.string().min(1) }))
    .min(1)
    .max(200),
  count: z.number().int().min(5).max(60).default(30),
});

const SYSTEM = `You generate plausible but WRONG English translations to use as multiple-choice distractors for a German vocabulary game.
Return STRICT JSON ONLY: {"distractors": ["word1","word2", ...]}.
Rules:
- Each item must be a single English word or very short phrase, lowercase unless it's a proper noun.
- They must look like reasonable translations (same word class, similar topic) but NOT actually match any of the given German words.
- Never reuse any of the provided English translations.
- No duplicates. No explanations. No numbering.`;

export const generateEnglishDistractors = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    await requireSignedInCaller();
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");

    const userPrompt = `Existing German→English pairs (do NOT reuse the English values as distractors):
${data.pairs.map((p) => `- ${p.german} = ${p.english}`).join("\n")}

Produce exactly ${data.count} wrong-but-plausible English distractor words/phrases.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Lovable AI ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    const raw: string = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s !== -1 && e > s) parsed = JSON.parse(raw.slice(s, e + 1));
    }
    const list: string[] = Array.isArray(parsed.distractors) ? parsed.distractors : [];
    const used = new Set(data.pairs.map((p) => p.english.trim().toLowerCase()));
    const cleaned = Array.from(
      new Set(
        list
          .map((x) => String(x).trim())
          .filter((x) => x.length > 0 && !used.has(x.toLowerCase())),
      ),
    );
    return { distractors: cleaned };
  });
