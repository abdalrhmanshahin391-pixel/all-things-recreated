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
        title_en: "Step 1: Click on the 'UNIVERSITIES' Button",
        title_ar: "الخطوة الأولى: الضغط على زر الجامعات (UNIVERSITIES)",
        description_en:
          "On the home page, click the prominent blue 'UNIVERSITIES' button (or the top navigation link) to explore medical universities.",
        description_ar:
          "في الصفحة الرئيسية، انقر على زر 'UNIVERSITIES' الأزرق الواضح في الوسط (أو عبر القائمة العلوية) لاستعراض الجامعات الطبية.",
        badge_en: "Home Button",
        badge_ar: "زر الصفحة الرئيسية",
      },
      {
        title_en: "Step 2: Choose Yerevan State Medical University (YSMU)",
        title_ar: "الخطوة الثانية: اختيار جامعة ولاية يريفان الطبية (YSMU)",
        description_en:
          "From the university catalog, select Yerevan State Medical University (YSMU) to enter your medical curriculum hub.",
        description_ar:
          "من قائمة الجامعات، اختر جامعة ولاية يريفان الطبية (YSMU) للدخول إلى البوابة التعليمية الخاصة بكليتك.",
        badge_en: "YSMU Portal",
        badge_ar: "بوابة YSMU",
      },
      {
        title_en: "Step 3: Understand Courses, Resources & Lectures",
        title_ar: "الخطوة الثالثة: التعرف على الكورسات، المصادر، والمحاضرات",
        description_en:
          "• Courses: Question bank for each material with study & test modes.\n• Resources: Committee (لجنة الطب والجراحة) with medical books, summaries & essential study resources.\n• Lectures: Video or PDF explanations for each material to make studying easier.",
        description_ar:
          "• الكورسات (Courses): بنك الأسئلة لكل مادة مع أنماط تدريب وامتحانات.\n• المصادر (Resources): أرشيف لجنة الطب والجراحة للكتب، الملخصات، والمصادر المعتمدة.\n• المحاضرات (Lectures): فيديوهات وملفات PDF لشرح المواد وتسهيل دراستها.",
        badge_en: "3 Core Pillars",
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
        title_en: "Step 1: All Years Covered (Zero Course to Sixth Course)",
        title_ar: "الخطوة الأولى: تغطية شاملة لجميع السنوات (من التحضيري إلى السنة السادسة)",
        description_en:
          "The Committee provides a complete academic archive for each medical year. From the main Committee page, pick your course (e.g. Sixth Course) to explore subjects, study plans, and books.",
        description_ar:
          "توفر لجنة الطب والجراحة أرشيفاً أكاديمياً متكاملاً لكل سنة دراسية. من صفحة اللجنة الرئيسية، اختر سنتك الدراسية (مثل السنة السادسة Sixth Course) لتصفح المواد، خطة الطب، والكتب.",
        badge_en: "Courses 0 → 6",
        badge_ar: "السنوات 0 ← 6",
      },
      {
        title_en: "Step 2: Best Sources of Study (Curated for Scores 9 & 10)",
        title_ar: "الخطوة الثانية: قسم أفضل مصادر الدراسة (توصيات طلبة 9 و 10)",
        description_en:
          "Inside each subject (e.g. Cardiology in Sixth Course), check the crown-marked 'Best sources of study' section. These lecture notes and summaries are recommendations based on senior students who scored 9/10 and 10/10.",
        description_ar:
          "داخل كل مادة (مثل مادة القلبية في السنة السادسة)، ستجد قسماً مميزاً بتاج 'أفضل مصادر الدراسة'. هذه الملاحظات والملخصات تم ترشيحها بناءً على خبرة أوائل الدفعات الحاصلين على درجات 9/10 و 10/10.",
        badge_en: "Scores 9 & 10",
        badge_ar: "طلبة 9 و 10",
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
];
