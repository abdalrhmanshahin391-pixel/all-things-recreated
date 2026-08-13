import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { GuideMarkdown } from "@/components/guides/GuideMarkdown";
import {
  GUIDE_LANGS,
  GUIDE_LANG_LABEL,
  HUB_COPY,
  guidePath,
  type GuideLang,
  type LocalizedGuide,
} from "@/lib/guides";

function LangSwitcher({ lang, slug }: { lang: GuideLang; slug?: string }) {
  return (
    <nav aria-label="Language" className="flex flex-wrap items-center gap-2">
      {GUIDE_LANGS.map((l) => (
        <Link
          key={l}
          to={guidePath(l, slug)}
          className={
            "rounded-full border px-3 py-1 text-xs font-semibold transition " +
            (l === lang
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground")
          }
          hrefLang={l}
        >
          {GUIDE_LANG_LABEL[l]}
        </Link>
      ))}
    </nav>
  );
}

export function GuidesHub({ lang, guides }: { lang: GuideLang; guides: LocalizedGuide[] }) {
  const copy = HUB_COPY[lang];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-28 md:px-8">
        <LangSwitcher lang={lang} />
        <h1
          className="mt-6 font-display font-black lowercase leading-[1.05]"
          style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)" }}
        >
          {copy.heading}
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{copy.intro}</p>

        {guides.length === 0 ? (
          <p className="mt-12 text-muted-foreground">{copy.empty}</p>
        ) : (
          <ul className="mt-12 grid gap-4">
            {guides.map((g) => (
              <li key={g.id}>
                <Link
                  to={guidePath(lang, g.slug)}
                  className="group block rounded-2xl border-2 border-border bg-card p-5 transition hover:border-primary/60"
                >
                  <div className="flex items-start gap-3">
                    <BookOpen className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold">{g.title}</h2>
                      {g.summary ? (
                        <p className="mt-1 text-sm text-muted-foreground">{g.summary}</p>
                      ) : null}
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                        {copy.read}
                        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export function GuideArticle({
  lang,
  guide,
}: {
  lang: GuideLang;
  guide: LocalizedGuide | null;
}) {
  const copy = HUB_COPY[lang];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 md:px-8">
        {!guide ? (
          <>
            <h1 className="text-2xl font-bold">Not found</h1>
            <p className="mt-3 text-muted-foreground">{copy.empty}</p>
            <Link to={guidePath(lang)} className="mt-6 inline-block font-semibold text-primary">
              {copy.heading}
            </Link>
          </>
        ) : (
          <>
            <LangSwitcher lang={lang} slug={guide.slug} />
            <Link
              to={guidePath(lang)}
              className="mt-6 inline-block text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              ← {copy.heading}
            </Link>
            <h1
              className="mt-4 font-display font-black leading-[1.1]"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
            >
              {guide.title}
            </h1>
            {guide.summary ? (
              <p className="mt-4 text-lg text-muted-foreground">{guide.summary}</p>
            ) : null}
            <article className="mt-10">
              <GuideMarkdown body={guide.body} />
            </article>
            {guide.courseId ? (
              <Link
                to="/courses/$courseId"
                params={{ courseId: guide.courseId }}
                className="mt-12 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
              >
                {copy.read}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
