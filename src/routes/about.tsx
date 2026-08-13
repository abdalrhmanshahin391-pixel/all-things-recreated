import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/components/LanguageProvider";
import bedsideAsset from "@/assets/golden-age-bedside.jpg.asset.json";
import wardAsset from "@/assets/golden-age-ward.jpg.asset.json";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About AquaQBank — why we build doctors who think" },
      {
        name: "description",
        content:
          "AquaQBank was built by Abdalrhman Shaheen and Laith Shaheen around one idea: medicine is learned by deciding, not by memorising slides — and by the ethics the Golden Age physicians left us.",
      },
      { property: "og:title", content: "About AquaQBank — why we build doctors who think" },
      {
        property: "og:description",
        content:
          "Questions over slides, cases over abstraction, and the ethics of physicians who studied humans, not only diseases.",
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

const PHYSICIANS: {
  name: Bi;
  years: string;
  theme: Bi;
  body: Bi;
  quote: Bi;
}[] = [
  {
    name: { en: "Al-Razi (Rhazes)", ar: "أبو بكر الرازي" },
    years: "854 – 925",
    theme: { en: "Observation, honestly recorded", ar: "الملاحظة المدوَّنة بصدق" },
    body: {
      en: "Al-Razi kept case notes the way an honest scientist keeps a ledger: what he expected, what actually happened, and where he was wrong. His separation of smallpox from measles was not a flash of genius but the reward of watching patients closely for years. He treated the poor without fee and wrote that a physician who cannot bear the sight of suffering has chosen the wrong life.",
      ar: "كان الرازي يدوّن حالاته كما يدوّن العالِم الأمين دفتره: ما توقّعه، وما حدث فعلًا، وأين أخطأ. تمييزه بين الجدري والحصبة لم يكن ومضة عبقرية بل ثمرة سنوات من مراقبة المرضى عن قرب. عالج الفقراء بلا أجر، وكتب أن الطبيب الذي لا يحتمل رؤية الألم قد اختار حياة ليست له.",
    },
    quote: {
      en: "“The physician's aim is to do good, even to our enemies.”",
      ar: "«غاية الطبيب فعل الخير، حتى مع أعدائنا.»",
    },
  },
  {
    name: { en: "Ibn Sina (Avicenna)", ar: "ابن سينا" },
    years: "980 – 1037",
    theme: { en: "Medicine as reasoning", ar: "الطب بوصفه استدلالًا" },
    body: {
      en: "Ibn Sina's Canon dominated teaching for six centuries not because it listed more facts, but because it organised them into reasoning a student could carry into a room with a patient. He insisted that a cause must be sought before a cure is named — the medieval ancestor of the differential diagnosis every question you solve here is training.",
      ar: "لم يسُد «القانون» في التدريس ستة قرون لأنه جمع حقائق أكثر، بل لأنه رتّبها في استدلال يستطيع الطالب حمله إلى غرفة المريض. أصرّ على طلب السبب قبل تسمية الدواء — وهو الجدّ الأول للتشخيص التفريقي الذي يدرّبك عليه كل سؤال هنا.",
    },
    quote: {
      en: "“Medicine considers the human body as to the means by which it is cured and by which it is driven away from health.”",
      ar: "«الطب علم يُتعرف منه أحوال بدن الإنسان من جهة ما يصحّ ويزول عن الصحة.»",
    },
  },
  {
    name: { en: "Al-Zahrawi (Abulcasis)", ar: "أبو القاسم الزهراوي" },
    years: "936 – 1013",
    theme: { en: "Craft as a moral duty", ar: "الإتقان واجبٌ أخلاقي" },
    body: {
      en: "Al-Zahrawi drew every instrument he designed, because he believed a surgeon owes the patient precision, not improvisation. His thirty-volume Al-Tasrif taught that a careless hand is not a technical failure but an ethical one. Skill, to him, was the form respect takes when it reaches the body of another person.",
      ar: "رسم الزهراوي كل أداة صنعها، لأنه آمن بأن الجرّاح مدين للمريض بالدقة لا بالارتجال. علّم في «التصريف» أن اليد المهملة ليست خطأً تقنيًا بل خطأ أخلاقي. المهارة عنده هي الصورة التي يتخذها الاحترام حين يلمس جسد إنسان آخر.",
    },
    quote: {
      en: "“Whoever devotes himself to surgery must first be versed in anatomy; otherwise he will fall into error that costs lives.”",
      ar: "«من تصدّى للجراحة فليتقن التشريح أولًا، وإلا وقع في خطأ تذهب فيه الأرواح.»",
    },
  },
  {
    name: { en: "Ibn al-Nafis", ar: "ابن النفيس" },
    years: "1213 – 1288",
    theme: { en: "The courage to correct authority", ar: "شجاعة تصحيح السلطة" },
    body: {
      en: "Three centuries before Europe, Ibn al-Nafis described the pulmonary circulation and, in doing so, contradicted Galen — the most respected name in medicine. He did it politely, in writing, with reasons. That is the lesson: authority is a starting point for thought, never a substitute for it.",
      ar: "قبل أوروبا بثلاثة قرون وصف ابن النفيس الدورة الرئوية، فخالف جالينوس، أرفع اسم في الطب حينها. فعل ذلك بأدب، كتابةً، وبالحجّة. وهذا هو الدرس: السلطة نقطة انطلاق للتفكير، لا بديل عنه.",
    },
    quote: {
      en: "“In determining what we say, we depend on examination and honest study, not on what others have said.”",
      ar: "«اعتمدنا في ما قلناه على المعاينة والنظر الصادق، لا على ما قاله غيرنا.»",
    },
  },
  {
    name: { en: "Al-Ruhawi", ar: "إسحاق بن علي الرهاوي" },
    years: "c. 9th century",
    theme: { en: "The character of the physician", ar: "أخلاق الطبيب" },
    body: {
      en: "Al-Ruhawi wrote the first book we know of devoted entirely to medical ethics — Adab al-Tabib, \"The Conduct of the Physician\". He argued that a doctor's private character is a clinical variable: patients hand over their fear along with their symptoms, and a person who cannot be trusted with the first has no business handling the second.",
      ar: "كتب الرهاوي أول مؤلَّف نعرفه مكرَّسًا بالكامل لأخلاق المهنة: «أدب الطبيب». رأى أن أخلاق الطبيب في سرّه متغيّرٌ سريري: المريض يسلّمك خوفه مع أعراضه، ومن لا يُؤتمن على الأول لا شأن له بالثاني.",
    },
    quote: {
      en: "“The physician must be a guardian of the body and of the secret entrusted with it.”",
      ar: "«على الطبيب أن يكون حافظًا للبدن وللسرّ المودَع معه.»",
    },
  },
];

function Pull({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-8 border-s-4 border-primary ps-5 text-lg md:text-xl font-semibold leading-relaxed text-foreground">
      {children}
    </p>
  );
}

function Plate({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="my-12">
      <div className="overflow-hidden rounded-3xl border-2 border-border bg-muted">
        <img src={src} alt={alt} loading="lazy" className="w-full object-cover" />
      </div>
      <figcaption className="mt-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function AboutPage() {
  const { lang } = useLang();
  const ar = lang === "ar";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 md:px-8 pt-28 pb-24">
        {/* Hero */}
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            {T(lang, { en: "About us", ar: "من نحن" })}
          </p>
          <h1
            className="mt-3 font-display font-black leading-[1.05]"
            style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)" }}
          >
            {T(lang, {
              en: "We built a place for doctors who think.",
              ar: "بنينا مكانًا للأطباء الذين يفكّرون.",
            })}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            {T(lang, {
              en: "AquaQBank was created by two brothers in medicine, Abdalrhman Shaheen and Laith Shaheen, out of a simple frustration: the way we were told to study did not resemble the way we would one day have to practise.",
              ar: "أُنشئت أكوا كيو بانك على يد اثنين في الطب، عبدالرحمن شاهين وليث شاهين، من إحباط بسيط: الطريقة التي طُلب منّا أن ندرس بها لا تشبه الطريقة التي سنمارس بها الطب يومًا ما.",
            })}
          </p>
        </header>

        {/* Philosophy */}
        <section className="mt-16">
          <h2 className="text-2xl md:text-3xl font-black">
            {T(lang, { en: "Why it exists", ar: "لماذا وُجد هذا المكان" })}
          </h2>
          <div className="mt-5 space-y-5 text-base md:text-lg leading-relaxed text-muted-foreground">
            <p>
              {T(lang, {
                en: "A slide asks nothing of you. You read it, you recognise it, and recognition feels like knowing. But recognition is the weakest form of memory there is — it survives an exam hall and collapses at a bedside, at three in the morning, when nobody has underlined the important line for you.",
                ar: "الشريحة لا تطلب منك شيئًا. تقرؤها فتتعرّف عليها، ويبدو التعرّف وكأنه معرفة. لكن التعرّف أضعف صور الذاكرة: ينجو في قاعة الامتحان وينهار عند سرير المريض، في الثالثة فجرًا، حين لا يكون أحد قد وضع خطًا تحت السطر المهم.",
              })}
            </p>
            <Pull>
              {T(lang, {
                en: "A question is different. A question forces a decision — and a decision is the only thing a doctor is ever actually asked for.",
                ar: "السؤال مختلف. السؤال يفرض قرارًا — والقرار هو الشيء الوحيد الذي يُطلب من الطبيب فعلًا.",
              })}
            </Pull>
            <p>
              {T(lang, {
                en: "Every question you answer here is a small rehearsal of that moment. You commit, you are corrected, and the correction lands with a weight that reading never produces. This is why we built question banks and clinical cases first, and everything else second: not because slides are worthless, but because they describe disease in the abstract, while a case makes you meet a person who happens to be ill.",
                ar: "كل سؤال تجيب عنه هنا بروفة صغيرة لتلك اللحظة. تلتزم بجواب، فتُصحَّح، ويهبط التصحيح بثقلٍ لا تصنعه القراءة أبدًا. لهذا بدأنا ببنوك الأسئلة والحالات السريرية، وجعلنا ما عداها ثانيًا: لا لأن الشرائح بلا قيمة، بل لأنها تصف المرض مجردًا، بينما الحالة تجعلك تقابل إنسانًا صادف أن يكون مريضًا.",
              })}
            </p>
            <p>
              {T(lang, {
                en: "Studying smart is not a shortcut. It is an act of respect toward the patient who will inherit whatever you did or did not understand tonight.",
                ar: "الدراسة الذكية ليست اختصارًا. إنها فعل احترام تجاه المريض الذي سيرث ما فهمته — أو ما لم تفهمه — هذه الليلة.",
              })}
            </p>
          </div>
        </section>

        {/* Golden Age */}
        <section className="mt-20">
          <h2 className="text-2xl md:text-3xl font-black">
            {T(lang, {
              en: "The physicians we learned this from",
              ar: "الأطبّاء الذين تعلّمنا هذا منهم",
            })}
          </h2>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-muted-foreground">
            {T(lang, {
              en: "Long before evidence-based medicine had a name, a generation of physicians in Baghdad, Cordoba, Cairo and Damascus were already doing the thing we now call clinical reasoning: watching, recording, doubting, revising. Their remedies are gone. Their method, and their manners, are not.",
              ar: "قبل أن يصير للطب المبني على البراهين اسم بزمنٍ طويل، كان جيل من الأطباء في بغداد وقرطبة والقاهرة ودمشق يمارسون ما نسمّيه اليوم الاستدلال السريري: يراقبون، ويدوّنون، ويشكّون، ويراجعون. وصفاتهم انقضت. أما منهجهم وأخلاقهم فلا.",
            })}
          </p>

          <Plate
            src={bedsideAsset.url}
            alt="A Golden Age physician examining a patient at his bedside while a student carries his book"
            caption={T(lang, {
              en: "The visit: teaching happened where the patient was, never away from them.",
              ar: "الزيارة: كان التعليم يجري حيث المريض، لا بعيدًا عنه.",
            })}
          />

          <div className="mt-4 space-y-12">
            {PHYSICIANS.map((p, i) => (
              <article
                key={p.name.en}
                className="rounded-3xl border-2 border-border bg-card p-6 md:p-8"
                style={{ boxShadow: "0 6px 0 var(--border)" }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs font-black text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-xl md:text-2xl font-black">{T(lang, p.name)}</h3>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {p.years}
                  </span>
                </div>
                <p className="mt-1 text-sm font-bold text-primary">{T(lang, p.theme)}</p>
                <p className="mt-4 leading-relaxed text-muted-foreground">{T(lang, p.body)}</p>
                <blockquote className="mt-5 border-s-4 border-primary/40 ps-4 italic leading-relaxed">
                  {T(lang, p.quote)}
                  <footer className="mt-1 not-italic text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {T(lang, p.name)}
                  </footer>
                </blockquote>
              </article>
            ))}
          </div>
        </section>

        {/* Ethics */}
        <section className="mt-20">
          <h2 className="text-2xl md:text-3xl font-black">
            {T(lang, { en: "The inheritance that still matters", ar: "الميراث الذي ما زال مهمًّا" })}
          </h2>
          <div className="mt-5 space-y-5 text-base md:text-lg leading-relaxed text-muted-foreground">
            <p>
              {T(lang, {
                en: "To make better doctors today we do not need to return to ancient remedies. We need to return to the mindset and the ethics those pioneers championed — because that part of their work never expired.",
                ar: "لكي نصنع أطباء أفضل اليوم لا نحتاج إلى العودة إلى وصفات القدماء، بل إلى العقلية والأخلاق التي دافع عنها أولئك الروّاد — فذلك الجزء من عملهم لم تنتهِ صلاحيته.",
              })}
            </p>
            <p>
              <strong className="text-foreground">
                {T(lang, { en: "Work hard, because it is owed. ", ar: "اجتهد، لأن هذا دَين عليك. " })}
              </strong>
              {T(lang, {
                en: "Effort in medicine is not ambition; it is repayment. Someone will one day sit in front of you with a problem they cannot solve, and the only thing standing between them and harm is the hour you either gave or refused to give to your books.",
                ar: "الجهد في الطب ليس طموحًا، بل سدادُ دَين. سيجلس أمامك يومًا إنسان بمشكلة لا يستطيع حلّها، ولن يفصل بينه وبين الأذى سوى الساعة التي منحتها — أو رفضت أن تمنحها — لكتبك.",
              })}
            </p>
            <p>
              <strong className="text-foreground">
                {T(lang, { en: "Treat the poor, because it is the test. ", ar: "عالِج الفقير، فهو الاختبار. " })}
              </strong>
              {T(lang, {
                en: "How a physician behaves toward a patient who can give nothing back is the honest measure of whether medicine, in their hands, is a service or a transaction. Al-Razi and his contemporaries answered that question in public hospitals that turned no one away, and they answered it long before anyone was watching.",
                ar: "سلوك الطبيب مع مريضٍ لا يملك أن يردّ له شيئًا هو المقياس الصادق لما إذا كان الطب في يديه خدمةً أم صفقة. أجاب الرازي ومعاصروه عن هذا السؤال في بيمارستانات لم تردّ أحدًا، وأجابوا عنه قبل أن يراقبهم أحد.",
              })}
            </p>
            <p>
              <strong className="text-foreground">
                {T(lang, { en: "Take the weight seriously. ", ar: "خُذ الأمر بجدّيته. " })}
              </strong>
              {T(lang, {
                en: "Our subject matter is not tissue. A person arrives carrying fear, a family, a life they were in the middle of. Whatever gives you your sense of accountability — your conscience, your faith, the promise you made when you chose this — hold on to it, because competence without that weight drifts, and drifting in this profession costs someone else.",
                ar: "موضوعنا ليس نسيجًا. يأتيك إنسان يحمل خوفًا وأهلًا وحياةً كان في منتصفها. أيًّا كان ما يمنحك شعورك بالمسؤولية — ضميرك، أو إيمانك، أو العهد الذي قطعته حين اخترت هذا الطريق — فتمسّك به، لأن الكفاءة بلا هذا الثقل تنجرف، والانجراف في هذه المهنة يدفع ثمنه غيرك.",
              })}
            </p>
            <p>
              {T(lang, {
                en: "Ethics is not a lecture you attend once in first year. It is a habit built the same way clinical skill is built: in small, unwatched decisions — the extra question you ask, the result you chase, the answer you admit you do not know.",
                ar: "الأخلاق ليست محاضرة تحضرها مرة في السنة الأولى. إنها عادة تُبنى كما تُبنى المهارة السريرية: في قرارات صغيرة لا يراها أحد — سؤال إضافي تسأله، نتيجة تلاحقها، وجواب تعترف أنك لا تعرفه.",
              })}
            </p>
          </div>

          <Plate
            src={wardAsset.url}
            alt="A senior physician teaching students at the bedside in a historic hospital ward"
            caption={T(lang, {
              en: "The ward: a hospital that turned no one away, and a teacher who never left the room.",
              ar: "البيمارستان: مشفى لا يردّ أحدًا، ومعلّم لا يغادر الغرفة.",
            })}
          />

          <p className="mt-6 rounded-3xl border-2 border-border bg-card p-6 md:p-8 text-lg md:text-xl font-bold leading-relaxed">
            {T(lang, {
              en: "“They taught us that science without compassion is incomplete. They didn't just study diseases; they studied humans.”",
              ar: "«علّمونا أن العلم بلا رحمة ناقص. لم يدرسوا الأمراض فحسب، بل درسوا البشر.»",
            })}
          </p>
        </section>

        {/* CTA */}
        <section
          className="mt-16 rounded-3xl border-2 border-border bg-card p-8 text-center"
          style={{ boxShadow: "0 6px 0 var(--border)" }}
        >
          <h2 className="text-2xl font-black">
            {T(lang, { en: "Start with a question, not a slide.", ar: "ابدأ بسؤال، لا بشريحة." })}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {T(lang, {
              en: "Built by Abdalrhman Shaheen and Laith Shaheen for students who want to practise thinking.",
              ar: "من إعداد عبدالرحمن شاهين وليث شاهين، لطلبة يريدون التدرّب على التفكير.",
            })}
          </p>
          <Link
            to="/courses"
            className="mt-5 inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm"
          >
            {ar ? "ابدأ الآن" : "Get started"}
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
