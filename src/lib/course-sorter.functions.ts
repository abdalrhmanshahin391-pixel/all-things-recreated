import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "gemini-2.5-flash";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function getGeminiKey(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from("admin_ai_keys")
    .select("api_key, slot")
    .eq("provider", "gemini")
    .order("slot", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key) throw new Error("No Gemini API key configured. Add one in /admin/ai-keys.");
  return data.api_key as string;
}

function stripFences(text: string): string {
  return String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parseJsonObject(text: string): any | null {
  const s = stripFences(text);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {}
  const lb = s.indexOf("{");
  const rb = s.lastIndexOf("}");
  if (lb !== -1 && rb > lb) {
    try {
      return JSON.parse(s.slice(lb, rb + 1));
    } catch {}
  }
  return null;
}

function responseText(responseJson: any): string {
  return (
    responseJson?.candidates?.[0]?.content?.parts?.[0]?.text ??
    responseJson?.choices?.[0]?.message?.content ??
    ""
  );
}

// ---------------- 1. Extract Topics from Questionnaire PDF / Text ----------------

export const extractQuestionnaireTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        courseId: z.string().uuid(),
        pdfBase64: z.string().optional(),
        text: z.string().max(30000).optional(),
        autoDetectFromQuestions: z.boolean().optional(),
        selectedSubjectIds: z.array(z.string().uuid()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = await getGeminiKey(supabaseAdmin);

    // Mode A: Uploaded PDF
    if (data.pdfBase64) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: `You are an expert medical curriculum organizer. Analyze the supplied questionnaire, syllabus, or lecture topics document and extract all distinct topic titles, section names, or sub-subject categories.
Return a strict JSON object with: { "topics": string[] }.
Rules:
- Each topic should be concise (2 to 6 words), informative, and suitable as a sub-subject name in a medical question bank (e.g., "Valvular Heart Disease", "Acute Coronary Syndrome", "Glomerular Disorders").
- Return between 2 and 40 topics.
- Ignore administrative details (dates, professor names, grading criteria).`,
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "application/pdf", data: data.pdfBase64 } },
                  { text: "Extract all topics and sub-subjects from this questionnaire/syllabus document." },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
          }),
        },
      );

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(`Reading questionnaire PDF failed (${res.status}): ${JSON.stringify(json?.error || json)}`);
      const parsed = parseJsonObject(responseText(json));
      const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
      const cleanTopics = rawTopics
        .map((t: unknown) => String(t).trim())
        .filter((t: string) => t.length >= 2 && t.length <= 80);

      if (cleanTopics.length < 2) {
        throw new Error("Could not extract topics from that PDF. Please try pasting the topic text directly.");
      }
      return { topics: cleanTopics };
    }

    // Mode B: Pasted text
    if (data.text && data.text.trim()) {
      const lines = data.text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
      // If the text is already a clean list of lines (e.g. 3-30 lines of reasonable length)
      if (lines.length >= 2 && lines.length <= 40 && lines.every((l) => l.length <= 80)) {
        const cleaned = lines.map((l) => l.replace(/^(?:(?:lec|lecture|topic|part|section|ch|chapter)\s*\d+[\s.:)\-–—=]+|\d+[\s.:)\-–—=]+)/i, "").trim()).filter(Boolean);
        if (cleaned.length >= 2) return { topics: [...new Set(cleaned)] };
      }

      // Otherwise, let Gemini extract topics from the text
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: `Extract distinct medical sub-subject topics or categories from the provided text. Return strict JSON: { "topics": string[] }. Each topic should be 2 to 6 words. Ignore administrative fluff.`,
                },
              ],
            },
            contents: [{ role: "user", parts: [{ text: data.text }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
          }),
        },
      );

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(`Reading topic text failed (${res.status}).`);
      const parsed = parseJsonObject(responseText(json));
      const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
      const cleanTopics = rawTopics
        .map((t: unknown) => String(t).trim())
        .filter((t: string) => t.length >= 2 && t.length <= 80);

      if (cleanTopics.length < 2) {
        throw new Error("Could not extract at least 2 distinct topics from the text. Please provide more details.");
      }
      return { topics: cleanTopics };
    }

    // Mode C: Auto-detect from course questions
    if (data.autoDetectFromQuestions) {
      // Fetch sample questions from the course
      const { data: groups } = await supabaseAdmin.from("subject_groups").select("id").eq("course_id", data.courseId);
      const groupIds = (groups ?? []).map((g: any) => g.id);
      let subjectQuery = supabaseAdmin.from("subjects").select("id");
      if (data.selectedSubjectIds && data.selectedSubjectIds.length > 0) {
        subjectQuery = subjectQuery.in("id", data.selectedSubjectIds);
      } else {
        subjectQuery = subjectQuery.in("group_id", groupIds);
      }
      const { data: subjects } = await subjectQuery;
      const sIds = (subjects ?? []).map((s: any) => s.id);

      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("stem")
        .in("subject_id", sIds)
        .limit(100);

      if (!qs || qs.length < 3) {
        throw new Error("Not enough questions in this scope to auto-detect topics. Please provide a PDF or paste topic text.");
      }

      const stemsSample = qs.map((q: any, i: number) => `${i + 1}. ${q.stem.slice(0, 120)}`).join("\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: `Analyze these medical exam questions and propose 4 to 10 logical sub-subject categories / topics that best divide and organize them into distinct study modules. Return JSON: { "topics": string[] }.`,
                },
              ],
            },
            contents: [{ role: "user", parts: [{ text: stemsSample }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" },
          }),
        },
      );

      const json = await res.json().catch(() => ({} as any));
      const parsed = parseJsonObject(responseText(json));
      const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
      const cleanTopics = rawTopics
        .map((t: unknown) => String(t).trim())
        .filter((t: string) => t.length >= 2 && t.length <= 80);

      return { topics: cleanTopics };
    }

    throw new Error("Please upload a PDF or enter topic text.");
  });

// ---------------- 2. Classify Questions by Topics ----------------

export type SortedQuestionCategory = {
  topic: string;
  questionsCount: number;
  questionIds: string[];
  questionsSample: Array<{ id: string; stem: string; currentSubjectName: string }>;
  suggestedTargetSubjectId?: string;
  suggestedTargetGroupId?: string;
};

export const classifyCourseQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        courseId: z.string().uuid(),
        subjectIds: z.array(z.string().uuid()).optional(),
        topics: z.array(z.string().min(1)).min(1),
        sortingInstructions: z.string().max(5000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = await getGeminiKey(supabaseAdmin);

    // Get groups and subjects in the course
    const { data: groups } = await supabaseAdmin
      .from("subject_groups")
      .select("id, name, sort_order")
      .eq("course_id", data.courseId)
      .order("sort_order");

    const groupIds = (groups ?? []).map((g: any) => g.id);
    const { data: subjects } = await supabaseAdmin
      .from("subjects")
      .select("id, group_id, name, sort_order")
      .in("group_id", groupIds)
      .order("sort_order");

    const subjectMap = new Map<string, any>();
    (subjects ?? []).forEach((s: any) => subjectMap.set(s.id, s));

    let targetSubjectIds: string[] = [];
    if (data.subjectIds && data.subjectIds.length > 0) {
      targetSubjectIds = data.subjectIds;
    } else {
      targetSubjectIds = (subjects ?? []).map((s: any) => s.id);
    }

    if (!targetSubjectIds.length) {
      throw new Error("No subjects found in this course to sort.");
    }

    // Fetch questions
    const questions: any[] = [];
    for (let i = 0; i < targetSubjectIds.length; i += 200) {
      const chunk = targetSubjectIds.slice(i, i + 200);
      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("id, stem, subject_id, sort_order")
        .in("subject_id", chunk)
        .order("sort_order");
      if (qs) questions.push(...qs);
    }

    if (!questions.length) {
      throw new Error("No questions found in the selected scope.");
    }

    const topicsList = data.topics;
    const allowedTopicNames = [...topicsList, "Other / Uncategorized"];

    const topicClassification = new Map<string, string[]>();
    for (const t of allowedTopicNames) topicClassification.set(t, []);

    const instructionsBlock = data.sortingInstructions?.trim()
      ? `\nADMINISTRATOR SORTING INSTRUCTIONS (STRICTLY ENFORCE):\n${data.sortingInstructions.trim()}\n`
      : "";

    // Batch questions into chunks of 35 to classify with Gemini
    const CHUNK_SIZE = 35;
    for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
      const chunk = questions.slice(i, i + CHUNK_SIZE);
      const promptItems = chunk.map(
        (q, idx) => `ID: ${q.id}\nQuestion: ${q.stem.slice(0, 250)}`,
      ).join("\n---\n");

      const systemPrompt = `You are a medical question categorization system.
Categorize each question into EXACTLY ONE best-fitting topic from this allowed list:
${topicsList.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}
- Other / Uncategorized
${instructionsBlock}
Return strict JSON:
{
  "classifications": [
    { "id": "question-id", "topic": "Exact topic name from allowed list" }
  ]
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: promptItems }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
          }),
        },
      );

      const json = await res.json().catch(() => ({} as any));
      const parsed = parseJsonObject(responseText(json));
      const classifications: Array<{ id: string; topic: string }> = Array.isArray(parsed?.classifications)
        ? parsed.classifications
        : [];

      const classifiedMap = new Map<string, string>();
      classifications.forEach((c) => {
        if (c.id && c.topic) classifiedMap.set(c.id, c.topic);
      });

      for (const q of chunk) {
        let assigned = classifiedMap.get(q.id);
        // Find best match in allowedTopicNames
        if (!assigned || !allowedTopicNames.includes(assigned)) {
          const match = allowedTopicNames.find(
            (t) => t.toLowerCase() === (assigned || "").toLowerCase(),
          );
          assigned = match || "Other / Uncategorized";
        }
        const existing = topicClassification.get(assigned) ?? [];
        existing.push(q.id);
        topicClassification.set(assigned, existing);
      }
    }

    const questionMap = new Map<string, any>();
    questions.forEach((q) => questionMap.set(q.id, q));

    // Build categories
    const categories: SortedQuestionCategory[] = [];
    for (const [topic, qIds] of topicClassification.entries()) {
      if (!qIds.length) continue;

      const sample = qIds.slice(0, 5).map((id) => {
        const q = questionMap.get(id);
        const sub = q ? subjectMap.get(q.subject_id) : null;
        return {
          id,
          stem: q?.stem ?? "",
          currentSubjectName: sub?.name ?? "Unknown Subject",
        };
      });

      // Check if a subject with the same or very similar name exists
      const matchSub = (subjects ?? []).find(
        (s: any) => s.name.trim().toLowerCase() === topic.trim().toLowerCase(),
      );

      categories.push({
        topic,
        questionsCount: qIds.length,
        questionIds: qIds,
        questionsSample: sample,
        suggestedTargetSubjectId: matchSub ? matchSub.id : undefined,
        suggestedTargetGroupId: matchSub ? matchSub.group_id : (groups?.[0]?.id ?? undefined),
      });
    }

    return {
      courseId: data.courseId,
      totalQuestions: questions.length,
      groups: groups ?? [],
      subjects: subjects ?? [],
      categories,
    };
  });

// ---------------- 3. Apply Sort Destinations ----------------

const AssignmentSchema = z.object({
  topic: z.string(),
  questionIds: z.array(z.string().uuid()),
  action: z.enum(["create_new_subject", "move_to_existing", "skip"]),
  targetSubjectId: z.string().uuid().optional(),
  newSubjectName: z.string().optional(),
  targetGroupId: z.string().uuid().optional(),
  newGroupName: z.string().optional(),
});

export const applyCourseQuestionSort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        courseId: z.string().uuid(),
        assignments: z.array(AssignmentSchema),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let movedQuestionsCount = 0;
    let createdSubjectsCount = 0;
    const affectedSubjectIds = new Set<string>();

    for (const item of data.assignments) {
      if (item.action === "skip" || !item.questionIds.length) {
        continue;
      }

      let destinationSubjectId: string | null = null;

      if (item.action === "move_to_existing") {
        if (!item.targetSubjectId) {
          throw new Error(`No target subject selected for "${item.topic}".`);
        }
        destinationSubjectId = item.targetSubjectId;
      } else if (item.action === "create_new_subject") {
        const subName = (item.newSubjectName || item.topic).trim();
        if (!subName) throw new Error("New subject name cannot be empty.");

        let targetGroupId = item.targetGroupId;
        // If a new group name is provided
        if (item.newGroupName && item.newGroupName.trim()) {
          const gName = item.newGroupName.trim();
          const { data: existingGroup } = await supabaseAdmin
            .from("subject_groups")
            .select("id")
            .eq("course_id", data.courseId)
            .ilike("name", gName)
            .maybeSingle();

          if (existingGroup) {
            targetGroupId = existingGroup.id;
          } else {
            const { data: newGroup, error: gErr } = await supabaseAdmin
              .from("subject_groups")
              .insert({
                course_id: data.courseId,
                name: gName,
                sort_order: 99,
              })
              .select("id")
              .single();
            if (gErr || !newGroup) throw new Error(gErr?.message || "Failed to create group");
            targetGroupId = newGroup.id;
          }
        }

        if (!targetGroupId) {
          // Fallback to first group in course
          const { data: firstGroup } = await supabaseAdmin
            .from("subject_groups")
            .select("id")
            .eq("course_id", data.courseId)
            .order("sort_order")
            .limit(1)
            .maybeSingle();
          if (!firstGroup) throw new Error("Please create at least one folder/group in this course first.");
          targetGroupId = firstGroup.id;
        }

        // Check if subject already exists under this group
        const { data: existingSub } = await supabaseAdmin
          .from("subjects")
          .select("id")
          .eq("group_id", targetGroupId)
          .ilike("name", subName)
          .maybeSingle();

        if (existingSub) {
          destinationSubjectId = existingSub.id;
        } else {
          const { data: newSub, error: sErr } = await supabaseAdmin
            .from("subjects")
            .insert({
              group_id: targetGroupId,
              name: subName,
              access_level: "paid",
              sort_order: 99,
            })
            .select("id")
            .single();
          if (sErr || !newSub) throw new Error(sErr?.message || "Failed to create subject");
          destinationSubjectId = newSub.id;
          createdSubjectsCount++;
        }
      }

      if (destinationSubjectId) {
        affectedSubjectIds.add(destinationSubjectId);
        // Find previous subjects to update their counts too
        const { data: prevQs } = await supabaseAdmin
          .from("questions")
          .select("subject_id")
          .in("id", item.questionIds);
        (prevQs ?? []).forEach((q: any) => affectedSubjectIds.add(q.subject_id));

        // Move the questions!
        // Chunk question updates to handle large batches
        for (let i = 0; i < item.questionIds.length; i += 200) {
          const chunk = item.questionIds.slice(i, i + 200);
          const { error: uErr } = await supabaseAdmin
            .from("questions")
            .update({ subject_id: destinationSubjectId })
            .in("id", chunk);
          if (uErr) throw new Error(uErr.message);
        }
        movedQuestionsCount += item.questionIds.length;
      }
    }

    return {
      success: true,
      movedQuestionsCount,
      createdSubjectsCount,
    };
  });
