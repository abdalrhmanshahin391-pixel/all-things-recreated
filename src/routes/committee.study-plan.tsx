import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Map as MapIcon,
  GraduationCap, Trophy, PencilRuler, Check,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";

export const Route = createFileRoute("/committee/study-plan")({
  head: () => ({
    meta: [
      { title: "Medicine Study Plan — Zero to Sixth Course | AquaQBank" },
      {
        name: "description",
        content:
          "The full medicine study plan: every subject from the preparatory Zero course to the Sixth course, with exam type and notes.",
      },
      { property: "og:title", content: "Medicine Study Plan — Zero to Sixth Course" },
      {
        property: "og:description",
        content: "Every subject, semester by semester, with exam type and notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studyPlanQuery),
  component: StudyPlanPage,
});

const BRAND = "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)";

export type Stage = {
  id: string;
  slug: string;
  title_en: string;
  title_ar: string | null;
  subtitle_en: string | null;
  has_semesters: boolean;
  has_finals: boolean;
  sort_order: number;
};

export type PlanSubject = {
  id: string;
  stage_id: string;
  semester: number | null;
  is_final: boolean;
  name: string;
  assessment: string;
  note: string | null;
  sort_order: number;
};

const ASSESSMENTS = [
  { key: "exam", label: "Exam" },
  { key: "oral", label: "Oral exam" },
  { key: "test", label: "Test" },
  { key: "practical", label: "Practical" },
  { key: "pass", label: "Pass" },
  { key: "custom", label: "Other" },
] as const;

function badgeClass(a: string) {
  switch (a) {
    case "exam":
      return "bg-primary/15 text-primary border-primary/30";
    case "oral":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "test":
      return "bg-accent/15 text-accent border-accent/30";
    case "practical":
      return "bg-secondary text-secondary-foreground border-border";
    case "pass":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function badgeLabel(a: string) {
  return ASSESSMENTS.find((x) => x.key === a)?.label ?? a;
}

const studyPlanQuery = queryOptions({
  queryKey: ["study-plan"],
  queryFn: async (): Promise<{ stages: Stage[]; subjects: PlanSubject[] }> => {
    const [{ data: stages, error: e1 }, { data: subjects, error: e2 }] = await Promise.all([
      supabase
        .from("study_plan_stages")
        .select("id, slug, title_en, title_ar, subtitle_en, has_semesters, has_finals, sort_order")
        .order("sort_order"),
      supabase
        .from("study_plan_subjects")
        .select("id, stage_id, semester, is_final, name, assessment, note, sort_order")
        .order("sort_order"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return { stages: (stages ?? []) as Stage[], subjects: (subjects ?? []) as PlanSubject[] };
  },
  staleTime: 5 * 60_000,
});

function StudyPlanPage() {
  const { canManage } = useCommitteeRole();
  const [editMode, setEditMode] = useState(false);
  const { data, isLoading } = useQuery(studyPlanQuery);

  const stages = data?.stages ?? [];
  const subjects = data?.subjects ?? [];

  const total = subjects.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="pt-16 pb-24 px-5 md:px-10 max-w-6xl mx-auto">
        <div className="pt-10">
          <Link
            to="/committee"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={15} /> Back to لجنة الطب والجراحة
          </Link>
        </div>

        <header className="mt-6 rounded-3xl border border-border bg-card p-6 sm:p-9 relative overflow-hidden">
          <div
            className="absolute -top-24 -right-16 h-56 w-56 rounded-full opacity-20 blur-3xl"
            style={{ background: BRAND }}
          />
          <div className="relative flex flex-wrap items-start gap-5">
            <div
              className="grid place-items-center h-16 w-16 shrink-0 rounded-2xl text-white shadow-lg"
              style={{ background: BRAND }}
            >
              <MapIcon size={30} strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Study plan
              </div>
              <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">
                Medicine study plan
              </h1>
              <p className="mt-2 text-muted-foreground max-w-xl">
                From the Zero course to the Sixth course — every subject, its semester and how it is
                assessed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                  {stages.length} stages
                </span>
                <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                  {total} subjects
                </span>
              </div>
            </div>
            {canManage && (
              <button
                onClick={() => setEditMode((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-border bg-background hover:bg-muted"
              >
                {editMode ? <Check size={15} /> : <PencilRuler size={15} />}
                {editMode ? "Done editing" : "Edit plan"}
              </button>
            )}
          </div>
        </header>

        {isLoading ? (
          <div className="mt-8 space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {stages.map((stage, i) => (
              <StageCard
                key={stage.id}
                stage={stage}
                index={i}
                subjects={subjects.filter((s) => s.stage_id === stage.id)}
                editMode={editMode && canManage}
              />
            ))}
          </div>
        )}

        {editMode && canManage && <AddStageRow count={stages.length} />}
      </main>
    </div>
  );
}

/* --------------------------- Stage --------------------------- */

function StageCard({
  stage,
  index,
  subjects,
  editMode,
}: {
  stage: Stage;
  index: number;
  subjects: PlanSubject[];
  editMode: boolean;
}) {
  const qc = useQueryClient();
  const [editingStage, setEditingStage] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["study-plan"] });

  const loose = useMemo(
    () => subjects.filter((s) => !s.is_final && s.semester == null).sort(byOrder),
    [subjects],
  );
  const sem1 = useMemo(
    () => subjects.filter((s) => !s.is_final && s.semester === 1).sort(byOrder),
    [subjects],
  );
  const sem2 = useMemo(
    () => subjects.filter((s) => !s.is_final && s.semester === 2).sort(byOrder),
    [subjects],
  );
  const finals = useMemo(() => subjects.filter((s) => s.is_final).sort(byOrder), [subjects]);

  async function delStage() {
    if (!confirm(`Delete "${stage.title_en}" and all its subjects?`)) return;
    const { error } = await supabase.from("study_plan_stages").delete().eq("id", stage.id);
    if (error) return toast.error(error.message);
    toast.success("Stage deleted");
    refresh();
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-4 px-5 sm:px-6 py-4 border-b border-border bg-muted/40">
        <div
          className="grid place-items-center h-10 w-10 shrink-0 rounded-xl text-white text-sm font-bold"
          style={{ background: BRAND }}
        >
          {index}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold truncate">{stage.title_en}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {[stage.subtitle_en, stage.title_ar].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="hidden sm:inline text-xs text-muted-foreground">
          {subjects.length} subjects
        </span>
        {editMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditingStage(true)}
              className="grid place-items-center h-8 w-8 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
              aria-label="Edit stage"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={delStage}
              className="grid place-items-center h-8 w-8 rounded-md border border-border bg-background text-destructive hover:bg-destructive/10"
              aria-label="Delete stage"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6">
        {stage.has_semesters ? (
          <div className="grid gap-5 md:grid-cols-2">
            <SubjectColumn
              title="First semester"
              stage={stage}
              semester={1}
              items={sem1}
              editMode={editMode}
            />
            <SubjectColumn
              title="Second semester"
              stage={stage}
              semester={2}
              items={sem2}
              editMode={editMode}
            />
          </div>
        ) : (
          <SubjectColumn
            title="Subjects"
            stage={stage}
            semester={null}
            items={loose}
            editMode={editMode}
          />
        )}

        {(stage.has_finals || finals.length > 0) && (
          <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={15} className="text-primary" />
              <h3 className="text-sm font-bold">Final major exams</h3>
            </div>
            <SubjectColumn
              title=""
              stage={stage}
              semester={null}
              isFinal
              items={finals}
              editMode={editMode}
            />
          </div>
        )}
      </div>

      {editingStage && (
        <StageDialog
          stage={stage}
          onClose={() => setEditingStage(false)}
          onSaved={() => {
            setEditingStage(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

const byOrder = (a: PlanSubject, b: PlanSubject) => a.sort_order - b.sort_order;

/* --------------------------- Subjects --------------------------- */

function SubjectColumn({
  title,
  stage,
  semester,
  items,
  editMode,
  isFinal = false,
}: {
  title: string;
  stage: Stage;
  semester: number | null;
  items: PlanSubject[];
  editMode: boolean;
  isFinal?: boolean;
}) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<PlanSubject | "new" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["study-plan"] });

  async function move(item: PlanSubject, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === item.id);
    const other = items[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("study_plan_subjects").update({ sort_order: other.sort_order }).eq("id", item.id),
      supabase.from("study_plan_subjects").update({ sort_order: item.sort_order }).eq("id", other.id),
    ]);
    refresh();
  }

  async function del(item: PlanSubject) {
    if (!confirm(`Remove "${item.name}"?`)) return;
    const { error } = await supabase.from("study_plan_subjects").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div>
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap size={15} className="text-muted-foreground" />
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {title}
          </h3>
        </div>
      )}

      {items.length === 0 && !editMode && (
        <p className="text-sm text-muted-foreground italic">Coming soon</p>
      )}

      <ul className="space-y-2">
        {items.map((s, i) => (
          <li
            key={s.id}
            className="group flex items-start gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5 hover:border-primary/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground break-words">{s.name}</div>
              {s.note && <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>}
            </div>
            <span
              className={`shrink-0 mt-0.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badgeClass(
                s.assessment,
              )}`}
            >
              {badgeLabel(s.assessment)}
            </span>
            {editMode && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => move(s, -1)}
                  disabled={i === 0}
                  className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => move(s, 1)}
                  disabled={i === items.length - 1}
                  className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => setDialog(s)}
                  className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted"
                  aria-label="Edit subject"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => del(s)}
                  className="grid place-items-center h-7 w-7 rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="Delete subject"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editMode && (
        <button
          onClick={() => setDialog("new")}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
        >
          <Plus size={13} /> Add subject
        </button>
      )}

      {dialog && (
        <SubjectDialog
          existing={dialog === "new" ? null : dialog}
          stageId={stage.id}
          semester={isFinal ? null : semester}
          isFinal={isFinal}
          nextOrder={items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SubjectDialog({
  existing,
  stageId,
  semester,
  isFinal,
  nextOrder,
  onClose,
  onSaved,
}: {
  existing: PlanSubject | null;
  stageId: string;
  semester: number | null;
  isFinal: boolean;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [assessment, setAssessment] = useState(existing?.assessment ?? "exam");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    const payload = {
      name: name.trim(),
      assessment,
      note: note.trim() || null,
    };
    const { error } = existing
      ? await supabase.from("study_plan_subjects").update(payload).eq("id", existing.id)
      : await supabase.from("study_plan_subjects").insert({
          ...payload,
          stage_id: stageId,
          semester,
          is_final: isFinal,
          sort_order: nextOrder,
        });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Subject updated" : "Subject added");
    onSaved();
  }

  return (
    <CommitteeDialog title={existing ? "Edit subject" : "Add subject"} onClose={onClose}>
      <Field label="Subject name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Assessment">
        <select
          className={inputCls}
          value={assessment}
          onChange={(e) => setAssessment(e.target.value)}
        >
          {ASSESSMENTS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input
          className={inputCls}
          value={note}
          placeholder="e.g. depends on the group"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}

/* --------------------------- Stage editing --------------------------- */

function StageDialog({
  stage,
  onClose,
  onSaved,
}: {
  stage: Stage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titleEn, setTitleEn] = useState(stage?.title_en ?? "");
  const [titleAr, setTitleAr] = useState(stage?.title_ar ?? "");
  const [subtitle, setSubtitle] = useState(stage?.subtitle_en ?? "");
  const [hasSemesters, setHasSemesters] = useState(stage?.has_semesters ?? true);
  const [hasFinals, setHasFinals] = useState(stage?.has_finals ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!titleEn.trim()) return toast.error("Title is required");
    setSaving(true);
    const payload = {
      title_en: titleEn.trim(),
      title_ar: titleAr.trim() || null,
      subtitle_en: subtitle.trim() || null,
      has_semesters: hasSemesters,
      has_finals: hasFinals,
    };
    const { error } = stage
      ? await supabase.from("study_plan_stages").update(payload).eq("id", stage.id)
      : await supabase.from("study_plan_stages").insert({
          ...payload,
          slug: `stage-${Date.now()}`,
          sort_order: 99,
        });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  }

  return (
    <CommitteeDialog title={stage ? "Edit stage" : "Add stage"} onClose={onClose}>
      <Field label="Title (English)">
        <input className={inputCls} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
      </Field>
      <Field label="Title (Arabic)">
        <input className={inputCls} value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" />
      </Field>
      <Field label="Subtitle (optional)">
        <input className={inputCls} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={hasSemesters}
          onChange={(e) => setHasSemesters(e.target.checked)}
        />
        Has two semesters
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={hasFinals} onChange={(e) => setHasFinals(e.target.checked)} />
        Has final major exams
      </label>
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}

function AddStageRow({ count }: { count: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50"
      >
        <Plus size={15} /> Add stage ({count} so far)
      </button>
      {open && (
        <StageDialog
          stage={null}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["study-plan"] });
          }}
        />
      )}
    </>
  );
}
