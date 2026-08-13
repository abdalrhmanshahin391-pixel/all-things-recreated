import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StudyToolShell } from "@/components/study/StudyToolShell";

export const Route = createFileRoute("/study-hub/exams")({
  head: () => ({
    meta: [
      { title: "My exams & tests — Study Hub | AquaQBank Academy" },
      {
        name: "description",
        content:
          "Add every exam with its date and time and see a live countdown so nothing catches you by surprise.",
      },
      { property: "og:title", content: "My exams & tests — Study Hub | AquaQBank Academy" },
      {
        property: "og:description",
        content: "Keep all your exam dates in one place with a live countdown.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamsPage,
});

type Exam = {
  id: string;
  title: string;
  subject: string | null;
  starts_at: string;
  location: string | null;
  notes: string | null;
};

function ExamsPage() {
  return (
    <StudyToolShell
      title="My exams & tests"
      subtitle="Add each exam with its date and time. The countdown updates on its own."
    >
      <ExamsBoard />
    </StudyToolShell>
  );
}

function ExamsBoard() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", subject: "", when: "", location: "" });
  const now = useNow();

  const { data: exams = [] } = useQuery({
    queryKey: ["study-exams"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("study_exams")
        .select("id,title,subject,starts_at,location,notes")
        .order("starts_at");
      return (data ?? []) as Exam[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase.from as any)("study_exams").insert({
        user_id: u.user.id,
        title: form.title.trim().slice(0, 120),
        subject: form.subject.trim().slice(0, 80) || null,
        starts_at: new Date(form.when).toISOString(),
        location: form.location.trim().slice(0, 120) || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ title: "", subject: "", when: "", location: "" });
      qc.invalidateQueries({ queryKey: ["study-exams"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await (supabase.from as any)("study_exams").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-exams"] }),
  });

  const upcoming = exams.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = exams.filter((e) => new Date(e.starts_at).getTime() < now).reverse();

  const valid = form.title.trim().length > 0 && form.when.length > 0;

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) add.mutate();
        }}
        className="grid gap-3 rounded-2xl border-2 border-border bg-card p-5 sm:grid-cols-2"
      >
        <Field label="Exam">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={120}
            placeholder="Anatomy midterm"
            className={inputCls}
          />
        </Field>
        <Field label="Subject (optional)">
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            maxLength={80}
            placeholder="Anatomy"
            className={inputCls}
          />
        </Field>
        <Field label="Date & time">
          <input
            type="datetime-local"
            value={form.when}
            onChange={(e) => setForm({ ...form, when: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Place (optional)">
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            maxLength={120}
            placeholder="Hall B"
            className={inputCls}
          />
        </Field>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={!valid || add.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            <Plus size={16} /> Add exam
          </button>
        </div>
      </form>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No upcoming exams yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((e) => (
              <ExamCard key={e.id} exam={e} now={now} onDelete={() => remove.mutate(e.id)} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground">Past</h2>
          <ul className="mt-3 space-y-3 opacity-60">
            {past.map((e) => (
              <ExamCard key={e.id} exam={e} now={now} onDelete={() => remove.mutate(e.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ExamCard({ exam, now, onDelete }: { exam: Exam; now: number; onDelete: () => void }) {
  const d = new Date(exam.starts_at);
  const diff = d.getTime() - now;
  return (
    <li className="flex items-start justify-between gap-4 rounded-2xl border-2 border-border bg-card p-4">
      <div className="min-w-0">
        <div className="truncate text-base font-black text-foreground">{exam.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={13} /> {d.toLocaleString()}
          </span>
          {exam.subject && <span>{exam.subject}</span>}
          {exam.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {exam.location}
            </span>
          )}
        </div>
        <div className="mt-2 text-sm font-black" style={{ color: "var(--primary)" }}>
          {diff > 0 ? `in ${humanize(diff)}` : `${humanize(-diff)} ago`}
        </div>
      </div>
      <button
        onClick={onDelete}
        aria-label="Delete exam"
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

function humanize(ms: number) {
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""}, ${hours} h`;
  if (hours > 0) return `${hours} h ${m} min`;
  return `${m} min`;
}

/** Ticks once a minute; pauses while the tab is hidden. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(() => {
      if (!document.hidden) tick();
    }, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
