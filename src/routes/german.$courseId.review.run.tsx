import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { CheckCircle2, ArrowLeft, Trophy, RotateCcw } from "lucide-react";
import { ShadowingPlayer, type ShadowItem } from "@/components/german/ShadowingPlayer";
import type { ShadowScore } from "@/lib/german-shadowing";
import { useAuth } from "@/hooks/useAuth";

type Kind = "words" | "sentences";

export const Route = createFileRoute("/german/$courseId/review/run")({
  validateSearch: (s: Record<string, unknown>) => ({
    kind: (s.kind === "sentences" ? "sentences" : "words") as Kind,
    subjects: typeof s.subjects === "string" ? s.subjects : "",
  }),
  head: () => ({ meta: [{ title: "Smart Review — Shadowing" }] }),
  component: SmartReviewRun,
});

type Phase = "intro" | "play" | "result";

function SmartReviewRun() {
  const { courseId } = Route.useParams();
  const { kind, subjects } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("intro");
  const [items, setItems] = useState<ShadowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Array<{ id: string; score: ShadowScore }>>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const subIds = subjects.split(",").filter(Boolean);
      if (subIds.length === 0) { setItems([]); setLoading(false); return; }
      const { data: itemsRaw } = await (supabase.from as any)("german_items")
        .select("id,subject_id").in("subject_id", subIds);
      const itemIds = (itemsRaw ?? []).map((i: any) => i.id);
      if (itemIds.length === 0) { setItems([]); setLoading(false); return; }
      const table = kind === "words" ? "german_word_entries" : "german_sentence_entries";
      const { data: ents } = await (supabase.from as any)(table)
        .select("id,german,english").in("item_id", itemIds).order("position");
      const arr = ((ents ?? []) as any[]).map((e) => ({
        id: e.id, prompt: e.german as string, translation: (e.english ?? null) as string | null,
      }));
      // shuffle
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      setItems(arr);
      setLoading(false);
    })();
  }, [kind, subjects]);

  async function handleFinish(res: Array<{ id: string; score: ShadowScore }>) {
    if (res.length === 0) {
      // user backed out
      navigate({ to: "/german/$courseId/review", params: { courseId } });
      return;
    }
    setResults(res);
    setPhase("result");
    // persist (best-effort)
    if (user) {
      const avg = res.reduce((a, r) => a + r.score.score, 0) / res.length;
      await (supabase.from as any)("german_shadowing_sessions").insert({
        user_id: user.id,
        course_id: courseId,
        kind,
        subject_ids: subjects.split(",").filter(Boolean),
        total_items: res.length,
        score_avg: Number(avg.toFixed(2)),
        details: res.map((r) => ({ id: r.id, score: r.score.score, band: r.score.band, heard: r.score.transcript })),
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FB]">
        <SiteHeader variant="light" />
        <div className="pt-32 text-center text-slate-500">Loading…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F7FB]">
        <SiteHeader variant="light" />
        <div className="pt-32 text-center">
          <p className="text-slate-600">Nothing to review yet.</p>
          <button onClick={() => navigate({ to: "/german/$courseId/review", params: { courseId } })} className="mt-4 px-4 py-2 rounded-lg bg-blue-500 text-white font-bold">Back</button>
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-[#F5F7FB]">
        <SiteHeader variant="light" />
        <main className="mx-auto max-w-2xl px-5 pt-20 pb-40 text-center">
          <div className="w-28 h-28 mx-auto rounded-full bg-white shadow grid place-items-center text-5xl">🐧</div>
          <h1 className="mt-4 text-3xl font-extrabold text-slate-900">{kind === "words" ? "Word Review" : "Sentence Review"}</h1>
          <p className="mt-2 text-slate-500 text-sm md:text-base">
            We'll show you {items.length} {kind}. Tap the mic, repeat after the prompt, and we'll score your pronunciation.
          </p>
          <h3 className="mt-8 font-bold text-emerald-600">Recommended way to study</h3>
          <div className="mt-3 rounded-2xl bg-white shadow-sm p-5 text-left space-y-3">
            {[
              "1. Listen to the prompt first (play button)",
              "2. Tap the mic and repeat clearly",
              "3. Strengthen your memory through shadowing",
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <span className="text-slate-700">{t}</span>
              </div>
            ))}
          </div>
        </main>
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#F5F7FB] to-transparent">
          <button
            onClick={() => setPhase("play")}
            className="block w-full max-w-2xl mx-auto h-14 rounded-full bg-blue-500 text-white text-lg font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600"
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  if (phase === "play") {
    return <ShadowingPlayer items={items} lang="de-DE" onFinish={handleFinish} />;
  }

  // result
  const avg = results.reduce((a, r) => a + r.score.score, 0) / Math.max(1, results.length);
  const great = results.filter((r) => r.score.band === "great").length;
  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-xl px-5 pt-20 pb-24">
        <button
          onClick={() => navigate({ to: "/german/$courseId/review", params: { courseId } })}
          className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to review
        </button>
        <div className="rounded-3xl bg-white shadow-sm p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 text-amber-600 grid place-items-center"><Trophy className="w-10 h-10" /></div>
          <h1 className="mt-4 text-3xl font-extrabold">Nice work!</h1>
          <p className="mt-1 text-slate-500">You finished {results.length} {kind}.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase font-bold text-slate-500">Average</div>
              <div className="text-3xl font-extrabold text-blue-600">{Math.round(avg)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase font-bold text-slate-500">Great</div>
              <div className="text-3xl font-extrabold text-emerald-600">{great}/{results.length}</div>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => { setPhase("intro"); setResults([]); }}
              className="flex-1 h-12 rounded-full bg-white border border-slate-200 text-slate-700 font-bold inline-flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Practice again
            </button>
            <button
              onClick={() => navigate({ to: "/german/$courseId/review", params: { courseId } })}
              className="flex-1 h-12 rounded-full bg-blue-500 text-white font-bold"
            >
              Done
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
