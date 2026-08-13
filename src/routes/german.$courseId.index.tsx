import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  BookOpen,
  Timer,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Languages,
  Type,
  MessageSquareText,
  Shuffle,
  Mic,
  Gamepad2,
  ArrowRight,
  Brain,
  Calendar,
} from "lucide-react";

export const Route = createFileRoute("/german/$courseId/")({
  head: () => ({ meta: [{ title: "German course" }] }),
  component: GermanCoursePage,
});

type ContentType = "words" | "sentences" | "mixed" | "shadowing";
type Course = { id: string; title: string; content_type: ContentType };
type Subject = {
  id: string;
  title: string;
  position: number;
  content_type: ContentType;
  word_count: number;
  sentence_count: number;
};
type Range = "3d" | "1m" | "1y" | "all";

const RANGES: { id: Range; label: string }[] = [
  { id: "3d", label: "3 days" },
  { id: "1m", label: "1 month" },
  { id: "1y", label: "1 year" },
  { id: "all", label: "All time" },
];

const TYPE_META: Record<ContentType, { label: string; pill: string; Icon: any }> = {
  words: { label: "Words", pill: "bg-emerald-100 text-emerald-700 border-emerald-200", Icon: Type },
  sentences: { label: "Sentences", pill: "bg-sky-100 text-sky-700 border-sky-200", Icon: MessageSquareText },
  mixed: { label: "Mixed", pill: "bg-amber-100 text-amber-700 border-amber-200", Icon: Shuffle },
  shadowing: { label: "Shadowing", pill: "bg-blue-100 text-blue-700 border-blue-200", Icon: Mic },
};

function rangeStart(r: Range): Date | null {
  const now = new Date();
  if (r === "3d") return new Date(now.getTime() - 3 * 86400_000);
  if (r === "1m") return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (r === "1y") return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return null;
}

function GermanCoursePage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<Range>("all");
  const [timed, setTimed] = useState(false);
  const [durationMin, setDurationMin] = useState(15);
  const [smart, setSmart] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c } = await (supabase.from as any)("german_courses")
        .select("id,title,content_type")
        .eq("id", courseId)
        .maybeSingle();
      const courseRow = c ? { ...c, content_type: (c.content_type ?? "mixed") as ContentType } : null;
      setCourse(courseRow);
      if (courseRow?.content_type === "shadowing") {
        navigate({ to: "/german/$courseId/review", params: { courseId }, replace: true });
        return;
      }

      const { data: s } = await (supabase.from as any)("german_subjects")
        .select("id,title,position,content_type")
        .eq("course_id", courseId)
        .order("position");
      const subs = (s ?? []) as Subject[];

      const start = rangeStart(range);
      const subIds = subs.map((x) => x.id);
      let wordCounts: Record<string, number> = {};
      let sentCounts: Record<string, number> = {};

      if (subIds.length) {
        const { data: items } = await (supabase.from as any)("german_items")
          .select("id,subject_id,kind")
          .in("subject_id", subIds);
        const itemMap = new Map<string, string>((items ?? []).map((i: any) => [i.id, i.subject_id]));
        const itemIds = (items ?? []).map((i: any) => i.id);

        if (itemIds.length) {
          let wq = (supabase.from as any)("german_word_entries").select("item_id,created_at").in("item_id", itemIds);
          if (start) wq = wq.gte("created_at", start.toISOString());
          const { data: ws } = await wq;
          for (const w of ws ?? []) {
            const sid = itemMap.get(w.item_id);
            if (sid) wordCounts[sid] = (wordCounts[sid] ?? 0) + 1;
          }
          let stq = (supabase.from as any)("german_sentence_entries").select("item_id,created_at").in("item_id", itemIds);
          if (start) stq = stq.gte("created_at", start.toISOString());
          const { data: ss } = await stq;
          for (const w of ss ?? []) {
            const sid = itemMap.get(w.item_id);
            if (sid) sentCounts[sid] = (sentCounts[sid] ?? 0) + 1;
          }
        }
      }

      setSubjects(
        subs.map((s) => ({
          ...s,
          content_type: (s.content_type ?? "mixed") as ContentType,
          word_count: wordCounts[s.id] ?? 0,
          sentence_count: sentCounts[s.id] ?? 0,
        })),
      );
      setLoading(false);
    })();
  }, [courseId, range]);

  const totalWords = useMemo(() => subjects.reduce((a, s) => a + s.word_count, 0), [subjects]);
  const totalSent = useMemo(() => subjects.reduce((a, s) => a + s.sentence_count, 0), [subjects]);
  const pickedSubjects = useMemo(
    () => (selected.size ? subjects.filter((s) => selected.has(s.id)) : subjects),
    [subjects, selected],
  );
  const pickedWords = pickedSubjects.reduce((a, s) => a + s.word_count, 0);
  const pickedSent = pickedSubjects.reduce((a, s) => a + s.sentence_count, 0);
  const pickedTotal = pickedWords + pickedSent;
  const estMin = Math.max(1, Math.round(pickedTotal * 0.4));

  function toggleSubject(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function launch(mode: "study" | "session" | "exam" | "voice" | "game") {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const subjectIds = selected.size ? Array.from(selected) : subjects.map((s) => s.id);
    if (subjectIds.length === 0) return;
    // Runner currently supports one subject at a time — pick first when multiple.
    const subjectId = subjectIds[0];
    navigate({
      to: "/german/$courseId/run",
      params: { courseId },
      search: {
        item: "",
        subject: subjectId,
        mode,
        range,
        timed: mode === "exam" && timed ? 1 : 0,
        duration: mode === "exam" && timed ? durationMin : 0,
        smart: smart ? 1 : 0,
      } as any,
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-7xl px-6 pt-28 pb-24">
          <div className="h-10 w-64 rounded-lg bg-slate-200 animate-pulse mb-6" />
          <div className="h-32 rounded-2xl bg-slate-100 animate-pulse mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
            <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
        <SiteHeader variant="light" />
        <div className="pt-32 text-center text-slate-600">Course not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-7xl px-6 md:px-10 pt-24 pb-24">
        {/* Header band */}
        <section className="relative overflow-hidden rounded-3xl aurora-bg-soft border border-slate-200 px-6 md:px-10 py-8 md:py-10 mb-8">
          <Link to="/admin/german" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700">
            ← All German courses
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 bg-white border border-emerald-200 rounded-full px-3 py-1">
              <Languages className="w-3 h-3" /> Deutsch · {course.content_type === "mixed" ? "Words & Sentences" : course.content_type === "words" ? "Words" : "Sentences"}
            </span>
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight capitalize text-slate-900">
            {course.title.split(" ").map((w, i, arr) =>
              i === arr.length - 1 ? (
                <span key={i} className="bg-clip-text text-transparent bg-[linear-gradient(120deg,#10b981,#06b6d4,#3b82f6)]">{w}</span>
              ) : (
                <span key={i}>{w} </span>
              ),
            )}
          </h1>
          <p className="mt-2 text-slate-600 max-w-xl">
            Pick a subject, choose a time range, then launch Study, Session, Exam, Voice, or Game mode.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <StatPill icon={<BookOpen className="w-3.5 h-3.5" />} label="Subjects" value={String(subjects.length)} tone="emerald" />
            <StatPill icon={<Type className="w-3.5 h-3.5" />} label="Words" value={String(totalWords)} tone="emerald" />
            <StatPill icon={<MessageSquareText className="w-3.5 h-3.5" />} label="Sentences" value={String(totalSent)} tone="sky" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          {/* LEFT — curriculum */}
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest font-bold text-emerald-700">Curriculum</div>
                <h2 className="text-xl font-bold text-slate-900">Subjects · {selected.size} selected</h2>
              </div>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline">
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {subjects.length === 0 && (
                <div className="medical-card p-8 text-center text-slate-500 text-sm">
                  No subjects yet for this course.
                </div>
              )}
              {subjects.map((s, idx) => {
                const meta = TYPE_META[s.content_type];
                const Icon = meta.Icon;
                const isSelected = selected.has(s.id);
                const total = s.word_count + s.sentence_count;
                return (
                  <div key={s.id} className="subject-row" data-locked={false}>
                    <span className="text-[11px] font-bold text-slate-400 tabular-nums w-6">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <input
                      type="checkbox"
                      className="cb-indigo accent-emerald-600"
                      checked={isSelected}
                      onChange={() => toggleSubject(s.id)}
                    />
                    <button type="button" onClick={() => toggleSubject(s.id)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-md grid place-items-center border ${meta.pill}`}>
                          <Icon className="w-3 h-3" />
                        </span>
                        <div className="font-semibold text-slate-900 truncate">{s.title}</div>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 pl-8">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded-full border px-1.5 py-0.5 mr-2 ${meta.pill}`}>
                          {meta.label}
                        </span>
                        {s.word_count} words · {s.sentence_count} sentences
                      </div>
                    </button>
                    <span className="text-xs font-semibold text-slate-400 tabular-nums shrink-0">{total}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* RIGHT — session panel */}
          <aside className="lg:sticky lg:top-24 self-start">
            <div className="medical-card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-900">Start a session</span>
              </div>

              {/* Summary */}
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-1.5 mb-2">
                  {[
                    { label: "Items", value: pickedTotal },
                    { label: "Words", value: pickedWords },
                    { label: "Sent.", value: pickedSent },
                  ].map((c) => (
                    <span key={c.label} className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{c.label}</span>
                      <span className="text-sm font-extrabold text-slate-900 tabular-nums">{c.value}</span>
                    </span>
                  ))}
                </div>
                <div className="space-y-1">
                  <Row label="Subjects" value={selected.size === 0 ? "All" : `${selected.size} of ${subjects.length}`} />
                  <Row label={timed ? "Timer" : "Est. time"} value={timed ? `${durationMin} min` : `~${estMin} min`} />
                </div>
              </div>

              <div className="px-5 py-3 space-y-3 text-sm">
                {/* Time range */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Time range
                  </div>
                  <div className="segmented w-full">
                    {RANGES.map((r) => (
                      <button key={r.id} onClick={() => setRange(r.id)} data-active={range === r.id} className="flex-1 text-xs">
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timed */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-slate-700">Timed (Exam)</span>
                  </div>
                  <button
                    onClick={() => setTimed((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${timed ? "bg-emerald-600" : "bg-slate-300"}`}
                    aria-label="Toggle timed mode"
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${timed ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                {timed && (
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 10, 15, 30, 60].map((m) => (
                      <button
                        key={m}
                        onClick={() => setDurationMin(m)}
                        className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors ${
                          durationMin === m
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "border-slate-200 text-slate-600 hover:border-emerald-300"
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                )}

                {/* Smart */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-slate-700">Smart repetition</span>
                  </div>
                  <button
                    onClick={() => setSmart((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${smart ? "bg-purple-600" : "bg-slate-300"}`}
                    aria-label="Toggle smart"
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${smart ? "translate-x-5" : ""}`} />
                  </button>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-2">
                <ModeBtn onClick={() => launch("study")} icon={<BookOpen className="w-4 h-4" />} label="Study mode" variant="ghost" disabled={pickedTotal === 0} />
                <ModeBtn onClick={() => launch("session")} icon={<Sparkles className="w-4 h-4" />} label="Session mode" variant="primary" disabled={pickedTotal === 0} />
                <ModeBtn onClick={() => launch("exam")} icon={<Timer className="w-4 h-4" />} label="Exam mode" variant="dark" disabled={pickedTotal === 0} />
                <ModeBtn onClick={() => launch("voice")} icon={<Mic className="w-4 h-4" />} label="Voice mode" variant="cyan" disabled={pickedTotal === 0} />
                <ModeBtn onClick={() => launch("game")} icon={<Gamepad2 className="w-4 h-4" />} label="Game mode" variant="amber" disabled={pickedWords < 4} />
                <button
                  onClick={() => { setSelected(new Set()); setTimed(false); setSmart(false); setRange("all"); }}
                  className="w-full py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-semibold inline-flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatPill({ icon, label, value, tone = "emerald" }: { icon: any; label: string; value: string; tone?: "emerald" | "sky" }) {
  const c = tone === "sky" ? "text-sky-700 border-sky-200 bg-sky-50" : "text-emerald-700 border-emerald-200 bg-emerald-50";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${c}`}>
      {icon}
      <span className="uppercase tracking-widest text-[10px] opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function ModeBtn({
  onClick, icon, label, variant, disabled,
}: { onClick: () => void; icon: any; label: string; variant: "primary" | "ghost" | "dark" | "cyan" | "amber"; disabled?: boolean }) {
  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30 hover:shadow-emerald-500/50"
      : variant === "dark"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : variant === "cyan"
      ? "bg-gradient-to-r from-cyan-500 to-sky-600 text-white shadow-md shadow-cyan-500/30"
      : variant === "amber"
      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30"
      : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-2.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed ${styles}`}
    >
      {icon} {label}
    </button>
  );
}
