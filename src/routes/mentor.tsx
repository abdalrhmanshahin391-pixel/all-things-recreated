import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  mentorGetTasks,
  mentorAddTask,
  mentorUpdateTask,
  mentorDeleteTask,
  mentorToggleTask,
  mentorGetCompletions,
  mentorGetOverviewStats,
  mentorGetTreasures,
  mentorAddTreasure,
  mentorDeleteTreasure,
  mentorPinTreasure,
  mentorUnpinTreasure,
  mentorGetCategoriesWithEntries,
  mentorAddCategory,
  mentorDeleteCategory,
  mentorAddEntry,
  mentorDeleteEntry,
  mentorSaveSuggestedDua,
  mentorSeedDefaultTasks,
  type MentorTaskRow,
  type MentorTreasureRow,
  type MentorCategoryWithEntries,
} from "@/lib/mentor.functions";
import {
  SUGGESTED_ATHKAR_GROUPS,
  SUGGESTED_DUAS,
  getTodayCuratedPearl,
  type AthkarGroup,
  type AthkarItem,
  type SuggestedDua,
} from "@/lib/mentor-data";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  BookOpen,
  ListChecks,
  Gem,
  Flame,
  Sparkles,
  RefreshCw,
  Pin,
  MoonStar,
  Sun,
  Moon,
  Copy,
  Check,
  CheckCircle2,
  Bookmark,
  Search,
  RotateCcw,
  BedDouble,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArmeniaPrayerBar } from "@/components/prayer/PrayerNotificationWatcher";
import { SurahKahfReaderModal } from "@/components/mentor/SurahKahfReaderModal";

export const Route = createFileRoute("/mentor")({
  head: () => ({
    meta: [
      { title: "My Mentor — مرشدي" },
      {
        name: "description",
        content: "مرشدك اليومي: الأذكار اليومية المأثورة، كنوزك الخاصة، أدعية مقترحة، وقائمة المهام اليومية المباركة.",
      },
      { property: "og:title", content: "My Mentor — مرشدي" },
      {
        property: "og:description",
        content: "أذكار الصباح والمساء، أدعية الامتحانات والسفر، كنوز مختارة، ومتابعة الواجبات اليومية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MentorPage,
});

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateAr(d: Date) {
  try {
    const g = d.toLocaleDateString("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const h = d.toLocaleDateString("ar-SA-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return { g, h };
  } catch {
    return { g: d.toDateString(), h: "" };
  }
}

function getAthkarStorageKey(dateStr: string): string {
  return `mentor_athkar_${dateStr}`;
}

function loadAthkarProgress(dateStr: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem(getAthkarStorageKey(dateStr));
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveAthkarProgress(dateStr: string, progress: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getAthkarStorageKey(dateStr), JSON.stringify(progress));
  } catch {}
}

/* ============================================================ */
/*                          MAIN PAGE                            */
/* ============================================================ */

function MentorPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const [activeMainTab, setActiveMainTab] = useState<"athkar_treasures" | "duas" | "tasks">(
    "athkar_treasures"
  );
  const [surahKahfOpen, setSurahKahfOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const isFriday = useMemo(() => now.getDay() === 5, [now]);
  const date = useMemo(() => formatDateAr(now), [now]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  const displayName =
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    user?.email?.split("@")[0] ||
    "طالب العلم";

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20" dir="rtl">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-4 md:py-8 space-y-6 md:space-y-8">
        {/* Armenia Prayer Times Live Bar with Silent Adhan Notification */}
        <ArmeniaPrayerBar className="shadow-xs" />

        {/* Friday Special Surah Al-Kahf Banner */}
        {isFriday && (
          <FridayKahfBanner
            onOpenReader={() => setSurahKahfOpen(true)}
            onOpenAthkar={() => setActiveMainTab("athkar_treasures")}
          />
        )}

        {/* Welcome Greeting Banner */}
        <section
          className="relative overflow-hidden rounded-3xl border border-primary/25 p-5 md:p-8 shadow-sm transition-all"
          style={{
            background:
              "radial-gradient(900px 300px at 95% -10%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, var(--card)), var(--card))",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                <Sparkles size={13} className="text-primary" />
                <span>مرشدك ورفيقك اليومي</span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
                Welcome, {displayName}! <span className="text-primary font-bold">👋</span>
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                أهلاً بك يا <span className="font-bold text-foreground">{displayName}</span> في مساحتك اليومية لحفظ الأذكار، استكشاف الأدعية، وتنظيم الطاعات.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start md:self-auto bg-background/80 backdrop-blur-sm border border-border/80 rounded-2xl px-4 py-2.5 text-xs sm:text-sm">
              <Calendar size={18} className="text-primary shrink-0" />
              <div>
                <div className="font-bold text-foreground">{date.g}</div>
                {date.h && <div className="text-primary font-medium text-xs">{date.h}</div>}
              </div>
            </div>
          </div>
        </section>

        {/* Hero Section: Today's Pearl / Pinned Treasure */}
        <MentorHero />

        {/* Quick Stats Strip */}
        <StatsStrip />

        {/* Segmented Main Navigation Switcher */}
        <div className="sticky top-16 z-20 backdrop-blur-md bg-background/90 py-2 border-b border-border/60">
          <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-muted/60 border border-border/70 max-w-xl mx-auto">
            <button
              type="button"
              onClick={() => setActiveMainTab("athkar_treasures")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeMainTab === "athkar_treasures"
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Gem size={16} className={activeMainTab === "athkar_treasures" ? "text-primary" : ""} />
              <span>كنوزي والأذكار</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab("duas")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeMainTab === "duas"
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <BookOpen size={16} className={activeMainTab === "duas" ? "text-primary" : ""} />
              <span>الأدعية</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab("tasks")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeMainTab === "tasks"
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <ListChecks size={16} className={activeMainTab === "tasks" ? "text-primary" : ""} />
              <span>المهام اليومية</span>
            </button>
          </div>
        </div>

        {/* Tab Content Panels */}
        {activeMainTab === "athkar_treasures" && (
          <AthkarAndTreasuresSection onOpenSurahKahf={() => setSurahKahfOpen(true)} />
        )}
        {activeMainTab === "duas" && <DuasSection />}
        {activeMainTab === "tasks" && (
          <TasksSection onOpenSurahKahf={() => setSurahKahfOpen(true)} />
        )}

        {/* Surah Al-Kahf Reader Modal */}
        <SurahKahfReaderModal
          open={surahKahfOpen}
          onClose={() => setSurahKahfOpen(false)}
        />
      </main>
    </div>
  );
}

function FridayKahfBanner({
  onOpenReader,
  onOpenAthkar,
}: {
  onOpenReader: () => void;
  onOpenAthkar?: () => void;
}) {
  const qc = useQueryClient();
  const addTaskFn = useServerFn(mentorAddTask);
  const [added, setAdded] = useState(false);

  async function handleAddKahfTask() {
    try {
      await addTaskFn({
        data: {
          kind: "religious",
          title: "قراءة سورة الكهف (سنة يوم الجمعة)",
          is_daily: false,
        },
      });
      setAdded(true);
      toast.success("تمت إضافة قراءة سورة الكهف إلى مهامك اليوم بنجاح 📖");
      await qc.invalidateQueries({ queryKey: ["mentor_tasks"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر إضافة المهمة");
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-card p-5 md:p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold">
            <Sparkles size={13} />
            <span>نورٌ ما بين الجمعتين 🌟</span>
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-foreground">
            سُنّة قراءة سورة الكهف اليوم 📖
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed">
            قال رسول الله ﷺ: «مَنْ قَرَأَ سُورَةَ الْكَهْفِ فِي يَوْمِ الْجُمُعَةِ أَضَاءَ لَهُ مِنَ النُّورِ مَا بَيْنَ الْجُمُعَتَيْنِ».
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={onOpenReader}
            className="rounded-xl font-bold gap-2 text-xs sm:text-sm bg-primary text-primary-foreground shadow-sm"
          >
            <BookOpen size={16} />
            <span>قراءة سورة الكهف الآن</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleAddKahfTask}
            disabled={added}
            className="rounded-xl font-bold gap-1.5 text-xs sm:text-sm border-amber-500/40 hover:bg-amber-500/10"
          >
            {added ? (
              <>
                <Check size={14} className="text-emerald-500" />
                <span>مضافة لمهامك</span>
              </>
            ) : (
              <>
                <Plus size={14} />
                <span>إضافة لمهام الجمعة</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*                         HERO + TREASURES                      */
/* ============================================================ */

function MentorHero() {
  const qc = useQueryClient();
  const [seed, setSeed] = useState(0);
  const [managerOpen, setManagerOpen] = useState(false);
  const today = useMemo(() => todayUtcDate(), []);

  const getTreasuresFn = useServerFn(mentorGetTreasures);
  const pinTreasureFn = useServerFn(mentorPinTreasure);
  const unpinTreasureFn = useServerFn(mentorUnpinTreasure);
  const addTreasureFn = useServerFn(mentorAddTreasure);

  const { data: userTreasures = [] } = useQuery({
    queryKey: ["mentor_treasures_all"],
    queryFn: async () => {
      const res = await getTreasuresFn();
      return (res as MentorTreasureRow[]) ?? [];
    },
  });

  const pinned = userTreasures.find((t) => t.is_pinned_today && t.pinned_on === today);
  const curatedPearl = useMemo(() => getTodayCuratedPearl(), []);

  // Display item: pinned > cycled user treasure > today's curated pearl
  const displayItem = useMemo(() => {
    if (pinned) {
      return {
        id: pinned.id,
        title: pinned.title,
        body: pinned.body,
        source: pinned.source,
        isCurated: false,
        isPinned: true,
      };
    }
    if (userTreasures.length > 0) {
      const picked = userTreasures[Math.abs(seed) % userTreasures.length];
      return {
        id: picked.id,
        title: picked.title,
        body: picked.body,
        source: picked.source,
        isCurated: false,
        isPinned: false,
      };
    }
    return {
      id: "curated-today",
      title: curatedPearl.title,
      body: curatedPearl.text,
      source: curatedPearl.source,
      isCurated: true,
      isPinned: false,
    };
  }, [pinned, userTreasures, seed, curatedPearl]);

  async function handlePin(id: string) {
    try {
      await pinTreasureFn({ data: { id, today } });
      toast.success("تم تثبيت الكنز لليوم ✨");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر التثبيت");
    }
  }

  async function handleUnpin(id: string) {
    try {
      await unpinTreasureFn({ data: { id } });
      toast.success("تم إلغاء التثبيت");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر إلغاء التثبيت");
    }
  }

  async function handleBookmarkPearl() {
    try {
      await addTreasureFn({
        data: {
          title: curatedPearl.title,
          body: curatedPearl.text,
          source: curatedPearl.source,
          tags: ["مأثورات", curatedPearl.category],
        },
      });
      toast.success("تم حفظ الكنز في كنوزك الخاصة ⭐");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر الحفظ");
    }
  }

  function handleCopy() {
    if (!displayItem) return;
    navigator.clipboard.writeText(displayItem.body);
    toast.success("تم نسخ النص بنجاح");
  }

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-primary/20 px-5 py-7 md:px-10 md:py-10 shadow-sm"
      style={{
        background:
          "radial-gradient(1000px 350px at 50% -10%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 65%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 6%, var(--card)), var(--card))",
      }}
    >
      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <MoonStar size={18} />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-primary font-bold">
                {displayItem.isPinned
                  ? "كنزك المثبّت لليوم 📌"
                  : displayItem.isCurated
                  ? "حكمة وحديث اليوم 🌟"
                  : "من كنوزك المختارة 💎"}
              </span>
              {displayItem.title && (
                <h3 className="text-sm md:text-base font-bold text-foreground">
                  {displayItem.title}
                </h3>
              )}
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setManagerOpen(true)}
            className="rounded-xl border-primary/20 hover:border-primary/40 hover:bg-primary/5 gap-1.5"
          >
            <Gem size={14} className="text-primary" />
            <span className="hidden sm:inline">إدارة كنوزي</span>
            <span className="sm:hidden">كنوزي</span>
          </Button>
        </div>

        <div className="text-center max-w-3xl mx-auto py-2 md:py-4">
          <p className="text-xl sm:text-2xl md:text-3xl leading-[2.1] sm:leading-[2.2] md:leading-[2.4] font-medium text-foreground whitespace-pre-wrap font-sans">
            {displayItem.body}
          </p>

          {displayItem.source && (
            <div className="mt-4 text-xs sm:text-sm text-muted-foreground font-medium">
              — {displayItem.source}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {userTreasures.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSeed((s) => s + 1)}
                className="rounded-xl text-xs gap-1.5"
              >
                <RefreshCw size={14} />
                <span>كنز آخر</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="rounded-xl text-xs gap-1.5"
            >
              <Copy size={14} />
              <span>نسخ</span>
            </Button>

            {displayItem.isCurated ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBookmarkPearl}
                className="rounded-xl text-xs gap-1.5 text-primary hover:bg-primary/10"
              >
                <Bookmark size={14} />
                <span>حفظ في كنوزي</span>
              </Button>
            ) : displayItem.isPinned ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUnpin(displayItem.id)}
                className="rounded-xl text-xs gap-1.5 text-destructive hover:bg-destructive/10"
              >
                <X size={14} />
                <span>إلغاء التثبيت</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handlePin(displayItem.id)}
                className="rounded-xl text-xs gap-1.5 text-primary hover:bg-primary/10"
              >
                <Pin size={14} />
                <span>تثبيت لليوم</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {managerOpen && <TreasuresManagerDialog onClose={() => setManagerOpen(false)} />}
    </section>
  );
}

/* ============================================================ */
/*                          STATS STRIP                          */
/* ============================================================ */

function StatsStrip() {
  const today = todayUtcDate();
  const getOverviewStatsFn = useServerFn(mentorGetOverviewStats);

  const { data } = useQuery({
    queryKey: ["mentor_overview_stats"],
    queryFn: async () => {
      return await getOverviewStatsFn();
    },
  });

  const tasks = (data?.tasks ?? []) as MentorTaskRow[];
  const completions = data?.completions ?? [];
  const duasCount = data?.entriesTotal ?? 0;
  const treasuresCount = data?.treasuresTotal ?? 0;

  // Streak: consecutive full days
  const streak = useMemo(() => {
    const dailyIds = tasks.filter((t) => t.is_daily).map((t) => t.id);
    if (dailyIds.length === 0) return 0;
    const byDate = new Map<string, Set<string>>();
    for (const c of completions) {
      if (!dailyIds.includes(c.task_id)) continue;
      if (!byDate.has(c.completed_on)) byDate.set(c.completed_on, new Set());
      byDate.get(c.completed_on)!.add(c.task_id);
    }
    const fullDays = new Set<string>();
    for (const [dateStr, set] of byDate) {
      if (dailyIds.every((id) => set.has(id))) fullDays.add(dateStr);
    }
    let count = 0;
    const d = new Date();
    if (!fullDays.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
    while (fullDays.has(d.toISOString().slice(0, 10))) {
      count++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return count;
  }, [tasks, completions]);

  // Today's daily tasks progress
  const todayProgress = useMemo(() => {
    const dailyTasks = tasks.filter((t) => t.is_daily);
    if (dailyTasks.length === 0) return { done: 0, total: 0, pct: 0 };
    const doneToday = new Set(
      completions.filter((c) => c.completed_on === today).map((c) => c.task_id)
    );
    const done = dailyTasks.filter((t) => doneToday.has(t.id)).length;
    return {
      done,
      total: dailyTasks.length,
      pct: Math.round((done / dailyTasks.length) * 100),
    };
  }, [tasks, completions, today]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatChip
        icon={<Flame size={18} />}
        label="سلسلة الالتزام"
        value={`${streak} يوم`}
        accent={streak >= 3}
      />
      <ProgressChip
        label="مهام اليوم"
        done={todayProgress.done}
        total={todayProgress.total}
        pct={todayProgress.pct}
      />
      <StatChip
        icon={<BookOpen size={18} />}
        label="أدعيتي المسجلة"
        value={String(duasCount)}
      />
      <StatChip
        icon={<Gem size={18} />}
        label="كنوزي المحفوظة"
        value={String(treasuresCount)}
      />
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 flex items-center gap-3 transition-all ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-card shadow-xs"
      }`}
    >
      <div
        className={`p-2 rounded-xl shrink-0 ${
          accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </div>
        <div className="text-base sm:text-lg font-extrabold truncate text-foreground">{value}</div>
      </div>
    </div>
  );
}

function ProgressChip({
  label,
  done,
  total,
  pct,
}: {
  label: string;
  done: number;
  total: number;
  pct: number;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c - (c * pct) / 100;
  const isFull = pct === 100 && total > 0;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5 flex items-center gap-3 shadow-xs">
      <div className="relative shrink-0 flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="3.5" />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={isFull ? "#10b981" : "var(--primary)"}
            strokeWidth="3.5"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div className="absolute text-[10px] font-bold text-foreground">{pct}%</div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </div>
        <div className="text-base sm:text-lg font-extrabold text-foreground">
          {done}/{total || 0}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*            TAB 1: ATHKAR & TREASURES (SUGGESTED + CUSTOM)     */
/* ============================================================ */

function AthkarAndTreasuresSection({ onOpenSurahKahf }: { onOpenSurahKahf?: () => void }) {
  const isFriday = useMemo(() => new Date().getDay() === 5, []);
  const [subTab, setSubTab] = useState<"suggested_athkar" | "my_treasures">("suggested_athkar");
  const [activeGroupId, setActiveGroupId] = useState<AthkarGroup["id"]>(() =>
    isFriday ? "friday" : "morning"
  );

  const today = useMemo(() => todayUtcDate(), []);
  const [progress, setProgress] = useState<Record<string, number>>(() => loadAthkarProgress(today));

  // Keep progress synced with localStorage
  const updateCount = useCallback(
    (itemId: string, maxCount: number) => {
      setProgress((prev) => {
        const current = prev[itemId] || 0;
        const next = current >= maxCount ? maxCount : current + 1;
        const updated = { ...prev, [itemId]: next };
        saveAthkarProgress(today, updated);
        return updated;
      });
    },
    [today]
  );

  const resetItem = useCallback(
    (itemId: string) => {
      setProgress((prev) => {
        const updated = { ...prev, [itemId]: 0 };
        saveAthkarProgress(today, updated);
        return updated;
      });
    },
    [today]
  );

  const resetGroup = useCallback(
    (items: AthkarItem[]) => {
      setProgress((prev) => {
        const updated = { ...prev };
        for (const it of items) {
          updated[it.id] = 0;
        }
        saveAthkarProgress(today, updated);
        return updated;
      });
      toast.success("تمت إعادة تصفير عداد الأذكار لهذه المجموعة");
    },
    [today]
  );

  const currentGroup = useMemo(() => {
    return (
      SUGGESTED_ATHKAR_GROUPS.find((g) => g.id === activeGroupId) ||
      SUGGESTED_ATHKAR_GROUPS[0]
    );
  }, [activeGroupId]);

  const groupProgress = useMemo(() => {
    const items = currentGroup.items;
    const completedCount = items.filter((it) => (progress[it.id] || 0) >= it.count).length;
    return {
      completed: completedCount,
      total: items.length,
      pct: Math.round((completedCount / items.length) * 100),
    };
  }, [currentGroup, progress]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("suggested_athkar")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              subTab === "suggested_athkar"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            الأذكار اليومية المأثورة
          </button>
          <button
            type="button"
            onClick={() => setSubTab("my_treasures")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              subTab === "my_treasures"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            كنوزي الخاصة
          </button>
        </div>
      </div>

      {subTab === "suggested_athkar" ? (
        <div className="space-y-6">
          {/* Athkar Groups Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {SUGGESTED_ATHKAR_GROUPS.map((grp) => {
              const active = grp.id === activeGroupId;
              const grpCompleted = grp.items.filter(
                (it) => (progress[it.id] || 0) >= it.count
              ).length;
              const allDone = grpCompleted === grp.items.length;

              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => setActiveGroupId(grp.id)}
                  className={`flex flex-col items-center text-center p-3.5 rounded-2xl border transition-all text-xs sm:text-sm font-bold ${
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {grp.id === "morning" && <Sun size={17} className={active ? "text-amber-500" : ""} />}
                    {grp.id === "evening" && <Moon size={17} className={active ? "text-indigo-400" : ""} />}
                    {grp.id === "post_prayer" && <CheckCircle2 size={17} className={active ? "text-emerald-500" : ""} />}
                    {grp.id === "sleep" && <BedDouble size={17} className={active ? "text-purple-400" : ""} />}
                    {grp.id === "friday" && <Sparkles size={17} className={active ? "text-amber-500" : "text-amber-400"} />}
                    <span>{grp.title}</span>
                  </div>
                  <span className="text-[11px] font-normal opacity-80">
                    {grp.id === "friday" && isFriday && (
                      <span className="text-amber-600 dark:text-amber-400 font-bold block mb-0.5">
                        سُنّة اليوم 🌟
                      </span>
                    )}
                    {allDone ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        مكتملة ✓
                      </span>
                    ) : (
                      `${grpCompleted} / ${grp.items.length} منجز`
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Group Header info and Reset */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border">
            <div>
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <span>{currentGroup.title}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                  {groupProgress.completed} من {groupProgress.total} تم إتمامها
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{currentGroup.description}</p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => resetGroup(currentGroup.items)}
              className="self-start sm:self-auto text-xs rounded-xl gap-1.5 border-border hover:bg-muted"
            >
              <RotateCcw size={13} />
              <span>تصفير العداد</span>
            </Button>
          </div>

          {/* Athkar Items Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentGroup.items.map((item) => {
              const currentCount = progress[item.id] || 0;
              const isCompleted = currentCount >= item.count;

              return (
                <AthkarCard
                  key={item.id}
                  item={item}
                  currentCount={currentCount}
                  isCompleted={isCompleted}
                  onCount={() => updateCount(item.id, item.count)}
                  onReset={() => resetItem(item.id)}
                  onOpenSurahKahf={onOpenSurahKahf}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <MyTreasuresList />
      )}
    </div>
  );
}

function AthkarCard({
  item,
  currentCount,
  isCompleted,
  onCount,
  onReset,
  onOpenSurahKahf,
}: {
  item: AthkarItem;
  currentCount: number;
  isCompleted: boolean;
  onCount: () => void;
  onReset: () => void;
  onOpenSurahKahf?: () => void;
}) {
  const qc = useQueryClient();
  const addTreasureFn = useServerFn(mentorAddTreasure);

  async function handleBookmark() {
    try {
      await addTreasureFn({
        data: {
          title: item.title,
          body: item.text,
          source: item.virtue || "أذكار مأثورة",
          tags: ["أذكار", "مقترح"],
        },
      });
      toast.success("تمت إضافة الذكر إلى كنوزك الخاصة ⭐");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر الحفظ");
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(item.text);
    toast.success("تم نسخ الذكر بنجاح");
  }

  return (
    <article
      className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
        isCompleted
          ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold text-base text-foreground">{item.title}</h4>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
              isCompleted
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {item.count > 1 ? `${item.count} مرات` : "مرة واحدة"}
          </span>
        </div>

        <p className="text-base sm:text-lg leading-[2.1] text-foreground font-sans whitespace-pre-wrap">
          {item.text}
        </p>

        {item.virtue && (
          <div className="text-xs leading-relaxed text-muted-foreground bg-muted/50 p-2.5 rounded-xl border border-border/60">
            <span className="font-bold text-primary ms-1">الفضل:</span>
            {item.virtue}
          </div>
        )}
      </div>

      {/* Counter & Action Bar */}
      <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3 mt-auto">
        <div className="flex items-center gap-1 flex-wrap">
          {item.id === "f-1" && onOpenSurahKahf && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenSurahKahf}
              className="rounded-xl h-9 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10 font-bold"
            >
              <BookOpen size={14} />
              <span>قراءة السورة 📖</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleBookmark}
            title="حفظ في كنوزي"
            className="rounded-xl h-9 text-xs gap-1 text-muted-foreground hover:text-primary"
          >
            <Bookmark size={14} />
            <span className="hidden sm:inline">حفظ في كنوزي</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            title="نسخ"
            className="rounded-xl h-9 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <Copy size={14} />
            <span className="hidden sm:inline">نسخ</span>
          </Button>

          {currentCount > 0 && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onReset}
              title="تصفير هذا الذكر"
              className="rounded-xl h-9 w-9 text-muted-foreground hover:text-destructive"
            >
              <RotateCcw size={13} />
            </Button>
          )}
        </div>

        {/* Big Interactive Clicker Button */}
        <button
          type="button"
          onClick={onCount}
          disabled={isCompleted}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold transition-transform active:scale-95 ${
            isCompleted
              ? "bg-emerald-600 text-white cursor-default shadow-xs"
              : "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
          }`}
        >
          {isCompleted ? (
            <>
              <Check size={16} />
              <span>تم الإتمام!</span>
            </>
          ) : (
            <>
              <span>{currentCount}</span>
              <span className="opacity-70">/ {item.count}</span>
              <span className="text-xs bg-primary-foreground/20 px-1.5 py-0.5 rounded-md ms-1">
                اضغط
              </span>
            </>
          )}
        </button>
      </div>
    </article>
  );
}

function MyTreasuresList() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<MentorTreasureRow | null>(null);
  const [search, setSearch] = useState("");
  const today = useMemo(() => todayUtcDate(), []);

  const getTreasuresFn = useServerFn(mentorGetTreasures);
  const deleteTreasureFn = useServerFn(mentorDeleteTreasure);
  const pinTreasureFn = useServerFn(mentorPinTreasure);
  const unpinTreasureFn = useServerFn(mentorUnpinTreasure);

  const { data: treasures = [], isLoading } = useQuery({
    queryKey: ["mentor_treasures_all"],
    queryFn: async () => {
      const res = await getTreasuresFn();
      return (res as MentorTreasureRow[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return treasures;
    return treasures.filter(
      (t) =>
        t.body.toLowerCase().includes(q) ||
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.source && t.source.toLowerCase().includes(q))
    );
  }, [treasures, search]);

  async function handleDelete(t: MentorTreasureRow) {
    if (!confirm(`حذف هذا الكنز؟`)) return;
    try {
      await deleteTreasureFn({ data: { id: t.id } });
      toast.success("تم حذف الكنز");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر الحذف");
    }
  }

  async function handlePinToggle(t: MentorTreasureRow) {
    try {
      if (t.is_pinned_today) {
        await unpinTreasureFn({ data: { id: t.id } });
        toast.success("تم إلغاء التثبيت");
      } else {
        await pinTreasureFn({ data: { id: t.id, today } });
        toast.success("تم تثبيت هذا الكنز في أعلى الصفحة لليوم ✨");
      }
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
    } catch (err: any) {
      toast.error(err?.message || "فشلت العملية");
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ بنجاح");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث في كنوزي الشخصية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pe-9 rounded-xl"
          />
        </div>

        <Button onClick={() => setAddOpen(true)} className="rounded-xl gap-1.5 self-start sm:self-auto">
          <Plus size={16} />
          <span>إضافة كنز جديد</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border p-6 space-y-3">
          <Gem size={32} className="mx-auto text-primary opacity-60" />
          <h4 className="font-bold text-base">لا توجد كنوز محفوظة حتى الآن</h4>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            أضف أدعيتك المفضلة، أو احفظ الأذكار والأحاديث المقترحة لتظهر لك في ركنك الخاص وترافق يومك.
          </p>
          <Button onClick={() => setAddOpen(true)} className="rounded-xl mt-2">
            <Plus size={16} className="ms-1" />
            أضف كنزك الأول
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <article
              key={t.id}
              className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between gap-3 hover:border-primary/30 transition-all shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {t.title ? (
                    <h4 className="font-bold text-base text-primary">{t.title}</h4>
                  ) : (
                    <span className="text-xs text-muted-foreground">كنز مبارك</span>
                  )}
                  {t.is_pinned_today && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold inline-flex items-center gap-1">
                      <Pin size={10} />
                      <span>مثبّت لليوم</span>
                    </span>
                  )}
                </div>

                <p className="text-base sm:text-lg leading-[2.1] text-foreground font-sans whitespace-pre-wrap">
                  {t.body}
                </p>

                {t.source && (
                  <div className="text-xs text-muted-foreground font-medium">— {t.source}</div>
                )}

                {t.tags && t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {t.tags.map((tg) => (
                      <span
                        key={tg}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
                      >
                        #{tg}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/70 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePinToggle(t)}
                  className={`rounded-xl text-xs gap-1 ${
                    t.is_pinned_today ? "text-primary font-bold" : "text-muted-foreground"
                  }`}
                >
                  <Pin size={13} />
                  <span>{t.is_pinned_today ? "إلغاء التثبيت" : "تثبيت لليوم"}</span>
                </Button>

                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopy(t.body)}
                    title="نسخ"
                    className="rounded-xl h-8 w-8"
                  >
                    <Copy size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(t)}
                    title="تعديل"
                    className="rounded-xl h-8 w-8"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(t)}
                    title="حذف"
                    className="rounded-xl h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Add or Edit Treasure Dialog */}
      <TreasureEditDialog
        open={addOpen || !!editing}
        editing={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function TreasureEditDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: MentorTreasureRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const addTreasureFn = useServerFn(mentorAddTreasure);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title || "");
      setBody(editing.body || "");
      setSource(editing.source || "");
    } else {
      setTitle("");
      setBody("");
      setSource("");
    }
  }, [editing, open]);

  async function handleSave() {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error("يرجى كتابة نص الكنز");
      return;
    }

    setIsSaving(true);
    try {
      if (editing) {
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase
          .from("mentor_treasures")
          .update({
            title: title.trim() || null,
            body: trimmedBody,
            source: source.trim() || null,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("تم تحديث الكنز بنجاح");
      } else {
        await addTreasureFn({
          data: {
            title: title.trim() || null,
            body: trimmedBody,
            source: source.trim() || null,
            tags: ["كنوزي"],
          },
        });
        toast.success("تمت إضافة الكنز بنجاح ⭐");
      }

      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "فشلت عملية الحفظ");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-xl w-[95vw] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gem size={18} className="text-primary" />
            <span>{editing ? "تعديل الكنز" : "إضافة كنز جديد"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              عنوان الكنز (اختياري)
            </label>
            <Input
              placeholder="مثلاً: دعاء تفريج الهم، آية عظيمة..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              نص الكنز أو الذكر <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="اكتب هنا النص الكريم أو الدعاء..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="rounded-xl text-base leading-loose"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              المصدر أو الراوي (اختياري)
            </label>
            <Input
              placeholder="مثلاً: صحيح مسلم، سورة الأنبياء، إحياء علوم الدين..."
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving} className="rounded-xl">
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !body.trim()} className="rounded-xl">
            {isSaving ? "جارٍ الحفظ..." : "حفظ الكنز"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TreasuresManagerDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col rounded-3xl p-6"
      >
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Gem size={20} className="text-primary" />
            <span>إدارة كنوزي المختارة</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <MyTreasuresList />
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/*            TAB 2: DUAS (SUGGESTED + PERSONAL CATEGORIES)     */
/* ============================================================ */

function DuasSection() {
  const [duaTab, setDuaTab] = useState<"suggested" | "personal">("suggested");
  const [selectedCategory, setSelectedCategory] = useState<string>("exams");
  const [searchDua, setSearchDua] = useState("");

  const duaCategories = [
    { id: "exams", label: "🎓 الامتحانات والمذاكرة" },
    { id: "travel", label: "✈️ السفر والتنقل" },
    { id: "relief", label: "🤲 تفريج الكرب والهم" },
    { id: "sustenance", label: "🌿 الرزق والبركة" },
    { id: "healing", label: "🩺 الشفاء والعافية" },
    { id: "parents", label: "👨‍👩‍👧 بر الوالدين والأهل" },
    { id: "quranic", label: "📖 جوامع القرآن الكريم" },
  ];

  const filteredSuggestedDuas = useMemo(() => {
    let list = SUGGESTED_DUAS;
    if (selectedCategory !== "all") {
      list = list.filter((d) => d.categoryId === selectedCategory);
    }
    const q = searchDua.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.text.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          (d.source && d.source.toLowerCase().includes(q))
      );
    }
    return list;
  }, [selectedCategory, searchDua]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDuaTab("suggested")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              duaTab === "suggested"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            أدعية مقترحة ومأثورة
          </button>
          <button
            type="button"
            onClick={() => setDuaTab("personal")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              duaTab === "personal"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            أدعيتي الخاصة
          </button>
        </div>
      </div>

      {duaTab === "suggested" ? (
        <div className="space-y-6">
          {/* Category Pills & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-all ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                جميع الأدعية
              </button>
              {duaCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-all ${
                    selectedCategory === c.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64 shrink-0">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث في الأدعية..."
                value={searchDua}
                onChange={(e) => setSearchDua(e.target.value)}
                className="pe-8 h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Duas Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSuggestedDuas.map((dua) => (
              <SuggestedDuaCard key={dua.id} dua={dua} />
            ))}
          </div>
        </div>
      ) : (
        <PersonalDuasManager />
      )}
    </div>
  );
}

function SuggestedDuaCard({ dua }: { dua: SuggestedDua }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const saveSuggestedDuaFn = useServerFn(mentorSaveSuggestedDua);
  const addTreasureFn = useServerFn(mentorAddTreasure);

  async function handleSaveToMyDuas() {
    try {
      await saveSuggestedDuaFn({
        data: {
          title: dua.title,
          body: dua.text,
          categoryTitle: dua.categoryTitle,
        },
      });
      setSaved(true);
      toast.success("تم حفظ الدعاء في قائمة أدعيتك الشخصية 🤲");
      await qc.invalidateQueries({ queryKey: ["mentor_categories"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر حفظ الدعاء");
    }
  }

  async function handleSaveToTreasures() {
    try {
      await addTreasureFn({
        data: {
          title: dua.title,
          body: dua.text,
          source: dua.source || "أدعية مختارة",
          tags: ["أدعية", dua.categoryTitle],
        },
      });
      toast.success("تمت إضافة الدعاء إلى كنوزك ⭐");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر حفظ الكنز");
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(dua.text);
    toast.success("تم نسخ نص الدعاء");
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between gap-4 hover:border-primary/30 transition-all shadow-xs">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold text-base text-foreground">{dua.title}</h4>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
            {dua.categoryTitle}
          </span>
        </div>

        <p className="text-base sm:text-lg leading-[2.1] text-foreground font-sans whitespace-pre-wrap">
          {dua.text}
        </p>

        {dua.source && (
          <div className="text-xs text-muted-foreground font-medium">— {dua.source}</div>
        )}

        {dua.virtue && (
          <div className="text-xs leading-relaxed text-muted-foreground bg-muted/50 p-2.5 rounded-xl border border-border/60">
            <span className="font-bold text-primary ms-1">الفضل:</span>
            {dua.virtue}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="rounded-xl text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <Copy size={14} />
            <span>نسخ</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleSaveToTreasures}
            className="rounded-xl text-xs gap-1 text-muted-foreground hover:text-primary"
          >
            <Gem size={14} />
            <span className="hidden sm:inline">إلى كنوزي</span>
          </Button>
        </div>

        <Button
          size="sm"
          variant={saved ? "outline" : "default"}
          onClick={handleSaveToMyDuas}
          className="rounded-xl text-xs gap-1.5"
        >
          {saved ? (
            <>
              <Check size={14} className="text-emerald-500" />
              <span>محفوظ في أدعيتك</span>
            </>
          ) : (
            <>
              <Bookmark size={14} />
              <span>حفظ في أدعيتي</span>
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

function PersonalDuasManager() {
  const qc = useQueryClient();
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [openCategory, setOpenCategory] = useState<MentorCategoryWithEntries | null>(null);

  const getCatsFn = useServerFn(mentorGetCategoriesWithEntries);
  const addCatFn = useServerFn(mentorAddCategory);
  const deleteCatFn = useServerFn(mentorDeleteCategory);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["mentor_categories"],
    queryFn: async () => {
      const res = await getCatsFn();
      return (res as MentorCategoryWithEntries[]) ?? [];
    },
  });

  async function handleAddCategory() {
    const t = newCatTitle.trim();
    if (!t) return;
    try {
      await addCatFn({ data: { title: t } });
      setNewCatTitle("");
      setAddCatOpen(false);
      toast.success("تمت إضافة الفئة بنجاح");
      await qc.invalidateQueries({ queryKey: ["mentor_categories"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر إضافة الفئة");
    }
  }

  async function handleDeleteCategory(cat: MentorCategoryWithEntries) {
    if (!confirm(`هل تريد حذف فئة "${cat.title}" وجميع الأدعية بداخلها؟`)) return;
    try {
      await deleteCatFn({ data: { id: cat.id } });
      toast.success("تم حذف الفئة");
      await qc.invalidateQueries({ queryKey: ["mentor_categories"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر حذف الفئة");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground">
          قسّم أدعيتك الشخصية إلى فئات خاصة بك وافتح أي فئة لإضافة أو تصفح أدعيتها.
        </p>

        <Button onClick={() => setAddCatOpen(true)} className="rounded-xl gap-1.5 shrink-0">
          <Plus size={16} />
          <span>فئة جديدة</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">جارٍ التحميل...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border p-6 space-y-3">
          <BookOpen size={32} className="mx-auto text-primary opacity-60" />
          <h4 className="font-bold text-base">لا توجد فئات أدعية شخصية بعد</h4>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            أنشئ فئات خاصة بك مثل "دعاء لي ولوالدي"، "دعاء التخرج والوظيفة"، أو احفظ من الأدعية المقترحة.
          </p>
          <Button onClick={() => setAddCatOpen(true)} className="rounded-xl mt-2">
            <Plus size={16} className="ms-1" />
            أنشئ أول فئة
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="group rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                    {cat.title}
                  </h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                    {cat.entries.length} أدعية
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenCategory(cat)}
                  className="rounded-xl text-xs gap-1"
                >
                  <span>تصفح الأدعية</span>
                  <ChevronLeft size={14} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDeleteCategory(cat)}
                  title="حذف الفئة"
                  className="rounded-xl h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Category Dialog */}
      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent dir="rtl" className="max-w-md w-[95vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle>إنشاء فئة أدعية جديدة</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="مثلاً: أدعية الشفاء، أدعية للوالدين..."
              value={newCatTitle}
              onChange={(e) => setNewCatTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
              autoFocus
              className="rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAddCatOpen(false)} className="rounded-xl">
              إلغاء
            </Button>
            <Button onClick={handleAddCategory} disabled={!newCatTitle.trim()} className="rounded-xl">
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entries Modal for Category */}
      {openCategory && (
        <CategoryEntriesModal
          category={openCategory}
          onClose={() => {
            setOpenCategory(null);
            qc.invalidateQueries({ queryKey: ["mentor_categories"] });
          }}
        />
      )}
    </div>
  );
}

function CategoryEntriesModal({
  category,
  onClose,
}: {
  category: MentorCategoryWithEntries;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [addMode, setAddMode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const addEntryFn = useServerFn(mentorAddEntry);
  const deleteEntryFn = useServerFn(mentorDeleteEntry);
  const addTreasureFn = useServerFn(mentorAddTreasure);

  const entries = category.entries || [];

  async function handleAddEntry() {
    const b = newBody.trim();
    if (!b) {
      toast.error("يرجى كتابة نص الدعاء");
      return;
    }
    setIsSaving(true);
    try {
      await addEntryFn({
        data: {
          categoryId: category.id,
          title: newTitle.trim() || undefined,
          body: b,
        },
      });
      setNewTitle("");
      setNewBody("");
      setAddMode(false);
      toast.success("تمت إضافة الدعاء بنجاح 🤲");
      await qc.invalidateQueries({ queryKey: ["mentor_categories"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر حفظ الدعاء");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm("حذف هذا الدعاء؟")) return;
    try {
      await deleteEntryFn({ data: { id } });
      toast.success("تم حذف الدعاء");
      await qc.invalidateQueries({ queryKey: ["mentor_categories"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر الحذف");
    }
  }

  async function handleSaveToTreasures(title: string | null, body: string) {
    try {
      await addTreasureFn({
        data: {
          title: title || "دعاء مختار",
          body,
          tags: ["أدعية", category.title],
        },
      });
      toast.success("تمت إضافة الدعاء إلى كنوزك ⭐");
      await qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر الحفظ");
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("تم نسخ الدعاء");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col rounded-3xl p-6"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BookOpen size={18} className="text-primary" />
            <span>{category.title}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
              {entries.length} عناصر
            </span>
          </DialogTitle>

          {!addMode && (
            <Button size="sm" onClick={() => setAddMode(true)} className="rounded-xl gap-1 text-xs">
              <Plus size={14} />
              <span>إضافة دعاء</span>
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {addMode && (
            <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-3">
              <h5 className="font-bold text-sm text-primary">دعاء جديد في هذه الفئة</h5>
              <Input
                placeholder="عنوان الدعاء (اختياري)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="rounded-xl bg-background"
              />
              <Textarea
                placeholder="نص الدعاء المبارك..."
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={5}
                className="rounded-xl text-base leading-loose bg-background"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddMode(false)}
                  disabled={isSaving}
                  className="rounded-xl"
                >
                  إلغاء
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddEntry}
                  disabled={isSaving || !newBody.trim()}
                  className="rounded-xl"
                >
                  {isSaving ? "جارٍ الحفظ..." : "حفظ الدعاء"}
                </Button>
              </div>
            </div>
          )}

          {entries.length === 0 && !addMode ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              لا توجد أدعية مسجلة في هذه الفئة بعد. اضغط "إضافة دعاء" لكتابة دعائك.
            </div>
          ) : (
            entries.map((entry) => (
              <article
                key={entry.id}
                className="p-4 rounded-2xl border border-border bg-card space-y-2 hover:border-primary/30 transition-all shadow-xs"
              >
                {entry.title && (
                  <h4 className="font-bold text-base text-primary">{entry.title}</h4>
                )}
                <p className="text-base sm:text-lg leading-[2.1] text-foreground font-sans whitespace-pre-wrap">
                  {entry.body}
                </p>

                <div className="flex items-center justify-between border-t border-border/70 pt-2.5 mt-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(entry.body)}
                      className="rounded-xl h-8 text-xs gap-1"
                    >
                      <Copy size={13} />
                      <span>نسخ</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSaveToTreasures(entry.title, entry.body)}
                      className="rounded-xl h-8 text-xs gap-1"
                    >
                      <Gem size={13} />
                      <span>كنز</span>
                    </Button>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="rounded-xl h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/*            TAB 3: TASKS (MODERNIZED CHECKLIST & HABITS)       */
/* ============================================================ */

function TasksSection({ onOpenSurahKahf }: { onOpenSurahKahf?: () => void }) {
  const qc = useQueryClient();
  const today = useMemo(() => todayUtcDate(), []);
  const isFriday = useMemo(() => new Date().getDay() === 5, []);

  const [newTitle, setNewTitle] = useState("");
  const [newIsDaily, setNewIsDaily] = useState(true);
  const [filterMode, setFilterMode] = useState<"all" | "pending" | "done">("all");
  const [isAdding, setIsAdding] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Edit dialog state
  const [editingTask, setEditingTask] = useState<MentorTaskRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIsDaily, setEditIsDaily] = useState(true);
  const [isEditingSaving, setIsEditingSaving] = useState(false);

  const getTasksFn = useServerFn(mentorGetTasks);
  const addTaskFn = useServerFn(mentorAddTask);
  const updateTaskFn = useServerFn(mentorUpdateTask);
  const deleteTaskFn = useServerFn(mentorDeleteTask);
  const toggleTaskFn = useServerFn(mentorToggleTask);
  const getCompletionsFn = useServerFn(mentorGetCompletions);
  const seedDefaultTasksFn = useServerFn(mentorSeedDefaultTasks);

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["mentor_tasks"],
    queryFn: async () => {
      const res = await getTasksFn({ data: { kind: "religious" } });
      return (res as MentorTaskRow[]) ?? [];
    },
  });

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const { data: completions = [] } = useQuery({
    queryKey: ["mentor_completions", today, taskIds.join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return [];
      const res = await getCompletionsFn({ data: { taskIds } });
      return (res as { task_id: string; completed_on: string }[]) ?? [];
    },
    enabled: taskIds.length > 0,
  });

  const doneSet = useMemo(() => {
    const s = new Set<string>();
    const byTask = new Map(tasks.map((t) => [t.id, t]));
    for (const c of completions) {
      const t = byTask.get(c.task_id);
      if (!t) continue;
      if (t.is_daily) {
        if (c.completed_on === today) s.add(c.task_id);
      } else {
        s.add(c.task_id);
      }
    }
    return s;
  }, [completions, tasks, today]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (filterMode === "pending") return tasks.filter((t) => !doneSet.has(t.id));
    if (filterMode === "done") return tasks.filter((t) => doneSet.has(t.id));
    return tasks;
  }, [tasks, doneSet, filterMode]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => doneSet.has(t.id)).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct };
  }, [tasks, doneSet]);

  async function handleQuickAdd() {
    const t = newTitle.trim();
    if (!t) {
      toast.error("يرجى إدخال عنوان المهمة");
      return;
    }
    setIsAdding(true);
    try {
      await addTaskFn({
        data: {
          kind: "religious",
          title: t,
          is_daily: newIsDaily,
        },
      });
      setNewTitle("");
      toast.success("تمت إضافة المهمة بنجاح");
      await qc.invalidateQueries({ queryKey: ["mentor_tasks"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر إضافة المهمة");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleSeedDefaults() {
    setIsSeeding(true);
    try {
      await seedDefaultTasksFn({});
      toast.success(`تمت إضافة المهام المقترحة المباركة بنجاح! ✨`);
      await qc.invalidateQueries({ queryKey: ["mentor_tasks"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر إضافة المهام المقترحة");
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleToggle(task: MentorTaskRow) {
    try {
      await toggleTaskFn({
        data: {
          taskId: task.id,
          isDaily: task.is_daily,
          completedOn: today,
        },
      });
      await qc.invalidateQueries({ queryKey: ["mentor_completions"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر تحديث المهمة");
    }
  }

  async function handleDeleteTask(task: MentorTaskRow) {
    if (!confirm(`حذف مهمة "${task.title}"؟`)) return;
    try {
      await deleteTaskFn({ data: { id: task.id } });
      toast.success("تم حذف المهمة");
      await qc.invalidateQueries({ queryKey: ["mentor_tasks"] });
      await qc.invalidateQueries({ queryKey: ["mentor_completions"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر حذف المهمة");
    }
  }

  async function handleSaveEdit() {
    if (!editingTask) return;
    const t = editTitle.trim();
    if (!t) return;
    setIsEditingSaving(true);
    try {
      await updateTaskFn({
        data: {
          id: editingTask.id,
          title: t,
          is_daily: editIsDaily,
        },
      });
      setEditingTask(null);
      toast.success("تم تعديل المهمة بنجاح");
      await qc.invalidateQueries({ queryKey: ["mentor_tasks"] });
      await qc.invalidateQueries({ queryKey: ["mentor_overview_stats"] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر تعديل المهمة");
    } finally {
      setIsEditingSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress & Quick Actions Card */}
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ListChecks size={20} className="text-primary" />
              <span>قائمة المهام والواجبات اليومية</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              تنظيم يومك بين العبادات، طلب العلم، وبر الوالدين لتحقيق البركة المستمرة.
            </p>
          </div>

          {tasks.length < 5 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSeedDefaults}
              disabled={isSeeding}
              className="rounded-xl text-xs gap-1.5 border-primary/30 hover:bg-primary/10 self-start sm:self-auto"
            >
              <Sparkles size={14} className="text-primary" />
              <span>{isSeeding ? "جارٍ الإضافة..." : "إضافة المهام اليومية المقترحة"}</span>
            </Button>
          )}
        </div>

        {/* Friday Sunnah reminder banner */}
        {isFriday && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500 shrink-0" />
              <span className="font-bold text-foreground">
                سُنّة الجمعة: قراءة سورة الكهف والإكثار من الصلاة على النبي ﷺ
              </span>
            </div>
            {onOpenSurahKahf && (
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenSurahKahf}
                className="rounded-xl h-8 text-xs font-bold gap-1 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 self-start sm:self-auto shrink-0"
              >
                <BookOpen size={13} />
                <span>قراءة سورة الكهف الآن</span>
              </Button>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {tasks.length > 0 && (
          <div className="space-y-2 bg-muted/40 p-4 rounded-2xl border border-border/60">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground">
                {stats.completed} من {stats.total} مهام مكتملة اليوم
              </span>
              <span className={stats.pct === 100 ? "text-emerald-500 font-extrabold" : "text-primary"}>
                {stats.pct}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  stats.pct === 100 ? "bg-emerald-500" : "bg-primary"
                }`}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Fast Add Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          <Input
            placeholder="إضافة مهمة جديدة بسرعة... (اضغط Enter للحفظ)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleQuickAdd();
              }
            }}
            disabled={isAdding}
            className="flex-1 rounded-xl h-11 text-sm"
          />

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-3 py-2 bg-muted/50 rounded-xl border border-border cursor-pointer select-none">
              <Checkbox
                checked={newIsDaily}
                onCheckedChange={(v) => setNewIsDaily(v === true)}
                className="rounded-md"
              />
              <span>يومية</span>
            </label>

            <Button
              onClick={handleQuickAdd}
              disabled={isAdding || !newTitle.trim()}
              className="rounded-xl h-11 px-5 font-bold gap-1 shrink-0"
            >
              <Plus size={16} />
              <span>إضافة</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              filterMode === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            الكل ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("pending")}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              filterMode === "pending"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            المتبقية ({tasks.length - stats.completed})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("done")}
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              filterMode === "done"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            المكتملة ({stats.completed})
          </button>
        </div>
      </div>

      {/* Task List */}
      {loadingTasks ? (
        <div className="text-center py-12 text-sm text-muted-foreground">جارٍ تحميل المهام...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border p-6 space-y-3">
          <ListChecks size={32} className="mx-auto text-primary opacity-60" />
          <h4 className="font-bold text-base">
            {filterMode === "done"
              ? "لم تكتمل أي مهمة بعد، بالتوفيق!"
              : filterMode === "pending"
              ? "رائع! لقد أتممت جميع مهامك الحالية 🎉"
              : "لا توجد مهام مسجلة"}
          </h4>
          {tasks.length === 0 && (
            <div className="pt-2">
              <Button onClick={handleSeedDefaults} className="rounded-xl">
                <Sparkles size={15} className="ms-1" />
                إضافة المهام اليومية المقترحة
              </Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filteredTasks.map((t) => {
            const isDone = doneSet.has(t.id);

            return (
              <li
                key={t.id}
                className={`group flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border transition-all ${
                  isDone
                    ? "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/15"
                    : "border-border bg-card hover:border-primary/40 hover:shadow-xs"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggle(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleToggle(t);
                    }
                  }}
                  className="flex items-center gap-3.5 flex-1 min-w-0 cursor-pointer select-none"
                >
                  <div
                    className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                      isDone
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/50 hover:border-primary"
                    }`}
                  >
                    {isDone && <Check size={14} className="stroke-[3]" />}
                  </div>

                  <span
                    className={`text-sm sm:text-base font-medium transition-all break-words ${
                      isDone
                        ? "line-through text-muted-foreground"
                        : "text-foreground font-semibold"
                    }`}
                  >
                    {t.title}
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      t.is_daily
                        ? "bg-primary/10 border-primary/20 text-primary"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {t.is_daily ? "يومي" : "مرة واحدة"}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingTask(t);
                      setEditTitle(t.title);
                      setEditIsDaily(t.is_daily);
                    }}
                    title="تعديل"
                    className="rounded-xl h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteTask(t)}
                    title="حذف"
                    className="rounded-xl h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(o) => !o && setEditingTask(null)}>
        <DialogContent dir="rtl" className="max-w-md w-[95vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle>تعديل المهمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveEdit();
                }
              }}
              autoFocus
              className="rounded-xl"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={editIsDaily}
                onCheckedChange={(v) => setEditIsDaily(v === true)}
                className="rounded-md"
              />
              <span>مهمة يومية متكررة</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setEditingTask(null)}
              disabled={isEditingSaving}
              className="rounded-xl"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isEditingSaving || !editTitle.trim()}
              className="rounded-xl"
            >
              {isEditingSaving ? "جارٍ الحفظ..." : "حفظ التعديل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
