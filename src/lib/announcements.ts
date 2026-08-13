import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AnnouncementStyle =
  | "ribbon"
  | "floating"
  | "spotlight"
  | "modal"
  | "marquee"
  | "toast"
  | "strip"
  | "inline";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  href_label: string | null;
  style: AnnouncementStyle;
  accent: string;
  urgent: boolean;
  active: boolean;
  pinned: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort: number;
};

export const ANNOUNCEMENT_STYLES: { id: AnnouncementStyle; name: string; note: string }[] = [
  { id: "ribbon", name: "Top ribbon", note: "Thin coloured bar above the header" },
  { id: "strip", name: "Bold strip", note: "Taller full-width strip with a big badge" },
  { id: "marquee", name: "Marquee", note: "Slow scrolling ticker strip" },
  { id: "floating", name: "Floating card", note: "Small card that slides in bottom-right" },
  { id: "toast", name: "Corner toast", note: "Compact toast in the top-right corner" },
  { id: "spotlight", name: "Spotlight", note: "Wide gradient banner on the home page" },
  { id: "inline", name: "Inline card", note: "Card inside the home page content" },
  { id: "modal", name: "Modal popup", note: "Centred popup over the page" },
];


export const ACCENTS = ["#e11d48", "#58cc02", "#1cb0f6", "#f59e0b", "#8b5cf6", "#0f172a"];

export function isLive(a: Announcement, now = Date.now()) {
  if (!a.active) return false;
  if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
  if (a.ends_at && new Date(a.ends_at).getTime() < now) return false;
  return true;
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["site-announcements"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("my_announcements");
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}

/** Admin view: every announcement, regardless of audience. */
export function useAllAnnouncements() {
  return useQuery({
    queryKey: ["site-announcements-all"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("site_announcements")
        .select("*")
        .order("sort", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}

const KEY = "ysmu-dismissed-announcements";

export function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function dismiss(id: string) {
  try {
    const next = Array.from(new Set([...readDismissed(), id]));
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}