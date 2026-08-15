import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useLang } from "@/components/LanguageProvider";
import { EthicsBands } from "@/components/about/EthicsBands";
import { supabase } from "@/integrations/supabase/client";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { MemberCard } from "@/components/members/MemberCard";
import { MemberForm } from "@/components/members/MemberForm";
import { membersQuery, type Member } from "@/lib/members";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About AquaQBank — built by two brothers in medicine" },
      {
        name: "description",
        content:
          "AquaQBank was built by Abdalrhman Shaheen and Laith Shaheen: practise with questions, meet real cases, and keep the ethics the Golden Age physicians left behind.",
      },
      { property: "og:title", content: "About AquaQBank — built by two brothers in medicine" },
      {
        property: "og:description",
        content:
          "Questions over slides, cases over abstraction, and physicians who studied humans, not only diseases.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aquaqbank.com/about" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://aquaqbank.com/about" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About AquaQBank",
          url: "https://aquaqbank.com/about",
          mainEntity: {
            "@type": "Organization",
            "@id": "https://aquaqbank.com/#organization",
            name: "AquaQBank Academy",
            url: "https://aquaqbank.com/",
            email: "aquaqbank@gmail.com",
            founder: [
              { "@type": "Person", name: "Abdalrhman Shaheen" },
              { "@type": "Person", name: "Laith Shaheen" },
            ],
          },
        }),
      },
    ],
  }),
  component: AboutPage,
});

type Bi = { en: string; ar: string };
const T = (lang: string, v: Bi) => (lang === "ar" ? v.ar : v.en);

/* ---------------------------------------------------------------- data --- */

const CHIPS: { label: Bi; tone: number }[] = [
  { label: { en: "Questions, not slides", ar: "أسئلة، لا شرائح" }, tone: 1 },
  { label: { en: "Real clinical cases", ar: "حالات سريرية حقيقية" }, tone: 2 },
  { label: { en: "Built by students who passed", ar: "من إعداد طلاب نجحوا" }, tone: 3 },
];

const PHYSICIANS: { name: Bi; years: string; theme: Bi; quote: Bi; tone: number }[] = [
  {
    name: { en: "Al-Razi (Rhazes)", ar: "أبو بكر الرازي" },
    years: "854 – 925",
    theme: { en: "Observation, honestly recorded", ar: "الملاحظة المدوَّنة بصدق" },
    quote: {
      en: "“The physician's aim is to do good, even to our enemies.”",
      ar: "«غاية الطبيب فعل الخير، حتى مع أعدائنا.»",
    },
    tone: 1,
  },
  {
    name: { en: "Ibn Sina (Avicenna)", ar: "ابن سينا" },
    years: "980 – 1037",
    theme: { en: "Medicine as reasoning", ar: "الطب بوصفه استدلالًا" },
    quote: {
      en: "“Medicine considers the human body as to the means by which it is cured, and by which it is driven away from health.”",
      ar: "«الطب علم يُتعرف منه أحوال بدن الإنسان من جهة ما يصحّ ويزول عن الصحة.»",
    },
    tone: 2,
  },
  {
    name: { en: "Al-Zahrawi (Abulcasis)", ar: "أبو القاسم الزهراوي" },
    years: "936 – 1013",
    theme: { en: "Craft as a moral duty", ar: "الإتقان واجبٌ أخلاقي" },
    quote: {
      en: "“Whoever devotes himself to surgery must first be versed in anatomy; otherwise he will fall into error that costs lives.”",
      ar: "«من تصدّى للجراحة فليتقن التشريح أولًا، وإلا وقع في خطأ تذهب فيه الأرواح.»",
    },
    tone: 3,
  },
  {
    name: { en: "Ibn al-Nafis", ar: "ابن النفيس" },
    years: "1213 – 1288",
    theme: { en: "The courage to correct authority", ar: "شجاعة تصحيح السلطة" },
    quote: {
      en: "“In determining what we say, we depend on examination and honest study, not on what others have said.”",
      ar: "«اعتمدنا في ما قلناه على المعاينة والنظر الصادق، لا على ما قاله غيرنا.»",
    },
    tone: 4,
  },
  {
    name: { en: "Al-Ruhawi", ar: "إسحاق بن علي الرهاوي" },
    years: "c. 9th century",
    theme: { en: "The character of the physician", ar: "أخلاق الطبيب" },
    quote: {
      en: "“The physician must be a guardian of the body, and of the secret entrusted with it.”",
      ar: "«على الطبيب أن يكون حافظًا للبدن وللسرّ المودَع معه.»",
    },
    tone: 5,
  },
];

/* ------------------------------------------------------------ elements --- */

const tone = (n: number) => `var(--chart-${n})`;

function toneStyle(n: number) {
  return {
    background: `linear-gradient(150deg, color-mix(in oklab, ${tone(n)} 14%, var(--card)) 0%, var(--card) 62%)`,
    borderColor: `color-mix(in oklab, ${tone(n)} 38%, var(--border))`,
  } as React.CSSProperties;
}

function Chip({ label, n }: { label: string; n: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-black"
      style={{
        background: `color-mix(in oklab, ${tone(n)} 14%, var(--card))`,
        borderColor: `color-mix(in oklab, ${tone(n)} 40%, var(--border))`,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: tone(n) }} />
      {label}
    </span>
  );
}

function QuoteCard({ p, lang, i }: { p: (typeof PHYSICIANS)[number]; lang: string; i: number }) {
  return <QuoteCardInner p={p} lang={lang} i={i} />;
}

function Founders({ ar }: { ar: boolean }) {
  const { canManage } = useCommitteeRole();
  const qc = useQueryClient();
  const { data } = useQuery(membersQuery(true));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const list = data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["committee-members"] });

  async function del(m: Member) {
    if (!confirm(`Remove ${m.name_en || m.name_ar}?`)) return;
    const { error } = await (supabase.from as any)("committee_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  if (list.length === 0 && !canManage) return null;

  return (
    <div className="mt-8">
      <div className="mx-auto grid max-w-2xl gap-8 sm:grid-cols-2">
        {list.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            ar={ar}
            centered
            canManage={canManage}
            onEdit={() => setEditing(m)}
            onDelete={() => del(m)}
          />
        ))}
      </div>
      {canManage && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-black hover:bg-muted"
        >
          <Plus size={15} /> Add founder card
        </button>
      )}
      {(adding || editing) && (
        <MemberForm
          member={editing}
          founder
          nextSort={editing ? editing.sort_order : list.length}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function QuoteCardInner({ p, lang, i }: { p: (typeof PHYSICIANS)[number]; lang: string; i: number }) {
  const wide = i === 4;
  return (
    <article
      className={
        "relative overflow-hidden rounded-[1.5rem] border-2 p-6 md:p-7 " +
        (wide ? "sm:col-span-2" : "")
      }
      style={toneStyle(p.tone)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-6 end-3 font-display text-[7rem] leading-none font-black opacity-15 select-none"
        style={{ color: tone(p.tone) }}
      >
        ”
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -start-10 h-28 w-28 rounded-full"
        style={{ background: `color-mix(in oklab, ${tone(p.tone)} 18%, transparent)` }}
      />
      <p className="relative text-xs font-black uppercase tracking-[0.16em]" style={{ color: tone(p.tone) }}>
        {T(lang, p.theme)}
      </p>
      <blockquote className="relative mt-3 text-base md:text-lg font-bold leading-relaxed">
        {T(lang, p.quote)}
      </blockquote>
      <footer className="relative mt-4 flex flex-wrap items-baseline gap-x-3">
        <span className="font-display text-lg font-black">{T(lang, p.name)}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {p.years}
        </span>
      </footer>
    </article>
  );
}

/* ---------------------------------------------------------------- page --- */

function AboutPage() {
  const { lang } = useLang();
  const ar = lang === "ar";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 md:px-8 pt-28 pb-24 space-y-20 md:space-y-28">
        {/* Intro */}
        <header className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 start-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl opacity-40"
            style={{ background: `color-mix(in oklab, ${tone(1)} 35%, transparent)` }}
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {T(lang, { en: "About us", ar: "من نحن" })}
            </p>
            <h1
              className="mt-4 font-display font-black leading-[1.05]"
              style={{ fontSize: "clamp(2.1rem, 6vw, 3.6rem)" }}
            >
              {T(lang, { en: "Made by", ar: "من صنع" })}
            </h1>
            <Founders ar={ar} />
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {T(lang, {
                en: "Two brothers in medicine building the study companion we wished we had: you practise by answering, you get corrected, and the correction sticks. That's the whole method.",
                ar: "أخوان في الطب يبنيان رفيق الدراسة الذي تمنّياه: تتدرّب بالإجابة، فتُصحَّح، ويثبت التصحيح. هذه هي الطريقة كلها.",
              })}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              {CHIPS.map((c) => (
                <Chip key={c.label.en} label={T(lang, c.label)} n={c.tone} />
              ))}
            </div>
          </div>
        </header>

        {/* Images + ethics, alternating */}
        <EthicsBands />

        {/* Physicians */}
        <section>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {T(lang, { en: "Golden Age physicians", ar: "أطباء العصر الذهبي" })}
            </p>
            <h2 className="mt-3 font-display text-2xl md:text-4xl font-black">
              {T(lang, {
                en: "Five voices we still study by.",
                ar: "خمسة أصوات ما زلنا ندرس على هديها.",
              })}
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PHYSICIANS.map((p, i) => (
              <QuoteCard key={p.name.en} p={p} lang={lang} i={i} />
            ))}
          </div>
        </section>

        {/* Statement */}
        <section
          className="relative overflow-hidden rounded-[2rem] border-2 px-6 py-14 md:px-16 md:py-20 text-center"
          style={toneStyle(2)}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -end-16 h-56 w-56 rounded-full"
            style={{ background: `color-mix(in oklab, ${tone(2)} 16%, transparent)` }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -start-10 h-64 w-64 rounded-full"
            style={{ background: `color-mix(in oklab, ${tone(3)} 14%, transparent)` }}
          />
          <p className="relative mx-auto max-w-3xl font-display text-xl md:text-3xl font-black leading-snug">
            {T(lang, {
              en: "“Science without compassion is incomplete. They didn't just study diseases — they studied humans.”",
              ar: "«العلم بلا رحمة ناقص. لم يدرسوا الأمراض فحسب — بل درسوا البشر.»",
            })}
          </p>
        </section>

        {/* CTA */}
        <section className="text-center">
          <h2 className="font-display text-2xl md:text-3xl font-black">
            {T(lang, { en: "Start with a question, not a slide.", ar: "ابدأ بسؤال، لا بشريحة." })}
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/courses"
              className="inline-block rounded-xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground"
            >
              {ar ? "تصفّح الدورات" : "Browse courses"}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
