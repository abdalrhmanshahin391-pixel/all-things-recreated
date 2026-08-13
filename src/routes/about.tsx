import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/components/LanguageProvider";
import bedsideAsset from "@/assets/golden-age-bedside.jpg.asset.json";
import wardAsset from "@/assets/golden-age-ward.jpg.asset.json";

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

const BANDS: {
  src: string;
  alt: Bi;
  caption: Bi;
  eyebrow: Bi;
  title: Bi;
  body: Bi;
  points: Bi[];
  tone: number;
  imageFirst: boolean;
}[] = [
  {
    src: bedsideAsset.url,
    alt: {
      en: "A Golden Age physician examining a patient at his bedside while a student carries his book",
      ar: "طبيب من العصر الذهبي يفحص مريضًا عند سريره بينما يحمل تلميذه كتابه",
    },
    caption: {
      en: "The visit — teaching happened where the patient was.",
      ar: "الزيارة — كان التعليم يجري حيث المريض.",
    },
    eyebrow: { en: "The human element", ar: "الجانب الإنساني" },
    title: {
      en: "A patient is a person, not a case.",
      ar: "المريض إنسان، لا حالة.",
    },
    body: {
      en: "Someone arrives carrying fear, a family, and a life they were in the middle of. Slides describe disease in the abstract; a real case makes you meet the human being who happens to be ill.",
      ar: "يأتيك إنسان يحمل خوفًا وأهلًا وحياةً كان في منتصفها. الشرائح تصف المرض مجردًا، أما الحالة الحقيقية فتجعلك تقابل الإنسان الذي صادف أن يكون مريضًا.",
    },
    points: [
      { en: "Listen before you label.", ar: "أنصت قبل أن تسمّي." },
      { en: "Honesty when you don't know.", ar: "الصدق حين لا تعرف." },
      { en: "Care is part of the treatment.", ar: "الرحمة جزء من العلاج." },
    ],
    tone: 3,
    imageFirst: true,
  },
  {
    src: wardAsset.url,
    alt: {
      en: "A senior physician teaching students at the bedside in a historic hospital ward",
      ar: "طبيب كبير يعلّم طلابه عند الأسرّة في بيمارستان قديم",
    },
    caption: {
      en: "The ward — a hospital that turned no one away.",
      ar: "البيمارستان — مشفى لا يردّ أحدًا.",
    },
    eyebrow: { en: "The ethics we inherited", ar: "الأخلاق التي ورثناها" },
    title: {
      en: "Effort is repayment. The poor are the test.",
      ar: "الجهد سدادُ دَين. والفقير هو الاختبار.",
    },
    body: {
      en: "We don't need ancient remedies back — we need the mindset. How you treat a patient who can give nothing back is the honest measure of whether medicine, in your hands, is a service or a transaction.",
      ar: "لا نحتاج إلى عودة وصفات القدماء، بل إلى عقليتهم. وسلوكك مع مريض لا يملك أن يردّ لك شيئًا هو المقياس الصادق لما إذا كان الطب في يديك خدمةً أم صفقة.",
    },
    points: [
      { en: "Study hard — someone will need it.", ar: "اجتهد — سيحتاج أحدهم ذلك." },
      { en: "Turn no one away.", ar: "لا تردّ أحدًا." },
      { en: "Small unwatched decisions build you.", ar: "القرارات الصغيرة الخفية هي التي تبنيك." },
    ],
    tone: 4,
    imageFirst: false,
  },
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

/** Big picture on one side, the idea written beside it. */
function Band({
  band,
  lang,
}: {
  band: (typeof BANDS)[number];
  lang: string;
}) {
  const media = (
    <figure className="relative">
      <div
        aria-hidden
        className="absolute -inset-3 rounded-[2rem] opacity-60 blur-xl"
        style={{ background: `color-mix(in oklab, ${tone(band.tone)} 30%, transparent)` }}
      />
      <div
        className="relative overflow-hidden rounded-[1.75rem] border-2"
        style={{ borderColor: `color-mix(in oklab, ${tone(band.tone)} 45%, var(--border))` }}
      >
        <img
          src={band.src}
          alt={T(lang, band.alt)}
          loading="lazy"
          className="w-full h-full object-cover aspect-[4/3]"
        />
      </div>
      <figcaption className="relative mt-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {T(lang, band.caption)}
      </figcaption>
    </figure>
  );

  const copy = (
    <div className="rounded-[1.75rem] border-2 p-6 md:p-8" style={toneStyle(band.tone)}>
      <p
        className="text-xs font-black uppercase tracking-[0.18em]"
        style={{ color: tone(band.tone) }}
      >
        {T(lang, band.eyebrow)}
      </p>
      <h3 className="mt-3 font-display text-2xl md:text-3xl font-black leading-tight">
        {T(lang, band.title)}
      </h3>
      <p className="mt-4 leading-relaxed text-muted-foreground">{T(lang, band.body)}</p>
      <ul className="mt-5 space-y-2.5">
        {band.points.map((p) => (
          <li key={p.en} className="flex items-start gap-2.5 text-sm font-bold">
            <span
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm rotate-45"
              style={{ background: tone(band.tone) }}
            />
            <span>{T(lang, p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="grid items-center gap-6 md:gap-10 md:grid-cols-2">
      {band.imageFirst ? (
        <>
          <div className="md:order-2">{media}</div>
          <div className="md:order-1">{copy}</div>
        </>
      ) : (
        <>
          <div className="md:order-1">{media}</div>
          <div className="md:order-2">{copy}</div>
        </>
      )}
    </section>
  );
}

function QuoteCard({ p, lang, i }: { p: (typeof PHYSICIANS)[number]; lang: string; i: number }) {
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
              {T(lang, {
                en: "AquaQBank, by Abdalrhman & Laith Shaheen.",
                ar: "أكوا كيو بانك، من عبدالرحمن وليث شاهين.",
              })}
            </h1>
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
        {BANDS.map((b) => (
          <Band key={b.eyebrow.en} band={b} lang={lang} />
        ))}

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
            <Link
              to="/packages"
              className="inline-block rounded-xl border-2 border-border bg-card px-6 py-3 text-sm font-black"
            >
              {ar ? "الباقات" : "See packages"}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
