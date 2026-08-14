import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, GraduationCap, MapPin } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { UniversityImage } from "@/components/common/UniversityImage";
import { MedicalPageBackdrop } from "@/components/common/MedicalPageBackdrop";
import { UniversityTags } from "@/components/common/UniversityTags";
import { ComingSoonOverlay } from "@/components/common/ComingSoonOverlay";
import { useLang } from "@/components/LanguageProvider";

type NextHub = "courses" | "lectures" | "committee";

type University = {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  storage_path: string | null;
  cover_path: string | null;
  is_closed: boolean;
  closed_note_en: string | null;
  closed_note_ar: string | null;
  tags: unknown;
};

const universitiesQuery = queryOptions({
  queryKey: ["public-universities"],
  queryFn: async (): Promise<University[]> => {
    const { data, error } = await supabase
      .from("universities")
      .select("id,name,slug,short_name,description,city,country,logo_url,storage_path,cover_path,is_closed,closed_note_en,closed_note_ar,tags")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as University[];
  },
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
});

export const Route = createFileRoute("/universities")({
  validateSearch: (s: Record<string, unknown>): { next?: NextHub } => {
    const n = s.next;
    return n === "courses" || n === "lectures" || n === "committee" ? { next: n } : {};
  },
  head: () => ({
    meta: [
      { title: "YSMU Study Materials & Question Banks — AquaQBank" },
      { name: "description", content: "Yerevan State Medical University study materials on AquaQBank: YSMU question banks, video lectures and committee notes by year and course. Browse every university on the platform." },
      { property: "og:title", content: "YSMU Study Materials & Question Banks — AquaQBank" },
      { property: "og:description", content: "Yerevan State Medical University study materials on AquaQBank: YSMU question banks, video lectures and committee notes by year and course." },
      { property: "og:url", content: "https://aquaqbank.com/universities" },
    ],

    links: [{ rel: "canonical", href: "https://aquaqbank.com/universities" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Universities — AquaQBank",
          description: "Medical universities available on AquaQBank.",
          url: "https://aquaqbank.com/universities",
        }),
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(universitiesQuery),
  component: UniversitiesPage,
});

function UniversitiesPage() {
  const { t } = useTranslation();
  const { next } = Route.useSearch();
  const { data: list = [], isLoading } = useQuery(universitiesQuery);

  const nextLabel = next === "courses" ? "Courses" : next === "lectures" ? "Lectures" : next === "committee" ? "Committee" : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <MedicalPageBackdrop>
      <main className="pt-20 pb-24">
        <section>
          <div className="mx-auto max-w-7xl px-6 md:px-10 py-14 md:py-20">
            <span className="inline-flex items-center gap-2 rounded-full bg-white border-2 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]"
              style={{ borderColor: "#dcfce7", color: "var(--primary)", boxShadow: "0 3px 0 #dcfce7" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              {nextLabel
                ? t("cms.universitiesPage.badgeNext", { target: nextLabel })
                : t("cms.universitiesPage.badge")}
            </span>
            <h1 className="mt-5 font-display font-black text-foreground lowercase leading-[1.05]" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
              {nextLabel
                ? t("cms.universitiesPage.titleNext", { target: nextLabel.toLowerCase() })
                : t("cms.universitiesPage.title")}
            </h1>
            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl">
              {t("cms.universitiesPage.subtitle")}
            </p>
          </div>
        </section>


        <div className="mx-auto max-w-7xl px-6 md:px-10 mt-10">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-56 rounded-3xl bg-white/70 border-2 border-[#e5e5e5] animate-pulse" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-3xl border-2 border-[#e5e5e5] bg-white/80 backdrop-blur p-10 text-center" style={{ boxShadow: "0 4px 0 #e5e5e5" }}>
              <GraduationCap className="mx-auto h-10 w-10 text-[var(--primary)]" />
              <p className="mt-4 text-sm text-muted-foreground">{t("cms.universitiesPage.empty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {list.map((u) => (
                <UniversityCard key={u.id} u={u} next={next} />
              ))}
            </div>
          )}
        </div>
      </main>
      </MedicalPageBackdrop>
    </div>
  );
}

function UniversityCard({ u, next }: { u: University; next?: NextHub }) {
  const location = [u.city, u.country].filter(Boolean).join(", ");
  const { lang } = useLang();
  const cardClass = "group relative block rounded-3xl border-2 border-[#e5e5e5] bg-white overflow-hidden transition-transform";

  const body = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <UniversityImage
          cover={u.cover_path}
          logo={u.storage_path ?? u.logo_url}
          alt={u.name}
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-black text-lg text-foreground truncate lowercase">{u.name}</h2>
            {location && (
              <p className="mt-0.5 text-xs text-muted-foreground inline-flex items-center gap-1">
                <MapPin size={11} /> {location}
              </p>
            )}
          </div>
          {!u.is_closed && (
            <ArrowRight size={18} className="text-muted-foreground group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
          )}
        </div>
        <UniversityTags tags={u.tags} lang={lang} className="mt-2" />
        {u.description && (
          <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{u.description}</p>
        )}
      </div>
    </>
  );

  if (u.is_closed) {
    return (
      <div
        aria-disabled="true"
        className={`${cardClass} cursor-not-allowed`}
        style={{ boxShadow: "0 4px 0 #e5e5e5" }}
      >
        {body}
        <ComingSoonOverlay note={lang === "ar" ? (u.closed_note_ar || u.closed_note_en) : u.closed_note_en} lang={lang} />
      </div>
    );
  }

  return (
    <Link
      to="/u/$uniSlug"
      params={{ uniSlug: u.slug }}
      search={next ? { next } : undefined}
      className={`${cardClass} hover:-translate-y-1`}
      style={{ boxShadow: "0 4px 0 #e5e5e5" }}
    >
      {body}
    </Link>
  );
}
