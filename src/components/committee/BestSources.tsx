import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BookOpen, Video, NotebookPen, ListChecks, Sparkles, Star, Plus, Pencil, Trash2,
  ArrowUp, ArrowDown, ExternalLink, Crown, Eye, EyeOff,
} from "lucide-react";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";
import { touchCommitteeSnapshot } from "@/lib/committee-snapshot-touch";

export type BestSource = {
  id: string;
  subject_id: string;
  title: string;
  kind: string;
  rating: number;
  note: string | null;
  url: string | null;
  resource_id: string | null;
  is_top: boolean;
  sort_order: number;
};

const KINDS = [
  { key: "book", label: "Book", Icon: BookOpen },
  { key: "video", label: "Video", Icon: Video },
  { key: "notes", label: "Lecture notes", Icon: NotebookPen },
  { key: "qbank", label: "Question bank", Icon: ListChecks },
  { key: "other", label: "Other", Icon: Sparkles },
] as const;

const kindOf = (k: string) => KINDS.find((x) => x.key === k) ?? KINDS[4];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          className={n <= value ? "text-amber-500" : "text-muted-foreground/30"}
          fill={n <= value ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

export function BestSources({
  subjectId,
  canManage,
  enabled,
}: {
  subjectId: string;
  canManage: boolean;
  enabled: boolean;
}) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<BestSource | "new" | null>(null);

  const { data } = useQuery({
    queryKey: ["committee-best-sources", subjectId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("committee_best_sources")
        .select("id, subject_id, title, kind, rating, note, url, resource_id, is_top, sort_order")
        .eq("subject_id", subjectId)
        .order("sort_order");
      if (error) throw error;
      return (rows ?? []) as BestSource[];
    },
    enabled: enabled || canManage,
    staleTime: 5 * 60_000,
  });

  const items = useMemo(
    () =>
      (data ?? [])
        .slice()
        .sort((a, b) => Number(b.is_top) - Number(a.is_top) || a.sort_order - b.sort_order),
    [data],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["committee-best-sources", subjectId] });
    touchCommitteeSnapshot();
  };

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("committee_subjects")
        .update({ best_sources_enabled: next })
        .eq("id", subjectId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ["committee-subject", subjectId] });
      touchCommitteeSnapshot();
      toast.success(next ? "Best sources is now visible" : "Best sources hidden");
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Could not save"),
  });

  async function move(item: BestSource, dir: -1 | 1) {
    const list = (data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const idx = list.findIndex((i) => i.id === item.id);
    const other = list[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("committee_best_sources").update({ sort_order: other.sort_order }).eq("id", item.id),
      supabase.from("committee_best_sources").update({ sort_order: item.sort_order }).eq("id", other.id),
    ]);
    refresh();
  }

  async function del(item: BestSource) {
    if (!confirm(`Remove "${item.title}" from the best sources?`)) return;
    const { error } = await supabase.from("committee_best_sources").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    refresh();
  }

  if (!enabled && !canManage) return null;
  if (!enabled && canManage && items.length === 0) {
    return (
      <div className="mb-5 rounded-xl border border-dashed border-border bg-card/60 p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Best sources of study</span> — turn it on to
          list what previously passed students recommend.
        </p>
        <button
          onClick={() => toggle.mutate(true)}
          className="shrink-0 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
        >
          <Eye size={14} /> Turn on
        </button>
      </div>
    );
  }

  return (
    <section
      className={`mb-5 rounded-2xl border p-4 sm:p-5 ${
        enabled ? "border-amber-500/30 bg-amber-500/5" : "border-dashed border-border bg-card/60"
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-foreground">
            <Crown size={16} className="shrink-0 text-amber-500" />
            <span className="min-w-0">Best sources of study</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Based on previously passed students · أفضل مصادر الدراسة حسب الطلاب السابقين
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              onClick={() => toggle.mutate(!enabled)}
              disabled={toggle.isPending}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
            >
              {enabled ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="hidden sm:inline">{enabled ? "Turn off" : "Turn on"}</span>
            </button>
            <button
              onClick={() => setDialog("new")}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white shadow"
              style={primaryBtnStyle}
            >
              <Plus size={14} /> <span className="hidden sm:inline">Add source</span>
            </button>
          </div>
        )}
      </div>

      {!enabled && canManage && (
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          Hidden from students right now.
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-4 text-sm italic text-muted-foreground">No sources added yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {items.map((s, i) => {
            const { Icon, label } = kindOf(s.kind);
            return (
              <li
                key={s.id}
                className={`rounded-xl border bg-background p-3.5 ${
                  s.is_top ? "border-amber-500/60 shadow-sm" : "border-border"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-foreground">{s.title}</h3>
                      {s.is_top && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                          Top pick
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </span>
                      <Stars value={s.rating} />
                    </div>
                    {s.note && <p className="mt-1.5 text-xs text-muted-foreground">{s.note}</p>}
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      >
                        <ExternalLink size={13} /> Open source
                      </a>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-border pt-2">
                    <button
                      onClick={() => move(s, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      onClick={() => move(s, 1)}
                      disabled={i === items.length - 1}
                      aria-label="Move down"
                      className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      onClick={() => setDialog(s)}
                      aria-label="Edit source"
                      className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => del(s)}
                      aria-label="Delete source"
                      className="grid h-10 w-10 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <SourceDialog
          existing={dialog === "new" ? null : dialog}
          subjectId={subjectId}
          nextOrder={items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function SourceDialog({
  existing,
  subjectId,
  nextOrder,
  onClose,
  onSaved,
}: {
  existing: BestSource | null;
  subjectId: string;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [kind, setKind] = useState(existing?.kind ?? "book");
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [note, setNote] = useState(existing?.note ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [isTop, setIsTop] = useState(existing?.is_top ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return toast.error("Source name is required");
    setSaving(true);
    const payload = {
      title: title.trim(),
      kind,
      rating,
      note: note.trim() || null,
      url: url.trim() || null,
      is_top: isTop,
    };
    const { error } = existing
      ? await supabase.from("committee_best_sources").update(payload).eq("id", existing.id)
      : await supabase
          .from("committee_best_sources")
          .insert({ ...payload, subject_id: subjectId, sort_order: nextOrder });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Source updated" : "Source added");
    onSaved();
  }

  return (
    <CommitteeDialog title={existing ? "Edit source" : "Add best source"} onClose={onClose}>
      <Field label="Source name">
        <input
          className={inputCls}
          value={title}
          placeholder="e.g. Robbins & Cotran"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Students' rating">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} stars`}
              className="grid h-10 w-10 place-items-center rounded-md hover:bg-muted"
            >
              <Star
                size={20}
                className={n <= rating ? "text-amber-500" : "text-muted-foreground/30"}
                fill={n <= rating ? "currentColor" : "none"}
              />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Note (optional)">
        <input
          className={inputCls}
          value={note}
          placeholder="e.g. best for chapters 1–6"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label="Link (optional)">
        <input
          className={inputCls}
          value={url}
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={isTop} onChange={(e) => setIsTop(e.target.checked)} />
        Mark as top pick
      </label>
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}