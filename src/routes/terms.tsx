import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { TERMS_EN, TERMS_AR, LEGAL_UPDATED } from "@/lib/legal-content";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — AquaQBank" },
      {
        name: "description",
        content:
          "The terms you agree to when creating an account or buying access to AquaQBank's solved university archive questions.",
      },
      { property: "og:title", content: "Terms of Service — AquaQBank" },
      { property: "og:description", content: "Terms of Service for AquaQBank." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

/** True for lines like "5. PRICES, BILLING AND PAYMENT" (a section heading). */
function isHeading(line: string) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (/^\d+\.\d/.test(t)) return false; // 5.1 … is body text
  return /^\d+[.)]\s/.test(t) || /^[A-Z\u0600-\u06FF][^a-z]*$/.test(t);
}

export function LegalArticle({
  title,
  body,
  intro,
}: {
  title: string;
  body: string | null;
  intro?: string;
}) {
  const lines = (body ?? "").split("\n");
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">{title}</h1>
        {intro && <p className="mt-2 text-sm text-muted-foreground">{intro}</p>}
        <article className="mt-6 rounded-2xl border-2 border-border bg-card p-6 md:p-8 text-[15px] leading-relaxed text-foreground">
          {body?.trim() ? (
            lines.map((line, i) => {
              const t = line.trim();
              if (!t) return <div key={i} className="h-3" />;
              if (isHeading(t)) {
                return (
                  <h2
                    key={i}
                    className="mt-7 first:mt-0 text-sm font-black uppercase tracking-widest text-primary"
                  >
                    {t}
                  </h2>
                );
              }
              if (t.startsWith("- ")) {
                return (
                  <p key={i} className="mt-1.5 flex gap-2 ps-1">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{t.slice(2)}</span>
                  </p>
                );
              }
              return (
                <p key={i} className="mt-2">
                  {t}
                </p>
              );
            })
          ) : (
            <p>This document has not been published yet.</p>
          )}
        </article>
        <p className="mt-4 text-xs text-muted-foreground">Last updated: {LEGAL_UPDATED}</p>
      </main>
      <SiteFooter />
    </div>
  );
}

function TermsPage() {
  const s = useSiteSettings();
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "").startsWith("ar");
  const body = isAr ? s.terms_ar?.trim() || TERMS_AR : s.terms_en?.trim() || TERMS_EN;
  return <LegalArticle title={isAr ? "شروط الاستخدام" : "Terms of Service"} body={body} />;
}
