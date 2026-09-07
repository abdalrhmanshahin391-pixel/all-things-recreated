import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Plus, Repeat, Trash2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type LiveClass = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  repeat_weekly: boolean;
  recording_url: string | null;
};

/** Schedule live classes (Google Meet / Zoom) and post the recording afterwards. */
export function LiveClassesCard({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<LiveClass[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.from as any)("lecture_classes")
      .select("id,course_id,title,description,starts_at,duration_minutes,meeting_url,repeat_weekly,recording_url")
      .eq("course_id", courseId)
      .order("starts_at");
    if (error) setErr(error.message);
    else setRows((data as LiveClass[]) ?? []);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!title.trim() || !startsAt) {
      setErr("A title and a date/time are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await (supabase.from as any)("lecture_classes").insert({
      course_id: courseId,
      title: title.trim(),
      starts_at: new Date(startsAt).toISOString(),
      duration_minutes: duration,
      meeting_url: meetingUrl.trim() || null,
      repeat_weekly: weekly,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setTitle("");
      setStartsAt("");
      setMeetingUrl("");
      setWeekly(false);
      load();
    }
  }

  async function setRecording(row: LiveClass, url: string) {
    const { error } = await (supabase.from as any)("lecture_classes")
      .update({ recording_url: url.trim() || null })
      .eq("id", row.id);
    if (error) setErr(error.message);
    else load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this class?")) return;
    const { error } = await (supabase.from as any)("lecture_classes").delete().eq("id", id);
    if (error) setErr(error.message);
    else load();
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="text-primary" size={18} />
        <h2 className="font-semibold text-sm text-foreground">Live classes</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Students in this course see the schedule and get a phone notification before each class starts.
      </p>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="rounded-md border border-border bg-background p-4 grid md:grid-cols-2 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Class title (e.g. Week 3 — Cardiology)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          placeholder="Google Meet or Zoom link"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="number"
          min={15}
          step={15}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) || 60)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="accent-[var(--primary)]" />
          Repeats every week on this day
        </label>
        <button
          onClick={add}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Schedule class
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No classes scheduled.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    {new Date(r.starts_at).toLocaleString()} · {r.duration_minutes} min
                    {r.repeat_weekly && (
                      <span className="inline-flex items-center gap-1">
                        <Repeat size={11} /> weekly
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => remove(r.id)} className="p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Video size={13} className="text-muted-foreground shrink-0" />
                <input
                  defaultValue={r.recording_url ?? ""}
                  onBlur={(e) => setRecording(r, e.target.value)}
                  placeholder="Recording link after the class (optional)"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-accent"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
