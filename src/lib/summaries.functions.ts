import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiPool, callGeminiJSON as callGeminiPool, type GeminiPool } from "@/lib/gemini-pool";

// ---- Types shared with the UI ----
export type SummaryBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "callout"; tone: "highYield" | "trap" | "pearl" | "note"; title?: string; text: string }
  | { type: "mnemonic"; title: string; text: string }
  | { type: "usage"; title?: string; items: string[] }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      tone?: "indigo" | "pink" | "emerald" | "amber";
    };

export type SummarySection = {
  heading: string;
  kicker?: string;
  blocks: SummaryBlock[];
};

export type SummaryContent = {
  title: string;
  subtitle?: string;
  sections: SummarySection[];
  recap: string[];
};

type Provider = "lovable" | "gemini";

type GenInput =
  | {
      kind: "subject";
      subjectId: string;
      length: "short" | "standard" | "comprehensive";
      tone: "exam" | "concept" | "revision";
      authorName?: string;
      titleOverride?: string;
      provider?: Provider;
    }
  | {
      kind: "text";
      text: string;
      length: "short" | "standard" | "comprehensive";
      tone: "exam" | "concept" | "revision";
      authorName?: string;
      titleOverride?: string;
      provider?: Provider;
    }
  | {
      kind: "photos";
      images: { mimeType: string; base64: string }[]; // up to 10
      length: "short" | "standard" | "comprehensive";
      tone: "exam" | "concept" | "revision";
      authorName?: string;
      titleOverride?: string;
      provider?: Provider;
    }
  | {
      kind: "pdf";
      pdfBase64: string;
      filename?: string;
      length: "short" | "standard" | "comprehensive";
      tone: "exam" | "concept" | "revision";
      authorName?: string;
      titleOverride?: string;
      provider?: Provider;
    }
  | {
      kind: "flags";
      subjectId: string;
      length: "short" | "standard" | "comprehensive";
      tone: "exam" | "concept" | "revision";
      authorName?: string;
      titleOverride?: string;
      provider?: Provider;
    };

const SYSTEM_PROMPT = `You are an exam-focused medical summary writer.
Given source material (questions+explanations, free text, or OCR'd photos of pages), produce a beautiful, multi-page "cheat sheet" summary as STRICT JSON ONLY (no markdown fences, no commentary).

Output shape:
{
  "title": "short, punchy, ALL CAPS-friendly title (e.g. 'MYOCARDIAL INFARCTION')",
  "subtitle": "one short line, e.g. 'Pathology · Diagnosis · Management'",
  "sections": [
    {
      "heading": "Section title (Title Case)",
      "kicker": "optional uppercase eyebrow (e.g. 'OVERVIEW')",
      "blocks": [
        { "type": "paragraph", "text": "..." },
        { "type": "bullets", "items": ["...","..."] },
        { "type": "callout", "tone": "highYield"|"trap"|"pearl"|"note", "title": "optional", "text": "..." },
        { "type": "mnemonic", "title": "MONA", "text": "..." },
        { "type": "usage", "title": "When to suspect", "items": ["...","..."] },
        { "type": "table", "tone": "indigo"|"pink"|"emerald"|"amber", "headers": ["...","..."], "rows": [["..","..","..",".."]] }
      ]
    }
  ],
  "recap": ["bullet 1","bullet 2","bullet 3","..."]
}

Hard rules:
- Output JSON ONLY (no \`\`\`json fences).
- 4-12 sections depending on length preset; 3-6 blocks per section.
- Mix block types — never use only paragraphs. Use at least one TABLE and at least one CALLOUT per summary.
- Tables: 2-4 columns; 3-6 rows; concise cells (<= 12 words).
- Highlight high-yield facts via callouts (tone='highYield') and pearls (tone='pearl').
- Keep bullets short (<= 16 words). Bold mechanism words with **double asterisks**.
- Recap: 5-8 punchy one-liners.
- Write in English unless the source is clearly in another language.`;

function lengthHint(l: GenInput["length"]) {
  if (l === "short") return "Aim for 4-5 sections, ~2-3 pages of content.";
  if (l === "comprehensive") return "Aim for 9-12 sections, deep coverage, ~8-12 pages.";
  return "Aim for 6-8 sections, ~4-6 pages.";
}
function toneHint(t: GenInput["tone"]) {
  if (t === "concept") return "Tone: conceptual & mechanistic, explain the WHY.";
  if (t === "revision") return "Tone: quick-revision flashcard style — terse, list-heavy.";
  return "Tone: exam-focused — high-yield facts, common traps, pearls, classic associations.";
}

async function getGeminiKey(supabase: any): Promise<GeminiPool> {
  const pool = await getGeminiPool(supabase);
  if (!pool.keys.length)
    throw new Error("No Gemini API key saved. Ask an admin to add it in /admin/ai-keys.");
  return pool;
}

async function callGeminiText(pool: GeminiPool, systemText: string, userText: string, wantJson: boolean): Promise<string> {
  return await callGeminiPool({
    pool,
    systemPrompt: systemText,
    userParts: [{ text: userText }],
    allowTextOnly: true,
    timeoutMs: 120_000,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 32768,
      ...(wantJson ? { responseMimeType: "application/json" } : { responseMimeType: undefined }),
    },
  });
}

async function callGeminiMultimodal(
  pool: GeminiPool,
  systemText: string,
  userText: string,
  parts: any[],
): Promise<string> {
  return await callGeminiPool({
    pool,
    systemPrompt: systemText,
    userParts: [{ text: userText }, ...parts],
    timeoutMs: 120_000,
    generationConfig: { temperature: 0.2, maxOutputTokens: 16384, responseMimeType: undefined },
  });
}


async function callLovableJSON(messages: any[]) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429) throw new Error("AI rate limit — please try again in a moment.");
    if (r.status === 402) throw new Error("AI credits exhausted — add credits in Settings → Plans & credits.");
    throw new Error(`AI gateway ${r.status}: ${body}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

function tryParseJson(s: string): any {
  const t = s.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return JSON.parse(t);
}

function safeContent(raw: any): SummaryContent {
  const c: SummaryContent = {
    title: String(raw?.title ?? "Summary").slice(0, 120),
    subtitle: raw?.subtitle ? String(raw.subtitle).slice(0, 160) : undefined,
    sections: [],
    recap: Array.isArray(raw?.recap) ? raw.recap.map((x: any) => String(x)).slice(0, 12) : [],
  };
  if (Array.isArray(raw?.sections)) {
    for (const s of raw.sections.slice(0, 14)) {
      const blocks: SummaryBlock[] = [];
      if (Array.isArray(s?.blocks)) {
        for (const b of s.blocks.slice(0, 10)) {
          if (!b || typeof b !== "object") continue;
          const t = b.type;
          if (t === "paragraph" && typeof b.text === "string") blocks.push({ type: "paragraph", text: b.text });
          else if (t === "bullets" && Array.isArray(b.items))
            blocks.push({ type: "bullets", items: b.items.map((x: any) => String(x)).slice(0, 12) });
          else if (t === "callout" && typeof b.text === "string")
            blocks.push({
              type: "callout",
              tone: ["highYield", "trap", "pearl", "note"].includes(b.tone) ? b.tone : "note",
              title: b.title ? String(b.title) : undefined,
              text: b.text,
            });
          else if (t === "mnemonic" && typeof b.title === "string" && typeof b.text === "string")
            blocks.push({ type: "mnemonic", title: b.title, text: b.text });
          else if (t === "usage" && Array.isArray(b.items))
            blocks.push({
              type: "usage",
              title: b.title ? String(b.title) : undefined,
              items: b.items.map((x: any) => String(x)).slice(0, 10),
            });
          else if (t === "table" && Array.isArray(b.headers) && Array.isArray(b.rows))
            blocks.push({
              type: "table",
              tone: ["indigo", "pink", "emerald", "amber"].includes(b.tone) ? b.tone : "indigo",
              headers: b.headers.map((x: any) => String(x)).slice(0, 6),
              rows: b.rows
                .slice(0, 12)
                .map((r: any) => (Array.isArray(r) ? r.map((c: any) => String(c)).slice(0, 6) : [])),
            });
        }
      }
      c.sections.push({
        heading: String(s?.heading ?? "Section").slice(0, 100),
        kicker: s?.kicker ? String(s.kicker).slice(0, 40) : undefined,
        blocks,
      });
    }
  }
  return c;
}

async function ocrPhotosLovable(images: { mimeType: string; base64: string }[]) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const content: any[] = [
    {
      type: "text",
      text: "Extract ALL educational text from these pages verbatim. Preserve headings, lists, and tables. Plain text only.",
    },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    })),
  ];
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You OCR and structure educational pages into clean plain text." },
        { role: "user", content },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OCR failed (${r.status}): ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function ocrPhotosGemini(pool: GeminiPool, images: { mimeType: string; base64: string }[]) {
  const parts = images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));
  return await callGeminiMultimodal(
    pool,
    "You OCR and structure educational pages into clean plain text.",
    "Extract ALL educational text from these pages verbatim. Preserve headings, lists, and tables. Plain text only.",
    parts,
  );
}

async function extractPdfTextLovable(pdfBase64: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You extract educational content from PDFs into clean plain text, preserving headings, bullet lists, tables, and figure captions. No commentary." },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract ALL educational text from this PDF verbatim. Preserve structure (headings, lists, tables). Plain text only." },
            { type: "file", file: { filename: "source.pdf", file_data: `data:application/pdf;base64,${pdfBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 429) throw new Error("AI rate limit — please try again in a moment.");
    if (r.status === 402) throw new Error("AI credits exhausted — add credits in Settings → Plans & credits.");
    throw new Error(`PDF read failed (${r.status}): ${body}`);
  }
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text || text.trim().length < 40) throw new Error("Could not extract readable text from the PDF.");
  return text;
}

async function extractPdfTextGemini(pool: GeminiPool, pdfBase64: string): Promise<string> {
  const text = await callGeminiMultimodal(
    pool,
    "You extract educational content from PDFs into clean plain text, preserving headings, bullet lists, tables, and figure captions. No commentary.",
    "Extract ALL educational text from this PDF verbatim. Preserve structure (headings, lists, tables). Plain text only.",
    [{ inline_data: { mime_type: "application/pdf", data: pdfBase64 } }],
  );
  if (!text || text.trim().length < 40) throw new Error("Could not extract readable text from the PDF.");
  return text;
}



function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export const generateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GenInput) => {
    if (!data || !("kind" in data)) throw new Error("Invalid input");
    if (data.kind === "photos" && (!data.images?.length || data.images.length > 10)) {
      throw new Error("Upload 1-10 images.");
    }
    if (data.kind === "text" && (!data.text || data.text.trim().length < 20)) {
      throw new Error("Paste at least 20 characters of text.");
    }
    if (data.kind === "pdf" && (!data.pdfBase64 || data.pdfBase64.length < 100)) {
      throw new Error("Please attach a valid PDF.");
    }
    if (data.kind === "flags" && !data.subjectId) {
      throw new Error("Pick a subject.");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    let sourceText = "";
    const sourceRef: Record<string, unknown> = { kind: data.kind };
    let provider: Provider = data.provider === "gemini" ? "gemini" : "lovable";
    let geminiKey: GeminiPool | null = null;
    if (provider === "gemini") {
      try { geminiKey = await getGeminiKey(context.supabase); }
      catch { provider = "lovable"; geminiKey = null; }
    }
    sourceRef.provider = provider;




    if (data.kind === "subject") {
      const { data: subj, error: sErr } = await (context.supabase.from as any)("subjects")
        .select("id,name,group_id,subject_groups(id,name,course_id,courses(id,title))")
        .eq("id", data.subjectId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!subj) throw new Error("Subject not found");
      sourceRef.subjectId = subj.id;
      sourceRef.subjectName = subj.name;
      sourceRef.groupName = subj.subject_groups?.name;
      sourceRef.courseTitle = subj.subject_groups?.courses?.title;

      const { data: qs, error: qErr } = await (context.supabase.from as any)("questions")
        .select("stem,explanation,question_options(label,text,is_correct)")
        .eq("subject_id", data.subjectId)
        .order("sort_order", { ascending: true });
      if (qErr) throw qErr;
      if (!qs?.length) throw new Error("This subject has no questions yet.");

      sourceText =
        `Course: ${sourceRef.courseTitle ?? ""}\nGroup: ${sourceRef.groupName ?? ""}\nSubject: ${subj.name}\n\n` +
        qs
          .map((q: any, i: number) => {
            const opts = (q.question_options ?? [])
              .map((o: any) => `${o.label}) ${o.text}${o.is_correct ? "  ✓" : ""}`)
              .join("\n");
            return `### Q${i + 1}\n${q.stem}\n${opts}\nExplanation: ${q.explanation ?? ""}`;
          })
          .join("\n\n");
    } else if (data.kind === "text") {
      sourceText = data.text;
    } else if (data.kind === "photos") {
      if (provider === "gemini") {
        sourceText = await ocrPhotosGemini(geminiKey!, data.images);
      } else {
        sourceText = await ocrPhotosLovable(data.images);
      }
      sourceRef.imageCount = data.images.length;
    } else if (data.kind === "pdf") {
      if (provider === "gemini") {
        sourceText = await extractPdfTextGemini(geminiKey!, data.pdfBase64);
      } else {
        sourceText = await extractPdfTextLovable(data.pdfBase64);
      }
      sourceRef.filename = data.filename ?? "document.pdf";
    } else {
      // flags: build context from the user's red-flagged questions in this subject
      const { data: subj, error: sErr } = await (context.supabase.from as any)("subjects")
        .select("id,name,group_id,subject_groups(id,name,course_id,courses(id,title))")
        .eq("id", data.subjectId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!subj) throw new Error("Subject not found");

      const { data: flagged, error: fErr } = await (context.supabase.from as any)("question_flags")
        .select("question_id, questions!inner(id, stem, explanation, subject_id, question_options(label,text,is_correct))")
        .eq("user_id", context.userId)
        .eq("questions.subject_id", data.subjectId);
      if (fErr) throw fErr;
      const qs = (flagged ?? [])
        .map((r: any) => r.questions)
        .filter((q: any) => q && q.subject_id === data.subjectId);
      if (!qs.length) throw new Error("No red-flagged questions in this subject yet.");

      sourceRef.subjectId = subj.id;
      sourceRef.subjectName = subj.name;
      sourceRef.groupName = subj.subject_groups?.name;
      sourceRef.courseTitle = subj.subject_groups?.courses?.title;
      sourceRef.questionCount = qs.length;
      sourceRef.flagsOnly = true;

      sourceText =
        `Course: ${sourceRef.courseTitle ?? ""}\nGroup: ${sourceRef.groupName ?? ""}\nSubject: ${subj.name}\n\n` +
        `These are questions the student flagged as tricky / important. Build a focused cheat-sheet around the underlying concepts they keep missing.\n\n` +
        qs
          .map((q: any, i: number) => {
            const opts = (q.question_options ?? [])
              .map((o: any) => `${o.label}) ${o.text}${o.is_correct ? "  ✓" : ""}`)
              .join("\n");
            return `### Flagged Q${i + 1}\n${q.stem}\n${opts}\nExplanation: ${q.explanation ?? ""}`;
          })
          .join("\n\n");
    }

    const userPrompt = [
      lengthHint(data.length),
      toneHint(data.tone),
      data.titleOverride ? `Use this title: "${data.titleOverride}".` : "",
      "Source material follows:\n---\n",
      sourceText.slice(0, 60000),
    ]
      .filter(Boolean)
      .join("\n");

    const raw =
      provider === "gemini"
        ? await callGeminiText(geminiKey!, SYSTEM_PROMPT, userPrompt, true)
        : await callLovableJSON([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ]);

    let parsed: any;
    try {
      parsed = tryParseJson(raw);
    } catch {
      throw new Error("AI returned malformed output. Try again.");
    }
    const content = safeContent(parsed);
    if (data.titleOverride) content.title = data.titleOverride;
    if (!content.sections.length) throw new Error("AI returned an empty summary. Try again.");

    // resolve author
    let authorName = data.authorName?.trim() || "";
    if (!authorName) {
      const { data: prof } = await (context.supabase.from as any)("profiles")
        .select("full_name,username")
        .eq("id", context.userId)
        .maybeSingle();
      authorName = prof?.full_name || prof?.username || "Student";
    }

    const shareSlug = `${slugify(content.title)}-${Math.random().toString(36).slice(2, 8)}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: insErr } = await (supabaseAdmin.from as any)("summaries")
      .insert({
        user_id: context.userId,
        title: content.title,
        subtitle: content.subtitle,
        author_name: authorName,
        source_type: data.kind,
        source_ref: sourceRef,
        content,
        length_preset: data.length,
        tone: data.tone,
        share_slug: shareSlug,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return { id: row.id as string, providerUsed: provider, providerRequested: (data.provider === "gemini" ? "gemini" : "lovable") as Provider };
  });

export const toggleSummaryPublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; isPublic: boolean }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from as any)("summaries")
      .update({ is_public: data.isPublic })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from as any)("summaries").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
