import { Link } from "@tanstack/react-router";
import { useLang } from "@/components/LanguageProvider";

/**
 * Public FAQ block. Its questions are the ones students actually type into
 * Google ("what is AquaQBank", "what is the AquaQBank platform", "how much
 * does it cost"), and the same list is emitted as FAQPage structured data
 * from the home route's head() so Google can surface the answers directly.
 */
export const HOME_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What is AquaQBank Academy?",
    a: "AquaQBank Academy is an online medical study academy for medical students. It gathers question banks, past exam-style questions, video lectures, committee notes and study guides in one place, organized by university, academic year and course. It is also written as AquaQBank, Aqua Q Bank or the AquaQBank Platform — all of them refer to the same academy at aquaqbank.com.",
  },
  {
    q: "Who is AquaQBank Academy for?",
    a: "Medical students who want to practise real exam-style questions and revise from organized course material. Every course in the AquaQBank Academy is built around what students are actually examined on, year by year and semester by semester.",
  },
  {
    q: "What is AquaQBank?",
    a: "AquaQBank is the short name of AquaQBank Academy — an online study academy for medical students that brings question banks, past exam-style questions, video lectures and committee notes together in one place, organized by academic year and course.",
  },
  {
    q: "Is AquaQBank a bank?",
    a: "No. AquaQBank Academy is not a bank or a financial service. The name comes from 'question bank': it is a medical education academy where students practise exam questions and study from organized course material.",
  },

  {
    q: "Which universities does AquaQBank support?",
    a: "AquaQBank Academy is built to host any medical school. Each university in the academy gets its own space with its own years, courses, subjects and materials, and new universities are added over time.",
  },
  {
    q: "What subjects and courses are covered?",
    a: "Core preclinical and clinical subjects such as anatomy, biochemistry, physiology, histology, microbiology, pathology and pharmacology, each with its own question bank, lectures and notes.",
  },
  {
    q: "How much does AquaQBank cost?",
    a: "Access is sold per course, and per academic year or per semester depending on the course. Current prices are shown on each course page and on the packages page, where bundles cost less than buying courses separately.",
  },
  {
    q: "Do I need an account to use it?",
    a: "You can browse universities, courses and the free study guides without an account. You need a free account to start studying, and a purchase to unlock a paid course.",
  },
];

const FAQ_AR: Array<{ q: string; a: string }> = [
  {
    q: "ما هي أكاديمية AquaQBank؟",
    a: "أكاديمية AquaQBank هي منصة دراسة لطلاب الطب تجمع بنوك الأسئلة والمحاضرات المرئية وملاحظات اللجنة في مكان واحد، مرتّبة حسب السنة الدراسية والمادة.",
  },
  {
    q: "هل AquaQBank بنك مالي؟",
    a: "لا. الاسم مشتق من «بنك الأسئلة»؛ المنصة تعليمية طبية بالكامل وليست خدمة مصرفية.",
  },
  {
    q: "ما الجامعات المدعومة؟",
    a: "المنصة مصمّمة لاستضافة أي كلية طب، ولكل جامعة مساحتها الخاصة بسنواتها وموادها، وتتم إضافة جامعات جديدة تباعاً.",
  },
  {
    q: "ما المواد والدورات المتاحة؟",
    a: "المواد الأساسية والسريرية مثل التشريح والكيمياء الحيوية وعلم وظائف الأعضاء والأنسجة والأحياء الدقيقة وعلم الأمراض وعلم الأدوية.",
  },
  {
    q: "كم تكلفة AquaQBank؟",
    a: "يتم بيع الوصول لكل دورة، لسنة دراسية أو فصل دراسي حسب الدورة. الأسعار الحالية معروضة في صفحة كل دورة وفي صفحة الباقات.",
  },
  {
    q: "هل أحتاج إلى حساب؟",
    a: "يمكنك تصفح الجامعات والدورات والأدلة المجانية بدون حساب. تحتاج حساباً مجانياً لبدء الدراسة، وشراءً لفتح الدورات المدفوعة.",
  },
];


export function HomeFaq() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const items = ar ? FAQ_AR : HOME_FAQ;

  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <h2
          className="font-display font-black text-foreground leading-tight text-center"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}
        >
          {ar ? "الأسئلة الشائعة" : "Frequently asked questions"}
        </h2>

        <dl className="mt-10 space-y-4">
          {items.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border-2 border-border bg-card p-5 md:p-6"
            >
              <dt className="font-display text-base md:text-lg font-black text-foreground">
                {item.q}
              </dt>
              <dd className="mt-2 text-sm md:text-base leading-relaxed text-muted-foreground">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {ar ? "اقرأ أدلة الدراسة المجانية" : "Read the free study guides"}{" "}
          <Link to="/guides" className="font-bold text-foreground underline underline-offset-4">
            {ar ? "هنا" : "for medical students"}
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
