import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";

export type SubjectCourse = {
  id: string;
  subject_id: string;
  course_id: string;
  offer_label: string | null;
  original_price: number | null;
  promo_price: number | null;
  note: string | null;
  sort_order: number;
  course?: { id: string; title: string; price: number; image_url: string | null; published: boolean } | null;
};

const BRAND = "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)";

function money(v: number | null | undefined) {
  if (v === null || v === undefined) return null;
  return Number(v) <= 0 ? "Free" : `$${Number(v).toFixed(2).replace(/\.00$/, "")}`;
}

export function LinkedCourses({ subjectId, canManage }: { subjectId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ editing: SubjectCourse | null } | null>(null);

  const { data: links } = useQuery({
    queryKey: ["committee-subject-courses", subjectId],
    queryFn: async (): Promise<SubjectCourse[]> => {
      const { data, error } = await supabase
        .from("committee_subject_courses")
        .select("*, course:courses(id,title,price,image_url,published)")
        .eq("subject_id", subjectId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as SubjectCourse[];
    },
    staleTime: 60_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["committee-subject-courses", subjectId] });
  }

  async function remove(l: SubjectCourse) {
    if (!confirm("Remove this course from the subject?")) return;
    const { error } = await supabase.from("committee_subject_courses").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Course unlinked");
    invalidate();
  }

  const items = links ?? [];
  if (items.length === 0 && !canManage) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Related course{items.length === 1 ? "" : "s"}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setForm({ editing: null })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-border bg-background hover:bg-muted"
          >
            <Plus size={13} /> Link a course
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No course linked to this subject yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((l) => {
            const before = money(l.original_price ?? l.course?.price ?? null);
            const after = money(l.promo_price);
            return (
              <div key={l.id} className="relative group">
                <Link
                  to="/courses/$courseId"
                  params={{ courseId: l.course_id }}
                  className="block h-full rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="grid place-items-center h-11 w-11 shrink-0 rounded-lg text-white"
                      style={{ background: BRAND }}
                    >
                      <GraduationCap size={20} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-foreground truncate">
                        {l.course?.title ?? "Course"}
                      </div>
                      {l.note && <p className="text-xs text-muted-foreground truncate">{l.note}</p>}
                    </div>
                    <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                  </div>
                  {(l.offer_label || after) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {l.offer_label && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
                          {l.offer_label}
                        </span>
                      )}
                      {after && (
                        <span className="text-sm font-bold text-foreground">
                          {before && before !== after && (
                            <span className="mr-2 text-xs font-medium text-muted-foreground line-through">{before}</span>
                          )}
                          {after}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
                {canManage && (
                  <div className="absolute top-2 right-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm({ editing: l }); }}
                      className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label="Edit link"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(l); }}
                      className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      aria-label="Remove link"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <LinkCourseForm
          subjectId={subjectId}
          editing={form.editing}
          nextSort={items.length + 1}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function LinkCourseForm({
  subjectId,
  editing,
  nextSort,
  onClose,
  onSaved,
}: {
  subjectId: string;
  editing: SubjectCourse | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [courseId, setCourseId] = useState(editing?.course_id ?? "");
  const [label, setLabel] = useState(editing?.offer_label ?? "");
  const [before, setBefore] = useState(editing?.original_price != null ? String(editing.original_price) : "");
  const [after, setAfter] = useState(editing?.promo_price != null ? String(editing.promo_price) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const { data: courses } = useQuery({
    queryKey: ["all-courses-for-link"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id,title,price").order("title");
      return (data ?? []) as Array<{ id: string; title: string; price: number }>;
    },
    staleTime: 5 * 60_000,
  });

  async function save() {
    if (!courseId) return toast.error("Pick a course");
    setSaving(true);
    const payload = {
      subject_id: subjectId,
      course_id: courseId,
      offer_label: label.trim() || null,
      original_price: before.trim() === "" ? null : Number(before),
      promo_price: after.trim() === "" ? null : Number(after),
      note: note.trim() || null,
    };
    const op = editing
      ? supabase.from("committee_subject_courses").update(payload).eq("id", editing.id)
      : supabase.from("committee_subject_courses").insert({ ...payload, sort_order: nextSort });
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Course link updated" : "Course linked");
    onSaved();
  }

  return (
    <CommitteeDialog title={editing ? "Edit course link" : "Link a course"} onClose={onClose}>
      <Field label="Course">
        <select className={inputCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Select a course…</option>
          {(courses ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </Field>
      <Field label="Offer label (optional)">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Limited offer" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Old price (USD)">
          <input className={inputCls} inputMode="decimal" value={before} onChange={(e) => setBefore(e.target.value)} placeholder="100" />
        </Field>
        <Field label="New price (USD)">
          <input className={inputCls} inputMode="decimal" value={after} onChange={(e) => setAfter(e.target.value)} placeholder="0 = Free" />
        </Field>
      </div>
      <Field label="Short note (optional)">
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Covers this subject's exam questions" />
      </Field>
      <p className="text-xs text-muted-foreground -mt-1 mb-3">
        Prices here are shown as a promo label only. The real checkout price stays what you set in Admin → Courses.
      </p>
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}