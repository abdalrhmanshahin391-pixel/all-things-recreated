import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Check, Circle, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StudyToolShell } from "@/components/study/StudyToolShell";

export const Route = createFileRoute("/study-hub/todo")({
  head: () => ({
    meta: [
      { title: "To do — Study Hub | AquaQBank Academy" },
      {
        name: "description",
        content:
          "Organise your subjects and topics, mark what you have covered and follow your revision progress.",
      },
      { property: "og:title", content: "To do — Study Hub | AquaQBank Academy" },
      {
        property: "og:description",
        content: "Track your subjects, topics and revision progress in one list.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodoPage,
});

type Subject = { id: string; name: string; sort: number };
type Topic = {
  id: string;
  subject_id: string;
  title: string;
  status: string;
  due_date: string | null;
  sort: number;
};

const NEXT: Record<string, string> = { todo: "doing", doing: "done", done: "todo" };

function TodoPage() {
  return (
    <StudyToolShell
      title="To do"
      subtitle="Add your subjects, list the topics inside each one and tick them off as you cover them."
    >
      <TodoBoard />
    </StudyToolShell>
  );
}

function TodoBoard() {
  const qc = useQueryClient();
  const [newSubject, setNewSubject] = useState("");

  const { data: subjects = [] } = useQuery({
    queryKey: ["study-subjects"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("study_subjects")
        .select("id,name,sort")
        .order("sort")
        .order("created_at");
      return (data ?? []) as Subject[];
    },
  });

  const { data: topics = [] } = useQuery({
    queryKey: ["study-topics"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("study_topics")
        .select("id,subject_id,title,status,due_date,sort")
        .order("sort")
        .order("created_at");
      return (data ?? []) as Topic[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["study-subjects"] });
    qc.invalidateQueries({ queryKey: ["study-topics"] });
  };

  const addSubject = useMutation({
    mutationFn: async (name: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase.from as any)("study_subjects").insert({
        user_id: u.user.id,
        name,
        sort: subjects.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeSubject = useMutation({
    mutationFn: async (id: string) => {
      await (supabase.from as any)("study_subjects").delete().eq("id", id);
    },
    onSuccess: invalidate,
  });

  const addTopic = useMutation({
    mutationFn: async (v: { subjectId: string; title: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase.from as any)("study_topics").insert({
        user_id: u.user.id,
        subject_id: v.subjectId,
        title: v.title,
        sort: topics.filter((t) => t.subject_id === v.subjectId).length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cycleTopic = useMutation({
    mutationFn: async (t: Topic) => {
      await (supabase.from as any)("study_topics")
        .update({ status: NEXT[t.status] ?? "todo" })
        .eq("id", t.id);
    },
    onSuccess: invalidate,
  });

  const removeTopic = useMutation({
    mutationFn: async (id: string) => {
      await (supabase.from as any)("study_topics").delete().eq("id", id);
    },
    onSuccess: invalidate,
  });

  const doneCount = topics.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-black text-foreground">Overall progress</div>
            <div className="text-sm text-muted-foreground">
              {doneCount} of {topics.length} topics done
            </div>
          </div>
          <div className="w-40">
            <Bar value={topics.length ? (doneCount / topics.length) * 100 : 0} />
          </div>
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = newSubject.trim();
          if (!v) return;
          addSubject.mutate(v.slice(0, 80));
          setNewSubject("");
        }}
      >
        <input
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          maxLength={80}
          placeholder="Add a subject (e.g. Anatomy)"
          className="flex-1 rounded-xl border-2 border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground"
        >
          <Plus size={16} /> Add
        </button>
      </form>

      {subjects.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Start by adding your first subject.
        </div>
      ) : (
        subjects.map((s) => {
          const list = topics.filter((t) => t.subject_id === s.id);
          const done = list.filter((t) => t.status === "done").length;
          return (
            <div key={s.id} className="rounded-2xl border-2 border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-foreground">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {done} / {list.length} topics
                  </div>
                </div>
                <button
                  onClick={() => removeSubject.mutate(s.id)}
                  aria-label={`Delete ${s.name}`}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-3">
                <Bar value={list.length ? (done / list.length) * 100 : 0} />
              </div>

              <ul className="mt-4 space-y-2">
                {list.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <button
                      onClick={() => cycleTopic.mutate(t)}
                      aria-label="Change status"
                      className="text-primary"
                    >
                      {t.status === "done" ? (
                        <Check size={18} />
                      ) : t.status === "doing" ? (
                        <CircleDot size={18} />
                      ) : (
                        <Circle size={18} className="text-muted-foreground" />
                      )}
                    </button>
                    <span
                      className={`flex-1 text-sm font-semibold ${
                        t.status === "done"
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {t.title}
                    </span>
                    <button
                      onClick={() => removeTopic.mutate(t.id)}
                      aria-label="Delete topic"
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>

              <TopicInput onAdd={(title) => addTopic.mutate({ subjectId: s.id, title })} />
            </div>
          );
        })
      )}
    </div>
  );
}

function TopicInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = v.trim();
        if (!t) return;
        onAdd(t.slice(0, 160));
        setV("");
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        maxLength={160}
        placeholder="Add a topic…"
        className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <button
        type="submit"
        className="rounded-xl border-2 border-border px-3 py-2 text-sm font-black text-foreground hover:bg-muted"
      >
        <Plus size={16} />
      </button>
    </form>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.round(value)}%`, background: "var(--primary)" }}
      />
    </div>
  );
}
