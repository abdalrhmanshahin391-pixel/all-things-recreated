import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getGeminiPool, callGeminiJSON as callGeminiPool, type GeminiPool } from "@/lib/gemini-pool";

const Provider = z.enum(["gemini", "lovable"]);

const PairsInput = z.object({
  subjectId: z.string().uuid(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pdf"), pdfBase64: z.string().min(100) }),
    z.object({
      kind: z.literal("photos"),
      images: z
        .array(
          z.object({
            base64: z.string().min(50),
            mimeType: z.string().default("image/jpeg"),
          }),
        )
        .min(1)
        .max(10),
    }),
    z.object({
      kind: z.literal("text"),
      text: z.string().min(2),
    }),
  ]),
  provider: Provider.default("lovable"),
  hint: z.string().optional(),
});

const PAIRS_SYSTEM = `You extract German→English vocabulary or sentence pairs from study material.

Return STRICT JSON only (no markdown fences, no commentary) in this shape:
{"pairs":[{"german":"...","english":"..."}]}

Rules:
- Read EVERY visible entry across the supplied source (PDF/images/text).
- Each entry has a GERMAN side (word with article + plural OR full sentence) and its ENGLISH translation.
- Keep the German side EXACTLY as written (preserve articles like "der/die/das", capitalisation, plural form). Do not translate it.
- Keep the English side concise — copy what is shown if a translation is given; if missing, write the most accurate short English translation.
- Skip entries that are not language pairs (page numbers, headings, image-only rows with no translation).
- If nothing is readable, return {"pairs":[]}.
- Output JSON only.`;

const DISTRACTORS_SYSTEM = `You write WRONG English translations to use as distractors for a German→English MCQ.

Return STRICT JSON only:
{"wrong":["...","...","..."]}

Rules:
- Exactly 3 strings.
- Each must be a PLAUSIBLE-LOOKING English translation of the given German word/sentence but UNAMBIGUOUSLY INCORRECT.
- Same length and register as the correct answer (single word vs. full sentence).
- Do NOT include the correct answer, its synonyms, or near-paraphrases.
- Prefer semantically related words (same category — e.g. for "die Bank" wrong choices could be "library", "post office", "shop") so the choice is not trivial.
- No markdown, no numbering, no commentary.`;

async function callLovableJSON(systemText: string, userParts: any[]): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: userParts },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new Error("AI rate limit — try again in a moment.");
    if (r.status === 402) throw new Error("AI credits exhausted — add credits in Settings → Plans & credits.");
    throw new Error(`Lovable AI ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callGeminiJSON(
  pool: GeminiPool,
  systemText: string,
  parts: any[],
  allowTextOnly = false,
): Promise<string> {
  return await callGeminiPool({
    pool,
    systemPrompt: systemText,
    userParts: parts,
    allowTextOnly,
    timeoutMs: 90_000,
    generationConfig: { temperature: 0.3, maxOutputTokens: 24576 },
  });
}

function tryParseJson(s: string): any {
  const t = s.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return JSON.parse(t);
}

async function getPool(supabase: any): Promise<GeminiPool> {
  const pool = await getGeminiPool(supabase);
  if (!pool.keys.length) throw new Error("No Gemini API key saved. Add it in /admin/ai-keys.");
  return pool;
}

async function extractPairs(
  supabase: any,
  provider: "gemini" | "lovable",
  source: z.infer<typeof PairsInput>["source"],
  hint?: string,
): Promise<{ german: string; english: string }[]> {
  const hintLine = hint ? `Hint: ${hint}\n\n` : "";
  const userText = `${hintLine}Extract every German→English pair (vocabulary words with articles+plural, or full sentences with translations). Return JSON only.`;

  let raw = "";
  if (provider === "lovable") {
    const parts: any[] = [{ type: "text", text: userText }];
    if (source.kind === "pdf") {
      parts.push({ type: "file", file: { filename: "source.pdf", file_data: `data:application/pdf;base64,${source.pdfBase64}` } });
    } else if (source.kind === "photos") {
      for (const img of source.images) {
        parts.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
      }
    } else {
      parts[0] = { type: "text", text: `${userText}\n\nSource text:\n---\n${source.text.slice(0, 60000)}` };
    }
    raw = await callLovableJSON(PAIRS_SYSTEM, parts);
  } else {
    const pool = await getPool(supabase);
    const parts: any[] = [{ text: userText }];
    if (source.kind === "pdf") {
      parts.push({ inline_data: { mime_type: "application/pdf", data: source.pdfBase64 } });
    } else if (source.kind === "photos") {
      for (const img of source.images) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    } else {
      parts[0] = { text: `${userText}\n\nSource text:\n---\n${source.text.slice(0, 60000)}` };
    }
    raw = await callGeminiJSON(pool, PAIRS_SYSTEM, parts, source.kind === "text");
  }
  const parsed = tryParseJson(raw);
  const list = Array.isArray(parsed?.pairs) ? parsed.pairs : [];
    if (!list.length) {
      const preview = raw.slice(0, 300).replace(/\s+/g, " ");
      throw new Error(`AI returned no pairs. Raw preview: ${preview}`);
    }
    return list
    .filter((p: any) => p && typeof p.german === "string" && typeof p.english === "string" && p.german.trim() && p.english.trim())
    .map((p: any) => ({ german: String(p.german).trim(), english: String(p.english).trim() }));
}

async function generateDistractors(
  supabase: any,
  provider: "gemini" | "lovable",
  german: string,
  english: string,
): Promise<string[]> {
  const userText = `German: ${german}\nCorrect English: ${english}\n\nWrite 3 wrong English translations as JSON {"wrong":[...]}`;
  let raw = "";
  if (provider === "lovable") {
    raw = await callLovableJSON(DISTRACTORS_SYSTEM, [{ type: "text", text: userText }]);
  } else {
    const pool = await getPool(supabase);
    raw = await callGeminiJSON(pool, DISTRACTORS_SYSTEM, [{ text: userText }], true);
  }
  const parsed = tryParseJson(raw);
  const list = Array.isArray(parsed?.wrong) ? parsed.wrong : [];
  const cleaned = list
    .map((w: any) => String(w).trim())
    .filter((w: string) => w && w.toLowerCase() !== english.toLowerCase())
    .slice(0, 3);
  while (cleaned.length < 3) cleaned.push(`not "${english}"`);
  return cleaned;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const importGermanPairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PairsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const pairs = await extractPairs(supabase, data.provider, data.source, data.hint);
    if (!pairs.length) throw new Error("No German→English pairs were found in the source.");

    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", data.subjectId);
    let sortOrder = (count ?? 0) + 1;

    const results: { german: string; english: string; status: "added" | "failed"; error?: string }[] = [];

    for (const pair of pairs) {
      try {
        const wrong = await generateDistractors(supabase, data.provider, pair.german, pair.english);
        const all = shuffle([
          { body: pair.english, is_correct: true },
          { body: wrong[0], is_correct: false },
          { body: wrong[1], is_correct: false },
          { body: wrong[2], is_correct: false },
        ]);
        const letters = ["A", "B", "C", "D"] as const;

        const { data: q, error: qErr } = await supabase
          .from("questions")
          .insert({
            subject_id: data.subjectId,
            stem: pair.german,
            explanation: `**Deutsch:** ${pair.german}\n\n**English:** ${pair.english}`,
            sort_order: sortOrder++,
          })
          .select("id")
          .single();
        if (qErr) throw qErr;

        const rows = all.map((o, i) => ({
          question_id: q.id,
          label: letters[i],
          text: o.body,
          is_correct: o.is_correct,
          sort_order: i + 1,
        }));
        const { error: oErr } = await supabase.from("question_options").insert(rows);
        if (oErr) throw oErr;
        results.push({ german: pair.german, english: pair.english, status: "added" });
      } catch (e: any) {
        results.push({
          german: pair.german,
          english: pair.english,
          status: "failed",
          error: e?.message ?? String(e),
        });
      }
    }

    return {
      total: pairs.length,
      added: results.filter((r) => r.status === "added").length,
      failed: results.filter((r) => r.status === "failed").length,
      items: results,
    };
  });
