import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RequestGroup = { id: string; owner_id: string; name: string; completed: boolean; created_at: string; updated_at: string };
export type RequestOption = { id?: string; label: string; text: string; is_correct: boolean; sort_order: number };
export type RequestQuestion = {
  id: string;
  group_id: string;
  stem: string;
  explanation: string | null;
  answer_mode: "single" | "multiple";
  image_url: string | null;
  sort_order: number;
  options: RequestOption[];
};

export const rdb = (table: string) => (supabase.from as any)(table);

export function useIsContributor(userId: string | undefined) {
  const { data } = useQuery({
    enabled: !!userId,
    queryKey: ["is-contributor", userId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await rdb("question_contributors").select("user_id").eq("user_id", userId).maybeSingle();
      return !!data;
    },
  });
  return !!data;
}

export async function loadGroupQuestions(groupId: string): Promise<RequestQuestion[]> {
  const { data, error } = await rdb("request_questions").select("*").eq("group_id", groupId).order("sort_order");
  if (error) throw error;
  const qs = (data ?? []) as RequestQuestion[];
  if (!qs.length) return [];
  const { data: opts, error: oErr } = await rdb("request_question_options")
    .select("*").in("question_id", qs.map((q) => q.id)).order("sort_order");
  if (oErr) throw oErr;
  const by = new Map<string, RequestOption[]>();
  for (const o of (opts ?? []) as any[]) {
    const a = by.get(o.question_id) ?? [];
    a.push(o);
    by.set(o.question_id, a);
  }
  return qs.map((q) => ({ ...q, options: by.get(q.id) ?? [] }));
}

export async function saveRequestQuestion(groupId: string, q: Omit<RequestQuestion, "id" | "group_id"> & { id?: string }) {
  const row = {
    group_id: groupId,
    stem: q.stem.trim(),
    explanation: q.explanation?.trim() || null,
    answer_mode: q.answer_mode,
    image_url: q.image_url,
    sort_order: q.sort_order,
  };
  let id = q.id;
  if (id) {
    const { error } = await rdb("request_questions").update(row).eq("id", id);
    if (error) throw error;
    const { error: dErr } = await rdb("request_question_options").delete().eq("question_id", id);
    if (dErr) throw dErr;
  } else {
    const { data, error } = await rdb("request_questions").insert(row).select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  const opts = q.options.filter((o) => o.text.trim());
  if (opts.length) {
    const { error } = await rdb("request_question_options").insert(
      opts.map((o, i) => ({ question_id: id, label: o.label, text: o.text.trim(), is_correct: o.is_correct, sort_order: i + 1 })),
    );
    if (error) throw error;
  }
}
