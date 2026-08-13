import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Play, Layers } from "lucide-react";

type Kind = "words" | "sentences";
type Subject = { id: string; title: string; word_count: number; sentence_count: number };

export function MatchSetup({
  courseId,
  subjects,
  mode = "match",
}: {
  courseId: string;
  subjects: Subject[];
  mode?: "match" | "tap";
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("words");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const visible = subjects.filter((s) => (kind === "words" ? s.word_count > 0 : s.sentence_count > 0));
  const totalAll = visible.reduce((n, s) => n + (kind === "words" ? s.word_count : s.sentence_count), 0);
  const pickedSubject = pickedId ? subjects.find((s) => s.id === pickedId) : null;
  const pickedCount = pickedSubject ? (kind === "words" ? pickedSubject.word_count : pickedSubject.sentence_count) : totalAll;
  const minNeeded = mode === "tap" ? 2 : 4;
  const canStart = pickedCount >= minNeeded;

  function start() {
    if (!canStart) return;
    navigate({
      to: mode === "tap" ? "/german/$courseId/tap" : "/german/$courseId/match",
      params: { courseId },
      search: { kind, subjects: pickedId ?? "all" } as any,
    });
  }

  return (
    <div className="mt-4 rounded-3xl bg-white border border-slate-100 p-5 shadow-sm">
      {/* Kind tabs */}
      <div className="grid grid-cols-2 bg-slate-100 rounded-full p-1">
        {(["words", "sentences"] as Kind[]).map((t) => (
          <button
            key={t}
            onClick={() => { setKind(t); setPickedId(null); }}
            className={`h-10 rounded-full text-sm font-bold transition ${
              kind === t ? "bg-white text-blue-600 shadow" : "text-slate-500"
            }`}
          >
            {t === "words" ? "Words" : "Sentences"}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Subject</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPickedId(null)}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-semibold border transition ${
              pickedId === null
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> All subjects
            <span className="ml-1 text-xs opacity-80">({totalAll})</span>
          </button>
          {visible.map((s) => {
            const n = kind === "words" ? s.word_count : s.sentence_count;
            const active = pickedId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setPickedId(active ? null : s.id)}
                className={`h-9 px-3.5 rounded-full text-sm font-semibold border transition ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                }`}
              >
                {s.title}
                <span className="ml-1.5 text-xs opacity-80">{n}</span>
              </button>
            );
          })}
        </div>
        {visible.length === 0 && (
          <div className="mt-3 text-sm text-slate-500">No {kind} yet in this course.</div>
        )}
      </div>

      <button
        onClick={start}
        disabled={!canStart}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-blue-600 text-white text-base font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        <Play className="w-4 h-4 fill-current" /> Start · 30s
      </button>
      {!canStart && (
        <div className="mt-2 text-center text-xs text-slate-500">Need at least {minNeeded} {kind} to play.</div>
      )}
    </div>
  );
}
