import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export type Member = {
  id: string;
  name_en: string;
  name_ar: string;
  country_code: string;
  country_label: string;
  year_label: string;
  role_label: string;
  description_en: string;
  description_ar: string;
  photo_url: string;
  photo_fit: string;
  accent: number;
  is_founder: boolean;
  sort_order: number;
};

export const MEMBERS_BUCKET = "member-photos";

export const membersQuery = (founders: boolean) =>
  queryOptions({
    queryKey: ["committee-members", founders ? "founders" : "team"],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await (supabase.from as any)("committee_members")
        .select("*")
        .eq("is_founder", founders)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
    staleTime: 5 * 60_000,
  });

/** Accent colours cycle through the theme chart tokens. */
export const memberTone = (n: number) => `var(--chart-${((n - 1 + 5) % 5) + 1})`;

/** Turn a two-letter country code into its flag emoji. */
export function flagOf(code: string): string {
  const c = (code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🏳️";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export const COUNTRIES: { code: string; en: string; ar: string }[] = [
  { code: "JO", en: "Jordan", ar: "الأردن" },
  { code: "PS", en: "Palestine", ar: "فلسطين" },
  { code: "SY", en: "Syria", ar: "سوريا" },
  { code: "IQ", en: "Iraq", ar: "العراق" },
  { code: "SA", en: "Saudi Arabia", ar: "السعودية" },
  { code: "AE", en: "United Arab Emirates", ar: "الإمارات" },
  { code: "KW", en: "Kuwait", ar: "الكويت" },
  { code: "QA", en: "Qatar", ar: "قطر" },
  { code: "BH", en: "Bahrain", ar: "البحرين" },
  { code: "OM", en: "Oman", ar: "عُمان" },
  { code: "YE", en: "Yemen", ar: "اليمن" },
  { code: "EG", en: "Egypt", ar: "مصر" },
  { code: "SD", en: "Sudan", ar: "السودان" },
  { code: "LY", en: "Libya", ar: "ليبيا" },
  { code: "TN", en: "Tunisia", ar: "تونس" },
  { code: "DZ", en: "Algeria", ar: "الجزائر" },
  { code: "MA", en: "Morocco", ar: "المغرب" },
  { code: "LB", en: "Lebanon", ar: "لبنان" },
  { code: "AM", en: "Armenia", ar: "أرمينيا" },
  { code: "TR", en: "Turkey", ar: "تركيا" },
  { code: "RU", en: "Russia", ar: "روسيا" },
  { code: "UA", en: "Ukraine", ar: "أوكرانيا" },
  { code: "DE", en: "Germany", ar: "ألمانيا" },
  { code: "US", en: "United States", ar: "الولايات المتحدة" },
  { code: "GB", en: "United Kingdom", ar: "المملكة المتحدة" },
];

export function countryName(code: string, fallback: string, ar: boolean): string {
  const hit = COUNTRIES.find((c) => c.code === (code || "").toUpperCase());
  if (hit) return ar ? hit.ar : hit.en;
  return fallback || code;
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();

/** Resolve a stored photo value (https URL or storage path) to a usable URL. */
export async function resolveMemberPhoto(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const now = Date.now();
  const hit = urlCache.get(value);
  if (hit && hit.expiresAt > now) return hit.url;
  const { data } = await supabase.storage.from(MEMBERS_BUCKET).createSignedUrl(value, 3600);
  const url = data?.signedUrl ?? null;
  if (url) urlCache.set(value, { url, expiresAt: now + 50 * 60_000 });
  return url;
}

export function initialsOf(name: string): string {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}