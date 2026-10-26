import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RaziWordmark } from "@/components/brand/RaziWordmark";
import { useAuth } from "@/hooks/useAuth";

export function FooterCTA() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const signedIn = !!user;

  const userCtaText = (() => {
    const text = t("cms.home.footer.ctaUser");
    if (
      text === "Go to My Courses" ||
      text === "إلى دوراتي" ||
      text === "Explore available university" ||
      !text
    ) {
      return (i18n.language || "").startsWith("ar")
        ? "استكشف الجامعات المتاحة"
        : "Explore available universities";
    }
    return text;
  })();

  return (
    <section
      className="on-dark-panel relative overflow-hidden py-20 md:py-28"
      style={{ background: "linear-gradient(160deg, var(--navy-deep) 0%, var(--navy) 100%)" }}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)] to-transparent" />
      <div className="relative mx-auto max-w-3xl px-4 md:px-8 text-center">
        <div className="flex justify-center mb-6">
          <RaziWordmark size={28} color="white" />
        </div>
        <h2
          className="font-display font-extrabold tracking-tight text-white first-letter:uppercase leading-[1.1]"
          style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}
        >
          {signedIn ? t("cms.home.footer.titleUser") : t("cms.home.footer.titleGuest")}
        </h2>
        {!signedIn && (
          <p className="mt-4 text-white/85 text-base md:text-lg">
            {t("cms.home.footer.body")}
          </p>
        )}
        <div className="mt-8">
          {signedIn ? (
            <Link to="/universities" className="btn-chunky btn-chunky--lg btn-chunky--gold">
              {userCtaText}
            </Link>
          ) : (
            <Link to="/register" className="btn-chunky btn-chunky--lg btn-chunky--gold">
              {t("cms.home.footer.ctaGuest")}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
