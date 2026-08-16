import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EventVisibility = "public" | "auth";
export type EventButtonPlacement = "home" | "header" | "both" | "hidden";
export type EventButtonStyle = "hero" | "solid" | "outline" | "gradient";

export type SiteEvent = {
  id: string;
  slug: string;
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
  enabled: boolean;
  visibility: EventVisibility;
  button_placement: EventButtonPlacement;
  button_style: EventButtonStyle;
  accent: string;
  cover_url: string | null;
  sort_order: number;
};

export type EventSection = {
  id: string;
  event_id: string;
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  visible: boolean;
  sort_order: number;
};

export type EventMember = {
  id: string;
  event_id: string;
  name_en: string;
  name_ar: string;
  role_label: string;
  description_en: string;
  description_ar: string;
  photo_url: string;
  photo_fit: string;
  is_head: boolean;
  accent: number;
  sort_order: number;
};

export type EventContact = {
  id: string;
  event_id: string;
  kind: string;
  title_en: string;
  title_ar: string;
  note_en: string;
  note_ar: string;
  link: string;
  button_label: string;
  qr_url: string;
  sort_order: number;
};

export const EVENT_ACCENTS = ["emerald", "sky", "amber", "rose", "violet", "slate"] as const;

/** Tailwind-free accent styles so the buttons still follow the site theme. */
export const accentColor: Record<string, string> = {
  emerald: "#0f9d58",
  sky: "#1cb0f6",
  amber: "#f59e0b",
  rose: "#e11d48",
  violet: "#8b5cf6",
  slate: "#0f172a",
};

const db = (table: string) => (supabase.from as any)(table);

export const eventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: async (): Promise<SiteEvent[]> => {
    const { data, error } = await db("events").select("*").order("sort_order");
    if (error) throw error;
    return (data ?? []) as SiteEvent[];
  },
  staleTime: 5 * 60_000,
});

export const eventBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["event", slug],
    queryFn: async () => {
      const { data: ev, error } = await db("events").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!ev) return null;
      const event = ev as SiteEvent;
      const [sections, members, contacts] = await Promise.all([
        db("event_sections").select("*").eq("event_id", event.id).order("sort_order"),
        db("event_members").select("*").eq("event_id", event.id).order("sort_order"),
        db("event_contacts").select("*").eq("event_id", event.id).order("sort_order"),
      ]);
      return {
        event,
        sections: (sections.data ?? []) as EventSection[],
        members: (members.data ?? []) as EventMember[],
        contacts: (contacts.data ?? []) as EventContact[],
      };
    },
    staleTime: 60_000,
  });

export const eventPartsQuery = (eventId: string) =>
  queryOptions({
    queryKey: ["event-parts", eventId],
    queryFn: async () => {
      const [sections, members, contacts] = await Promise.all([
        db("event_sections").select("*").eq("event_id", eventId).order("sort_order"),
        db("event_members").select("*").eq("event_id", eventId).order("sort_order"),
        db("event_contacts").select("*").eq("event_id", eventId).order("sort_order"),
      ]);
      return {
        sections: (sections.data ?? []) as EventSection[],
        members: (members.data ?? []) as EventMember[],
        contacts: (contacts.data ?? []) as EventContact[],
      };
    },
  });

export function slugify(v: string) {
  const base = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `event-${Math.random().toString(36).slice(2, 7)}`;
}

export const fallbackQr = (link: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(link)}`;

/** Events whose entry button should be shown in a given place. */
export function eventsFor(list: SiteEvent[] | undefined, place: "home" | "header", signedIn: boolean) {
  return (list ?? []).filter(
    (e) =>
      e.enabled &&
      (e.button_placement === place || e.button_placement === "both") &&
      (e.visibility === "public" || signedIn),
  );
}
