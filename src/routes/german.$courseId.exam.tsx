import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Mic, Target, Volume2, Flag, Trophy, CheckCircle2, XCircle, GraduationCap, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { ShadowingPlayer, type ShadowItem } from "@/components/german/ShadowingPlayer";
import type { ShadowScore } from "@/lib/german-shadowing";
import { speak } from "@/lib/german-shadowing";
import { playCorrect, playWrong } from "@/lib/german-match-audio";
import { generateSummary } from "@/lib/summaries.functions";
import { toast } from "sonner";


type Search = { subjects?: string };
type Entry = { id: string; german: string; english: string; kind: "words" | "sentences" };

export const Route = createFileRoute("/german/$courseId/exam")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    subjects: typeof s.subjects === "string" ? s.subjects : "all",
  }),
  head: () => ({ meta: [{ title: "German Exam" }] }),
  component: ExamPage,
});

const SHADOW_COUNT = 15;
const MATCH_COUNT = 15; // pairs to match (no timer)
const TAP_COUNT = 30;

type Stage = "loading" | "intro" | "shadow" | "match" | "tap" | "done" | "empty";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Result = {
  entry: Entry;
  stage: "shadow" | "match" | "tap";
  correct: boolean;
  detail?: string;
};

function ExamPage() {
  const { courseId } = Route.useParams();
  const { subjects } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stage, setStage] = useState<Stage>("loading");
  const [pool, setPool] = useState<Entry[]>([]);
  const [shadowItems, setShadowItems] = useState<Entry[]>([]);
  const [matchItems, setMatchItems] = useState<Entry[]>([]);
  const [tapItems, setTapItems] = useState<Entry[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const genFn = useServerFn(generateSummary);
  const [summarizing, setSummarizing] = useState(false);
  const [provider, setProvider] = useState<"lovable" | "gemini">("lovable");
  const correct = results.filter((r) => r.correct);
  const wrong = results.filter((r) => !r.correct);
  const scorePercent = results.length ? Math.round((correct.length / results.length) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let subjectIds: string[] = [];
      if (subjects && subjects !== "all") subjectIds = subjects.split(",").filter(Boolean);
      else {
        const { data } = await (supabase.from as any)("german_subjects")
          .select("id").eq("course_id", courseId);
        subjectIds = (data ?? []).map((r: any) => r.id);
      }
      if (!subjectIds.length) { if (!cancelled) setStage("empty"); return; }

      const { data: items } = await (supabase.from as any)("german_items")
        .select("id").in("subject_id", subjectIds);
      const itemIds = (items ?? []).map((i: any) => i.id);
      if (!itemIds.length) { if (!cancelled) setStage("empty"); return; }

      const [{ data: ws }, { data: ss }] = await Promise.all([
        (supabase.from as any)("german_word_entries").select("id,german,english").in("item_id", itemIds),
        (supabase.from as any)("german_sentence_entries").select("id,german,english").in("item_id", itemIds),
      ]);
      const all: Entry[] = [
        ...((ws ?? []) as any[]).filter((e) => e.german && e.english).map((e) => ({ id: e.id, german: e.german, english: e.english, kind: "words" as const })),
        ...((ss ?? []) as any[]).filter((e) => e.german && e.english).map((e) => ({ id: e.id, german: e.german, english: e.english, kind: "sentences" as const })),
      ];
      if (cancelled) return;
      if (all.length < 2) { setStage("empty"); return; }
      const shuffled = shuffle(all);
      setPool(shuffled);
      setShadowItems(shuffled.slice(0, Math.min(SHADOW_COUNT, shuffled.length)));
      setMatchItems(shuffle(shuffled).slice(0, Math.min(MATCH_COUNT, Math.max(2, shuffled.length))));
      setTapItems(shuffle(shuffled).slice(0, Math.min(TAP_COUNT, Math.max(2, shuffled.length))));
      setStage("intro");
    })();
    return () => { cancelled = true; };
  }, [courseId, subjects]);

  function handleShadowFinish(scores: Array<{ id: string; score: ShadowScore }>) {
    if (scores.length === 0) {
      navigate({ to: "/german/$courseId/review", params: { courseId } });
      return;
    }
    const rs: Result[] = scores.map((s) => {
      const entry = shadowItems.find((e) => e.id === s.id)!;
      return {
        entry,
        stage: "shadow",
        correct: s.score.band !== "try",
        detail: `${s.score.score}/100 — heard "${s.score.transcript || "(silence)"}"`,
      };
    });
    setResults((prev) => [...prev, ...rs]);
    setStage(matchItems.length > 0 ? "match" : "done");
  }

  function handleMatchFinish(rs: Result[]) {
    setResults((prev) => [...prev, ...rs]);
    setStage(tapItems.length > 0 ? "tap" : "done");
  }

  function handleTapFinish(rs: Result[]) {
    setResults((prev) => [...prev, ...rs]);
    setStage("done");
  }

  async function toggleFlag(entry: Entry) {
    if (!user) { toast.error("Sign in to flag items."); return; }
    const isFlagged = flaggedIds.has(entry.id);
    if (isFlagged) {
      const next = new Set(flaggedIds); next.delete(entry.id); setFlaggedIds(next);
      await (supabase.from as any)("german_flags").delete().eq("user_id", user.id).eq("entry_id", entry.id);
      toast.success("Flag removed");
    } else {
      const next = new Set(flaggedIds); next.add(entry.id); setFlaggedIds(next);
      const { error } = await (supabase.from as any)("german_flags").insert({
        user_id: user.id,
        entry_id: entry.id,
        kind: entry.kind,
        german: entry.german,
        english: entry.english,
        course_id: courseId,
      });
      if (error) {
        next.delete(entry.id); setFlaggedIds(new Set(next));
        toast.error("Could not save flag");
      } else {
        toast.success("Red-flagged for review");
      }
    }
  }

  if (stage === "loading") {
    return <div className="min-h-screen bg-[#F5F7FB]"><SiteHeader variant="light" /><div className="pt-32 text-center text-slate-500">Loading exam…</div></div>;
  }
  if (stage === "empty") {
    return (
      <div className="min-h-screen bg-[#F5F7FB]"><SiteHeader variant="light" />
        <main className="mx-auto max-w-md px-6 pt-28 text-center">
          <div className="text-6xl mb-3">📚</div>
          <h2 className="text-xl font-bold mb-2">Nothing to test yet</h2>
          <p className="text-slate-500 text-sm mb-6">Add some words or sentences first.</p>
          <Link to="/german/$courseId/review" params={{ courseId }} className="inline-flex h-11 px-5 items-center rounded-full bg-blue-600 text-white font-bold">Back</Link>
        </main>
      </div>
    );
  }

  if (stage === "intro") {
    return (
      <div className="min-h-screen bg-[#F5F7FB]">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-2xl px-5 pt-24 pb-32 text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-rose-500 to-orange-500 grid place-items-center text-white shadow-xl">
            <GraduationCap className="w-12 h-12" />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold text-slate-900">German Exam</h1>
          <p className="mt-2 text-slate-500">Three stages, one combined exam. Red-flag tricky items at the end.</p>
          <div className="mt-6 grid gap-3 text-left">
            <Stage1Card icon={<Mic className="w-5 h-5" />} title="1. Shadowing" desc={`Repeat ${shadowItems.length} item(s) out loud.`} color="from-blue-500 to-indigo-600" />
            <Stage1Card icon={<Target className="w-5 h-5" />} title="2. Match" desc={`Pair ${matchItems.length} German ↔ English.`} color="from-emerald-500 to-teal-600" />
            <Stage1Card icon={<Target className="w-5 h-5" />} title="3. Tap" desc={`Pick the correct translation, ${tapItems.length} rounds.`} color="from-orange-500 to-rose-500" />
          </div>
          <button
            onClick={() => setStage("shadow")}
            className="mt-8 inline-flex items-center gap-2 h-14 px-8 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold text-lg shadow-xl shadow-rose-500/40"
          >
            Start exam <ChevronRight className="w-5 h-5" />
          </button>
        </main>
      </div>
    );
  }

  if (stage === "shadow") {
    const items: ShadowItem[] = shadowItems.map((e) => ({ id: e.id, prompt: e.german, translation: e.english }));
    return <ShadowingPlayer items={items} lang="de-DE" maxItems={SHADOW_COUNT} onFinish={handleShadowFinish} />;
  }

  if (stage === "match") {
    return <MatchStage items={matchItems} onFinish={handleMatchFinish} />;
  }

  if (stage === "tap") {
    return <TapStage items={tapItems} pool={pool} onFinish={handleTapFinish} />;
  }

  // Done
  // Build a German-learning study summary from flagged (or all missed) items
  async function makeStudySummary() {
    // Prefer flagged items; fall back to all missed
    const flaggedEntries = results.map((r) => r.entry).filter((e) => flaggedIds.has(e.id));
    const seen = new Set<string>();
    const picked = (flaggedEntries.length > 0 ? flaggedEntries : wrong.map((r) => r.entry))
      .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    if (picked.length === 0) { toast.error("Nothing to summarize — red-flag some items first."); return; }

    const list = picked.map((e, i) => `${i + 1}. **${e.german}** — ${e.english}`).join("\n");
    const text = [
      `You are a German language tutor making a study sheet for a student who just missed (or red-flagged) these items in an exam.`,
      `This is NOT a medical summary. Make it a language-learning sheet. For EVERY item, build a memorable mini-card with: (1) German word/phrase, article + plural when relevant, (2) clear English translation, (3) simple pronunciation hint, (4) literal breakdown / root / word family, (5) a one-line memory hook in English, (6) one short German example sentence with English translation, (7) common mistake and why it is wrong.`,
      `Group items by theme if useful. End with a quick-recall table (German | Meaning | Memory hook | Common trap), then a short speak-it-out drill where the student repeats German first, then English.`,
      ``,
      `Items:`,
      list,
    ].join("\n");

    setSummarizing(true);
    try {
      const res = await genFn({ data: { kind: "text", text, length: "standard", tone: "concept", provider, titleOverride: `German Review — ${picked.length} items` } });
      toast.success("Study summary ready!");
      navigate({ to: "/summaries/$summaryId", params: { summaryId: res.id } });
    } catch (e: any) {
      const msg = e?.message ?? "Failed to generate";
      if (provider === "gemini" && /gemini/i.test(msg)) {
        toast.error("Gemini key missing — switching to Lovable AI. Tap again.");
        setProvider("lovable");
      } else {
        toast.error(msg);
      }
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-2xl px-4 pt-24 pb-16">
        <div className="rounded-3xl bg-white shadow-sm p-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 text-amber-600 grid place-items-center"><Trophy className="w-10 h-10" /></div>
          <h1 className="mt-4 text-2xl font-extrabold">Exam complete</h1>
          <p className="text-slate-500 text-sm">{scorePercent}% mark · {correct.length} right · {wrong.length} to revisit</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-blue-50 p-3"><div className="text-xs font-bold uppercase text-blue-700">Mark</div><div className="text-3xl font-extrabold text-blue-600">{scorePercent}%</div></div>
            <div className="rounded-2xl bg-emerald-50 p-3"><div className="text-xs font-bold uppercase text-emerald-700">Correct</div><div className="text-3xl font-extrabold text-emerald-600">{correct.length}</div></div>
            <div className="rounded-2xl bg-rose-50 p-3"><div className="text-xs font-bold uppercase text-rose-700">Missed</div><div className="text-3xl font-extrabold text-rose-600">{wrong.length}</div></div>
          </div>
        </div>

        {/* Study summary CTA */}
        <div className="mt-5 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 grid place-items-center shrink-0"><Sparkles className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold">Turn missed items into a study sheet</div>
              <div className="text-xs text-white/80 mt-0.5">Red-flag the tricky ones below, then tap. We'll write a German-learning summary with translations, mnemonics & example sentences.</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full bg-white/10 p-0.5 text-[11px] font-bold">
                  <button onClick={() => setProvider("lovable")} className={`px-3 py-1 rounded-full ${provider === "lovable" ? "bg-white text-indigo-700" : "text-white/80"}`}>Lovable AI</button>
                  <button onClick={() => setProvider("gemini")} className={`px-3 py-1 rounded-full ${provider === "gemini" ? "bg-white text-indigo-700" : "text-white/80"}`}>Gemini</button>
                </div>
                <button
                  onClick={makeStudySummary}
                  disabled={summarizing}
                  className="ml-auto inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white text-indigo-700 font-bold text-sm disabled:opacity-60"
                >
                  {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {summarizing ? "Writing…" : "Make summary"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <Section title="Missed items" icon={<XCircle className="w-4 h-4 text-rose-500" />} items={wrong} onFlag={toggleFlag} flagged={flaggedIds} empty="Nothing missed — perfect run!" />
        <Section title="Correct items" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} items={correct} onFlag={toggleFlag} flagged={flaggedIds} empty="No correct items recorded." />

        <div className="mt-6 flex gap-2">
          <button onClick={() => navigate({ to: "/german/$courseId/review", params: { courseId } })} className="flex-1 h-12 rounded-full bg-slate-100 text-slate-800 font-bold hover:bg-slate-200">Back to review</button>
          <button
            onClick={() => {
              const ids = Array.from(new Set((flaggedIds.size ? results.filter((r) => flaggedIds.has(r.entry.id)) : wrong).map((r) => r.entry.id)));
              if (!ids.length) { toast.error("No missed or red-flagged items to review."); return; }
              setResults([]);
              setShadowItems((flaggedIds.size ? results.filter((r) => flaggedIds.has(r.entry.id)) : wrong).map((r) => r.entry));
              setMatchItems([]);
              setTapItems([]);
              setStage("shadow");
            }}
            className="flex-1 h-12 rounded-full bg-indigo-600 text-white font-bold hover:bg-indigo-700"
          >
            Review misses
          </button>
          <button onClick={() => window.location.reload()} className="flex-1 h-12 rounded-full bg-blue-600 text-white font-bold hover:bg-blue-700">Retake</button>
        </div>
      </main>
    </div>
  );
}


function Stage1Card({ icon, title, desc, color }: { icon: React.ReactNode; title: string; desc: string; color: string }) {
  return (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${color} flex items-center gap-3`}>
      <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center">{icon}</div>
      <div className="flex-1"><div className="font-extrabold">{title}</div><div className="text-xs opacity-90">{desc}</div></div>
    </div>
  );
}

function Section({ title, icon, items, onFlag, flagged, empty }: { title: string; icon: React.ReactNode; items: Result[]; onFlag: (e: Entry) => void; flagged: Set<string>; empty: string }) {
  return (
    <div className="mt-6">
      <h2 className="font-bold text-sm uppercase text-slate-500 mb-2 flex items-center gap-2">{icon} {title} <span className="text-slate-400">({items.length})</span></h2>
      {items.length === 0 ? (
        <div className="rounded-2xl bg-white p-4 text-center text-slate-400 text-sm">{empty}</div>
      ) : (
        <div className="rounded-2xl bg-white divide-y divide-slate-100">
          {items.map((r, i) => {
            const isFlagged = flagged.has(r.entry.id);
            return (
              <div key={`${r.entry.id}-${i}`} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm" dir="auto">{r.entry.german}</div>
                  <div className="text-xs text-slate-500">{r.entry.english}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 capitalize">{r.stage}{r.detail ? ` · ${r.detail}` : ""}</div>
                </div>
                <button onClick={() => speak(r.entry.german, { lang: "de-DE" })} className="w-8 h-8 grid place-items-center rounded-full text-blue-600 hover:bg-blue-50" aria-label="Play"><Volume2 className="w-4 h-4" /></button>
                <button
                  onClick={() => onFlag(r.entry)}
                  className={`w-8 h-8 grid place-items-center rounded-full transition ${isFlagged ? "text-white bg-rose-500 hover:bg-rose-600" : "text-rose-500 hover:bg-rose-50"}`}
                  aria-label="Red flag"
                  title={isFlagged ? "Remove flag" : "Red-flag this"}
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Match stage (no timer, finish when all pairs done) ---------------
function MatchStage({ items, onFinish }: { items: Entry[]; onFinish: (r: Result[]) => void }) {
  const VISIBLE = Math.min(5, items.length);
  const [pool] = useState<Entry[]>(() => shuffle(items));
  const idxRef = useRef(0);
  const [left, setLeft] = useState<Entry[]>([]);
  const [right, setRight] = useState<Entry[]>([]);
  const [pickedL, setPickedL] = useState<string | null>(null);
  const [pickedR, setPickedR] = useState<string | null>(null);
  const [resolved, setResolved] = useState(0);
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [wrongAnim, setWrongAnim] = useState<{ l: string | null; r: string | null }>({ l: null, r: null });
  const [correctAnim, setCorrectAnim] = useState<string | null>(null);

  useEffect(() => {
    const first = pool.slice(0, VISIBLE);
    idxRef.current = first.length;
    setLeft(first);
    setRight(shuffle(first));
  }, [pool, VISIBLE]);

  function next(): Entry | null {
    if (idxRef.current >= pool.length) return null;
    return pool[idxRef.current++];
  }

  function tryMatch(lid: string, rid: string) {
    if (lid === rid) {
      playCorrect();
      setCorrectAnim(lid);
      setTimeout(() => {
        setCorrectAnim(null);
        const nxt = next();
        setLeft((cur) => {
          const i = cur.findIndex((e) => e.id === lid);
          if (i < 0) return cur;
          const copy = cur.slice();
          if (nxt) copy[i] = nxt;
          else copy.splice(i, 1);
          return copy;
        });
        setRight((cur) => {
          const i = cur.findIndex((e) => e.id === lid);
          if (i < 0) return cur;
          const copy = cur.slice();
          if (nxt) copy[i] = nxt;
          else copy.splice(i, 1);
          return shuffle(copy);
        });
        setPickedL(null); setPickedR(null);
        setResolved((n) => n + 1);
      }, 300);
    } else {
      playWrong();
      setMissed((cur) => new Set(cur).add(lid).add(rid));
      setWrongAnim({ l: lid, r: rid });
      setTimeout(() => { setWrongAnim({ l: null, r: null }); setPickedL(null); setPickedR(null); }, 450);
    }
  }

  useEffect(() => {
    if (resolved >= items.length || (left.length === 0 && right.length === 0 && idxRef.current > 0)) {
      const rs: Result[] = items.map((e) => ({
        entry: e,
        stage: "match",
        correct: !missed.has(e.id),
      }));
      setTimeout(() => onFinish(rs), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, left.length, right.length]);

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-2xl px-4 pt-24 pb-10">
        <div className="text-center mb-4">
          <div className="text-xs uppercase font-bold text-slate-500">Stage 2 · Match</div>
          <div className="text-sm text-slate-600">{resolved}/{items.length} pairs</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-3">
            {left.map((e) => {
              const sel = pickedL === e.id;
              const ok = correctAnim === e.id;
              const bad = wrongAnim.l === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => { if (!pickedR) setPickedL(e.id); else tryMatch(e.id, pickedR); }}
                  className={`w-full min-h-[64px] rounded-2xl px-3 py-2 text-sm md:text-base font-bold border transition ${ok ? "bg-emerald-500 text-white border-emerald-500" : bad ? "bg-rose-100 text-rose-700 border-rose-400" : sel ? "bg-blue-50 text-blue-700 border-blue-400" : "bg-white text-slate-900 border-slate-100 hover:border-blue-300"}`}
                >
                  <span dir="auto">{e.german}</span>
                </button>
              );
            })}
          </div>
          <div className="space-y-3">
            {right.map((e) => {
              const sel = pickedR === e.id;
              const ok = correctAnim === e.id;
              const bad = wrongAnim.r === e.id;
              return (
                <button
                  key={`r-${e.id}`}
                  onClick={() => { if (!pickedL) setPickedR(e.id); else tryMatch(pickedL, e.id); }}
                  className={`w-full min-h-[64px] rounded-2xl px-3 py-2 text-sm md:text-base font-bold border transition ${ok ? "bg-emerald-500 text-white border-emerald-500" : bad ? "bg-rose-100 text-rose-700 border-rose-400" : sel ? "bg-blue-50 text-blue-700 border-blue-400" : "bg-white text-slate-900 border-slate-100 hover:border-blue-300"}`}
                >
                  {e.english}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------- Tap stage (no timer, fixed rounds) -------------------------------
function TapStage({ items, pool, onFinish }: { items: Entry[]; pool: Entry[]; onFinish: (r: Result[]) => void }) {
  const order = useMemo(() => shuffle(items), [items]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const cur = order[i];

  const options = useMemo(() => {
    if (!cur) return [];
    const others = pool.filter((p) => p.id !== cur.id && p.english.trim().toLowerCase() !== cur.english.trim().toLowerCase());
    const distractor = others.length ? others[Math.floor(Math.random() * others.length)].english : "—";
    return shuffle([{ text: cur.english, correct: true }, { text: distractor, correct: false }]);
  }, [cur, pool]);

  function pick(idx: number) {
    if (picked !== null || !cur) return;
    setPicked(idx);
    const ok = options[idx].correct;
    if (ok) playCorrect(); else playWrong();
    const newResult: Result = { entry: cur, stage: "tap", correct: ok };
    const nextResults = [...results, newResult];
    setResults(nextResults);
    setTimeout(() => {
      if (i + 1 >= order.length) onFinish(nextResults);
      else { setI(i + 1); setPicked(null); }
    }, 500);
  }

  if (!cur) return null;
  const pct = ((i + (picked !== null ? 1 : 0)) / order.length) * 100;

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-md px-4 pt-24 pb-10 flex flex-col min-h-[calc(100vh-6rem)]">
        <div className="text-center mb-3">
          <div className="text-xs uppercase font-bold text-slate-500">Stage 3 · Tap</div>
          <div className="text-sm text-slate-600">{i + 1}/{order.length}</div>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-6">
          <div className="h-full bg-orange-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex-1 grid place-items-center">
          <div className="text-3xl md:text-4xl font-extrabold text-sky-500 text-center" dir="auto">{cur.german}</div>
        </div>
        <div className="space-y-3 mt-6">
          {options.map((o, idx) => {
            const isPicked = picked === idx;
            const showOk = picked !== null && o.correct;
            const showWrong = isPicked && !o.correct;
            let cls = "bg-slate-100 text-slate-800";
            if (showOk) cls = "bg-emerald-300 text-emerald-950";
            else if (showWrong) cls = "bg-rose-300 text-rose-950";
            return (
              <button key={idx} disabled={picked !== null} onClick={() => pick(idx)} className={`w-full min-h-[56px] rounded-2xl px-4 py-3 text-lg font-bold transition-colors ${cls}`}>
                <span dir="auto">{o.text}</span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
