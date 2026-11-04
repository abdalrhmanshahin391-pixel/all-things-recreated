import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { QbIndex, QbMeta, QbQuestion } from "@/lib/question-bank";

/**
 * Lets the Aqua Forge / Aqua Papers desktop tools save a finished set of questions straight into the
 * admin Question Bank (and, optionally, pour it into a course section right away).
 *
 * POST /api/question-bank-import      Authorization: Bearer <the admin's Aqua session token>
 *   { groups: [{ meta: { name, year, semester, subject }, questions: [...] }],
 *     course?: { sectionId: string, subjectName?: string } }
 *
 * Admin or QBank only. Every group gets a fresh id, so an import can never overwrite an existing group.
 * A question's image_url may be an https link or a data URL (jpeg/png); data URLs are uploaded to the
 * question-images bucket and replaced by their storage path. An option may carry an image_url too (a formula
 * cut out of the paper): it is uploaded the same way and the option's text becomes [[img:storage-path]].
 */

const MAX_BODY_BYTES = 45 * 1024 * 1024;
const MAX_QUESTIONS = 1000;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

const pictureOk = (image: unknown): image is string =>
  typeof image === "string" && (/^https:\/\//.test(image) || (/^data:image\/(jpeg|png);base64,/.test(image) && image.length < 4_000_000));

const text = (value: unknown, max: number, fallback = "") => String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, max);

function cleanQuestion(raw: any, index: number): QbQuestion | null {
  const stem = String(raw?.stem ?? "").trim().slice(0, 8000);
  const rawOptions: any[] = Array.isArray(raw?.options) ? raw.options.slice(0, 10) : [];
  const options = rawOptions
    .map((o, i) => ({
      label: text(o?.label, 8, String.fromCharCode(65 + i)),
      text: String(o?.text ?? "").trim().slice(0, 2000),
      is_correct: Boolean(o?.is_correct),
      sort_order: i + 1,
      image_url: pictureOk(o?.image_url) ? o.image_url : null,
    }))
    .filter((o) => o.text || o.image_url);
  if (!stem || options.length < 2 || !options.some((o) => o.is_correct)) return null;
  const image = typeof raw?.image_url === "string" ? raw.image_url : "";
  const imageOk = pictureOk(image);
  return {
    stem,
    explanation: raw?.explanation ? String(raw.explanation).slice(0, 18000) : null,
    answer_mode: raw?.answer_mode === "multiple" ? "multiple" : "single",
    sort_order: index + 1,
    options,
    image_url: imageOk ? image : null,
  };
}

const IMAGE_BUCKET = "question-images";

/**
 * Pictures arrive as data URLs. Aqua shows a question picture from either an https link or a path in the
 * private "question-images" bucket (see QuestionImage), so each picture is uploaded there and the question
 * keeps the storage path. Questions that share a picture share one upload.
 */
async function storePictures(questions: QbQuestion[]): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const uploaded = new Map<string, string>();
  /** Uploads one data URL (once, however many times it is used) and returns its storage path, or null if it cannot be stored. */
  const store = async (data: string): Promise<string | null> => {
    let path = uploaded.get(data);
    if (path) return path;
    const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(data);
    if (!match) return null;
    const ext = match[1] === "png" ? "png" : "jpg";
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    path = `manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(IMAGE_BUCKET)
      .upload(path, bytes, { contentType: `image/${match[1]}`, cacheControl: "31536000", upsert: false });
    if (error) throw new Error(`Could not store a question picture: ${error.message}`);
    uploaded.set(data, path);
    return path;
  };
  for (const q of questions) {
    const data = q.image_url;
    if (data && data.startsWith("data:")) q.image_url = await store(data);
    for (const o of q.options) {
      const picture = o.image_url;
      delete o.image_url;
      if (!picture) continue;
      const path = picture.startsWith("data:") ? await store(picture) : null;
      // a picture option is its marker; one that could not be stored keeps whatever text it had (the question is rejected if there is none)
      if (path) o.text = `[[img:${path}]]`;
      else if (/^https:\/\//.test(picture)) o.text = `[[img:${picture}]]`;
    }
    if (q.options.some((o) => !o.text)) throw new Error("A picture of an answer option could not be stored.");
  }
}

/** Signed in as an admin or a QBank member? Returns the person's own client, or the response to send back. */
async function authenticate(request: Request): Promise<{ response: Response } | { supabase: any; userId: string }> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return { response: jsonError("Unauthorized", 401) };

  const backendUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!backendUrl || !publishableKey) return { response: jsonError("Backend is not configured", 500) };

  const supabase = createClient(backendUrl, publishableKey, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: authorization },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (publishableKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${publishableKey}`) {
          headers.set("Authorization", authorization);
        }
        headers.set("apikey", publishableKey);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return { response: jsonError("Unauthorized", 401) };
  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "admin",
  });
  if (roleError) return { response: jsonError("Forbidden", 403) };
  if (!isAdmin) {
    // The QBank team (Aqua Studio) may send questions too. If the role is not created yet this check fails: refused.
    const { data: isQbank } = await supabase.rpc("has_role", { _user_id: authData.user.id, _role: "qbank" as any });
    if (!isQbank) return { response: jsonError("Forbidden: admin or QBank only", 403) };
  }
  return { supabase, userId: authData.user.id };
}

export const Route = createFileRoute("/api/question-bank-import")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // ?targets=1 : the Question Bank groups and the course subjects an update can be added to
        const auth = await authenticate(request);
        if ("response" in auth) return auth.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const qb = await import("@/lib/question-bank.server");
        const index = await qb.readIndex();
        const { data: subjects } = await supabaseAdmin.from("subjects").select("id, name, group_id, sort_order").order("sort_order");
        return Response.json({
          groups: index.groups.map((g) => ({ id: g.id, name: g.name, year: g.year, semester: g.semester, subject: g.subject, count: g.count })),
          subjects: (subjects ?? []).map((s: any) => ({ id: s.id, name: s.name, group_id: s.group_id })),
        });
      },
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if ("response" in auth) return auth.response;

        const length = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(length) && length > MAX_BODY_BYTES) return jsonError("That import is too large. Send it in parts.", 413);

        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonError("The request body is not valid JSON", 400);
        }
        const incoming: any[] = Array.isArray(body?.groups) ? body.groups : [];
        if (!incoming.length) return jsonError("No groups to import", 400);

        const prepared: Array<{ meta: QbMeta; questions: QbQuestion[] }> = [];
        let total = 0;
        for (const entry of incoming) {
          const rawQuestions: any[] = Array.isArray(entry?.questions) ? entry.questions : [];
          const questions = rawQuestions.map(cleanQuestion).filter((q): q is QbQuestion => q !== null);
          if (!questions.length) continue;
          total += questions.length;
          if (total > MAX_QUESTIONS) return jsonError(`At most ${MAX_QUESTIONS} questions per import`, 413);
          const name = text(entry?.meta?.name, 120, "Imported questions");
          const now = new Date().toISOString();
          prepared.push({
            questions: questions.map((q, i) => ({ ...q, sort_order: i + 1 })),
            meta: {
              id: crypto.randomUUID(),
              name,
              year: text(entry?.meta?.year, 40, "For all years"),
              semester: text(entry?.meta?.semester, 40, "Whole year"),
              subject: text(entry?.meta?.subject, 120, name),
              count: questions.length,
              sort_order: 0,
              created_at: now,
              updated_at: now,
              source: text(entry?.meta?.source, 60, "Desktop tool"),
            },
          });
        }
        if (!prepared.length) return jsonError("None of the questions were valid (each needs text, 2+ options and a correct answer)", 400);

        try {
          const qb = await import("@/lib/question-bank.server");
          for (const group of prepared) await storePictures(group.questions);
          const appendGroupId = typeof body?.append?.groupId === "string" ? body.append.groupId : "";
          let appended: { id: string; name: string; added: number; skipped: number; total: number } | null = null;
          if (appendGroupId) {
            // add to a group the bank already has: nothing new is created
            appended = await qb.appendToGroup(appendGroupId, prepared.flatMap((g) => g.questions));
          } else {
            const index: QbIndex = await qb.readIndex();
            for (const group of prepared) {
              group.meta.sort_order = index.groups.length + 1;
              await qb.writeGroupFile(group.meta, group.questions);
              index.groups.push(group.meta);
            }
            await qb.writeIndex(index);
          }

          let course: { subjectId: string; saved: number; skipped: number; failed: number } | null = null;
          const sectionId = typeof body?.course?.sectionId === "string" ? body.course.sectionId : "";
          const existingSubjectId = typeof body?.course?.subjectId === "string" ? body.course.subjectId : "";
          if (sectionId || existingSubjectId) {
            const first = prepared[0];
            course = await qb.pourIntoCourse({
              sectionId,
              subjectName: text(body.course.subjectName, 120, first.meta.subject),
              questions: prepared.flatMap((g) => g.questions),
              existingSubjectId: existingSubjectId || undefined,
            });
          }
          return Response.json({
            imported: prepared.length,
            questions: total,
            groups: appended
              ? [{ id: appended.id, name: appended.name, count: appended.added }]
              : prepared.map((g) => ({ id: g.meta.id, name: g.meta.name, count: g.meta.count })),
            appended,
            course,
          });
        } catch (error) {
          console.error("question-bank-import failed", error);
          return jsonError(error instanceof Error ? error.message : "The import failed", 500);
        }
      },
    },
  },
});
