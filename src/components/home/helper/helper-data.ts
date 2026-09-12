export interface StepData {
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  badge_en?: string;
  badge_ar?: string;
}

export interface HelperTopic {
  id: string;
  icon: "compass" | "landmark" | "layers" | "timer" | "sparkles";
  badge_en: string;
  badge_ar: string;
  badge_color: string;
  title_en: string;
  title_ar: string;
  short_desc_en: string;
  short_desc_ar: string;
  action_href: string;
  action_label_en: string;
  action_label_ar: string;
  steps: StepData[];
}

export const HELPER_TOPICS: HelperTopic[] = [
  {
    id: "how-to-use-website",
    icon: "compass",
    badge_en: "Start Here",
    badge_ar: "ابدأ من هنا",
    badge_color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    title_en: "How to use the website?",
    title_ar: "كيف تستخدم الموقع؟",
    short_desc_en:
      "Select your university (YSMU), then explore Courses, Resources (Committee), and Lectures.",
    short_desc_ar:
      "اختر جامعتك (YSMU)، ثم استكشف الكورسات، المصادر (اللجنة)، ومحاضرات الشرح.",
    action_href: "/universities",
    action_label_en: "Explore Universities",
    action_label_ar: "تصفح الجامعات",
    steps: [
      {
        title_en: "Step 1: Open Universities",
        title_ar: "الخطوة الأولى: فتح قائمة الجامعات",
        description_en:
          "Click the 'Universities' tab from the top navigation bar or home page to view all supported medical institutions.",
        description_ar:
          "انقر على زر 'الجامعات' من القائمة العلوية أو الصفحة الرئيسية لعرض كليات الطب المتاحة.",
        badge_en: "Navigation",
        badge_ar: "التنقل",
      },
      {
        title_en: "Step 2: Choose YSMU",
        title_ar: "الخطوة الثانية: اختيار جامعة YSMU",
        description_en:
          "Select Yerevan State Medical University (YSMU) to access your university's medical curriculum, courses, and exam archives.",
        description_ar:
          "اختر جامعة ولاية يريفان الطبية (YSMU) للوصول إلى مناهج كليتك، كورساتك، وبنوك أسئلة جامعتك.",
        badge_en: "YSMU Portal",
        badge_ar: "بوابة YSMU",
      },
      {
        title_en: "Step 3: Discover the 3 Main Pillars",
        title_ar: "الخطوة الثالثة: استكشاف الأقسام الثلاثة الرئيسية",
        description_en:
          "• Courses: Question bank for each subject with study & test modes.\n• Resources: Committee (لجنة الطب والجراحة) study archives.\n• Lectures: Video and PDF explanations that make tough topics easy to master.",
        description_ar:
          "• الكورسات (Courses): بنك الأسئلة الشامل لكل مادة مع أنماط تدريب واختبار.\n• المصادر (Resources): أرشيف لجنة الطب والجراحة الشامل.\n• المحاضرات (Lectures): شروحات فيديو وملفات PDF لتسهيل دراسة المواد المعقدة.",
        badge_en: "3 Pillars",
        badge_ar: "3 أقسام رئيسية",
      },
    ],
  },
  {
    id: "what-is-committee",
    icon: "landmark",
    badge_en: "Committee",
    badge_ar: "لجنة الطب والجراحة",
    badge_color: "bg-purple-500/15 text-purple-600 border-purple-500/30",
    title_en: "What is Committee (لجنة الطب والجراحة)?",
    title_ar: "ما هي لجنة الطب والجراحة؟",
    short_desc_en:
      "All medical summaries and materials from Course 0 to 6, plus 'Best Sources of Study' from top students scoring 9 & 10.",
    short_desc_ar:
      "جميع ملخصات ومصادر الطب من السنة التحضيرية إلى السادسة، مع قسم 'أفضل مصادر الدراسة' من أوائل الطلبة الحاصلين على 9 و 10.",
    action_href: "/committee",
    action_label_en: "Visit Committee",
    action_label_ar: "زيارة لجنة الطب والجراحة",
    steps: [
      {
        title_en: "Course 0 to Course 6 Coverage",
        title_ar: "تغطية شاملة من السنة 0 إلى 6",
        description_en:
          "The Committee archives complete study resources, verified past papers, textbooks, and summaries for every academic year — from Course 0 (Foundation) all the way to Course 6 (Clinical Graduation Year).",
        description_ar:
          "توفر لجنة الطب والجراحة أرشيفاً دراسياً متكاملاً يشمل الملخصات، أسئلة السنوات السابقة، والكتب لكل سنة دراسية — من السنة التحضيرية (Course 0) وحتى سنة التخرج السادسة (Course 6).",
        badge_en: "Course 0 → 6",
        badge_ar: "السنة 0 ← 6",
      },
      {
        title_en: "Example: Course 6 (Internal Medicine & Surgery)",
        title_ar: "مثال عملي: السنة السادسة (الباطنية والجراحة)",
        description_en:
          "When you open Course 6, you will find clinical round summaries, oral exam guides, recall questions, and curated high-yield clinical materials.",
        description_ar:
          "عند فتح السنة السادسة، ستجد تفريغات الراوندات السريرية، أسئلة الاختبارات الشفوية، بنوك الأسئلة السابقة، وأقوى المراجع السريرية المركزة.",
        badge_en: "Course 6 Example",
        badge_ar: "مثال السنة السادسة",
      },
      {
        title_en: "The 'Best Sources of Study' Section",
        title_ar: "قسم أفضل مصادر الدراسة (Best Sources)",
        description_en:
          "Inside each subject, check the crown-marked 'Best Sources of Study' section. These recommendations are written by previous top-ranking students who achieved scores of 9/10 and 10/10 in that exact subject.",
        description_ar:
          "داخل كل مادة، ستجد قسماً مميزاً بتاج ذهبي هو 'أفضل مصادر الدراسة'. هذه التوصيات وضعها زملاؤكم الأوائل والمتفوقون الذين حققوا درجات 9/10 و 10/10 في نفس المادة لترشدكم لأقصر طريق للتفوق.",
        badge_en: "Scores 9 & 10",
        badge_ar: "موصى به من طلبة 9 و 10",
      },
    ],
  },
  {
    id: "how-to-use-qbank",
    icon: "layers",
    badge_en: "Practice",
    badge_ar: "تدريب وبنك أسئلة",
    badge_color: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    title_en: "How to use the Question Bank?",
    title_ar: "كيف تستخدم بنك الأسئلة؟",
    short_desc_en:
      "Practice questions subject by subject, get instant answer explanations, and bookmark tough questions for revision.",
    short_desc_ar:
      "تدرّب على آلاف الأسئلة لكل مادة، واقرأ التفسيرات الطبية الفورية، واحفظ الأسئلة الصعبة في مفكرتك.",
    action_href: "/universities?next=courses",
    action_label_en: "Go to Question Bank",
    action_label_ar: "الذهاب إلى بنك الأسئلة",
    steps: [
      {
        title_en: "Choose Your Subject & Mode",
        title_ar: "اختر مادتك ونمط التدريب",
        description_en:
          "Pick any medical subject (Anatomy, Pharmacology, Pathology, etc.) and choose Study Mode (instant feedback) or Exam Mode (timed simulation).",
        description_ar:
          "اختر أي مادة طبية (تشريح، فارما، باثولوجي...) وحدد نمط الدراسة (تصحيح فوري) أو نمط الامتحان (محاكاة بوقت محدد).",
        badge_en: "Study Mode",
        badge_ar: "نمط الدراسة",
      },
      {
        title_en: "Instant Feedback & Scientific Explanations",
        title_ar: "تصحيح فوري وشرح علمي مفصل",
        description_en:
          "When you answer, the correct option highlights in bright emerald with an in-depth clinical explanation and textbook references.",
        description_ar:
          "عند الإجابة، تضيء الإجابة الصحيحة باللون الأخضر ويظهر لك صندوق شرح طبي مدعم بالمراجع لتفهم سبب الإجابة بالتفصيل.",
        badge_en: "Explanations",
        badge_ar: "شروحات فورية",
      },
      {
        title_en: "Star & Bookmark for Revision",
        title_ar: "حفظ الأسئلة الصعبة للمراجعة",
        description_en:
          "Tap the star on any tricky question to save it to your personal Notebook so you can re-test yourself before the real exam.",
        description_ar:
          "انقر على أيقونة النجمة بجانب أي سؤال صعب لحفظه في دفتر مراجعتك الشخصي وإعادة حله قبل الامتحان.",
        badge_en: "Bookmarks",
        badge_ar: "دفتر المراجعة",
      },
    ],
  },
  {
    id: "how-to-take-exams",
    icon: "timer",
    badge_en: "Mock Exams",
    badge_ar: "امتحانات تجريبية",
    badge_color: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    title_en: "How to take Mock Exams & Timed Quizzes?",
    title_ar: "كيف تقدم الاختبارات التجريبية؟",
    short_desc_en:
      "Simulate real university exam conditions with countdown timers, question flags, and instant score analytics.",
    short_desc_ar:
      "حاكي أجواء الامتحانات الحقيقية مع عداد زمني، إمكانية وضع علامات على الأسئلة، وتحليل فوري للدرجات.",
    action_href: "/universities?next=courses",
    action_label_en: "Try Mock Exam",
    action_label_ar: "جرب اختباراً تجريبياً",
    steps: [
      {
        title_en: "Set Real Exam Conditions",
        title_ar: "ضبط شروط الامتحان الحقيقي",
        description_en:
          "Select question count and timer duration to mimic university exams and train your time management under pressure.",
        description_ar:
          "حدد عدد الأسئلة والمدة الزمنية لمحاكاة امتحانات الجامعة وتدريب نفسك على إدارة الوقت بذكاء.",
        badge_en: "Timer",
        badge_ar: "العداد الزمني",
      },
      {
        title_en: "Flag Tricky Questions During the Exam",
        title_ar: "وضع علامات على الأسئلة المشكوك فيها",
        description_en:
          "Use the quick question navigator to flag doubts, review them before submitting, and jump seamlessly between questions.",
        description_ar:
          "استخدم شريط التنقل لتحديد الأسئلة التي تحتاج مراجعة قبل تسليم الامتحان والتنقل السلس بينها.",
        badge_en: "Navigator",
        badge_ar: "شريط الأسئلة",
      },
      {
        title_en: "Instant Score & Diagnostic Analytics",
        title_ar: "درجة فورية وتحليل لمستواك",
        description_en:
          "Get an immediate score percentage, topic-by-topic strength breakdown, and instant option to review every mistake.",
        description_ar:
          "احصل على نسبتك المئوية فوراً، مع تحليل لنقاط القوة والضعف في كل موضوع وإمكانية مراجعة جميع الإجابات الخاطئة.",
        badge_en: "Results",
        badge_ar: "تقرير النتيجة",
      },
    ],
  },
  {
    id: "how-to-use-aquavisionx",
    icon: "sparkles",
    badge_en: "AI Tech",
    badge_ar: "ذكاء اصطناعي",
    badge_color: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
    title_en: "How AquaVisionX & AI Question Solver works?",
    title_ar: "كيف يعمل AquaVisionX وحلال الأسئلة الذكي؟",
    short_desc_en:
      "Scan past exam PDFs, solve multi-answer combinations, and extract verified answers instantly.",
    short_desc_ar:
      "امسح أوراق الامتحانات وPDF، وحل الأسئلة التركيبية المعقدة ذات الإجابات المتعددة واستخرج الحلول الموثوقة.",
    action_href: "/about",
    action_label_en: "Learn About AquaVisionX",
    action_label_ar: "تعرف على AquaVisionX",
    steps: [
      {
        title_en: "Upload Exam Paper or PDF",
        title_ar: "رفع ورقة الامتحان أو ملف PDF",
        description_en:
          "AquaVisionX recognizes medical text, diagram labels, and questions directly from scanned past papers.",
        description_ar:
          "يتعرف AquaVisionX تلقائياً على النصوص والرسومات وأسئلة الامتحانات من الأوراق المصورة والملفات.",
        badge_en: "OCR Scan",
        badge_ar: "المسح الضوئي",
      },
      {
        title_en: "Multi-Answer Combination Solving",
        title_ar: "حل الأسئلة التركيبية المعقدة",
        description_en:
          "Specialized AI logic solves combination statements (e.g. '1, 3, and 5 are correct') with textbook verification.",
        description_ar:
          "خوارزميات مخصصة لحل أسئلة التركيبات الطبية المعقدة (مثل: العبارات 1 و 3 و 5 صحيحة) مع التحقق من المراجع.",
        badge_en: "Combination Logic",
        badge_ar: "منطق التركيبات",
      },
      {
        title_en: "Direct Integration into Question Bank",
        title_ar: "دمج الأسئلة فوراً في بنك الأسئلة",
        description_en:
          "Solved questions are verified and added directly to your course so you can practice them anytime.",
        description_ar:
          "تُضاف الأسئلة المحلولة والمحققة مباشرة إلى مادتك الدراسية لتتدرب عليها في أي وقت.",
        badge_en: "Ready to Practice",
        badge_ar: "جاهز للتدريب",
      },
    ],
  },
];
