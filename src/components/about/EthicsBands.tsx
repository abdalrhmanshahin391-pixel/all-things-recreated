import { useLang } from "@/components/LanguageProvider";
import bedsideAsset from "@/assets/golden-age-bedside.jpg.asset.json";
import wardAsset from "@/assets/golden-age-ward.jpg.asset.json";

type Bi = { en: string; ar: string };
const T = (lang: string, v: Bi) => (lang === "ar" ? v.ar : v.en);

export const BANDS: {
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
    title: { en: "A patient is a person, not a case.", ar: "المريض إنسان، لا حالة." },
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

const tone = (n: number) => `var(--chart-${n})`;

function toneStyle(n: number) {
  return {
    background: `linear-gradient(150deg, color-mix(in oklab, ${tone(n)} 14%, var(--card)) 0%, var(--card) 62%)`,
    borderColor: `color-mix(in oklab, ${tone(n)} 38%, var(--border))`,
  } as React.CSSProperties;
}

/** Big picture on one side, the idea written beside it. */
export function Band({ band, lang }: { band: (typeof BANDS)[number]; lang: string }) {
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

/** The two Golden-Age paintings with the ethics written beside them. */
export function EthicsBands({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  return (
    <div className={"space-y-14 md:space-y-20 " + className}>
      {BANDS.map((b) => (
        <Band key={b.eyebrow.en} band={b} lang={lang} />
      ))}
    </div>
  );
}
