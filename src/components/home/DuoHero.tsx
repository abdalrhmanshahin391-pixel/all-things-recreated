import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FloatingMedicalBackdrop } from "./FloatingMedicalBackdrop";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/components/LanguageProvider";
import { useNavItems, canSee, navLabel, targetHref, isExternal } from "@/lib/site-structure";
import { useHomeUniversities } from "@/hooks/useHomeUniversities";

/**
 * DuoHero — clean, single-line bold headline over an animated medical-glyph
 * backdrop. No mascot, no per-word glass pills.
 */
export function DuoHero() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { lang } = useLang();
  const { isAdmin } = useAuth();
  const heroButtons = useNavItems("hero").filter((b) =>
    canSee(b, { signedIn: !!user, isAdmin }),
  );
  const unis = useHomeUniversities();

  return (
    <section className="relative bg-background pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      <FloatingMedicalBackdrop />
      <div className="relative mx-auto max-w-4xl px-4 md:px-8 text-center">
        <h1
          className="font-display font-black text-foreground leading-[1.05] tracking-tight"
          style={{ fontSize: "clamp(2.25rem, 6vw, 4.5rem)" }}
        >
          {t("cms.home.hero.title")}
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {t("cms.home.hero.subtitle")}
        </p>

        {heroButtons.length > 0 && (
          <div
            className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 mx-auto w-full max-w-xs ${
              heroButtons.length > 1 ? "sm:max-w-md" : ""
            }`}
          >
            {heroButtons.map((b) => {
              const cls = `btn-chunky btn-chunky--lg w-full sm:flex-1 ${
                b.style === "secondary" ? "btn-chunky--secondary" : ""
              }`;
              const href = targetHref(b.target_kind, b.target_value);
              if (b.coming_soon) {
                return (
                  <span
                    key={b.id}
                    aria-disabled="true"
                    className={`${cls} opacity-60 cursor-not-allowed select-none`}
                  >
                    {navLabel(b, lang)}
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                      {t("nav.comingSoon")}
                    </span>
                  </span>
                );
              }
              return isExternal(b.target_kind, b.target_value) ? (
                <a key={b.id} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                  {navLabel(b, lang)}
                </a>
              ) : (
                <Link key={b.id} to={href as any} className={cls}>
                  {navLabel(b, lang)}
                </Link>
              );
            })}

          </div>
        )}
      </div>

      {/* University chip strip */}
      {unis.length > 0 && (
        <div className="relative mt-16 md:mt-24 border-t border-b border-border bg-card">
          <div className="mx-auto max-w-7xl overflow-x-auto scrollbar-hide">
            <ul className="flex items-center gap-2 md:gap-3 px-4 md:px-8 py-5 min-w-max">
              {unis.map((u) => (
                <li key={u.id}>
                  <Link
                    to="/u/$uniSlug"
                    params={{ uniSlug: u.slug }}
                    className="group relative inline-flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-muted transition-colors"
                  >
                    <span
                      className="grid place-items-center h-9 w-9 rounded-full font-display font-black text-white text-sm"
                      style={{ background: "var(--primary)" }}
                    >
                      {(u.short_name ?? u.name).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-sm font-bold uppercase tracking-wider text-foreground">
                      {u.short_name ?? u.name}
                    </span>
                    {u.home_badge && (
                      <span
                        className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md text-white"
                        style={{
                          background:
                            u.home_badge === "COMING_SOON"
                              ? "#9ca3af"
                              : "var(--primary)",
                        }}
                      >
                        {u.home_badge === "COMING_SOON" ? "Soon" : u.home_badge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
