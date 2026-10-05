import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Data for the AQUA version of the committee page.
 *  - Which years / semesters / modules / subjects are open is kept in committee_aqua_state.
 *    A node with no row is closed ("coming soon"), so everything starts closed.
 *  - The summaries themselves are committee resources inside a category whose section is "aqua".
 */

export type AquaNodeType = "year" | "semester" | "module" | "subject";

export const AQUA_MIGRATION = "20261005140000_committee_aqua_version.sql";
export const AQUA_SECTION = "aqua";
export const AQUA_CATEGORY_NAME = "AQUA Summaries";

export const aquaKey = (type: AquaNodeType, id: string) => `${type}:${id}`;

export type AquaState = {
  /** keys (see aquaKey) of every node that is open */
  open: string[];
  /** true when the committee_aqua_state table does not exist yet (the migration is not applied) */
  missingTable: boolean;
};

export function isAquaOpen(state: AquaState | undefined, type: AquaNodeType, id: string | null | undefined): boolean {
  if (!id) return true; // a subject with no module has nothing to check at that level
  return !!state && state.open.includes(aquaKey(type, id));
}

/** The first closed node on the way down to a subject, or null when the whole path is open. */
export function firstClosed(
  state: AquaState | undefined,
  chain: { type: AquaNodeType; id: string | null | undefined }[],
): { type: AquaNodeType; id: string } | null {
  for (const node of chain) {
    if (node.id && !isAquaOpen(state, node.type, node.id)) return { type: node.type, id: node.id };
  }
  return null;
}

function explain(error: { message?: string; code?: string } | null): string {
  const msg = error?.message ?? "Something went wrong.";
  if (error?.code === "PGRST205" || error?.code === "42P01" || msg.includes("committee_aqua_state")) {
    return `The AQUA version needs a database update first. Ask Lovable to apply the migration ${AQUA_MIGRATION}, then try again.`;
  }
  if (msg.includes("committee_categories_section_check")) {
    return `Summaries need a database update first. Ask Lovable to apply the migration ${AQUA_MIGRATION}, then try again.`;
  }
  return msg;
}
export { explain as explainAquaError };

export const aquaStateQuery = queryOptions({
  queryKey: ["committee-aqua-state"],
  queryFn: async (): Promise<AquaState> => {
    const { data, error } = await (supabase.from as any)("committee_aqua_state").select("node_type,node_id,is_open");
    if (error) return { open: [], missingTable: true };
    const open = ((data ?? []) as { node_type: AquaNodeType; node_id: string; is_open: boolean }[])
      .filter((r) => r.is_open)
      .map((r) => aquaKey(r.node_type, r.node_id));
    return { open, missingTable: false };
  },
  staleTime: 20_000,
  refetchOnWindowFocus: true,
});

export async function setAquaOpen(
  nodes: { type: AquaNodeType; id: string; open: boolean }[],
  userId?: string | null,
): Promise<void> {
  if (!nodes.length) return;
  const now = new Date().toISOString();
  const { error } = await (supabase.from as any)("committee_aqua_state").upsert(
    nodes.map((n) => ({ node_type: n.type, node_id: n.id, is_open: n.open, updated_by: userId ?? null, updated_at: now })),
    { onConflict: "node_type,node_id" },
  );
  if (error) throw new Error(explain(error));
}

/** The whole structure in one small query, used for the "open subjects" counts on the home page. */
export const aquaTreeQuery = queryOptions({
  queryKey: ["committee-aqua-tree"],
  queryFn: async () => {
    const [{ data: subjects }, { data: semesters }, { data: modules }] = await Promise.all([
      supabase.from("committee_subjects").select("id, year_id, semester_id, module_id"),
      supabase.from("committee_semesters").select("id, year_id"),
      supabase.from("committee_modules").select("id, semester_id"),
    ]);
    return {
      subjects: (subjects ?? []) as { id: string; year_id: string; semester_id: string | null; module_id: string | null }[],
      semesters: (semesters ?? []) as { id: string; year_id: string }[],
      modules: (modules ?? []) as { id: string; semester_id: string }[],
    };
  },
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
});

/** How many AQUA summaries each subject has. */
export const aquaCountsQuery = queryOptions({
  queryKey: ["committee-aqua-counts"],
  queryFn: async (): Promise<Record<string, number>> => {
    const { data: cats } = await supabase.from("committee_categories").select("id, subject_id").eq("section", AQUA_SECTION);
    const byCat = new Map<string, string>(((cats ?? []) as { id: string; subject_id: string }[]).map((c) => [c.id, c.subject_id]));
    if (!byCat.size) return {};
    const { data: res } = await supabase.from("committee_resources").select("category_id").in("category_id", [...byCat.keys()]);
    const out: Record<string, number> = {};
    for (const r of (res ?? []) as { category_id: string }[]) {
      const subject = byCat.get(r.category_id);
      if (subject) out[subject] = (out[subject] ?? 0) + 1;
    }
    return out;
  },
  staleTime: 60_000,
  refetchOnWindowFocus: false,
});

export type AquaResource = {
  id: string;
  category_id: string;
  title: string;
  kind: "pdf" | "link" | "video" | "folder";
  file_path: string | null;
  url: string | null;
  description: string | null;
  sort_order: number;
  drive_file_id?: string | null;
  drive_web_link?: string | null;
  drive_download_link?: string | null;
  file_size?: number | null;
  allow_preview?: boolean | null;
};

/** One subject's AQUA summaries. */
export function aquaSubjectQuery(subjectId: string) {
  return queryOptions({
    queryKey: ["committee-aqua-subject", subjectId],
    queryFn: async () => {
      const { data: cats } = await supabase
        .from("committee_categories")
        .select("id, subject_id, name, sort_order")
        .eq("subject_id", subjectId)
        .eq("section", AQUA_SECTION)
        .order("sort_order");
      const categories = (cats ?? []) as { id: string; subject_id: string; name: string; sort_order: number }[];
      const ids = categories.map((c) => c.id);
      const { data: res } = ids.length
        ? await supabase.from("committee_resources").select("*").in("category_id", ids).order("sort_order")
        : { data: [] as AquaResource[] };
      return {
        categories,
        resources: ((res ?? []) as unknown as AquaResource[]).filter((r) => r.kind !== "folder"),
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** The subject's single AQUA category, created the first time a summary is added. */
export async function ensureAquaCategory(subjectId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("committee_categories")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("section", AQUA_SECTION)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await (supabase.from("committee_categories") as any)
    .insert({ subject_id: subjectId, name: AQUA_CATEGORY_NAME, section: AQUA_SECTION, sort_order: 0 })
    .select("id")
    .single();
  if (error) throw new Error(explain(error));
  return data.id as string;
}

export type AquaSubjectInfo = {
  id: string;
  year_id: string;
  semester_id: string | null;
  module_id: string | null;
  name: string;
  icon_key: string;
  tag_label: string | null;
  tag_color: string | null;
};

/** Just the subject row (the university page's query would also load all its university files). */
export function aquaSubjectInfoQuery(subjectId: string) {
  return queryOptions({
    queryKey: ["committee-aqua-subject-info", subjectId],
    queryFn: async (): Promise<AquaSubjectInfo | null> => {
      const { data } = await supabase
        .from("committee_subjects")
        .select("id, year_id, semester_id, module_id, name, icon_key, tag_label, tag_color")
        .eq("id", subjectId)
        .maybeSingle();
      return (data ?? null) as AquaSubjectInfo | null;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}