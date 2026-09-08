import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiPool, callGeminiJSON } from "@/lib/gemini-pool";

export type QuestionTranslation = {
  stem: string;
  explanation: string | null;
  options: Record<string, string>; // option id -> Arabic text
};

const SYSTEM = `You are a professional medical translator. Translate the given exam question into Modern Standard Arabic.
Rules:
- Keep the medical meaning exactly. Never add, remove or reorder content.
- After a translated medical/technical term, keep the English term in parentheses, e.g. التهاب الجنبة (pleurisy).
- Keep numbers, units, drug doses, abbreviations and lab values unchanged.
- Keep any numbered statements (1, 2, 3, 4) and their numbering exactly as they are.
- Do NOT reveal or change which answer is correct.
- Return ONLY JSON in this exact shape:
{"stem":"...","explanation":"...","options":{"<option id>":"..."}}
- "options" must contain one entry for every option id given, with the Arabic text only (no letter prefix).
- If explanation is empty, return "" for it.`;

function parseJson(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Translation service returned an unexpected answer. Please try again.");
  }
}

export const translateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { questionId: string; lang?: string }) => {
    const questionId = String(input?.questionId || "").trim();
    if (!questionId) throw new Error("Missing question");
    return { questionId, lang: input?.lang === "ar" || !input?.lang ? "ar" : String(input.lang) };
  })
  .handler(async ({ data, context }): Promise<QuestionTranslation> => {
    const { supabase } = context;
    const { questionId, lang } = data;

    // 1) Cached?
    const cached = await supabase
      .from("question_translations")
      .select("stem,explanation,options")
      .eq("question_id", questionId)
      .eq("lang", lang)
      .maybeSingle();
    if (cached.data) {
      return {
        stem: cached.data.stem ?? "",
        explanation: cached.data.explanation ?? null,
        options: (cached.data.options as Record<string, string>) ?? {},
      };
    }

    // 2) Load the question through the user's own client so RLS enforces access.
    const { data: q, error } = await supabase
      .from("questions")
      .select("id,stem,explanation,question_options(id,label,text,sort_order)")
      .eq("id", questionId)
      .maybeSingle();
    if (error) throw new Error("Could not load this question.");
    if (!q) throw new Error("You do not have access to this question.");

    const options = ((q as any).question_options ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const payload = {
      stem: (q as any).stem ?? "",
      explanation: (q as any).explanation ?? "",
      options: options.map((o: any) => ({ id: o.id, text: o.text ?? "" })),
    };

    // 3) Translate with the site's own Gemini key pool (admin-only table → service role).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pool = await getGeminiPool(supabaseAdmin);
    if (!pool.keys.length) {
      throw new Error("Arabic translation is not set up yet. Ask an admin to add a Gemini key.");
    }

    let raw: string;
    try {
      raw = await callGeminiJSON({
        pool,
        systemPrompt: SYSTEM,
        userParts: [{ text: JSON.stringify(payload) }],
        allowTextOnly: true,
        timeoutMs: 120_000,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/quota|429|rate|timed out|unavailable/i.test(msg)) {
        throw new Error("Translation is busy right now. Please try again in a moment.");
      }
      throw new Error("Translation failed. Please try again.");
    }

    const parsed = parseJson(raw);
    // Gemini sometimes returns options as an array of {id,text} instead of a map.
    const optMap: Record<string, string> = {};
    const rawOpts = parsed?.options;
    if (Array.isArray(rawOpts)) {
      for (let i = 0; i < rawOpts.length; i++) {
        const item = rawOpts[i] as any;
        const id = typeof item?.id === "string" ? item.id : options[i]?.id;
        const text = typeof item?.text === "string" ? item.text : typeof item === "string" ? item : "";
        if (id) optMap[id] = text;
      }
    } else if (rawOpts && typeof rawOpts === "object") {
      for (const [k, v] of Object.entries(rawOpts as Record<string, unknown>)) {
        if (typeof v === "string") optMap[k] = v;
        else if (v && typeof (v as any).text === "string") optMap[k] = (v as any).text;
      }
    }
    const outOptions: Record<string, string> = {};
    for (const o of options) {
      const v = optMap[o.id];
      outOptions[o.id] = typeof v === "string" && v.trim() ? v.trim() : (o.text ?? "");
    }
    const result: QuestionTranslation = {
      stem: typeof parsed?.stem === "string" ? parsed.stem : payload.stem,
      explanation:
        typeof parsed?.explanation === "string" && parsed.explanation.trim()
          ? parsed.explanation
          : null,
      options: outOptions,
    };

    // 4) Save for everyone else (service role — the table is read-only for users).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).from("question_translations").upsert(
        {
          question_id: questionId,
          lang,
          stem: result.stem,
          explanation: result.explanation,
          options: result.options,
        },
        { onConflict: "question_id,lang" },
      );
    } catch {
      // Caching is best-effort; the student still gets the translation.
    }

    return result;
  });
