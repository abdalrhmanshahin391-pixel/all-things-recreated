import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ListChecks,
  Gem,
  Flame,
  Sparkles,
  RefreshCw,
  Pin,
  Star,
  Sunrise,
  Moon,
  MoonStar,
  X,
  Copy,
  BookHeart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/mentor")({
  head: () => ({
    meta: [
      { title: "My Mentor — مرشدي" },
      { name: "description", content: "My Mentor: your personal duas, daily obligations and reflection journal." },
      { property: "og:title", content: "My Mentor — مرشدي" },
      { property: "og:description", content: "Personal duas, daily obligations and a reflection journal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MentorPage,
});

type Kind = "dua";
type TaskKind = "religious";
type Category = { id: string; kind: Kind; title: string; sort_order: number };
type Entry = {
  id: string;
  category_id: string;
  title: string | null;
  body: string;
  sort_order: number;
};
type Task = {
  id: string;
  kind: TaskKind;
  title: string;
  is_daily: boolean;
  sort_order: number;
};
type Treasure = {
  id: string;
  kind: Kind;
  title: string | null;
  body: string;
  source: string | null;
  tags: string[];
  is_pinned_today: boolean;
  pinned_on: string | null;
};
type Journal = {
  id?: string;
  entry_date: string;
  intention: string | null;
  did_well: string | null;
  fell_short: string | null;
  tomorrow: string | null;
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function MentorPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-8">
        <MentorHero />
        <StatsStrip />

        <section>
          <CategoriesPanel kind="dua" heading="الأدعية" icon={<BookOpen size={18} />} tone="dua" />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="text-primary" size={20} />
            <h2 className="text-xl font-semibold">قائمة المهام اليومية</h2>
          </div>
          <div className="grid gap-6">
            <ChecklistPanel kind="religious" heading="الواجبات الدينية" />
          </div>
        </section>

      </main>
    </div>
  );
}

/* ============================================================ */
/*                         HERO + TREASURES                      */
/* ============================================================ */

function formatDateAr(d: Date) {
  try {
    const g = d.toLocaleDateString("ar", {
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

function MentorHero() {
  const qc = useQueryClient();
  const [managerOpen, setManagerOpen] = useState(false);
  const [seed, setSeed] = useState(0);
  const now = useMemo(() => new Date(), []);
  const date = useMemo(() => formatDateAr(now), [now]);

  const { data: treasures = [] } = useQuery({
    queryKey: ["mentor_treasures_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_treasures")
        .select("id,kind,title,body,source,tags,is_pinned_today,pinned_on")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Treasure[]) ?? [];
    },
  });

  const today = todayUtcDate();
  const pinned = treasures.find((t) => t.is_pinned_today && t.pinned_on === today);
  const pool = treasures;

  const picked = useMemo(() => {
    if (pinned) return pinned;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length) % pool.length];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length, seed, pinned?.id]);

  async function unpin() {
    if (!pinned) return;
    const { error } = await supabase
      .from("mentor_treasures")
      .update({ is_pinned_today: false, pinned_on: null })
      .eq("id", pinned.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
  }

  async function pinToday(id: string) {
    // clear other pins, then pin this one
    await supabase
      .from("mentor_treasures")
      .update({ is_pinned_today: false, pinned_on: null })
      .eq("is_pinned_today", true);
    const { error } = await supabase
      .from("mentor_treasures")
      .update({ is_pinned_today: true, pinned_on: today })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
  }

  function copyBody() {
    if (!picked) return;
    navigator.clipboard.writeText(picked.body);
    toast.success("تم النسخ");
  }

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-primary/20 px-5 py-8 md:px-10 md:py-12 shadow-sm"
      style={{
        background:
          "radial-gradient(1200px 400px at 50% -10%, color-mix(in oklab, var(--primary) 20%, transparent), transparent 60%), linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, var(--card)), var(--card))",
      }}
    >
      {/* Subtle pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "22px 22px",
          color: "var(--primary)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <MoonStar size={20} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                My Mentor <span className="text-muted-foreground font-bold">· مرشدي</span>
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {date.g}
                {date.h ? ` · ${date.h}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setManagerOpen(true)}>
              <Gem size={15} className="ms-1" />
              كنوزي
            </Button>
          </div>
        </div>

        {picked ? (
          <div className="text-center max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles size={14} className="text-primary" />
              <span className="text-xs uppercase tracking-[0.25em] text-primary font-semibold">
                {pinned ? "كنز اليوم — مثبّت" : "كنزك اليوم"}
              </span>
            </div>
            {picked.title && (
              <div className="text-sm font-bold text-primary mb-3">{picked.title}</div>
            )}
            <p className="text-2xl md:text-4xl leading-[1.9] md:leading-[2.1] font-medium whitespace-pre-wrap">
              {picked.body}
            </p>

            {picked.source && (
              <div className="mt-4 text-sm text-muted-foreground">— {picked.source}</div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSeed((s) => s + 1)}>
                <RefreshCw size={14} className="ms-1" />
                كنز آخر
              </Button>
              <Button size="sm" variant="ghost" onClick={copyBody}>
                <Copy size={14} className="ms-1" />
                نسخ
              </Button>
              {pinned ? (
                <Button size="sm" variant="ghost" onClick={unpin}>
                  <X size={14} className="ms-1" />
                  إلغاء التثبيت
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => pinToday(picked.id)}>
                  <Pin size={14} className="ms-1" />
                  ثبّت لليوم
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center max-w-xl mx-auto py-6">
            <Gem size={28} className="mx-auto text-primary mb-3" />
            <h2 className="text-xl font-bold mb-2">ابدأ بناء كنوزك</h2>
            <p className="text-sm text-muted-foreground mb-5">
              أضف أدعيتك المختارة واقتباساتك العزيزة هنا. سيظهر منها واحد عشوائي
              فوق الصفحة كل يوم ليرافقك.
            </p>
            <Button onClick={() => setManagerOpen(true)}>
              <Plus size={16} className="ms-1" />
              أضف أول كنز
            </Button>
          </div>
        )}
      </div>

      {managerOpen && <TreasuresManager onClose={() => setManagerOpen(false)} />}
    </section>
  );
}

function TreasuresManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Kind>("dua");
  const [editing, setEditing] = useState<Treasure | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", source: "" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["mentor_treasures_manager", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_treasures")
        .select("id,kind,title,body,source,tags,is_pinned_today,pinned_on")
        .eq("kind", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Treasure[]) ?? [];
    },
  });

  function startAdd() {
    setAddMode(true);
    setEditing(null);
    setDraft({ title: "", body: "", source: "" });
  }
  function startEdit(t: Treasure) {
    setEditing(t);
    setAddMode(false);
    setDraft({ title: t.title ?? "", body: t.body, source: t.source ?? "" });
  }

  async function save() {
    const body = draft.body.trim();
    if (!body) return toast.error("الرجاء كتابة النص");
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    if (addMode) {
      const { error } = await supabase.from("mentor_treasures").insert({
        user_id: uid,
        kind: tab,
        title: draft.title.trim() || null,
        body,
        source: draft.source.trim() || null,
      });
      if (error) return toast.error(error.message);
    } else if (editing) {
      const { error } = await supabase
        .from("mentor_treasures")
        .update({
          title: draft.title.trim() || null,
          body,
          source: draft.source.trim() || null,
        })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
    }
    setAddMode(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["mentor_treasures_manager", tab] });
    qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
  }

  async function remove(t: Treasure) {
    if (!confirm("حذف هذا الكنز؟")) return;
    const { error } = await supabase.from("mentor_treasures").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mentor_treasures_manager", tab] });
    qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gem size={18} className="text-primary" />
            كنوزي — مجموعتي المختارة
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border pb-2">
          {(["dua"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors " +
                (tab === k
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground")
              }
            >
              {k === "dua" ? "أدعية مختارة" : ""}
            </button>
          ))}
          <div className="flex-1" />
          {!addMode && !editing && (
            <Button size="sm" onClick={startAdd}>
              <Plus size={15} className="ms-1" />
              إضافة كنز
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {(addMode || editing) && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
              <Input
                placeholder="عنوان (اختياري — مثلاً: دعاء الكرب)"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <Textarea
                placeholder="النص…"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={6}
                className="text-base leading-loose"
              />
              <Input
                placeholder="المصدر (اختياري — مثلاً: سورة الأنبياء 83، تأملات)"
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAddMode(false);
                    setEditing(null);
                  }}
                >
                  إلغاء
                </Button>
                <Button size="sm" onClick={save}>
                  حفظ
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-10">جارٍ التحميل…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-10">
              لا توجد كنوز بعد في هذه الفئة.
            </div>
          ) : (
            items.map((t) => (
              <article
                key={t.id}
                className="group rounded-xl border border-border bg-card px-4 py-3"
              >
                {t.title && (
                  <div className="text-sm font-bold text-primary mb-1.5">{t.title}</div>
                )}
                <p className="whitespace-pre-wrap text-base leading-loose">
                  {t.body}
                </p>

                {t.source && (
                  <div className="mt-2 text-xs text-muted-foreground">— {t.source}</div>
                )}
                <div className="mt-2 flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                  {t.is_pinned_today && (
                    <span className="me-auto text-[10px] uppercase tracking-wide rounded-full bg-primary/15 text-primary px-2 py-0.5 font-semibold">
                      <Pin size={10} className="inline ms-1" />
                      مثبّت
                    </span>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => startEdit(t)}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/*                          STATS STRIP                          */
/* ============================================================ */

function StatsStrip() {
  const today = todayUtcDate();

  const { data: tasks = [] } = useQuery({
    queryKey: ["mentor_tasks_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_tasks")
        .select("id,kind,title,is_daily,sort_order");
      if (error) throw error;
      return (data as Task[]) ?? [];
    },
  });
  const taskIds = tasks.map((t) => t.id);
  const { data: completions = [] } = useQuery({
    queryKey: ["mentor_completions_all", taskIds.join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return [] as { task_id: string; completed_on: string }[];
      const { data, error } = await supabase
        .from("mentor_task_completions")
        .select("task_id,completed_on")
        .in("task_id", taskIds);
      if (error) throw error;
      return (data as { task_id: string; completed_on: string }[]) ?? [];
    },
    enabled: taskIds.length > 0,
  });

  const { data: counts } = useQuery({
    queryKey: ["mentor_counts"],
    queryFn: async () => {
      const [duas, treasures] = await Promise.all([
        supabase.from("mentor_entries").select("id", { count: "exact", head: true }),
        supabase.from("mentor_treasures").select("id", { count: "exact", head: true }),
      ]);
      return {
        duas: duas.count ?? 0,
        treasures: treasures.count ?? 0,
      };
    },
  });

  // Streak: consecutive days (ending today or yesterday) where all daily tasks done
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
    for (const [date, set] of byDate)
      if (dailyIds.every((id) => set.has(id))) fullDays.add(date);
    let count = 0;
    const d = new Date();
    // Start from today; if today not full, start counting from yesterday
    if (!fullDays.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
    while (fullDays.has(d.toISOString().slice(0, 10))) {
      count++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return count;
  }, [tasks, completions]);

  // Today's progress ring
  const todayProgress = useMemo(() => {
    const dailyIds = tasks.filter((t) => t.is_daily).map((t) => t.id);
    if (dailyIds.length === 0) return { done: 0, total: 0, pct: 0 };
    const doneToday = new Set(
      completions.filter((c) => c.completed_on === today).map((c) => c.task_id),
    );
    const done = dailyIds.filter((id) => doneToday.has(id)).length;
    return { done, total: dailyIds.length, pct: Math.round((done / dailyIds.length) * 100) };
  }, [tasks, completions, today]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatChip
        icon={<Flame size={16} />}
        label="السلسلة"
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
        icon={<BookOpen size={16} />}
        label="أدعية مسجّلة"
        value={String(counts?.duas ?? 0)}
      />
      <StatChip
        icon={<Gem size={16} />}
        label="كنوزي"
        value={String(counts?.treasures ?? 0)}
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
      className={
        "rounded-2xl border px-4 py-3 flex items-center gap-3 " +
        (accent
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card")
      }
    >
      <div className={accent ? "text-primary" : "text-muted-foreground"}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-base font-bold truncate">{value}</div>
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
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (c * pct) / 100;
  const isFull = pct === 100 && total > 0;
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-3">
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={isFull ? "#d4a017" : "var(--primary)"}
          strokeWidth="4"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-base font-bold">
          {done}/{total || 0}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*                  CATEGORIES + ENTRY MODAL                     */
/* ============================================================ */

function CategoriesPanel({
  kind,
  heading,
  icon,
  tone,
}: {
  kind: Kind;
  heading: string;
  icon: React.ReactNode;
  tone: "dua";
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [openCategory, setOpenCategory] = useState<Category | null>(null);

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ["mentor_categories", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_categories")
        .select("id,kind,title,sort_order")
        .eq("kind", kind)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as Category[]) ?? [];
    },
  });

  async function addCategory() {
    const t = newTitle.trim();
    if (!t) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const sort = cats.length;
    const { error } = await supabase
      .from("mentor_categories")
      .insert({ user_id: uid, kind, title: t, sort_order: sort });
    if (error) return toast.error(error.message);
    setNewTitle("");
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["mentor_categories", kind] });
  }

  async function saveEdit() {
    if (!editing) return;
    const t = editTitle.trim();
    if (!t) return;
    const { error } = await supabase
      .from("mentor_categories")
      .update({ title: t })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["mentor_categories", kind] });
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`حذف "${c.title}" وكل ما بداخلها؟`)) return;
    const { error } = await supabase.from("mentor_categories").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mentor_categories", kind] });
  }

  const panelBg =
    tone === "dua"
      ? "bg-[oklch(0.98_0.02_95)] dark:bg-card border-amber-200/60 dark:border-border"
      : "bg-[oklch(0.97_0.005_240)] dark:bg-card border-slate-300/60 dark:border-border";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${panelBg}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <h2 className="text-lg font-bold">{heading}</h2>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={16} className="ms-1" />
          إضافة
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل…</div>
      ) : cats.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          لا توجد عناصر بعد. أضف فئتك الأولى.
        </div>
      ) : (
        <ul className="space-y-2">
          {cats.map((c) => (
            <li
              key={c.id}
              className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-background/80 backdrop-blur-sm px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <button
                onClick={() => setOpenCategory(c)}
                className="flex-1 text-start font-medium hover:text-primary"
              >
                {c.title}
              </button>
              <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(c);
                    setEditTitle(c.title);
                  }}
                  aria-label="تعديل"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteCategory(c)}
                  aria-label="حذف"
                >
                  <Trash2 size={15} className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>فئة جديدة</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="مثلاً: دعاء الصبر"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={addCategory}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الفئة</DialogTitle>
          </DialogHeader>
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button onClick={saveEdit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {openCategory && (
        <EntriesModal category={openCategory} onClose={() => setOpenCategory(null)} />
      )}
    </div>
  );
}

function EntriesModal({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["mentor_entries", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_entries")
        .select("id,category_id,title,body,sort_order")
        .eq("category_id", category.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as Entry[]) ?? [];
    },
  });

  const current = entries[index];
  useEffect(() => {
    if (index >= entries.length && entries.length > 0) setIndex(entries.length - 1);
  }, [entries.length, index]);

  // Keyboard arrows
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (addMode || editMode) return;
      if (e.key === "ArrowLeft") setIndex((i) => Math.min(entries.length - 1, i + 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries.length, addMode, editMode]);

  function startAdd() {
    setAddMode(true);
    setEditMode(false);
    setDraftTitle("");
    setDraftBody("");
  }
  function startEdit() {
    if (!current) return;
    setEditMode(true);
    setAddMode(false);
    setDraftTitle(current.title ?? "");
    setDraftBody(current.body);
  }

  async function saveNew() {
    const body = draftBody.trim();
    if (!body) return toast.error("الرجاء كتابة النص");
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const sort = entries.length;
    const { error } = await supabase.from("mentor_entries").insert({
      user_id: uid,
      category_id: category.id,
      title: draftTitle.trim() || null,
      body,
      sort_order: sort,
    });
    if (error) return toast.error(error.message);
    setAddMode(false);
    await qc.invalidateQueries({ queryKey: ["mentor_entries", category.id] });
    setIndex(entries.length);
  }

  async function saveEdit() {
    if (!current) return;
    const body = draftBody.trim();
    if (!body) return toast.error("الرجاء كتابة النص");
    const { error } = await supabase
      .from("mentor_entries")
      .update({ title: draftTitle.trim() || null, body })
      .eq("id", current.id);
    if (error) return toast.error(error.message);
    setEditMode(false);
    qc.invalidateQueries({ queryKey: ["mentor_entries", category.id] });
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!confirm("حذف هذا العنصر؟")) return;
    const { error } = await supabase.from("mentor_entries").delete().eq("id", current.id);
    if (error) return toast.error(error.message);
    if (index > 0) setIndex(index - 1);
    qc.invalidateQueries({ queryKey: ["mentor_entries", category.id] });
  }

  async function addToTreasures() {
    if (!current) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("mentor_treasures").insert({
      user_id: uid,
      kind: category.kind,
      title: current.title,
      body: current.body,
    });
    if (error) return toast.error(error.message);
    toast.success("أُضيف إلى كنوزي ⭐");
    qc.invalidateQueries({ queryKey: ["mentor_treasures_all"] });
  }

  function copy() {
    if (!current) return;
    navigator.clipboard.writeText(current.body);
    toast.success("تم النسخ");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{category.title}</span>
            {entries.length > 0 && !addMode && (
              <span className="text-xs font-normal text-muted-foreground">
                {index + 1} / {entries.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 min-h-[300px]">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-10 text-center">جارٍ التحميل…</div>
          ) : addMode || editMode ? (
            <div className="space-y-3">
              <Input
                placeholder="عنوان (اختياري)"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
              <Textarea
                placeholder="النص…"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={12}
                className="text-lg leading-loose"
              />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-14 space-y-3">
              <p className="text-muted-foreground">لا يوجد محتوى داخل هذه الفئة بعد.</p>
              <Button onClick={startAdd}>
                <Plus size={16} className="ms-1" />
                أضف أول عنصر
              </Button>
            </div>
          ) : (
            <article className="space-y-4 px-2">
              {current?.title && (
                <h3 className="text-lg font-semibold text-primary">{current.title}</h3>
              )}
              <p className="whitespace-pre-wrap text-xl md:text-2xl leading-[2.1]">
                {current?.body}
              </p>

            </article>
          )}
        </div>

        <DialogFooter className="flex flex-row flex-wrap items-center gap-2 justify-between border-t border-border pt-3">
          {addMode || editMode ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setAddMode(false);
                  setEditMode(false);
                }}
              >
                إلغاء
              </Button>
              <Button onClick={addMode ? saveNew : saveEdit}>حفظ</Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0 || entries.length === 0}
                >
                  <ChevronRight size={16} />
                  السابق
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIndex((i) => Math.min(entries.length - 1, i + 1))}
                  disabled={index >= entries.length - 1 || entries.length === 0}
                >
                  التالي
                  <ChevronLeft size={16} />
                </Button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {current && (
                  <>
                    <Button size="sm" variant="ghost" onClick={addToTreasures} title="إلى كنوزي">
                      <Star size={15} className="ms-1" />
                      كنز
                    </Button>
                    <Button size="sm" variant="ghost" onClick={copy}>
                      <Copy size={15} className="ms-1" />
                      نسخ
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={startAdd}>
                  <Plus size={15} className="ms-1" />
                  إضافة
                </Button>
                {current && (
                  <>
                    <Button size="sm" variant="ghost" onClick={startEdit}>
                      <Pencil size={15} className="ms-1" />
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={deleteCurrent}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 size={15} className="ms-1" />
                      حذف
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/*                        CHECKLIST PANEL                        */
/* ============================================================ */

function ChecklistPanel({ kind, heading }: { kind: TaskKind; heading: string }) {
  const qc = useQueryClient();
  const today = useMemo(() => todayUtcDate(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIsDaily, setNewIsDaily] = useState(true);
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIsDaily, setEditIsDaily] = useState(true);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["mentor_tasks", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_tasks")
        .select("id,kind,title,is_daily,sort_order")
        .eq("kind", kind)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as Task[]) ?? [];
    },
  });

  const taskIds = tasks.map((t) => t.id);
  const { data: completions = [] } = useQuery({
    queryKey: ["mentor_completions", kind, today, taskIds.join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return [] as { task_id: string; completed_on: string }[];
      const { data, error } = await supabase
        .from("mentor_task_completions")
        .select("task_id,completed_on")
        .in("task_id", taskIds);
      if (error) throw error;
      return (data as { task_id: string; completed_on: string }[]) ?? [];
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

  async function addTask() {
    const t = newTitle.trim();
    if (!t) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("mentor_tasks").insert({
      user_id: uid,
      kind,
      title: t,
      is_daily: newIsDaily,
      sort_order: tasks.length,
    });
    if (error) return toast.error(error.message);
    setNewTitle("");
    setNewIsDaily(true);
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["mentor_tasks", kind] });
    qc.invalidateQueries({ queryKey: ["mentor_tasks_all"] });
  }

  async function saveEdit() {
    if (!editing) return;
    const t = editTitle.trim();
    if (!t) return;
    const { error } = await supabase
      .from("mentor_tasks")
      .update({ title: t, is_daily: editIsDaily })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["mentor_tasks", kind] });
  }

  async function deleteTask(t: Task) {
    if (!confirm(`حذف "${t.title}"؟`)) return;
    const { error } = await supabase.from("mentor_tasks").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mentor_tasks", kind] });
    qc.invalidateQueries({ queryKey: ["mentor_completions", kind] });
    qc.invalidateQueries({ queryKey: ["mentor_tasks_all"] });
  }

  async function toggle(task: Task) {
    const isDone = doneSet.has(task.id);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    if (isDone) {
      let q = supabase
        .from("mentor_task_completions")
        .delete()
        .eq("task_id", task.id)
        .eq("user_id", uid);
      if (task.is_daily) q = q.eq("completed_on", today);
      const { error } = await q;
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("mentor_task_completions").insert({
        user_id: uid,
        task_id: task.id,
        completed_on: today,
      });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["mentor_completions", kind] });
    qc.invalidateQueries({ queryKey: ["mentor_completions_all"] });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">{heading}</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={16} className="ms-1" />
          إضافة مهمة
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل…</div>
      ) : tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">لا توجد مهام بعد.</div>
      ) : (
        <ul className="space-y-2">
          {tasks
            .filter((t) => t.is_daily || !doneSet.has(t.id))
            .map((t) => {
              const done = doneSet.has(t.id);
              return (
                <li
                  key={t.id}
                  className={
                    "group flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all " +
                    (done
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-background hover:border-primary/40")
                  }
                >
                  <label className="flex items-center gap-3 flex-1 cursor-pointer">
                    <Checkbox checked={done} onCheckedChange={() => toggle(t)} />
                    <span
                      className={
                        "text-sm transition-all " +
                        (done
                          ? "line-through text-muted-foreground"
                          : "text-foreground")
                      }
                    >
                      {t.title}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                      {t.is_daily ? "يومي" : "لمرة"}
                    </span>
                  </label>
                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(t);
                        setEditTitle(t.title);
                        setEditIsDaily(t.is_daily);
                      }}
                      aria-label="تعديل"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteTask(t)}
                      aria-label="حذف"
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>مهمة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="عنوان المهمة"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={newIsDaily}
                onCheckedChange={(v) => setNewIsDaily(v === true)}
              />
              مهمة يومية (تعاد كل يوم)
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={addTask}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المهمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={editIsDaily}
                onCheckedChange={(v) => setEditIsDaily(v === true)}
              />
              مهمة يومية
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button onClick={saveEdit}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
