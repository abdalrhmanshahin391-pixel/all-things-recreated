import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { ReviewHero } from "@/components/german/ReviewHero";
import { AddEntryDialog } from "@/components/german/AddEntryDialog";
import { MatchSetup } from "@/components/german/MatchSetup";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ChevronRight, Mic, Plus, Target, Volume2, GraduationCap, Sparkles } from "lucide-react";
import { speak } from "@/lib/german-shadowing";
import { toast } from "sonner";

export const Route = createFileRoute("/german/$courseId/review/")({
  head: () => ({ meta: [{ title: "Smart Review" }] }),
  component: ReviewHub,
});

type Tab = "words" | "sentences";
type Mode = "shadow" | "match" | "tap";
type Subject = { id: string; title: string; position: number; created_at: string; word_count: number; sentence_count: number };
type Window = "today" | "3d" | "week" | "month" | "all";

const WINDOW_LABELS: Record<Window, string> = {
  today: "Today",
  "3d": "3 days",
  week: "Week",
  month: "Month",
  all: "All time",
};

function withinWindow(iso: string, w: Window): boolean {
  if (w === "all") return true;
  const t = new Date(iso).getTime();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const cutoff =
    w === "today" ? now - 1 * day :
    w === "3d" ? now - 3 * day :
    w === "week" ? now - 7 * day :
    now - 30 * day;
  return t >= cutoff;
}

function ReviewHub() {
  const { courseId } = Route.useParams();
  
  const { isAdmin } = useAuth();
  const [course, setCourse] = useState<{ id: string; title: string } | null>(null);
  const [mode, setMode] = useState<Mode>("shadow");
  const [tab, setTab] = useState<Tab>("words");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Record<string, Array<{ id: string; german: string; english: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [win, setWin] = useState<Window>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c } = await (supabase.from as any)("german_courses")
        .select("id,title").eq("id", courseId).maybeSingle();
      setCourse(c ?? null);

      const { data: subs } = await (supabase.from as any)("german_subjects")
        .select("id,title,position,created_at").eq("course_id", courseId).order("position");
      const sList = (subs ?? []) as Array<{ id: string; title: string; position: number; created_at: string }>;
      const subIds = sList.map((s) => s.id);

      const wCount: Record<string, number> = {};
      const stCount: Record<string, number> = {};
      if (subIds.length) {
        const { data: items } = await (supabase.from as any)("german_items")
          .select("id,subject_id").in("subject_id", subIds);
        const itemMap = new Map<string, string>((items ?? []).map((i: any) => [i.id, i.subject_id]));
        const itemIds = (items ?? []).map((i: any) => i.id);
        if (itemIds.length) {
          const { data: ws } = await (supabase.from as any)("german_word_entries")
            .select("item_id").in("item_id", itemIds);
          for (const r of ws ?? []) { const sid = itemMap.get(r.item_id); if (sid) wCount[sid] = (wCount[sid] ?? 0) + 1; }
          const { data: ss } = await (supabase.from as any)("german_sentence_entries")
            .select("item_id").in("item_id", itemIds);
          for (const r of ss ?? []) { const sid = itemMap.get(r.item_id); if (sid) stCount[sid] = (stCount[sid] ?? 0) + 1; }
        }
      }

      setSubjects(sList.map((s) => ({ ...s, word_count: wCount[s.id] ?? 0, sentence_count: stCount[s.id] ?? 0 })));
      setLoading(false);
    })();
  }, [courseId]);

  const visible = useMemo(() => subjects.filter((s) => withinWindow(s.created_at, win)), [subjects, win]);



  // when tab switches, reset selection so totals are clear
  useEffect(() => { setSelected(new Set()); setExpanded(new Set()); }, [tab]);

  async function toggleExpand(subjectId: string) {
    const next = new Set(expanded);
    if (next.has(subjectId)) {
      next.delete(subjectId);
      setExpanded(next);
      return;
    }
    next.add(subjectId);
    setExpanded(next);
    if (!entries[subjectId]) {
      const { data: items } = await (supabase.from as any)("german_items")
        .select("id").eq("subject_id", subjectId);
      const itemIds = (items ?? []).map((i: any) => i.id);
      if (!itemIds.length) { setEntries((p) => ({ ...p, [subjectId]: [] })); return; }
      const table = tab === "words" ? "german_word_entries" : "german_sentence_entries";
      const { data: ents } = await (supabase.from as any)(table)
        .select("id,german,english").in("item_id", itemIds).order("position");
      setEntries((p) => ({ ...p, [subjectId]: (ents ?? []) as any }));
    }
  }

  function toggleSelect(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }

  // Pre-compute Smart Review target (kind + subjects) so it can render as a typed <Link>
  const smartReviewTarget = useMemo(() => {
    let kind: Tab = tab;
    const base = selected.size > 0 ? visible.filter((s) => selected.has(s.id)) : visible;
    let ids = base.filter((s) => (kind === "words" ? s.word_count : s.sentence_count) > 0).map((s) => s.id);
    if (ids.length === 0) {
      const other: Tab = kind === "words" ? "sentences" : "words";
      const otherIds = base.filter((s) => (other === "words" ? s.word_count : s.sentence_count) > 0).map((s) => s.id);
      if (otherIds.length > 0) { kind = other; ids = otherIds; }
    }
    return { kind, ids };
  }, [tab, selected, visible]);

  const examTarget = useMemo(() => {
    const ids = selected.size > 0
      ? Array.from(selected)
      : visible.filter((s) => s.word_count + s.sentence_count > 0).map((s) => s.id);
    return ids;
  }, [selected, visible]);

  const smartReviewHref = `/german/${encodeURIComponent(courseId)}/review/run?kind=${encodeURIComponent(smartReviewTarget.kind)}&subjects=${encodeURIComponent(smartReviewTarget.ids.join(","))}`;
  function hardLaunchSmartReview() {
    if (smartReviewTarget.ids.length === 0) {
      toast.error("No words or sentences saved yet. Tap + Add first.");
      return;
    }
    window.location.assign(smartReviewHref);
  }



  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-3xl px-4 md:px-6 pt-24 md:pt-28 pb-32">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/german/$courseId" params={{ courseId }} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold flex-1 truncate">Review</h1>
        </div>

        <ReviewHero />

        {/* Mode picker */}
        <div className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
          <button
            onClick={() => setMode("shadow")}
            className={`text-left rounded-2xl p-3 md:p-4 border transition shadow-sm ${
              mode === "shadow"
                ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-transparent"
                : "bg-white border-slate-100 hover:border-blue-200"
            }`}
          >
            <Mic className={`w-5 h-5 mb-2 ${mode === "shadow" ? "text-white" : "text-blue-600"}`} />
            <div className="font-extrabold text-sm md:text-base">Shadowing</div>
            <div className={`text-[11px] md:text-xs mt-0.5 ${mode === "shadow" ? "text-white/85" : "text-slate-500"}`}>Listen & repeat.</div>
          </button>
          <button
            onClick={() => setMode("match")}
            className={`text-left rounded-2xl p-3 md:p-4 border transition shadow-sm ${
              mode === "match"
                ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-transparent"
                : "bg-white border-slate-100 hover:border-emerald-200"
            }`}
          >
            <Target className={`w-5 h-5 mb-2 ${mode === "match" ? "text-white" : "text-emerald-600"}`} />
            <div className="font-extrabold text-sm md:text-base">Match · 30s</div>
            <div className={`text-[11px] md:text-xs mt-0.5 ${mode === "match" ? "text-white/85" : "text-slate-500"}`}>Pair them up.</div>
          </button>
          <button
            onClick={() => setMode("tap")}
            className={`text-left rounded-2xl p-3 md:p-4 border transition shadow-sm ${
              mode === "tap"
                ? "bg-gradient-to-br from-orange-500 to-rose-500 text-white border-transparent"
                : "bg-white border-slate-100 hover:border-orange-200"
            }`}
          >
            <Target className={`w-5 h-5 mb-2 ${mode === "tap" ? "text-white" : "text-orange-500"}`} />
            <div className="font-extrabold text-sm md:text-base">Tap · 30s</div>
            <div className={`text-[11px] md:text-xs mt-0.5 ${mode === "tap" ? "text-white/85" : "text-slate-500"}`}>Pick the translation.</div>
          </button>
        </div>

        {/* Timeline filter */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(WINDOW_LABELS) as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`h-8 px-3 rounded-full text-xs font-bold border transition ${
                win === w
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>

        {/* Inline Smart Review + Exam CTAs (always reachable, in flow) */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {smartReviewTarget.ids.length > 0 ? (
            <Link
              to="/german/$courseId/review/run"
              params={{ courseId }}
              search={{ kind: smartReviewTarget.kind, subjects: smartReviewTarget.ids.join(",") }}
              onClick={() => {
                setTimeout(() => {
                  if (!window.location.pathname.endsWith("/review/run")) hardLaunchSmartReview();
                }, 120);
              }}
              className="h-12 rounded-full bg-blue-600 text-white font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 hover:bg-blue-700"
            >
              <Sparkles className="w-4 h-4" /> Smart Review
            </Link>
          ) : (
            <button
              onClick={() => toast.error("No words or sentences saved yet. Tap + Add first.")}
              className="h-12 rounded-full bg-blue-600/50 text-white font-bold inline-flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Smart Review
            </button>
          )}
          {examTarget.length > 0 ? (
            <Link
              to="/german/$courseId/exam"
              params={{ courseId }}
              search={{ subjects: examTarget.join(",") }}
              className="h-12 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30 hover:opacity-95"
            >
              <GraduationCap className="w-4 h-4" /> Start Exam
            </Link>
          ) : (
            <button
              onClick={() => toast.error("Add some words or sentences first.")}
              className="h-12 rounded-full bg-gradient-to-r from-rose-500/60 to-orange-500/60 text-white font-bold inline-flex items-center justify-center gap-2"
            >
              <GraduationCap className="w-4 h-4" /> Start Exam
            </button>
          )}
        </div>

        {mode === "shadow" && smartReviewTarget.ids.length > 0 && (
          <a
            href={smartReviewHref}
            className="mt-2 inline-flex w-full h-10 items-center justify-center gap-2 rounded-full bg-white text-blue-700 text-sm font-extrabold border border-blue-100 shadow-sm hover:bg-blue-50"
          >
            <Sparkles className="w-4 h-4" /> Open Smart Review directly
          </a>
        )}


        {mode === "match" ? (
          <MatchSetup courseId={courseId} subjects={visible} mode="match" />
        ) : mode === "tap" ? (
          <MatchSetup courseId={courseId} subjects={visible} mode="tap" />
        ) : (

        <>
        {/* Words/Sentences tabs (shadowing) */}
        <div className="mt-5 grid grid-cols-2 bg-white rounded-full p-1.5 shadow-sm">
          {(["words", "sentences"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-11 rounded-full text-base font-bold transition ${
                tab === t ? "bg-blue-50 text-blue-600 shadow" : "text-slate-500"
              }`}
            >
              {t === "words" ? "Words" : "Sentences"}
            </button>
          ))}
        </div>




        <div className="mt-6">
          <h2 className="font-bold text-lg mb-3">{tab === "words" ? "Saved Words" : "Saved Lines"}</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-white animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-500 text-sm">
              No {tab} yet in this course. Ask an admin to add subjects with {tab}.
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((s) => {
                const isOpen = expanded.has(s.id);
                const isSel = selected.has(s.id);
                const count = tab === "words" ? s.word_count : s.sentence_count;
                return (
                  <div key={s.id} className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(s.id)}
                        className="w-5 h-5 accent-blue-600"
                      />
                      <button onClick={() => toggleExpand(s.id)} className="flex-1 text-left">
                        <div className="font-bold text-slate-900">{s.title}</div>
                        <div className="text-xs text-slate-500">{count} {tab}</div>
                      </button>
                      <ChevronRight className={`w-5 h-5 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`} />
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3 border-t border-slate-100 divide-y divide-slate-50">
                        {(entries[s.id] ?? []).map((e) => (
                          <div key={e.id} className="py-2.5 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-900 text-sm">{e.german}</div>
                              {e.english && <div className="text-xs text-slate-500 mt-0.5">{e.english}</div>}
                            </div>
                            <button
                              onClick={() => speak(e.german, { lang: "de-DE" })}
                              aria-label="Play"
                              className="w-8 h-8 grid place-items-center rounded-full text-blue-600 hover:bg-blue-50"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {(entries[s.id]?.length ?? 0) === 0 && (
                          <div className="py-3 text-xs text-slate-400">No entries.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}
      </main>

      {/* Add button — anyone can add now */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed top-24 right-4 md:right-6 z-30 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-blue-600 text-white text-sm font-bold shadow-lg hover:bg-blue-700"
      >
        <Plus className="w-4 h-4" /> Add
      </button>

      {/* (Smart Review + Exam buttons live inline above) */}

      {mode === "shadow" && smartReviewTarget.ids.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-[#F5F7FB] via-[#F5F7FB]/95 to-transparent md:hidden">
          <a
            href={smartReviewHref}
            className="mx-auto flex h-14 max-w-md items-center justify-center gap-2 rounded-full bg-blue-600 text-white font-extrabold shadow-xl shadow-blue-500/30"
          >
            <Sparkles className="w-4 h-4" /> Start Smart Review
          </a>
        </div>
      )}



      <AddEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        courseId={courseId}
        initialTab={tab}
        onAdded={(e) => {
          setSubjects((prev) => prev.map((s) =>
            s.id === e.subjectId
              ? { ...s, word_count: s.word_count + (e.kind === "words" ? 1 : 0), sentence_count: s.sentence_count + (e.kind === "sentences" ? 1 : 0) }
              : s,
          ));
          if (e.kind === tab) {
            setEntries((prev) => ({
              ...prev,
              [e.subjectId]: [{ id: e.id, german: e.german, english: e.english }, ...(prev[e.subjectId] ?? [])],
            }));
            setExpanded((prev) => new Set(prev).add(e.subjectId));
          }
        }}
      />
    </div>
  );
}
