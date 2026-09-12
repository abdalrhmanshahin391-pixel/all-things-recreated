/**
 * Catalog of every editable piece of copy on the public pages.
 *
 * This file is the source of truth for:
 *  - the admin "Content" screen (labels, grouping, order, defaults)
 *  - the i18n fallback bundle, so the site renders correctly even before
 *    the database rows are loaded
 *  - the seed / "reset to default" values
 */

export type ContentKind = "text" | "multiline";

export type ContentItem = {
  key: string;
  label: string;
  kind?: ContentKind;
  en: string;
  ar?: string;
  hint?: string;
};

export type ContentGroup = {
  key: string;
  label: string;
  items: ContentItem[];
};

export const CONTENT_GROUPS: ContentGroup[] = [
  {
    key: "header",
    label: "Header & navigation",
    items: [
      { key: "cms.header.universities", label: "Nav — Universities", en: "Universities", ar: "الجامعات" },
      { key: "cms.header.myCourses", label: "Nav — My Courses", en: "My Courses", ar: "دوراتي" },
      { key: "cms.header.packages", label: "Nav — Packages", en: "PACKAGES", ar: "الباقات" },
      { key: "cms.header.resources", label: "Nav — Resources pill", en: "Resources", ar: "المصادر" },
      { key: "cms.header.summaries", label: "Nav — Summaries", en: "Summaries", ar: "الملخصات" },
      { key: "cms.header.login", label: "Button — Login", en: "LOGIN", ar: "تسجيل الدخول" },
      { key: "cms.header.register", label: "Button — Register", en: "REGISTER", ar: "إنشاء حساب" },
      { key: "cms.header.profileSettings", label: "Menu — Profile settings", en: "Profile Settings", ar: "إعدادات الحساب" },
      { key: "cms.header.myNotes", label: "Menu — My notes", en: "MY NOTES", ar: "ملاحظاتي" },
      { key: "cms.header.logout", label: "Menu — Logout", en: "Logout", ar: "تسجيل الخروج" },
      { key: "cms.header.roleAdmin", label: "Menu — Admin role label", en: "admin", ar: "مشرف" },
      { key: "cms.header.roleUser", label: "Menu — User role label", en: "user", ar: "مستخدم" },
    ],
  },
  {
    key: "home_hero",
    label: "Home — Hero",
    items: [
      {
        key: "cms.home.hero.title",
        label: "Headline",
        kind: "multiline",
        en: "AquaQBank Academy — your medical question bank, all in one place.",
        ar: "أكاديمية AquaQBank — بنك أسئلتك الطبية كاملاً في مكان واحد.",
      },
      {
        key: "cms.home.hero.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "AquaQBank Academy is an online medical study academy: question banks, past exam questions, video lectures and committee notes — organized by year and course, written by medical students who already passed.",
        ar: "بنوك الأسئلة، أسئلة الامتحانات السابقة، محاضرات مرئية وملاحظات اللجنة — مرتّبة حسب السنة والمادة.",
      },

      { key: "cms.home.hero.ctaMyCourses", label: "Button — signed in", en: "go to my courses →", ar: "إلى دوراتي ←" },
      { key: "cms.home.hero.ctaPrimary", label: "Button — get started", en: "Get Started", ar: "ابدأ الآن" },
      { key: "cms.home.hero.ctaSecondary", label: "Button — I have an account", en: "I have an account", ar: "لدي حساب" },
    ],
  },
  {
    key: "home_feature1",
    label: "Home — Feature row 1",
    items: [
      { key: "cms.home.feature1.eyebrow", label: "Eyebrow", en: "free. focused.", ar: "مجاني. مركّز." },
      { key: "cms.home.feature1.title", label: "Title", en: "every subject, sorted.", ar: "كل مادة، مرتّبة." },
      {
        key: "cms.home.feature1.body",
        label: "Body",
        kind: "multiline",
        en: "Question banks, video lectures and committee notes — organized by year, course and subject so you never waste a study session searching for what to do next.",
        ar: "بنوك أسئلة ومحاضرات وملاحظات لجنة، مرتّبة حسب السنة والمادة، حتى لا تضيّع وقت مذاكرتك في البحث.",
      },
    ],
  },
  {
    key: "home_feature2",
    label: "Home — Feature row 2",
    items: [
      { key: "cms.home.feature2.eyebrow", label: "Eyebrow", en: "backed by your seniors", ar: "بدعم من زملائك الأكبر" },
      { key: "cms.home.feature2.title", label: "Title", en: "built by students who passed.", ar: "من إعداد طلاب نجحوا." },
      {
        key: "cms.home.feature2.body",
        label: "Body",
        kind: "multiline",
        en: "every question, explanation and note is written and reviewed by medical students who already sat — and aced — the same midterm and final exams.",
        ar: "كل سؤال وشرح وملاحظة كتبها وراجعها طلاب خاضوا الامتحان نفسه في جامعتك وتفوّقوا فيه.",
      },

    ],
  },
  {
    key: "home_courses",
    label: "Home — Courses strip",
    items: [
      { key: "cms.home.courses.eyebrow", label: "Eyebrow", en: "courses", ar: "الدورات" },
      { key: "cms.home.courses.title", label: "Title", en: "jump into a course.", ar: "ابدأ دورتك الآن." },
      { key: "cms.home.courses.yearOther", label: "Year chip — other", en: "other", ar: "أخرى" },
      { key: "cms.home.courses.yearSuffix", label: "Year chip — suffix", en: "year", ar: "سنة" },
      { key: "cms.home.courses.countOne", label: "Count — one course", en: "1 course", ar: "دورة واحدة" },
      { key: "cms.home.courses.countOther", label: "Count — many courses", en: "{{count}} courses", ar: "{{count}} دورات" },
      { key: "cms.home.courses.action", label: "Card button", en: "Unlock course", ar: "افتح الدورة" },
    ],
  },
  {
    key: "home_packages",
    label: "Home — Packages strip",
    items: [
      { key: "cms.home.packages.badge", label: "Badge pill", en: "special offers", ar: "عروض خاصة" },
      { key: "cms.home.packages.title", label: "Title", en: "bundle it all. save more.", ar: "اجمعها كلها ووفّر أكثر." },
      {
        key: "cms.home.packages.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "unlock multiple courses in one purchase — built for students who want the whole year covered.",
        ar: "افتح عدة دورات بعملية شراء واحدة — لمن يريد تغطية السنة كاملة.",
      },
      { key: "cms.home.packages.bestDeal", label: "Ribbon — best deal", en: "★ Best deal", ar: "★ أفضل عرض" },
      { key: "cms.home.packages.group", label: "Tag — group", en: "Group", ar: "مجموعة" },
      { key: "cms.home.packages.individual", label: "Tag — individual", en: "Individual", ar: "فردية" },
      { key: "cms.home.packages.includes", label: "Feature — includes N courses", en: "Includes {{count}} courses", ar: "تشمل {{count}} دورات" },
      { key: "cms.home.packages.includesOne", label: "Feature — includes 1 course", en: "Includes 1 course", ar: "تشمل دورة واحدة" },
      { key: "cms.home.packages.lifetime", label: "Feature — lifetime access", en: "Lifetime access", ar: "وصول دائم" },
      { key: "cms.home.packages.shareWith", label: "Feature — share with N students", en: "Share with {{count}} students", ar: "شاركها مع {{count}} طلاب" },
      { key: "cms.home.packages.groupPrice", label: "Price label — group", en: "group price", ar: "سعر المجموعة" },
      { key: "cms.home.packages.oneTimePrice", label: "Price label — individual", en: "one-time price", ar: "سعر لمرة واحدة" },
      { key: "cms.home.packages.perStudent", label: "Price note — per student", en: "/ student", ar: "/ للطالب" },
      { key: "cms.home.packages.cta", label: "Card button", en: "Unlock package", ar: "افتح الباقة" },
    ],
  },
  {
    key: "home_universities",
    label: "Home — Universities strip",
    items: [
      { key: "cms.home.universities.eyebrow", label: "Eyebrow", en: "universities", ar: "الجامعات" },
      { key: "cms.home.universities.title", label: "Title", en: "pick where you study.", ar: "اختر مكان دراستك." },
      { key: "cms.home.universities.open", label: "Card link", en: "Open", ar: "افتح" },
    ],
  },
  {
    key: "home_footer",
    label: "Home — Closing call to action",
    items: [
      { key: "cms.home.footer.titleGuest", label: "Headline — visitor", en: "ready to study smarter?", ar: "جاهز لمذاكرة أذكى؟" },
      { key: "cms.home.footer.titleUser", label: "Headline — signed in", en: "keep your streak going", ar: "حافظ على استمراريتك" },
      {
        key: "cms.home.footer.body",
        label: "Body — visitor",
        kind: "multiline",
        en: "join students who passed by practicing every day.",
        ar: "انضم إلى طلاب نجحوا بالتدرب كل يوم.",
      },
      { key: "cms.home.footer.ctaGuest", label: "Button — visitor", en: "Get Started — it's free", ar: "ابدأ الآن — مجاناً" },
      { key: "cms.home.footer.ctaUser", label: "Button — signed in", en: "Explore available university", ar: "استكشف الجامعات المتاحة" },
    ],
  },
  {
    key: "universities_page",
    label: "Universities page",
    items: [
      { key: "cms.universitiesPage.badge", label: "Badge pill", en: "Universities", ar: "الجامعات" },
      { key: "cms.universitiesPage.badgeNext", label: "Badge pill — with target", en: "{{target}} — pick a university", ar: "{{target}} — اختر جامعة" },
      { key: "cms.universitiesPage.title", label: "Heading", en: "pick your university.", ar: "اختر جامعتك." },
      { key: "cms.universitiesPage.titleNext", label: "Heading — with target", en: "choose a university to view {{target}}.", ar: "اختر جامعة لعرض {{target}}." },
      {
        key: "cms.universitiesPage.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "Each university has its own courses, lecture catalog and committee resources. Select yours to jump in.",
        ar: "لكل جامعة دوراتها ومحاضراتها ومصادر لجنتها. اختر جامعتك للبدء.",
      },
      {
        key: "cms.universitiesPage.empty",
        label: "Empty state",
        kind: "multiline",
        en: "No universities yet. An admin can add one from the user menu → Universities.",
        ar: "لا توجد جامعات بعد. يمكن للمشرف إضافة جامعة من قائمة المستخدم ← الجامعات.",
      },
    ],
  },
  {
    key: "courses_page",
    label: "Courses page",
    items: [
      { key: "cms.coursesPage.badge", label: "Badge pill", en: "Curriculum · Years 1–6", ar: "المنهج · السنوات ١–٦" },
      { key: "cms.coursesPage.title", label: "Heading", en: "Every course, organized for exams.", ar: "كل الدورات، مرتّبة للامتحانات." },
      {
        key: "cms.coursesPage.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "Browse the full question bank by year. Midterms, finals, every subject — searchable, explained, and updated weekly.",
        ar: "تصفّح بنك الأسئلة كاملاً حسب السنة. نصفي، نهائي، وكل مادة — قابلة للبحث والشرح وتُحدَّث أسبوعياً.",
      },
      { key: "cms.coursesPage.yearHeading", label: "Year heading", en: "{{ordinal}} Year", ar: "السنة {{ordinal}}" },
      { key: "cms.coursesPage.countOne", label: "Count — one course", en: "1 course", ar: "دورة واحدة" },
      { key: "cms.coursesPage.countOther", label: "Count — many courses", en: "{{count}} courses", ar: "{{count}} دورات" },
      { key: "cms.coursesPage.start", label: "Card button — enrolled", en: "Start course", ar: "ابدأ الدورة" },
      { key: "cms.coursesPage.unlock", label: "Card button — locked", en: "Unlock course", ar: "افتح الدورة" },
      { key: "cms.coursesPage.error", label: "Error message", en: "Couldn't load courses. Please refresh.", ar: "تعذّر تحميل الدورات. يرجى التحديث." },
      { key: "cms.coursesPage.emptyTitle", label: "Empty state — title", en: "Coming soon", ar: "قريباً" },
      {
        key: "cms.coursesPage.emptyBody",
        label: "Empty state — body",
        kind: "multiline",
        en: "New material is being published soon. Check back shortly.",
        ar: "سيتم نشر مواد جديدة قريباً. عد إلينا لاحقاً.",
      },
    ],
  },
  {
    key: "packages_page",
    label: "Packages page",
    items: [
      { key: "cms.packagesPage.badge", label: "Badge pill", en: "Subscription packages", ar: "باقات الاشتراك" },
      { key: "cms.packagesPage.title", label: "Heading", en: "Bundle courses. Pay once.", ar: "اجمع الدورات وادفع مرة واحدة." },
      {
        key: "cms.packagesPage.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "Team up with your study squad or grab everything for yourself. One price unlocks every course in the package — instantly.",
        ar: "تعاون مع مجموعة دراستك أو خذ كل شيء لنفسك. سعر واحد يفتح كل دورات الباقة فوراً.",
      },
      { key: "cms.packagesPage.loading", label: "Loading text", en: "Loading packages…", ar: "جاري تحميل الباقات…" },
      { key: "cms.packagesPage.empty", label: "Empty state", en: "No packages available yet. Check back soon!", ar: "لا توجد باقات متاحة بعد. عد قريباً!" },
      { key: "cms.packagesPage.groupSeats", label: "Tag — group seats", en: "Group · {{count}} seats", ar: "مجموعة · {{count}} مقاعد" },
      { key: "cms.packagesPage.individual", label: "Tag — individual", en: "Individual", ar: "فردية" },
      { key: "cms.packagesPage.oneTime", label: "Price note", en: "one-time", ar: "دفعة واحدة" },
      { key: "cms.packagesPage.coursesLabel", label: "Stat — courses", en: "{{count}} Courses", ar: "{{count}} دورات" },
      { key: "cms.packagesPage.questionsLabel", label: "Stat — questions", en: "{{count}} Questions", ar: "{{count}} سؤال" },
      { key: "cms.packagesPage.yearNote", label: "Course line — year & questions", en: "Year {{year}} · {{count}} questions", ar: "السنة {{year}} · {{count}} سؤال" },
      { key: "cms.packagesPage.ctaGroup", label: "Button — group", en: "Pick group & subscribe", ar: "اختر المجموعة واشترك" },
      { key: "cms.packagesPage.ctaIndividual", label: "Button — individual", en: "Subscribe", ar: "اشترك" },
      { key: "cms.packagesPage.opening", label: "Button — busy", en: "Opening…", ar: "جاري الفتح…" },
    ],
  },
  {
    key: "login_page",
    label: "Sign in page",
    items: [
      { key: "cms.login.eyebrow", label: "Eyebrow", en: "welcome back", ar: "أهلاً بعودتك" },
      { key: "cms.login.title", label: "Heading", en: "sign in.", ar: "تسجيل الدخول." },
      {
        key: "cms.login.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "continue where you left off — courses, lectures, and notes.",
        ar: "تابع من حيث توقفت — الدورات والمحاضرات والملاحظات.",
      },
      { key: "cms.login.emailLabel", label: "Field — email", en: "Email", ar: "البريد الإلكتروني" },
      { key: "cms.login.passwordLabel", label: "Field — password", en: "Password", ar: "كلمة المرور" },
      { key: "cms.login.submit", label: "Button", en: "Sign In", ar: "دخول" },
      { key: "cms.login.submitting", label: "Button — busy", en: "Signing in…", ar: "جاري الدخول…" },
      { key: "cms.login.footerText", label: "Footer text", en: "Don't have an account?", ar: "ليس لديك حساب؟" },
      { key: "cms.login.footerLink", label: "Footer link", en: "Sign Up", ar: "إنشاء حساب" },
      { key: "cms.login.errFill", label: "Error — empty fields", en: "Please fill in both fields.", ar: "يرجى تعبئة الحقلين." },
      { key: "cms.login.errInvalid", label: "Error — wrong credentials", en: "Invalid email or password.", ar: "البريد أو كلمة المرور غير صحيحة." },
      { key: "cms.login.errTimeout", label: "Error — timeout", en: "The server is taking too long to respond. Please try again.", ar: "الخادم يستغرق وقتاً طويلاً. حاول مرة أخرى." },
      { key: "cms.login.errGeneric", label: "Error — generic", en: "Something went wrong. Please try again.", ar: "حدث خطأ ما. حاول مرة أخرى." },
    ],
  },
  {
    key: "register_page",
    label: "Create account page",
    items: [
      { key: "cms.register.eyebrow", label: "Eyebrow", en: "join", ar: "انضم" },
      { key: "cms.register.title", label: "Heading", en: "create your account.", ar: "أنشئ حسابك." },
      {
        key: "cms.register.subtitle",
        label: "Subtitle",
        kind: "multiline",
        en: "join AquaQBank academy and start preparing for your medical exams.",
        ar: "انضم إلى AquaQBank وابدأ التحضير لامتحاناتك الطبية.",
      },
      { key: "cms.register.fullName", label: "Field — full name", en: "Full Name", ar: "الاسم الكامل" },
      { key: "cms.register.username", label: "Field — username", en: "Username", ar: "اسم المستخدم" },
      { key: "cms.register.email", label: "Field — email", en: "Email", ar: "البريد الإلكتروني" },
      { key: "cms.register.phone", label: "Field — phone", en: "Phone Number", ar: "رقم الهاتف" },
      { key: "cms.register.password", label: "Field — password", en: "Password", ar: "كلمة المرور" },
      { key: "cms.register.confirm", label: "Field — confirm password", en: "Confirm Password", ar: "تأكيد كلمة المرور" },
      { key: "cms.register.submit", label: "Button", en: "Create Account", ar: "إنشاء الحساب" },
      { key: "cms.register.submitting", label: "Button — busy", en: "Creating account…", ar: "جاري إنشاء الحساب…" },
      { key: "cms.register.footerText", label: "Footer text", en: "Already have an account?", ar: "لديك حساب بالفعل؟" },
      { key: "cms.register.footerLink", label: "Footer link", en: "Sign In", ar: "تسجيل الدخول" },
    ],
  },
  {
    key: "committee",
    label: "Committee",
    items: [
      {
        key: "cms.committee.orientationTip",
        label: "Orientation tip",
        kind: "multiline",
        en: "Rotate your device horizontally for bigger, clearer text.",
        ar: "أدر جهازك أفقيًا لتحصل على نص أكبر وأوضح.",
      },
    ],
  },
];

export const CONTENT_ITEMS: ContentItem[] = CONTENT_GROUPS.flatMap((g) => g.items);

/** Turn dotted keys into the nested object shape i18next expects. */
export function toResourceBundle(values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const parts = key.split(".");
    let node = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) {
        node[p] = value;
      } else {
        if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
        node = node[p] as Record<string, unknown>;
      }
    });
  }
  return out;
}

export const DEFAULT_EN: Record<string, string> = Object.fromEntries(
  CONTENT_ITEMS.map((i) => [i.key, i.en]),
);

export const DEFAULT_AR: Record<string, string> = Object.fromEntries(
  CONTENT_ITEMS.map((i) => [i.key, i.ar ?? i.en]),
);