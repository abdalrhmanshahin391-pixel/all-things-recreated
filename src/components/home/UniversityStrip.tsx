import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { useHomeUniversities, type HomeUniversity as Uni } from "@/hooks/useHomeUniversities";
import { UniversityTags } from "@/components/common/UniversityTags";
import { ComingSoonOverlay } from "@/components/common/ComingSoonOverlay";
import { useLang } from "@/components/LanguageProvider";

const BADGE_LABEL: Record<NonNullable<Uni["home_badge"]>, string> = {
  NEW: "NEW",
  POPULAR: "POPULAR",
  COMING_SOON: "COMING SOON",
};

/**
 * UniversityStrip — wide, soft-gray section with rounded uni cards.
 * Reads home_visible / home_badge / home_order / home_tagline.
 */
export function UniversityStrip() {
  const { t } = useTranslation();
  const { lang } = useLang();
  const unis = useHomeUniversities();

  if (unis.length === 0) return null;

  return (
    <section className="py-20 md:py-28 bg-muted">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center mb-12">
          <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: "var(--primary)" }}>
            {t("cms.home.universities.eyebrow")}
          </p>
          <h2
            className="font-display font-black text-foreground lowercase leading-[1.05]"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            {t("cms.home.universities.title")}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {unis.map((u) => {
            const cardClass =
              "group relative block bg-card rounded-3xl p-6 border-2 border-border transition-transform";
            const note = lang === "ar" ? (u.closed_note_ar || u.closed_note_en) : u.closed_note_en;
            const inner = (
              <>
                {u.home_badge && (
                  <span
                    className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md text-white"
                    style={{
                      background:
                        u.home_badge === "COMING_SOON" ? "#9ca3af" : "var(--primary)",
                    }}
                  >
                    {BADGE_LABEL[u.home_badge]}
                  </span>
                )}
                <div
                  className="h-14 w-14 rounded-2xl grid place-items-center font-display font-black text-white text-xl mb-4"
                  style={{ background: "var(--primary)" }}
                >
                  {(u.short_name ?? u.name).slice(0, 2).toUpperCase()}
                </div>
                <h3 className="font-display font-black text-lg text-foreground leading-tight">
                  {u.short_name ?? u.name}
                </h3>
                <UniversityTags tags={u.tags} lang={lang} className="mt-2" />
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {u.home_tagline ?? [u.city, u.country].filter(Boolean).join(", ")}
                </p>
                {!u.is_closed && (
                  <span
                    className="mt-4 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider"
                    style={{ color: "var(--secondary)" }}
                  >
                    {t("cms.home.universities.open")} <ArrowRight size={12} />
                  </span>
                )}
              </>
            );

            if (u.is_closed) {
              return (
                <div
                  key={u.id}
                  aria-disabled="true"
                  className={`${cardClass} cursor-not-allowed`}
                  style={{ boxShadow: "0 4px 0 var(--border)" }}
                >
                  {inner}
                  <ComingSoonOverlay note={note} lang={lang} />
                </div>
              );
            }

            return (
            <Link
              key={u.id}
              to="/u/$uniSlug"
              params={{ uniSlug: u.slug }}
              className={`${cardClass} hover:-translate-y-1`}
              style={{ boxShadow: "0 4px 0 var(--border)" }}
            >
              {inner}
            </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
