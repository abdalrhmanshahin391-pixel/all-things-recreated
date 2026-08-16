import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2, Eye, EyeOff, Pencil } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";
import { eventsQuery, slugify, accentColor, type SiteEvent } from "@/lib/events";

export const Route = createFileRoute("/admin/events")({
  head: () => ({
    meta: [
      { title: "Events — AquaQBank Admin" },
      { name: "description", content: "Create and switch on event pages for new students and special programs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminEventsPage,
});

const db = (t: string) => (supabase.from as any)(t);

function AdminEventsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: events } = useQuery({ ...eventsQuery, enabled: isAdmin });
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin) return <div className="min-h-screen bg-muted/40" />;

  async function create() {
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await db("events").insert({
      slug: slugify(name),
      title_en: name,
      title_ar: name,
      sort_order: (events?.length ?? 0) + 1,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTitle("");
    qc.invalidateQueries({ queryKey: ["events"] });
    toast.success("Event created");
  }

  async function patch(ev: SiteEvent, values: Partial<SiteEvent>) {
    const { error } = await db("events").update(values).eq("id", ev.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  async function remove(ev: SiteEvent) {
    if (!confirm(`Delete "${ev.title_en || ev.slug}" and everything inside it?`)) return;
    const { error } = await db("events").delete().eq("id", ev.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pt-28 pb-20">
        <h1 className="mb-2 inline-flex items-center gap-3 text-3xl font-black tracking-tight md:text-4xl">
          <CalendarDays size={28} className="text-primary" /> Events
        </h1>
        <p className="mb-8 text-muted-foreground">
          Build a page for anything happening at the university — an orientation week, a zero
          course, a scholarship — then switch it on when you are ready.
        </p>

        <div className="mb-8 flex gap-2 rounded-2xl border border-border bg-card p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event name (English or Arabic)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={busy || !title.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            <Plus size={15} /> Create
          </button>
        </div>

        <div className="space-y-3">
          {(events ?? []).map((ev) => (
            <div key={ev.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="h-9 w-9 shrink-0 rounded-xl"
                  style={{ background: accentColor[ev.accent] ?? accentColor.emerald }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{ev.title_en || ev.title_ar || ev.slug}</p>
                  <p className="truncate text-xs text-muted-foreground">/events/{ev.slug}</p>
                </div>
                <button
                  onClick={() => patch(ev, { enabled: !ev.enabled })}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${ev.enabled ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
                >
                  {ev.enabled ? <Eye size={13} /> : <EyeOff size={13} />} {ev.enabled ? "On" : "Off"}
                </button>
                <Link
                  to="/admin/events/$eventId"
                  params={{ eventId: ev.id }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold"
                >
                  <Pencil size={13} /> Edit
                </Link>
                <button
                  onClick={() => remove(ev)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                  aria-label="Delete event"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {(events ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No events yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
