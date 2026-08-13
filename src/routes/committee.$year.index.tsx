import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, Plus, Pencil, Trash2, Shield, CalendarDays, Layers } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { iconOf, ICON_KEYS } from "@/lib/committee-meta";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";
import { SubjectTag, TAG_COLOR_KEYS, tagChipClass } from "@/components/committee/SubjectTag";
import { ClosedWrap, ClosedBanner, ClosedFields, closedDefaults, closedPayload, CLOSED_SELECT, type ClosedInfo } from "@/components/committee/ClosedState";

export const Route = createFileRoute("/committee/$year/")({
  validateSearch: (search: Record<string, unknown>) => ({
    sem: typeof search['sem'] === "string" ? (search['sem'] as string) : undefined,
    mod: typeof search['mod'] === "string" ? (search['mod'] as string) : undefined,
  }),
  component: YearPage,
});

type Subject = {
  id: string;
  year_id: string;
  semester_id: string | null;
  module_id: string | null;
  name: string;
  icon_key: string;
  sort_order: number;
  tag_label?: string | null;
  tag_color?: string | null;
} & ClosedInfo;

type Semester = {
  id: string;
  year_id: string;
  name: string;
  number: number;
  sort_order: number;
} & ClosedInfo;

type Module = {
  id: string;
  semester_id: string;
  name: string;
  icon_key: string;
  sort_order: number;
} & ClosedInfo;

const BRAND = "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)";

function YearPage() {
  const { year } = useParams({ from: "/committee/$year/" });
  const { sem, mod } = Route.useSearch();
  const navigate = useNavigate();
  const { canManage, isAdmin, isCommittee } = useCommitteeRole();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [addingSem, setAddingSem] = useState(false);
  const [editingSem, setEditingSem] = useState<Semester | null>(null);
  const [addingMod, setAddingMod] = useState(false);
  const [editingMod, setEditingMod] = useState<Module | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["committee-year", year],
    queryFn: async () => {
      const { data: y } = await supabase
        .from("committee_years")
        .select(`id, display_name, year_number, icon_key, ${CLOSED_SELECT}`)
        .eq("year_number", Number(year))
        .maybeSingle();
      if (!y) return { year: null, subjects: [] as Subject[], semesters: [] as Semester[], modules: [] as Module[] };
      const [{ data: s }, { data: sem }, { data: allMods }] = await Promise.all([
        supabase
          .from("committee_subjects")
          .select(`id, year_id, semester_id, module_id, name, icon_key, sort_order, tag_label, tag_color, ${CLOSED_SELECT}`)
          .eq("year_id", y.id)
          .order("sort_order"),
        supabase
          .from("committee_semesters")
          .select(`id, year_id, name, number, sort_order, ${CLOSED_SELECT}`)
          .eq("year_id", y.id)
          .order("sort_order"),
        supabase
          .from("committee_modules")
          .select(`id, semester_id, name, icon_key, sort_order, ${CLOSED_SELECT}`)
          .order("sort_order"),
      ]);
      const semIds = (sem ?? []).map((x: { id: string }) => x.id);
      const mods = ((allMods ?? []) as Module[]).filter((m) => semIds.includes(m.semester_id));
      return {
        year: y,
        subjects: (s ?? []) as Subject[],
        semesters: (sem ?? []) as Semester[],
        modules: (mods ?? []) as Module[],
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const YearIcon = iconOf(data?.year?.icon_key ?? "graduation-cap");
  const yearNumber = data?.year?.year_number ?? Number(year);
  const usesSemesters = yearNumber >= 1 && yearNumber <= 6;
  const semesters = data?.semesters ?? [];
  const activeSemester = usesSemesters ? semesters.find((s) => s.id === sem) ?? null : null;
  const showSemesterGrid = usesSemesters && !activeSemester;
  const semesterModules = (data?.modules ?? []).filter((m) => m.semester_id === activeSemester?.id);
  const activeModule = activeSemester ? semesterModules.find((m) => m.id === mod) ?? null : null;
  const semesterSubjects = (data?.subjects ?? []).filter((s) =>
    usesSemesters ? s.semester_id === activeSemester?.id : true,
  );
  const visibleSubjects = activeModule
    ? semesterSubjects.filter((s) => s.module_id === activeModule.id)
    : usesSemesters && activeSemester
      ? semesterSubjects.filter((s) => !s.module_id)
      : semesterSubjects;

  // Students can't open a closed year / semester / module, even by URL.
  const blockedBy = !canManage
    ? (data?.year as ClosedInfo | undefined)?.is_closed
      ? (data?.year as ClosedInfo)
      : activeSemester?.is_closed
        ? activeSemester
        : activeModule?.is_closed
          ? activeModule
          : null
    : null;

  function openSemester(id: string | undefined) {
    navigate({ to: "/committee/$year", params: { year }, search: { sem: id, mod: undefined } });
  }

  function openModule(id: string | undefined) {
    navigate({ to: "/committee/$year", params: { year }, search: { sem, mod: id } });
  }

  async function del(s: Subject) {
    if (!confirm(`Delete ${s.name} and its resources?`)) return;
    const { error } = await supabase.from("committee_subjects").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Subject deleted");
    qc.invalidateQueries({ queryKey: ["committee-year", year] });
  }

  async function delSemester(s: Semester) {
    if (!confirm(`Delete ${s.name}? All its subjects and resources will be removed.`)) return;
    const { error } = await supabase.from("committee_semesters").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Semester deleted");
    qc.invalidateQueries({ queryKey: ["committee-year", year] });
  }

  async function delModule(m: Module) {
    if (!confirm(`Delete module ${m.name}? All its subjects and resources will be removed.`)) return;
    const { error } = await supabase.from("committee_modules").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Module deleted");
    qc.invalidateQueries({ queryKey: ["committee-year", year] });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main className="pt-16 pb-24 px-6 md:px-10 max-w-6xl mx-auto">
        <div className="pt-10">
          {activeModule ? (
            <button
              type="button"
              onClick={() => openModule(undefined)}
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ChevronLeft size={16} /> Back to {activeSemester?.name ?? "semester"}
            </button>
          ) : activeSemester ? (
            <button
              type="button"
              onClick={() => openSemester(undefined)}
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ChevronLeft size={16} /> Back to semesters
            </button>
          ) : (
            <Link
              to="/committee"
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ChevronLeft size={16} /> Back to years
            </Link>
          )}
        </div>

        {data?.year && (
          <header className="mb-10 p-6 rounded-xl bg-card border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid place-items-center h-14 w-14 shrink-0 rounded-lg bg-muted text-primary">
                  <YearIcon size={26} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {data.year.year_number === 0 ? "Preparation Year" : `Year ${data.year.year_number}`}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate text-foreground">
                    {activeModule
                      ? `${activeSemester?.name ?? ""} · ${activeModule.name}`
                      : activeSemester
                        ? `${data.year.display_name} · ${activeSemester.name}`
                        : data.year.display_name}
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {showSemesterGrid
                      ? `${semesters.length} semester${semesters.length === 1 ? "" : "s"}`
                      : `${visibleSubjects.length} subjects`}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-primary text-primary-foreground">
                    <Shield size={11} /> {isAdmin ? "Admin" : "عضو في اللجنة"}
                  </span>
                  {showSemesterGrid ? (
                    <button
                      onClick={() => setAddingSem(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Plus size={14} /> Add semester
                    </button>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2">
                      {activeSemester && !activeModule && (
                        <button
                          onClick={() => setAddingMod(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted"
                        >
                          <Layers size={14} /> Add module
                        </button>
                      )}
                      <button
                        onClick={() => setAdding(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Plus size={14} /> Add subject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>
        )}

        {canManage && (
          <ClosedBanner info={(activeModule ?? activeSemester ?? data?.year ?? {}) as ClosedInfo} />
        )}

        {blockedBy ? (
          <div className="text-center py-20 rounded-xl bg-card border border-dashed border-border">
            <p className="text-lg font-semibold text-foreground">
              {(blockedBy.closed_note ?? "").trim() || "Coming soon"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">This section is currently closed.</p>
            <Link to="/committee" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
              <ChevronLeft size={16} /> Back to years
            </Link>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : showSemesterGrid ? (
          semesters.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-card border border-dashed border-border">
              <p className="text-muted-foreground">
                No semesters yet.{canManage ? " Click \"Add semester\" above to create one." : ""}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {semesters.map((s) => {
                const count = (data?.subjects ?? []).filter((x) => x.semester_id === s.id).length;
                return (
                  <div key={s.id} className="relative group">
                    <ClosedWrap info={s} canManage={canManage}>
                    <button
                      type="button"
                      onClick={() => openSemester(s.id)}
                      className="w-full flex items-center gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all text-left"
                    >
                      <div className="grid place-items-center h-12 w-12 shrink-0 rounded-lg bg-muted text-primary">
                        <CalendarDays size={22} strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-foreground truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {count} subject{count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </button>
                    </ClosedWrap>
                    {canManage && (
                      <div className="absolute top-1.5 right-1.5 flex gap-1 z-40">
                        <button
                          onClick={() => setEditingSem(s)}
                          className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label="Edit semester"
                          type="button"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => delSemester(s)}
                          className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete semester"
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            {activeSemester && !activeModule && semesterModules.length > 0 && (
              <div className="mb-8">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  Modules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {semesterModules.map((m) => {
                    const MIcon = iconOf(m.icon_key);
                    const count = semesterSubjects.filter((x) => x.module_id === m.id).length;
                    return (
                      <div key={m.id} className="relative group">
                        <ClosedWrap info={m} canManage={canManage}>
                        <button
                          type="button"
                          onClick={() => openModule(m.id)}
                          className="w-full flex items-center gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all text-left"
                        >
                          <div className="grid place-items-center h-12 w-12 shrink-0 rounded-lg bg-muted text-primary">
                            <MIcon size={22} strokeWidth={1.8} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-foreground truncate">{m.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {count} subject{count === 1 ? "" : "s"}
                            </div>
                          </div>
                        </button>
                        </ClosedWrap>
                        {canManage && (
                          <div className="absolute top-1.5 right-1.5 flex gap-1 z-40">
                            <button
                              onClick={() => setEditingMod(m)}
                              className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                              aria-label="Edit module"
                              type="button"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => delModule(m)}
                              className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              aria-label="Delete module"
                              type="button"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {visibleSubjects.length === 0 ? (
              <div className="text-center py-16 rounded-xl bg-card border border-dashed border-border">
                <p className="text-muted-foreground">
                  No subjects here yet.{canManage ? " Use the buttons above to add one." : ""}
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleSubjects.map((s) => {
              const Icon = iconOf(s.icon_key);
              return (
                <div key={s.id} className="relative group">
                  <ClosedWrap info={s} canManage={canManage}>
                  <Link
                    to="/committee/$year/$subject"
                    params={{ year, subject: s.id }}
                    onMouseEnter={() => qc.prefetchQuery(committeeSubjectQuery(s.id))}
                    onTouchStart={() => qc.prefetchQuery(committeeSubjectQuery(s.id))}
                    className="flex min-h-32 flex-col items-center text-center gap-3 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                    preload="intent"
                  >
                    <div className="grid place-items-center h-12 w-12 rounded-lg bg-muted text-primary">
                      <Icon size={22} strokeWidth={1.8} />
                    </div>
                    <div className="text-sm font-semibold text-foreground leading-snug">{s.name}</div>
                    <SubjectTag label={s.tag_label} color={s.tag_color} />
                  </Link>
                  </ClosedWrap>
                  {canManage && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 z-40">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(s); }}
                        className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label="Edit"
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); del(s); }}
                        className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label="Delete"
                        type="button"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            )}
          </>
        )}
      </main>


      {(adding || editing) && data?.year && (
        <SubjectForm
          yearId={data.year.id}
          semesterId={activeSemester?.id ?? null}
          moduleId={activeModule?.id ?? null}
          modules={semesterModules}
          subject={editing}
          nextSort={visibleSubjects.length + 1}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["committee-year", year] });
          }}
        />
      )}
      {(addingSem || editingSem) && data?.year && (
        <SemesterForm
          yearId={data.year.id}
          semester={editingSem}
          nextNumber={semesters.length + 1}
          onClose={() => { setAddingSem(false); setEditingSem(null); }}
          onSaved={() => {
            setAddingSem(false);
            setEditingSem(null);
            qc.invalidateQueries({ queryKey: ["committee-year", year] });
          }}
        />
      )}
      {(addingMod || editingMod) && activeSemester && (
        <ModuleForm
          semesterId={activeSemester.id}
          module={editingMod}
          nextSort={semesterModules.length + 1}
          onClose={() => { setAddingMod(false); setEditingMod(null); }}
          onSaved={() => {
            setAddingMod(false);
            setEditingMod(null);
            qc.invalidateQueries({ queryKey: ["committee-year", year] });
          }}
        />
      )}
      {isCommittee && !isAdmin && (
        <span className="sr-only">committee member tools active</span>
      )}
    </div>
  );
}

function SemesterForm({
  yearId,
  semester,
  nextNumber,
  onClose,
  onSaved,
}: {
  yearId: string;
  semester: Semester | null;
  nextNumber: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(semester?.name ?? `Semester ${nextNumber}`);
  const [order, setOrder] = useState(String(semester?.sort_order ?? nextNumber));
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(closedDefaults(semester));

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    const n = Number(order) || nextNumber;
    setSaving(true);
    const op = semester
      ? supabase.from("committee_semesters").update({ name: name.trim(), sort_order: n, number: n, ...closedPayload(closed) }).eq("id", semester.id)
      : supabase.from("committee_semesters").insert({ year_id: yearId, name: name.trim(), number: n, sort_order: n, ...closedPayload(closed) });
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(semester ? "Semester updated" : "Semester added");
    onSaved();
  }

  return (
    <CommitteeDialog title={semester ? `Edit ${semester.name}` : "Add semester"} onClose={onClose}>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Semester 1" />
      </Field>
      <Field label="Order">
        <input className={inputCls} type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />
      </Field>
      <ClosedFields value={closed} onChange={setClosed} />
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}

function ModuleForm({
  semesterId,
  module: mod,
  nextSort,
  onClose,
  onSaved,
}: {
  semesterId: string;
  module: Module | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(mod?.name ?? "");
  const [icon, setIcon] = useState(mod?.icon_key ?? "layers");
  const [order, setOrder] = useState(String(mod?.sort_order ?? nextSort));
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(closedDefaults(mod));

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    const n = Number(order) || nextSort;
    setSaving(true);
    const op = mod
      ? supabase.from("committee_modules").update({ name: name.trim(), icon_key: icon, sort_order: n, ...closedPayload(closed) }).eq("id", mod.id)
      : supabase.from("committee_modules").insert({ semester_id: semesterId, name: name.trim(), icon_key: icon, sort_order: n, ...closedPayload(closed) });
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(mod ? "Module updated" : "Module added");
    onSaved();
  }

  return (
    <CommitteeDialog title={mod ? `Edit ${mod.name}` : "Add module"} onClose={onClose}>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Module 1 — Cardiovascular" />
      </Field>
      <Field label="Order">
        <input className={inputCls} type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />
      </Field>
      <Field label="Icon">
        <div className="grid grid-cols-7 gap-1.5 p-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
          {ICON_KEYS.map((k) => {
            const I = iconOf(k);
            const active = icon === k;
            return (
              <button
                key={k} type="button" onClick={() => setIcon(k)} title={k}
                className={`grid place-items-center h-10 w-10 rounded-lg ${active ? "text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                style={active ? { background: BRAND } : undefined}
              >
                <I size={16} />
              </button>
            );
          })}
        </div>
      </Field>
      <ClosedFields value={closed} onChange={setClosed} />
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}

function SubjectForm({
  yearId,
  semesterId,
  moduleId,
  modules,
  subject,
  nextSort,
  onClose,
  onSaved,
}: {
  yearId: string;
  semesterId: string | null;
  moduleId: string | null;
  modules: Module[];
  subject: Subject | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(subject?.name ?? "");
  const [icon, setIcon] = useState(subject?.icon_key ?? "book-open");
  const [tagLabel, setTagLabel] = useState(subject?.tag_label ?? "");
  const [tagColor, setTagColor] = useState(subject?.tag_color ?? "amber");
  const [modId, setModId] = useState<string>(subject ? subject.module_id ?? "" : moduleId ?? "");
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(closedDefaults(subject));

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    const targetModule = modId || null;
    const tag = tagLabel.trim() || null;
    const op = subject
      ? supabase.from("committee_subjects").update({ name: name.trim(), icon_key: icon, module_id: targetModule, tag_label: tag, tag_color: tagColor, ...closedPayload(closed) }).eq("id", subject.id)
      : supabase.from("committee_subjects").insert({ year_id: yearId, semester_id: semesterId, module_id: targetModule, name: name.trim(), icon_key: icon, color_key: "indigo", sort_order: nextSort, tag_label: tag, tag_color: tagColor, ...closedPayload(closed) });
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(subject ? "Subject updated" : "Subject added");
    onSaved();
  }

  return (
    <CommitteeDialog title={subject ? `Edit ${subject.name}` : "Add subject"} onClose={onClose}>
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Physiology" /></Field>
      <Field label="Tag (optional)">
        <input
          className={inputCls}
          value={tagLabel}
          onChange={(e) => setTagLabel(e.target.value)}
          maxLength={24}
          placeholder="e.g. Oral"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TAG_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setTagColor(c)}
              aria-label={c}
              className={`h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide ${tagChipClass(c)} ${tagColor === c ? "ring-2 ring-offset-1 ring-slate-400" : "opacity-70"}`}
            >
              {tagLabel.trim() || "Tag"}
            </button>
          ))}
        </div>
      </Field>
      {(modules.length > 0 || modId) && (
        <Field label="Module (optional)">
          <select className={inputCls} value={modId} onChange={(e) => setModId(e.target.value)}>
            <option value="">No module — show directly in the semester</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Icon">
        <div className="grid grid-cols-7 gap-1.5 p-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
          {ICON_KEYS.map((k) => {
            const I = iconOf(k);
            const active = icon === k;
            return (
              <button
                key={k} type="button" onClick={() => setIcon(k)} title={k}
                className={`grid place-items-center h-10 w-10 rounded-lg ${active ? "text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                style={active ? { background: BRAND } : undefined}
              >
                <I size={16} />
              </button>
            );
          })}
        </div>
      </Field>
      <ClosedFields value={closed} onChange={setClosed} />
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}