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
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--gold-ink)]">
            <span className="h-px w-8 bg-[color:var(--gold)]" />
            {t("cms.home.universities.eyebrow")}
            <span className="h-px w-8 bg-[color:var(--gold)]" />
          </p>
          <h2
            className="font-display font-extrabold tracking-tight text-foreground first-letter:uppercase leading-[1.1]"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            {t("cms.home.universities.title")}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {unis.map((u) => {
            const cardClass =
              "group relative block bg-card rounded-2xl p-6 border border-border shadow-[0_1px_2px_rgba(15,27,61,0.04)] transition-all hover:shadow-[0_24px_48px_-28px_rgba(15,27,61,0.45)]";
            const note = lang === "ar" ? (u.closed_note_ar || u.closed_note_en) : u.closed_note_en;
            const inner = (
              <>
                {u.home_badge && (
                  <span
                    className="absolute top-4 right-4 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={
                      u.home_badge === "COMING_SOON"
                        ? { background: "var(--muted)", color: "var(--muted-foreground)" }
                        : { background: "var(--gold)", color: "var(--gold-foreground)" }
                    }
                  >
                    {BADGE_LABEL[u.home_badge]}
                  </span>
                )}
                <div
                  className="on-dark-panel mb-4 grid h-14 w-14 place-items-center rounded-xl font-display text-lg font-extrabold tracking-wide"
                  style={{ background: "var(--navy)", color: "var(--gold)" }}
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
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: "var(--primary)" }}
                  >
                    {t("cms.home.universities.open")}
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
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
