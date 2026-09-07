import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, FileText, Link2, Loader2, Radio, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveLecturePdfUrl } from "@/lib/lecture-video";
import { LecturePdfModal } from "@/components/lectures/LecturePdfModal";

type Material = { id: string; title: string; url: string | null; storage_path: string | null };
type LiveClass = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  recording_url: string | null;
  repeat_weekly: boolean;
};

/** Course-wide material students can open (protected reader for uploaded files). */
export function CourseMaterialsList({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<Material[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ src: string; title: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase.from as any)("lecture_course_materials")
        .select("id,title,url,storage_path")
        .eq("course_id", courseId)
        .order("position");
      if (alive) setRows((data as Material[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  if (!rows.length) return null;

  async function open(m: Material) {
    if (m.storage_path) {
      setOpeningId(m.id);
      const url = await resolveLecturePdfUrl(null, m.storage_path);
      setOpeningId(null);
      if (url) setPdf({ src: url, title: m.title });
      return;
    }
    if (m.url) window.open(m.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
        <FileText size={18} className="text-primary" /> Course material
      </h2>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {rows.map((m) => (
          <button
            key={m.id}
            onClick={() => open(m)}
            className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-muted/40 transition"
          >
            {m.storage_path ? (
              <FileText size={16} className="text-primary shrink-0" />
            ) : (
              <Link2 size={16} className="text-primary shrink-0" />
            )}
            <span className="flex-1 min-w-0 truncate font-semibold text-foreground">{m.title}</span>
            {openingId === m.id ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <ExternalLink size={14} className="text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
      {pdf && <LecturePdfModal src={pdf.src} title={pdf.title} onClose={() => setPdf(null)} />}
    </section>
  );
}

/** Upcoming and past live classes for a course. */
export function LiveClassesList({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<LiveClass[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase.from as any)("lecture_classes")
        .select("id,title,starts_at,duration_minutes,meeting_url,recording_url,repeat_weekly")
        .eq("course_id", courseId)
        .order("starts_at");
      if (alive) setRows((data as LiveClass[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  if (!rows.length) return null;

  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.starts_at).getTime() + r.duration_minutes * 60_000 > now);
  const past = rows.filter((r) => new Date(r.starts_at).getTime() + r.duration_minutes * 60_000 <= now);

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
        <Radio size={18} className="text-primary" /> Live classes
      </h2>

      <div className="space-y-2">
        {upcoming.map((r) => {
          const start = new Date(r.starts_at).getTime();
          const joinable = now >= start - 15 * 60_000 && now <= start + r.duration_minutes * 60_000;
          return (
            <div
              key={r.id}
              className="rounded-lg border border-accent/30 bg-accent/5 px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">{r.title}</div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <CalendarClock size={12} />
                  {new Date(r.starts_at).toLocaleString()} · {r.duration_minutes} min
                  {r.repeat_weekly ? " · weekly" : ""}
                </div>
              </div>
              {r.meeting_url && (
                <a
                  href={r.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold ${
                    joinable
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground"
                  }`}
                >
                  <Video size={13} /> {joinable ? "Join now" : "Scheduled"}
                </a>
              )}
            </div>
          );
        })}

        {past.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-border bg-card px-5 py-3.5 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">{r.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(r.starts_at).toLocaleString()}
              </div>
            </div>
            {r.recording_url ? (
              <a
                href={r.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold"
              >
                <Video size={13} /> Recording
              </a>
            ) : (
              <span className="text-[11px] text-muted-foreground font-semibold shrink-0">Finished</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
