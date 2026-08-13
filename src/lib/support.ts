import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupportCategory = { key: string; en: string; ar: string };

export type SupportSettings = {
  page_enabled: boolean;
  form_enabled: boolean;
  channels_enabled: boolean;
  intro_title_en: string;
  intro_title_ar: string;
  intro_text_en: string;
  intro_text_ar: string;
  response_note_en: string;
  response_note_ar: string;
  categories: SupportCategory[];
  notify_enabled: boolean;
  notify_email: string;
};

export type SupportChannel = {
  id: string;
  kind: string;
  icon: string;
  label_en: string;
  label_ar: string;
  value: string;
  href: string;
  visible: boolean;
  sort_order: number;
};

export type SupportRequest = {
  id: string;
  ticket_no: number;
  user_id: string | null;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  admin_notes: string;
  created_at: string;
};

export type AboutBlock = {
  id: string;
  kind: string;
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  image_url: string;
  link_url: string;
  extra: Record<string, any>;
  visible: boolean;
  sort_order: number;
};

export const SUPPORT_DEFAULTS: SupportSettings = {
  page_enabled: true,
  form_enabled: true,
  channels_enabled: true,
  intro_title_en: "Need a hand?",
  intro_title_ar: "تحتاج مساعدة؟",
  intro_text_en: "Tell us what is going on and our team will get back to you.",
  intro_text_ar: "أخبرنا بما يحدث وسيتواصل معك فريقنا.",
  response_note_en: "We usually reply within 24 hours.",
  response_note_ar: "نرد عادة خلال 24 ساعة.",
  categories: [
    { key: "payment", en: "Payment", ar: "الدفع" },
    { key: "access", en: "Course access", ar: "الوصول للدورات" },
    { key: "technical", en: "Technical", ar: "مشكلة تقنية" },
    { key: "other", en: "Other", ar: "أخرى" },
  ],
  notify_enabled: false,
  notify_email: "",
};

export const SUPPORT_STATUSES = ["new", "in_progress", "resolved", "closed"] as const;

export const CHANNEL_ICONS = [
  "telegram",
  "whatsapp",
  "mail",
  "phone",
  "instagram",
  "link",
] as const;

export function pick(lang: string, en: string, ar: string) {
  return (lang === "ar" ? ar : en) || en || ar || "";
}

export async function fetchSupportSettings(): Promise<SupportSettings> {
  const { data } = await (supabase.from as any)("support_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (!data) return SUPPORT_DEFAULTS;
  return {
    ...SUPPORT_DEFAULTS,
    ...data,
    categories: Array.isArray(data.categories) ? data.categories : SUPPORT_DEFAULTS.categories,
  } as SupportSettings;
}

export async function fetchSupportChannels(): Promise<SupportChannel[]> {
  const { data } = await (supabase.from as any)("support_channels")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as SupportChannel[];
}

export async function fetchAboutBlocks(): Promise<AboutBlock[]> {
  const { data } = await (supabase.from as any)("about_blocks")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as AboutBlock[];
}

export function useSupportSettings() {
  const { data } = useQuery({
    queryKey: ["support-settings"],
    queryFn: fetchSupportSettings,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
  return data ?? SUPPORT_DEFAULTS;
}

export function useSupportChannels() {
  const { data } = useQuery({
    queryKey: ["support-channels"],
    queryFn: fetchSupportChannels,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
  return data ?? [];
}

export function useAboutBlocks() {
  const { data, isPending } = useQuery({
    queryKey: ["about-blocks"],
    queryFn: fetchAboutBlocks,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
  return { blocks: data ?? [], loading: isPending && data === undefined };
}

/** Simple per-browser cooldown so the public form can't be spammed. */
const COOLDOWN_MS = 60_000;
const COOLDOWN_KEY = "support-last-send";

export function cooldownLeft(): number {
  if (typeof window === "undefined") return 0;
  const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
  return Math.max(0, COOLDOWN_MS - (Date.now() - last));
}

export function markSent() {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export type SupportDraft = {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  userId: string | null;
};

export function validateDraft(d: SupportDraft): string | null {
  if (!d.name.trim() || d.name.trim().length > 120) return "Please enter your name (max 120 characters).";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) || d.email.length > 200)
    return "Please enter a valid email address.";
  if (!d.subject.trim() || d.subject.trim().length > 200) return "Please add a short subject (max 200 characters).";
  const msg = d.message.trim();
  if (msg.length < 10) return "Please describe the problem in at least 10 characters.";
  if (msg.length > 4000) return "Your message is too long (max 4000 characters).";
  return null;
}

export async function submitSupportRequest(d: SupportDraft): Promise<number | null> {
  const { data, error } = await (supabase.from as any)("support_requests")
    .insert({
      user_id: d.userId,
      name: d.name.trim(),
      email: d.email.trim(),
      category: d.category,
      subject: d.subject.trim(),
      message: d.message.trim(),
    })
    .select("ticket_no")
    .maybeSingle();
  if (error) throw error;
  markSent();
  return (data?.ticket_no as number | undefined) ?? null;
}
