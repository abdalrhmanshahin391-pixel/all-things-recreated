import { useEffect, useState } from "react";
import { translateQuestion, type QuestionTranslation } from "@/lib/question-translate.functions";

const cache = new Map<string, QuestionTranslation>();
const inflight = new Map<string, Promise<QuestionTranslation>>();

export function useQuestionTranslation(questionId: string | undefined, enabled: boolean) {
  const [data, setData] = useState<QuestionTranslation | null>(
    questionId && enabled ? (cache.get(questionId) ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!questionId || !enabled) return;
    const hit = cache.get(questionId);
    if (hit) {
      setData(hit);
      setError(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setData(null);
    setLoading(true);
    setError(null);
    let p = inflight.get(questionId);
    if (!p) {
      p = translateQuestion({ data: { questionId, lang: "ar" } }).then((res) => {
        cache.set(questionId, res);
        inflight.delete(questionId);
        return res;
      });
      p.catch(() => inflight.delete(questionId));
      inflight.set(questionId, p);
    }
    p.then((res) => {
      if (!alive) return;
      setData(res);
      setLoading(false);
    }).catch((e: any) => {
      if (!alive) return;
      setError(String(e?.message || e) || "Translation failed.");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [questionId, enabled]);

  return { data: enabled ? data : null, loading, error };
}
