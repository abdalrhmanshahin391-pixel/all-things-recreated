import { supabase } from "@/integrations/supabase/client";

export type StudyHubTile = {
  id: string;
  label: string;
  label_ar: string | null;
  description: string | null;
  description_ar: string | null;
  icon: string;
  href: string;
  external: boolean;
  hidden: boolean;
  sort: number;
};

export async function fetchStudyHubTiles(): Promise<StudyHubTile[]> {
  const { data } = await (supabase.from as any)("study_hub_tiles")
    .select("*")
    .order("sort", { ascending: true });
  return (data ?? []) as StudyHubTile[];
}
