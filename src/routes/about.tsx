import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/components/LanguageProvider";
import { useAboutBlocks, pick, type AboutBlock } from "@/lib/support";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About AquaQBank Academy — the medical question bank" },
      { name: "description", content: "AquaQBank Academy is an online medical study academy: question banks, video lectures, committee notes and study guides. Learn who runs it and how to reach us." },
      { property: "og:title", content: "About AquaQBank Academy — the medical question bank" },
      { property: "og:description", content: "Who we are: the team behind the AquaQBank Academy question banks, lectures and committee resources for medical students." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aquaqbank.com/about" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://aquaqbank.com/about" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About AquaQBank Academy",
          url: "https://aquaqbank.com/about",
          mainEntity: {
            "@type": "Organization",
            "@id": "https://aquaqbank.com/#organization",
            name: "AquaQBank Academy",
            alternateName: ["AquaQBank", "Aqua Q Bank"],
            url: "https://aquaqbank.com/",
            logo: "https://aquaqbank.com/favicon.png",
            email: "aquaqbank@gmail.com",
          },
        }),
      },
    ],
  }),

  component: AboutPage,
});

function Stats({ block, lang }: { block: AboutBlock; lang: string }) {
  const items = Array.isArray(block.extra?.items) ? block.extra.items : [];
  if (items.length === 0) return null;
  return (
    <section className="rounded-3xl border-2 border-border bg-card p-6 md:p-8">
      {pick(lang, block.title_en, block.title_ar) && (
        <h2 className="text-xl font-black">{pick(lang, block.title_en, block.title_ar)}</h2>
      )}
      <div className="mt-5 grid gap-4 grid-cols-2 md:grid-cols-4">
        {items.map((s: any, i: number) => (
          <div key={i} className="text-center">
            <div className="text-3xl font-black text-primary">{s.value}</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {pick(lang, s.label_en ?? "", s.label_ar ?? "")}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cards({ block, lang }: { block: AboutBlock; lang: string }) {
  const items = Array.isArray(block.extra?.items) ? block.extra.items : [];
  return (
    <section>
      {pick(lang, block.title_en, block.title_ar) && (
        <h2 className="text-2xl font-black">{pick(lang, block.title_en, block.title_ar)}</h2>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {items.map((c: any, i: number) => (
          <div key={i} className="rounded-2xl border-2 border-border bg-card p-5">
            <h3 className="font-black">{pick(lang, c.title_en ?? "", c.title_ar ?? "")}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {pick(lang, c.body_en ?? "", c.body_ar ?? "")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Team({ block, lang }: { block: AboutBlock; lang: string }) {
  const items = Array.isArray(block.extra?.items) ? block.extra.items : [];
  return (
    <section>
      {pick(lang, block.title_en, block.title_ar) && (
        <h2 className="text-2xl font-black">{pick(lang, block.title_en, block.title_ar)}</h2>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m: any, i: number) => (
          <div key={i} className="rounded-2xl border-2 border-border bg-card p-5 text-center">
            {m.image_url ? (
              <img src={m.image_url} alt={m.name ?? "Team member"} loading="lazy" className="mx-auto h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="mx-auto h-20 w-20 rounded-full bg-muted" />
            )}
            <h3 className="mt-3 font-black">{m.name}</h3>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {pick(lang, m.role_en ?? "", m.role_ar ?? "")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{pick(lang, m.bio_en ?? "", m.bio_ar ?? "")}</p>
            {m.link && (
              <a href={m.link} target="_blank" rel="noreferrer noopener" className="mt-3 inline-block text-xs font-bold text-primary">
                Profile
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AboutPage() {
  const { lang } = useLang();
  const { blocks, loading } = useAboutBlocks();
  const visible = blocks.filter((b) => b.visible);
  const hero = visible.find((b) => b.kind === "hero");
  const rest = visible.filter((b) => b.kind !== "hero");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 md:px-8 pt-28 pb-20">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            {hero && (
              <header>
                <h1 className="font-display font-black lowercase leading-[1.05]" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)" }}>
                  {pick(lang, hero.title_en, hero.title_ar)}
                </h1>
                {pick(lang, hero.body_en, hero.body_ar) && (
                  <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{pick(lang, hero.body_en, hero.body_ar)}</p>
                )}
                {hero.image_url && (
                  <img src={hero.image_url} alt="" loading="lazy" className="mt-6 w-full rounded-3xl border-2 border-border object-cover" />
                )}
              </header>
            )}

            <div className="mt-12 space-y-12">
              {rest.map((b) => {
                if (b.kind === "stats") return <Stats key={b.id} block={b} lang={lang} />;
                if (b.kind === "cards") return <Cards key={b.id} block={b} lang={lang} />;
                if (b.kind === "team") return <Team key={b.id} block={b} lang={lang} />;
                if (b.kind === "cta")
                  return (
                    <section key={b.id} className="rounded-3xl border-2 border-border bg-card p-8 text-center" style={{ boxShadow: "0 6px 0 var(--border)" }}>
                      <h2 className="text-2xl font-black">{pick(lang, b.title_en, b.title_ar)}</h2>
                      <p className="mt-2 text-muted-foreground">{pick(lang, b.body_en, b.body_ar)}</p>
                      <Link
                        to={(b.link_url || "/courses") as any}
                        className="mt-5 inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm"
                      >
                        {lang === "ar" ? "ابدأ الآن" : "Get started"}
                      </Link>
                    </section>
                  );
                return (
                  <section key={b.id}>
                    {pick(lang, b.title_en, b.title_ar) && (
                      <h2 className="text-2xl font-black">{pick(lang, b.title_en, b.title_ar)}</h2>
                    )}
                    {b.image_url && (
                      <img src={b.image_url} alt="" loading="lazy" className="mt-4 w-full rounded-2xl border-2 border-border object-cover" />
                    )}
                    <p className="mt-3 whitespace-pre-line text-muted-foreground leading-relaxed">
                      {pick(lang, b.body_en, b.body_ar)}
                    </p>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
