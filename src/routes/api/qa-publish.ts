import { createFileRoute } from "@tanstack/react-router";
import type { QbIndex, QbMeta, QbQuestion } from "@/lib/question-bank";

/**
 * The AquaQadmin panel publishes the questions QA approved into the admin Question Bank here.
 *
 * POST /api/qa-publish      x-qa-publish-key: <the secret QA_PUBLISH_KEY>
 *   { groups: [{ meta: { name, year, semester, subject, source }, questions: [...] }] }
 *
 * Only the panel's server knows the key. Every group gets a fresh id, so a publish never overwrites a group.
 */

const MAX_QUESTIONS = 1000;

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });
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
  return {
    stem,
    explanation: raw?.explanation ? String(raw.explanation).slice(0, 18000) : null,
    answer_mode: raw?.answer_mode === "multiple" ? "multiple" : "single",
    sort_order: index + 1,
    options,
    image_url: null,
  };
}

/** Compare two secrets without stopping at the first different character. */
function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/qa-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["QA_PUBLISH_KEY"];
        if (!secret) return jsonError("Publishing is not set up: QA_PUBLISH_KEY is missing.", 500);
        const sent = request.headers.get("x-qa-publish-key") ?? "";
        if (!sameSecret(sent, secret)) return jsonError("Unauthorized", 401);

        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonError("The request body is not valid JSON", 400);
        }
        const incoming: any[] = Array.isArray(body?.groups) ? body.groups : [];
        if (!incoming.length) return jsonError("No groups to publish", 400);

        const prepared: Array<{ meta: QbMeta; questions: QbQuestion[] }> = [];
        let total = 0;
        for (const entry of incoming) {
          const rawQuestions: any[] = Array.isArray(entry?.questions) ? entry.questions : [];
          const questions = rawQuestions.map(cleanQuestion).filter((q): q is QbQuestion => q !== null);
          if (rawQuestions.length !== questions.length) {
            return jsonError(`${rawQuestions.length - questions.length} question(s) are not valid (each needs text, 2+ options and a correct answer). Nothing was published.`, 400);
          }
          if (!questions.length) continue;
          total += questions.length;
          if (total > MAX_QUESTIONS) return jsonError(`At most ${MAX_QUESTIONS} questions per publish`, 413);
          const name = text(entry?.meta?.name, 120, "Published questions");
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
              source: text(entry?.meta?.source, 60, "AquaQadmin QA"),
            },
          });
        }
        if (!prepared.length) return jsonError("There were no questions to publish", 400);

        try {
          const qb = await import("@/lib/question-bank.server");
          const index: QbIndex = await qb.readIndex();
          for (const group of prepared) {
            group.meta.sort_order = index.groups.length + 1;
            await qb.writeGroupFile(group.meta, group.questions);
            index.groups.push(group.meta);
          }
          await qb.writeIndex(index);
          return Response.json({ imported: prepared.length, questions: total, groups: prepared.map((g) => ({ id: g.meta.id, name: g.meta.name, count: g.meta.count })) });
        } catch (error) {
          console.error("qa-publish failed", error);
          return jsonError(error instanceof Error ? error.message : "The publish failed", 500);
        }
      },
    },
  },
});
