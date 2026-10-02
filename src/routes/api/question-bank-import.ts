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
 * Admin only. Every group gets a fresh id, so an import can never overwrite an existing group.
 */

const MAX_BODY_BYTES = 45 * 1024 * 1024;
const MAX_QUESTIONS = 1000;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

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
    }))
    .filter((o) => o.text);
  if (!stem || options.length < 2 || !options.some((o) => o.is_correct)) return null;
  const image = typeof raw?.image_url === "string" ? raw.image_url : "";
  const imageOk = /^https:\/\//.test(image) || (/^data:image\/(jpeg|png);base64,/.test(image) && image.length < 4_000_000);
  return {
    stem,
    explanation: raw?.explanation ? String(raw.explanation).slice(0, 18000) : null,
    answer_mode: raw?.answer_mode === "multiple" ? "multiple" : "single",
    sort_order: index + 1,
    options,
    image_url: imageOk ? image : null,
  };
}

export const Route = createFileRoute("/api/question-bank-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return jsonError("Unauthorized", 401);

        const backendUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!backendUrl || !publishableKey) return jsonError("Backend is not configured", 500);

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
        if (authError || !authData.user) return jsonError("Unauthorized", 401);
        const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
          _user_id: authData.user.id,
          _role: "admin",
        });
        if (roleError || !isAdmin) return jsonError("Forbidden: admin only", 403);

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
          const index: QbIndex = await qb.readIndex();
          for (const group of prepared) {
            group.meta.sort_order = index.groups.length + 1;
            await qb.writeGroupFile(group.meta, group.questions);
            index.groups.push(group.meta);
          }
          await qb.writeIndex(index);

          let course: { subjectId: string; saved: number; skipped: number; failed: number } | null = null;
          const sectionId = typeof body?.course?.sectionId === "string" ? body.course.sectionId : "";
          if (sectionId) {
            const first = prepared[0];
            course = await qb.pourIntoCourse({
              sectionId,
              subjectName: text(body.course.subjectName, 120, first.meta.subject),
              questions: first.questions,
            });
          }
          return Response.json({
            imported: prepared.length,
            questions: total,
            groups: prepared.map((g) => ({ id: g.meta.id, name: g.meta.name, count: g.meta.count })),
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
