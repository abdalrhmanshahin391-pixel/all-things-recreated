import { useEffect, useMemo, useState } from "react";
import { Loader2, Merge } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { mergeSubjects } from "@/lib/subjects.functions";

type Group = { id: string; name: string; sort_order: number };
type Subject = { id: string; group_id: string; name: string; sort_order: number; question_count: number };

/** Admin: move every question of one subject into another subject of the course (same section or not). */
export function MergeSubjectDialog({
  source,
  groups,
  subjects,
  onClose,
  onDone,
}: {
  source: Subject | null;
  groups: Group[];
  subjects: Subject[];
  onClose: () => void;
  onDone: () => void;
}) {
  const merge = useServerFn(mergeSubjects);
  const [targetId, setTargetId] = useState("");
  const [deleteAfter, setDeleteAfter] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTargetId("");
    setDeleteAfter(true);
    setBusy(false);
  }, [source?.id]);

  const sections = useMemo(
    () =>
      [...groups]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => ({ group: g, items: subjects.filter((s) => s.group_id === g.id && s.id !== source?.id).sort((a, b) => a.sort_order - b.sort_order) }))
        .filter((x) => x.items.length > 0),
    [groups, subjects, source?.id],
  );
  const target = subjects.find((s) => s.id === targetId) ?? null;
  const targetGroup = target ? groups.find((g) => g.id === target.group_id) : null;

  async function run() {
    if (!source || !target) return;
    setBusy(true);
    try {
      const res = await merge({ data: { fromSubjectId: source.id, intoSubjectId: target.id, deleteEmpty: deleteAfter } });
      const parts = [`${res.moved} question${res.moved === 1 ? "" : "s"} moved to "${res.intoName}".`];
      if (res.skipped > 0) parts.push(`${res.skipped} already existed there and stayed in "${res.fromName}".`);
      if (res.deleted) parts.push(`"${res.fromName}" was deleted.`);
      if (res.skipped > 0) toast.warning(parts.join(" "));
      else toast.success(parts.join(" "));
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not merge the subjects");
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!source} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" /> Merge subject
          </DialogTitle>
          <DialogDescription>
            Move all {source?.question_count ?? 0} questions of <b>{source?.name}</b> into another subject. The other subject can be in any section of this course.
          </DialogDescription>
        </DialogHeader>

        <label className="block text-sm font-semibold">
          Merge into
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-normal"
          >
            <option value="">Choose a subject…</option>
            {sections.map(({ group, items }) => (
              <optgroup key={group.id} label={group.name}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.question_count})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {target && (
          <p className="text-sm text-muted-foreground">
            {source?.question_count ?? 0} questions will be added after the {target.question_count} that are already in <b>{target.name}</b>
            {targetGroup ? <> ({targetGroup.name})</> : null}. A question with the same text as one already there is not moved.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={deleteAfter} onChange={(e) => setDeleteAfter(e.target.checked)} disabled={busy} className="cb-indigo" />
          Delete <b>{source?.name}</b> afterwards (only when it is empty)
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} disabled={!target || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
