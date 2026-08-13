import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Kind = "words" | "sentences";
type SubjectLite = { id: string; title: string };
type NewEntry = { id: string; german: string; english: string; subjectId: string; kind: Kind };

export function AddEntryDialog({
  open,
  onOpenChange,
  courseId,
  initialTab = "words",
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseId: string;
  initialTab?: Kind;
  onAdded: (entry: NewEntry) => void;
}) {
  const [tab, setTab] = useState<Kind>(initialTab);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [german, setGerman] = useState("");
  const [english, setEnglish] = useState("");
  const [saving, setSaving] = useState(false);

  // inline subject creation state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<Kind>(initialTab);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setNewKind(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase.from as any)("german_subjects")
        .select("id,title").eq("course_id", courseId).order("position");
      const list = (data ?? []) as SubjectLite[];
      setSubjects(list);
      if (list.length && !subjectId) setSubjectId(list[0].id);
    })();
  }, [open, courseId]);

  const canSave = !!subjectId && german.trim().length > 0 && !saving;

  async function handleCreateSubject() {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const { data: existing } = await (supabase.from as any)("german_subjects")
        .select("position").eq("course_id", courseId).order("position", { ascending: false }).limit(1);
      const nextPos = ((existing?.[0]?.position ?? -1) as number) + 1;
      const { data: sub, error } = await (supabase.from as any)("german_subjects")
        .insert({ course_id: courseId, title, position: nextPos })
        .select("id,title").single();
      if (error) throw error;

      // create matching items row for the chosen kind
      await (supabase.from as any)("german_items").insert({
        subject_id: sub.id,
        title: newKind === "words" ? "Words" : "Sentences",
        kind: newKind,
        position: 0,
      });


      setSubjects((p) => [...p, { id: sub.id, title: sub.title }]);
      setSubjectId(sub.id);
      setTab(newKind);
      setCreateOpen(false);
      setNewTitle("");
      toast.success(`Subject "${title}" created`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create subject");
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const kindCol = tab; // "words" | "sentences"
      const table = tab === "words" ? "german_word_entries" : "german_sentence_entries";

      // find or create an item under this subject
      const { data: items } = await (supabase.from as any)("german_items")
        .select("id,kind,position").eq("subject_id", subjectId).order("position");
      let item = (items ?? []).find((i: any) => i.kind === kindCol) ?? (items ?? [])[0];
      if (!item) {
        const { data: ins, error } = await (supabase.from as any)("german_items")
          .insert({ subject_id: subjectId, title: tab === "words" ? "Words" : "Sentences", kind: kindCol, position: 0 })
          .select("id").single();
        if (error) throw error;
        item = ins;
      }


      const { data: existing } = await (supabase.from as any)(table)
        .select("position").eq("item_id", item.id).order("position").limit(1);
      const newPos = ((existing?.[0]?.position ?? 0) as number) - 1;

      const payload = { item_id: item.id, german: german.trim(), english: english.trim(), position: newPos };
      const { data: inserted, error: insErr } = await (supabase.from as any)(table)
        .insert(payload).select("id,german,english").single();
      if (insErr) throw insErr;

      onAdded({ id: inserted.id, german: inserted.german, english: inserted.english, subjectId, kind: tab });
      setGerman("");
      setEnglish("");
      toast.success(`Added to ${subjects.find((s) => s.id === subjectId)?.title ?? "subject"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to course</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 bg-slate-100 rounded-full p-1 mt-1">
          {(["words", "sentences"] as Kind[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-10 rounded-full text-sm font-bold transition ${
                tab === t ? "bg-white text-blue-600 shadow" : "text-slate-500"
              }`}
            >
              {t === "words" ? "Words" : "Sentences"}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase text-slate-500">Select a subject</div>
            <button
              type="button"
              onClick={() => setCreateOpen((v) => !v)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {createOpen && (
            <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Subject name (e.g. Body parts)"
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <div className="grid grid-cols-2 bg-white rounded-full p-1 border border-slate-200">
                {(["words", "sentences"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setNewKind(k)}
                    className={`h-8 rounded-full text-xs font-bold transition ${
                      newKind === k ? "bg-blue-600 text-white" : "text-slate-500"
                    }`}
                  >
                    {k === "words" ? "Words" : "Sentences"}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setCreateOpen(false); setNewTitle(""); }}
                  className="h-8 px-3 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newTitle.trim() || creating}
                  onClick={handleCreateSubject}
                  className="h-8 px-3 rounded-full text-xs font-bold bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
                >
                  {creating ? "Creating…" : "Create subject"}
                </button>
              </div>
            </div>
          )}

          {subjects.length === 0 ? (
            <div className="text-sm text-slate-500 py-3">No subjects yet. Tap “+ New” to create one.</div>
          ) : (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y">
              {subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="subject"
                    checked={subjectId === s.id}
                    onChange={() => setSubjectId(s.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-900">{s.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={german}
            onChange={(e) => setGerman(e.target.value)}
            placeholder={tab === "words" ? "German word (e.g. Hund)" : "German sentence"}
            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={english}
            onChange={(e) => setEnglish(e.target.value)}
            placeholder="Translation (optional)"
            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="h-10 px-5 rounded-full text-sm font-bold bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
