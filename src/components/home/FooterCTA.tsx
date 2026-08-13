import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RaziWordmark } from "@/components/brand/RaziWordmark";
import { useAuth } from "@/hooks/useAuth";

export function FooterCTA() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const signedIn = !!user;
  return (
    <section className="py-20 md:py-28" style={{ background: "var(--primary)" }}>
      <div className="mx-auto max-w-3xl px-4 md:px-8 text-center">
        <div className="flex justify-center mb-6">
          <RaziWordmark size={28} color="white" />
        </div>
        <h2
          className="font-display font-black text-white lowercase leading-[1.05]"
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
            <Link to="/my/courses" className="btn-chunky btn-chunky--lg btn-chunky--white">
              {t("cms.home.footer.ctaUser")}
            </Link>
          ) : (
            <Link to="/register" className="btn-chunky btn-chunky--lg btn-chunky--white">
              {t("cms.home.footer.ctaGuest")}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
