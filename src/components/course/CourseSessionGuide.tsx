import { useState } from "react";
import {
  HelpCircle,
  BookOpen,
  Sparkles,
  Timer,
  Flag,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Languages,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLang } from "@/components/LanguageProvider";

interface CourseSessionGuideProps {
  showInlineBanner?: boolean;
  className?: string;
  modalOpen?: boolean;
  onModalOpenChange?: (open: boolean) => void;
  onStartTour?: () => void;
}

export function CourseSessionGuide({
  showInlineBanner = true,
  className = "",
  modalOpen: controlledModalOpen,
  onModalOpenChange,
  onStartTour,
}: CourseSessionGuideProps) {
  const { lang, setLang } = useLang();
  const isArabic = lang === "ar";
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [isBannerExpanded, setIsBannerExpanded] = useState(false);

  const isModalOpen = controlledModalOpen !== undefined ? controlledModalOpen : internalModalOpen;
  const setModalOpen = onModalOpenChange || setInternalModalOpen;

  return (
    <>
      {/* ================= INLINE EXPANDABLE BANNER ================= */}
      {showInlineBanner && (
        <div
          className={`rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/5 via-card to-background p-4 sm:p-5 shadow-sm transition-all ${className}`}
          dir={isArabic ? "rtl" : "ltr"}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
                <HelpCircle size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-sm sm:text-base text-foreground">
                    {isArabic ? "دليل بدء الاختبارات والتدريب" : "How to Start Your Session"}
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                    {isArabic ? "إرشادات هامة" : "Quick Guide"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {isArabic
                    ? "اختر المواد التي تريد دراستها، أو اتركها لإضافة جميع الأسئلة تلقائياً. تعرّف على أنماط الاختبار والمؤقت."
                    : "Select subjects to practice, or leave unselected to test everything. Learn about modes and timer."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => setIsBannerExpanded(!isBannerExpanded)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer shadow-sm"
              >
                <span>{isBannerExpanded ? (isArabic ? "طي الدليل" : "Collapse") : isArabic ? "عرض الخطوات" : "Show Steps"}</span>
                {isBannerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer shadow-sm"
              >
                <HelpCircle size={14} />
                <span>{isArabic ? "دليل مفصل" : "Full Guide"}</span>
              </button>

              {onStartTour && (
                <button
                  type="button"
                  onClick={onStartTour}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:bg-primary/90 transition-all cursor-pointer shadow-sm shadow-primary/20 hover:scale-105 active:scale-95"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>{isArabic ? "جولة تفاعلية حية" : "Live Tour"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Expanded Step Cards */}
          {isBannerExpanded && (
            <div className="mt-4 pt-4 border-t border-border/80 grid grid-cols-1 md:grid-cols-2 gap-3">
              <GuideCard
                number="1"
                icon={<Layers className="text-blue-500" size={18} />}
                title={isArabic ? "اختيار المواد والأسئلة" : "Select Your Subjects"}
                tag={isArabic ? "هام جداً" : "Key Rule"}
                tagColor="bg-blue-500/10 text-blue-500 border-blue-500/20"
                text={
                  isArabic
                    ? "انقر على أي مادة لتحديدها. في حال لم تختر أي مادة (0 محددة)، ستتم إضافة جميع أسئلة الكورس المتاحة تلقائياً للاختبار!"
                    : "Click any subject to select it. If you select nothing (0 selected), ALL accessible course questions will be automatically included in your session!"
                }
              />

              <GuideCard
                number="2"
                icon={<BookOpen className="text-emerald-500" size={18} />}
                title={isArabic ? "الأنماط الثلاثة (Study, Session, Exam)" : "Choose Your Mode"}
                tag={isArabic ? "3 خيارات" : "3 Modes"}
                tagColor="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                text={
                  isArabic
                    ? "• نمط المراجعة (Study): إظهار الإجابات والشرح فوراً للقراءة.\n• التدريب (Session): حل تفاعلي مع تصحيح فوري لكل سؤال.\n• الامتحان (Exam): محاكاة للامتحان الحقيقي بدون إجابات حتى التسليم."
                    : "• Study mode: Pre-revealed answers & explanations for fast reading.\n• Session mode: Interactive practice with instant answer correction.\n• Exam mode: University simulation with no answers shown until finished."
                }
              />

              <GuideCard
                number="3"
                icon={<Timer className="text-amber-500" size={18} />}
                title={isArabic ? "تفعيل المؤقت للامتحان" : "Timed Exam Setup"}
                tag={isArabic ? "مؤقت تنازلي" : "Countdown"}
                tagColor="bg-amber-500/10 text-amber-500 border-amber-500/20"
                text={
                  isArabic
                    ? "قم بتفعيل خيار Timed (Exam) ثم اختر المدة الزمنية (15 دقيقة، 30 دقيقة، ساعة، ساعتان). عند انتهاء الوقت يسلم الامتحان تلقائياً."
                    : "Toggle 'Timed (Exam)' ON and select your duration (15m, 30m, 1h, 1.5h, 2h). The exam auto-submits when the timer runs out."
                }
              />

              <GuideCard
                number="4"
                icon={<Flag className="text-purple-500" size={18} />}
                title={isArabic ? "الأسئلة المعلمة والأخطاء" : "Flagged & Wrong Questions"}
                tag={isArabic ? "مراجعة ذكية" : "Smart Review"}
                tagColor="bg-purple-500/10 text-purple-500 border-purple-500/20"
                text={
                  isArabic
                    ? "انقر على أيقونة العلم (🚩) لحفظ السؤال أثناء الحل. ومن لوحة التحكم اختر 'Flagged' لمراجعة الأسئلة المعلمة، أو 'Wrong' لإعادة حل الأخطاء فقط!"
                    : "Tap the flag icon (🚩) during any question to bookmark it. In the control panel, switch to 'Flagged' to review bookmarks or 'Wrong' to master missed questions!"
                }
              />
            </div>
          )}
        </div>
      )}

      {/* ================= COMPREHENSIVE MODAL DIALOG ================= */}
      <Dialog open={isModalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-7 rounded-3xl border border-border bg-card shadow-2xl z-[160]"
          dir={isArabic ? "rtl" : "ltr"}
        >
          {/* Accessible title & description */}
          <DialogTitle className="sr-only">
            {isArabic ? "دليل استخدام بنك الأسئلة ولوحة التحكم" : "Question Bank & Control Panel Guide"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isArabic
              ? "شرح مفصل لكيفية اختيار مجموعات الأسئلة، الأنماط الثلاثة، المؤقت الزمني، ومراجعة الأسئلة المعلمة والأخطاء."
              : "Detailed explanation of subject selection, 3 modes, timer setup, and reviewing flagged & wrong questions."}
          </DialogDescription>

          {/* Modal Header with Language Toggle */}
          <div className="flex items-start justify-between pb-4 border-b border-border/80 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
                <HelpCircle size={24} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                  {isArabic ? "دليل استخدام بنك الأسئلة ولوحة التحكم" : "Question Bank & Session Guide"}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {isArabic
                    ? "كل ما تحتاجه للبدء بالدراسة وإجراء الاختبارات باحترافية وبدون أي ارتباك:"
                    : "Everything you need to know about starting sessions and taking exams with confidence:"}
                </p>
              </div>
            </div>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={() => setLang(isArabic ? "en" : "ar")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-2 border-primary/50 bg-primary/10 hover:bg-primary/20 text-xs font-black text-primary transition-all shadow-sm shrink-0 cursor-pointer mr-8 rtl:mr-0 rtl:ml-8 hover:scale-105 active:scale-95"
              title={isArabic ? "Switch to English" : "التحويل إلى العربية"}
            >
              <Languages size={15} className="text-primary" />
              <span>{isArabic ? "English" : "العربية"}</span>
            </button>
          </div>

          {/* Section 1: Subject Selection */}
          <div className="mt-4 space-y-4 text-xs sm:text-sm text-foreground/90">
            <div className="p-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 space-y-2">
              <div className="flex items-center gap-2 text-blue-500 font-extrabold text-sm sm:text-base">
                <Layers size={18} />
                <span>{isArabic ? "1. اختيار المواد ومجموعات الأسئلة (Curriculum)" : "1. Selecting Question Groups"}</span>
              </div>
              <p className="leading-relaxed">
                {isArabic
                  ? "• يمكنك النقر على أي مادة في القائمة لتحديدها ودراسة أسئلتها فقط."
                  : "• You can click any subject in the curriculum list to focus only on its questions."}
              </p>
              <div className="p-3 rounded-xl bg-background border border-blue-500/40 text-foreground font-semibold flex items-start gap-2.5">
                <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <span>
                  {isArabic ? (
                    <>
                      <strong className="text-blue-500">قاعدة هامة:</strong> في حال لم تقم بتحديد أي مادة (0 محددة)،{" "}
                      <strong>ستتم إضافة جميع أسئلة الكورس تلقائياً</strong> إلى جلستك التدريبية أو اختبارك (All accessible)!
                    </>
                  ) : (
                    <>
                      <strong className="text-blue-500">Important Rule:</strong> If you don't select any subject (0 selected),{" "}
                      <strong>ALL accessible course questions will automatically be added</strong> to your test session (All accessible)!
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Section 2: Control Panel & The 3 Modes */}
            <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-3">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm sm:text-base">
                <Sparkles size={18} />
                <span>{isArabic ? "2. لوحة التحكم والأنماط الثلاثة (Start a Session)" : "2. Control Panel & The 3 Modes"}</span>
              </div>
              <p className="leading-relaxed text-muted-foreground">
                {isArabic
                  ? "تتيح لك لوحة التحكم الجانبية بدء الدراسة بثلاثة أنماط مختلفة تناسب هدفك:"
                  : "The control panel allows you to start studying in 3 specialized modes:"}
              </p>

              <div className="space-y-2.5">
                {/* Study Mode */}
                <div className="p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <BookOpen size={16} />
                      {isArabic ? "نمط المراجعة (Study mode)" : "Study mode"}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {isArabic ? "قراءة وشرح فوري" : "Instant Explanations"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isArabic
                      ? "مخصص للقراءة والمذاكرة السريعة. تظهر الإجابات الصحيحة والشروحات الطبية فوراً وبدون أي ضغط امتحاني، لتتعلم المعلومة مباشرة مع المراجع."
                      : "Designed for reading and note review. Correct answers and clinical explanations are visible immediately without exam stress."}
                  </p>
                </div>

                {/* Session Mode */}
                <div className="p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-extrabold text-primary flex items-center gap-1.5">
                      <Sparkles size={16} />
                      {isArabic ? "نمط التدريب التفاعلي (Session mode)" : "Session mode"}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {isArabic ? "تصحيح فوري لكل سؤال" : "Instant Feedback"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isArabic
                      ? "النمط الأفضل للتدرب النشط. تقوم بحل الأسئلة سؤالاً بسؤال، وبمجرد اختيار الإجابة يظهر لك تصحيح فوري (أخضر للصحيح، أحمر للخطأ) مع الشرح التفصيلي."
                      : "Best for active practice. Answer question by question and receive instant feedback (Green/Red) upon answering, plus textbook explanations."}
                  </p>
                </div>

                {/* Exam Mode */}
                <div className="p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-extrabold text-foreground flex items-center gap-1.5">
                      <Timer size={16} />
                      {isArabic ? "نمط الامتحان (Exam mode)" : "Exam mode"}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {isArabic ? "محاكاة واقعية وتقييم" : "Exam Simulation"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isArabic
                      ? "يحاكي الامتحانات الجامعية الحقيقية. لا تظهر الإجابات أو الشروحات أثناء الحل. يمكنك التنقل بين الأسئلة وتعليم الأسئلة المشكوك فيها، وعند تسليم الامتحان تحصل على نتيجتك وتحليل تفصيلي لجميع أخطائك."
                      : "Simulates real exams. Answers and explanations remain hidden until you submit. Navigate freely, flag doubts, and receive a comprehensive score report with mistake diagnostics."}
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Timed Exam Setup */}
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-extrabold text-sm sm:text-base">
                <Timer size={18} />
                <span>{isArabic ? "3. تفعيل الامتحان بوقت محدد (Timed Exam)" : "3. Setting Up a Timed Exam"}</span>
              </div>
              <p className="leading-relaxed">
                {isArabic
                  ? "• في لوحة التحكم، قم بتشغيل زر التبديل بجانب 'Timed (Exam)'."
                  : "• In the control panel, toggle the switch next to 'Timed (Exam)' ON."}
              </p>
              <p className="leading-relaxed">
                {isArabic
                  ? "• ستظهر لك خيارات المدة: 15 دقيقة (15m)، 30 دقيقة (30m)، ساعة (1h)، ساعة ونصف (1.5h)، أو ساعتان (2h)."
                  : "• Duration options will appear: 15m, 30m, 1h, 1.5h, or 2h."}
              </p>
              <p className="text-xs text-muted-foreground">
                {isArabic
                  ? "• يعمل العداد التنازلي أثناء نمط الامتحان (Exam mode)، وعند انتهاء الوقت يتم تسليم الامتحان وحساب النتيجة تلقائياً."
                  : "• The live countdown timer runs during Exam mode, and auto-submits your test when time runs out."}
              </p>
            </div>

            {/* Section 4: Flagged & Wrong Questions */}
            <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-2">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-extrabold text-sm sm:text-base">
                <Flag size={18} />
                <span>{isArabic ? "4. الأسئلة المعلمة ومراجعة الأخطاء (Question Pool)" : "4. Flagging & Reviewing Mistakes"}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    🚩
                  </span>
                  <div>
                    <strong className="text-foreground">{isArabic ? "كيف تضع علامة على سؤال؟" : "How to Flag a Question:"}</strong>
                    <p className="text-muted-foreground mt-0.5">
                      {isArabic
                        ? "أثناء حل أي سؤال في أي نمط، انقر على أيقونة العلم (🚩) الموجودة أعلى السؤال لحفظه في قائمتك المفضلة للمراجعة لاحقاً."
                        : "While solving any question, click the flag icon (🚩) at the top of the question to bookmark it for later review."}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-1 border-t border-purple-500/20">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    🎯
                  </span>
                  <div>
                    <strong className="text-foreground">
                      {isArabic ? "كيف ترجع للأسئلة المعلمة والأخطاء؟" : "How to Return to Flagged & Wrong Questions:"}
                    </strong>
                    <p className="text-muted-foreground mt-0.5">
                      {isArabic
                        ? "في لوحة التحكم الجانبية تحت قسم Question pool، يمكنك الاختيار بين:"
                        : "In the control panel under 'Question pool', simply select:"}
                    </p>
                    <ul className="mt-1 space-y-1 list-disc list-inside text-xs text-foreground/80">
                      <li>
                        <strong>All:</strong> {isArabic ? "جميع أسئلة المادة بشكل طبيعي." : "All questions in the subject."}
                      </li>
                      <li>
                        <strong>Flagged:</strong>{" "}
                        {isArabic ? "الأسئلة التي وضعت عليها علامة فقط." : "Only questions you have flagged."}
                      </li>
                      <li>
                        <strong>Wrong:</strong>{" "}
                        {isArabic ? "الأسئلة التي أجبت عليها خطأ في محاولاتك السابقة لإتقانها!" : "Only questions you previously answered incorrectly to master them!"}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-sm hover:bg-primary/90 transition-all cursor-pointer shadow-md"
            >
              {isArabic ? "فهمت، جاهز للبدء" : "Got it, ready to start"}
            </button>
            <span className="text-xs text-muted-foreground">
              {isArabic ? "AquaQBank Academy · دليل الطالب" : "AquaQBank Academy · Student Guide"}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GuideCard({
  number,
  icon,
  title,
  tag,
  tagColor,
  text,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  tag: string;
  tagColor: string;
  text: string;
}) {
  return (
    <div className="p-3.5 rounded-xl border border-border/90 bg-card hover:border-primary/30 transition-all shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
          <h4 className="font-extrabold text-xs sm:text-sm text-foreground">{title}</h4>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tagColor}`}>
          {tag}
        </span>
      </div>
      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  );
}

export function GuideButtonTrigger({ onClick, isArabic }: { onClick: () => void; isArabic: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-extrabold text-primary transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95 shrink-0"
      title={isArabic ? "دليل الاستخدام السريع" : "Quick Guide"}
    >
      <HelpCircle size={13} className="text-primary animate-pulse" />
      <span>{isArabic ? "دليل الاستخدام" : "Guide"}</span>
    </button>
  );
}

export function LiveTourButtonTrigger({ onClick, isArabic }: { onClick: () => void; isArabic: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-black text-indigo-600 dark:text-indigo-400 transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95 shrink-0"
      title={isArabic ? "بدء جولة تفاعلية حية على الصفحة" : "Start Interactive Live Tour"}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
      <span>{isArabic ? "جولة حية" : "Live Tour"}</span>
    </button>
  );
}
