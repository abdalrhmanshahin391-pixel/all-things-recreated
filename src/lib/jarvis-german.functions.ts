import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getGeminiPool, callGeminiJSON, type GeminiPool } from "@/lib/gemini-pool";

const Input = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  kind: z.enum(["words", "sentences"]).default("words"),
  provider: z.enum(["lovable", "gemini"]).default("lovable"),
});

type Pair = { german: string; english: string };

const SYSTEM = `You read pages from a German learning textbook and extract a clean vocabulary table.
Return STRICT JSON ONLY (no markdown fences, no commentary) with this exact shape:

{ "pairs": [ { "german": "...", "english": "..." } ] }

Rules:
- One entry per visible row. Skip decorative pictures, page numbers, image credits (e.g. "© colourbox.de"), and headings.
- For WORDS: keep the German exactly as printed — INCLUDE article and plural when shown (e.g. "die Bank, die Banken", "das Büro, die Büros", "der Bus, die Busse").
- For SENTENCES: keep full German sentence and its full English translation.
- Never invent rows. If a row's translation is missing, skip it.
- Trim whitespace, no quotes around values.
- Output JSON only.`;

async function callLovable(imageBase64: string, mimeType: string, kindHint: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract ${kindHint} from this page.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429) throw new Error("AI rate limit — try again in a moment.");
    if (r.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callGemini(
  pool: GeminiPool,
  imageBase64: string,
  mimeType: string,
  kindHint: string,
): Promise<string> {
  return await callGeminiJSON({
    pool,
    systemPrompt: SYSTEM,
    userParts: [
      { text: `Extract ${kindHint} from this page.` },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    timeoutMs: 60_000,
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  });
}

async function getGeminiPoolSafe(supabase: any): Promise<GeminiPool | null> {
  try {
    const pool = await getGeminiPool(supabase);
    return pool.keys.length ? pool : null;
  } catch {
    return null;
  }
}

function parsePairs(raw: string): Pair[] {
  let txt = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  txt = txt.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  let obj: any;
  try { obj = JSON.parse(txt); }
  catch {
    const s = txt.indexOf("{");
    const e = txt.lastIndexOf("}");
    if (s !== -1 && e > s) obj = JSON.parse(txt.slice(s, e + 1));
  }
  const arr = Array.isArray(obj?.pairs) ? obj.pairs : [];
  const out: Pair[] = [];
  const seen = new Set<string>();
  for (const p of arr) {
    const g = String(p?.german ?? "").trim();
    const en = String(p?.english ?? "").trim();
    if (!g || !en) continue;
    const k = g.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ german: g, english: en });
  }
  return out;
}

export const extractGermanPairsFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // admin only
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const hint = data.kind === "words" ? "the German vocabulary words with their English translations" : "the German sentences with their English translations";

    let raw: string;
    let providerUsed: "lovable" | "gemini" = data.provider;
    if (data.provider === "gemini") {
      const pool = await getGeminiPoolSafe(context.supabase);
      if (pool) {
        try {
          raw = await callGemini(pool, data.imageBase64, data.mimeType, hint);
        } catch {
          providerUsed = "lovable";
          raw = await callLovable(data.imageBase64, data.mimeType, hint);
        }
      } else {
        providerUsed = "lovable";
        raw = await callLovable(data.imageBase64, data.mimeType, hint);
      }
    } else {
      raw = await callLovable(data.imageBase64, data.mimeType, hint);
    }

    const pairs = parsePairs(raw);
    if (!pairs.length) throw new Error("No vocabulary rows detected in the image.");
    return { pairs, providerUsed };
  });

const SaveInput = z.object({
  subjectId: z.string().uuid(),
  kind: z.enum(["words", "sentences"]),
  pairs: z.array(z.object({ german: z.string().min(1), english: z.string().min(1) })).min(1).max(500),
});

export const saveGermanPairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    // find or create item of this kind
    const { data: existing } = await context.supabase
      .from("german_items")
      .select("id")
      .eq("subject_id", data.subjectId)
      .eq("kind", data.kind)
      .order("position", { ascending: true })
      .limit(1);

    let itemId: string;
    if (existing && existing.length > 0) {
      itemId = (existing[0] as any).id;
    } else {
      const { data: created, error } = await context.supabase
        .from("german_items")
        .insert({ subject_id: data.subjectId, kind: data.kind, title: "Imported", position: 0 } as any)
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Could not create item");
      itemId = (created as any).id;
    }

    // count current entries
    const table = data.kind === "words" ? "german_word_entries" : "german_sentence_entries";
    const { count } = await context.supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId);
    const startPos = count ?? 0;

    const rows = data.pairs.map((p, i) => ({
      item_id: itemId,
      position: startPos + i,
      german: p.german,
      english: p.english,
    }));
    const { error: insErr } = await context.supabase.from(table).insert(rows as any);
    if (insErr) throw insErr;

    return { inserted: rows.length };
  });
