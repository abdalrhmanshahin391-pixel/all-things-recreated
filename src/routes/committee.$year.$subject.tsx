import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, ExternalLink, FileText, Folder, FolderOpen,
  Download, Link as LinkIcon, Plus, Pencil, Trash2, Upload, Shield, Search, X, FolderPlus, Files,
  ArrowUp, ArrowDown, GripVertical, Play, Video, Eye, EyeOff,
} from "lucide-react";
import { Copy, Link2 } from "lucide-react";
import { PdfPreviewModal } from "@/components/committee/PdfPreviewModal";

import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { iconOf } from "@/lib/committee-meta";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { SubjectTag } from "@/components/committee/SubjectTag";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";
import { ExistingFilePicker, CopyToDialog, refCounts } from "@/components/committee/ExistingFilePicker";
import { CopySectionDialog } from "@/components/committee/CopySectionDialog";
import { LinkedCourses } from "@/components/committee/LinkedCourses";
import { uploadFileToDrive, removeDriveFile, type DriveUploadPhase } from "@/lib/committee-drive";
import { touchCommitteeSnapshot } from "@/lib/committee-snapshot-touch";
import { VideoModal } from "@/components/committee/VideoModal";

export const Route = createFileRoute("/committee/$year/$subject")({
  component: SubjectPage,
});

type Category = { id: string; subject_id: string; name: string; sort_order: number; section: "resources" | "books" };
type Resource = {
  id: string;
  category_id: string;
  parent_resource_id: string | null;
  title: string;
  kind: "pdf" | "link" | "folder" | "video";
  file_path: string | null;
  url: string | null;
  description: string | null;
  sort_order: number;
  storage_provider?: string | null;
  drive_file_id?: string | null;
  drive_web_link?: string | null;
  drive_download_link?: string | null;
  file_size?: number | null;
  allow_preview?: boolean | null;
};


const BRAND = "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)";

/** Shared ordering: saved position first, title as a stable tie-break. */
const bySort = (a: Resource, b: Resource) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title);

function SubjectPage() {
  const { year, subject } = useParams({ from: "/committee/$year/$subject" });
  const { canManage, isAdmin } = useCommitteeRole();
  const qc = useQueryClient();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [resForm, setResForm] = useState<{ parent: Resource | null; categoryId: string; editing: Resource | null; defaultKind?: "folder" | "pdf" | "link" | "video"; presetFile?: File | null } | null>(null);
  const [catForm, setCatForm] = useState<{ editing: Category | null } | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => Promise<void> | void } | null>(null);
  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [existingFor, setExistingFor] = useState<{ categoryId: string; parentId: string | null } | null>(null);
  const [copyCat, setCopyCat] = useState<Category | null>(null);
  const [copyRes, setCopyRes] = useState<Resource | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["committee-subject", subject],
    queryFn: async () => {
      const [{ data: subj }, { data: cats }, { data: res }] = await Promise.all([
        supabase.from("committee_subjects").select("*").eq("id", subject).maybeSingle(),
        supabase.from("committee_categories").select("*").eq("subject_id", subject).order("sort_order"),
        supabase.from("committee_resources").select("*").order("sort_order"),
      ]);
      return {
        subject: subj,
        categories: (cats ?? []) as Category[],
        resources: (res ?? []) as Resource[],
      };
    },
    staleTime: 15_000,
  });

  const categories = data?.categories ?? [];

  /** file_path -> how many library rows use it (across the whole committee). */
  const linkCounts = useMemo(() => refCounts(data?.resources ?? []), [data]);

  useEffect(() => {
    if (categories.length === 0) {
      if (activeCategoryId !== null) setActiveCategoryId(null);
      return;
    }
    if (!activeCategoryId || !categories.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  const subj = data?.subject;
  const SubjIcon = iconOf(subj?.icon_key ?? "book");

  const activeResources = useMemo(
    () =>
      (data?.resources ?? [])
        .filter((r) => r.category_id === activeCategoryId)
        .slice()
        .sort(bySort),
    [data, activeCategoryId],
  );

  const searchQ = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!searchQ) return null;
    return (data?.resources ?? [])
      .filter(
        (r) =>
          r.title.toLowerCase().includes(searchQ) ||
          (r.description ?? "").toLowerCase().includes(searchQ),
      )
      .slice()
      .sort(bySort);
  }, [data, searchQ]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["committee-subject", subject] });
    touchCommitteeSnapshot();
  }

  async function persistOrder(items: Resource[]) {
    const updates = items.map((item, i) => ({ id: item.id, sort_order: i }));
    qc.setQueryData(["committee-subject", subject], (prev: any) => {
      if (!prev) return prev;
      const map = new Map(updates.map((u) => [u.id, u.sort_order]));
      return {
        ...prev,
        resources: prev.resources.map((x: Resource) =>
          map.has(x.id) ? { ...x, sort_order: map.get(x.id)! } : x,
        ),
      };
    });
    const results = await Promise.all(
      updates.map((u) =>
        supabase.from("committee_resources").update({ sort_order: u.sort_order }).eq("id", u.id),
      ),
    );
    const failed = results.find((r2) => r2.error);
    if (failed?.error) {
      toast.error(failed.error.message);
    }
    invalidate();
  }

  async function moveResource(r: Resource, dir: -1 | 1) {
    const all = data?.resources ?? [];
    const siblings = all
      .filter((x) => x.category_id === r.category_id && x.parent_resource_id === r.parent_resource_id)
      .slice()
      .sort(bySort);
    const idx = siblings.findIndex((x) => x.id === r.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const next = arrayMove(siblings, idx, swapIdx);
    await persistOrder(next);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const all = data?.resources ?? [];
    const activeRes = all.find((x) => x.id === active.id);
    const overRes = all.find((x) => x.id === over.id);
    if (!activeRes || !overRes) return;
    if (
      activeRes.category_id !== overRes.category_id ||
      activeRes.parent_resource_id !== overRes.parent_resource_id
    ) {
      return; // only reorder within same sibling group
    }
    const siblings = all
      .filter(
        (x) =>
          x.category_id === activeRes.category_id &&
          x.parent_resource_id === activeRes.parent_resource_id,
      )
      .slice()
      .sort(bySort);
    const oldIdx = siblings.findIndex((x) => x.id === active.id);
    const newIdx = siblings.findIndex((x) => x.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    await persistOrder(arrayMove(siblings, oldIdx, newIdx));
  }


  function askDeleteResource(r: Resource) {
    const driveUses = r.drive_file_id
      ? (data?.resources ?? []).filter((x) => x.drive_file_id === r.drive_file_id).length
      : 0;
    const shared = r.drive_file_id
      ? driveUses > 1
      : r.file_path
        ? (linkCounts.get(r.file_path) ?? 1) > 1
        : false;
    setConfirmState({
      title: `Delete ${r.title}?`,
      message: r.kind === "folder"
        ? "This folder and everything inside will be removed."
        : shared
          ? `This file is used in ${r.drive_file_id ? driveUses : linkCounts.get(r.file_path!)} places. Only this copy is removed — the file and the other places stay untouched.`
          : "This item will be permanently removed, including the stored file.",
      onConfirm: async () => {
        if (r.drive_file_id && !shared) {
          await removeDriveFile(r.drive_file_id);
        } else if (r.file_path && !shared) {
          await supabase.storage.from("committee-files").remove([r.file_path]);
        }
        const { error } = await supabase.from("committee_resources").delete().eq("id", r.id);
        if (error) { toast.error(error.message); return; }
        toast.success("Deleted");
        invalidate();
      },
    });
  }

  function askDeleteCategory(c: Category) {
    setConfirmState({
      title: `Delete section "${c.name}"?`,
      message: "Every resource inside this section will be deleted too.",
      onConfirm: async () => {
        const { error } = await supabase.from("committee_categories").delete().eq("id", c.id);
        if (error) { toast.error(error.message); return; }
        toast.success("Section deleted");
        if (activeCategoryId === c.id) setActiveCategoryId(null);
        invalidate();
      },
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main className="pt-16 pb-24 px-4 md:px-10">
        <div className="max-w-6xl mx-auto pt-10">
          <Link
            to="/committee/$year"
            params={{ year }}
            search={{
              sem: (subj as { semester_id?: string | null } | null)?.semester_id ?? undefined,
              mod: (subj as { module_id?: string | null } | null)?.module_id ?? undefined,
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft size={16} /> {year === "0" ? "Back to Preparation Year" : `Back to Year ${year}`}
          </Link>

          {!canManage && (subj as { is_closed?: boolean } | null)?.is_closed ? (
            <div className="text-center py-20 rounded-xl bg-card border border-dashed border-border">
              <p className="text-lg font-semibold text-foreground">
                {((subj as { closed_note?: string | null }).closed_note ?? "").trim() || "Coming soon"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">This subject is currently closed.</p>
            </div>
          ) : (
          <>
          <header className="mb-6 p-5 rounded-xl bg-card border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid place-items-center h-12 w-12 shrink-0 rounded-lg bg-muted text-primary">
                  <SubjIcon size={24} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {year === "0" ? "Preparation Year" : `Year ${year}`} · Subject
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold truncate text-foreground">{subj?.name ?? "Subject"}</h1>
                    <SubjectTag label={(subj as any)?.tag_label} color={(subj as any)?.tag_color} />
                  </div>
                </div>
              </div>
              {canManage && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-primary text-primary-foreground shrink-0">
                  <Shield size={11} /> {isAdmin ? "Admin" : "عضو في اللجنة"}
                </span>
              )}
            </div>
          </header>

          <LinkedCourses subjectId={subject} canManage={canManage} />

          {/* Search bar */}
          <div className="mb-5 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files, folders, links…"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="h-64 rounded-2xl bg-white/60 animate-pulse" />
          ) : searchResults ? (
            <SearchResultsList
              results={searchResults}
              categories={categories}
            />
          ) : (
            <div className="grid md:grid-cols-[220px_1fr] gap-8">
              {/* SIDEBAR */}
              <aside className="space-y-3 md:sticky md:top-28 md:self-start">
                <div className="rounded-2xl bg-muted border border-border p-2 grid gap-2 shadow-sm">
                  {categories.length === 0 && (
                    <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                      No sections yet.{canManage ? " Add one below." : ""}
                    </p>
                  )}
                  {categories.map((c) => {
                    const active = activeCategoryId === c.id;
                    return (
                      <div key={c.id} className="relative group">
                        <button
                          onClick={() => setActiveCategoryId(c.id)}
                          className={`w-full flex items-center justify-start gap-2 pl-4 pr-[5.5rem] py-3 rounded-xl text-sm font-black text-left transition-all ${
                            active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-card"
                          }`}
                        >
                          <span className="truncate">{c.name}</span>
                        </button>
                        {canManage && (
                          <div className="absolute top-1/2 right-1.5 -translate-y-1/2 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCatForm({ editing: c }); }}
                              className={`grid place-items-center h-7 w-7 rounded-full ${active ? "hover:bg-white/20 text-white" : "hover:bg-muted text-muted-foreground"}`}
                              aria-label="Rename"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCopyCat(c); }}
                              className={`grid place-items-center h-7 w-7 rounded-full ${active ? "hover:bg-white/20 text-white" : "hover:bg-muted text-muted-foreground"}`}
                              aria-label="Copy section to another subject"
                              title="Copy this section to another subject"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); askDeleteCategory(c); }}
                              className={`grid place-items-center h-7 w-7 rounded-full ${active ? "hover:bg-white/20 text-white" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"}`}
                              aria-label="Delete section"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canManage && (
                  <button
                    onClick={() => setCatForm({ editing: null })}
                    type="button"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus size={14} /> Add section
                  </button>
                )}
              </aside>

              {/* MAIN PANEL */}
              <section className="space-y-3 w-full min-w-0">
                {canManage && activeCategoryId && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setBulkOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black uppercase tracking-wider bg-card border border-border hover:bg-muted"
                    >
                      <Files size={14} /> Bulk upload
                    </button>
                    <button
                      onClick={() => setResForm({ parent: null, categoryId: activeCategoryId, editing: null, defaultKind: "folder" })}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black uppercase tracking-wider bg-card border border-border hover:bg-muted"
                    >
                      <FolderPlus size={14} /> New folder
                    </button>
                    <button
                      onClick={() => setExistingFor({ categoryId: activeCategoryId, parentId: null })}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black uppercase tracking-wider bg-card border border-border hover:bg-muted"
                    >
                      <Link2 size={14} /> Add existing file
                    </button>
                    <button
                      onClick={() => setResForm({ parent: null, categoryId: activeCategoryId, editing: null, defaultKind: "pdf" })}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black uppercase tracking-wider text-white hover:opacity-90"
                      style={{ background: BRAND }}
                    >
                      <Plus size={14} /> Add item
                    </button>
                  </div>
                )}
                {!activeCategoryId ? (
                  <div className="text-center py-16 rounded-2xl bg-card border border-dashed border-border">
                    <p className="text-muted-foreground">
                      {canManage ? "Add a section on the left to start." : "Nothing here yet."}
                    </p>
                  </div>
                ) : activeResources.filter((r) => !r.parent_resource_id).length === 0 ? (
                  <EmptyState canManage={canManage} />
                ) : (
                  <DraggableResourceList
                    items={activeResources.filter((r) => !r.parent_resource_id)}
                    all={activeResources}
                    canManage={canManage}
                    onAddChild={(parent) => setResForm({ parent, categoryId: activeCategoryId, editing: null, defaultKind: "pdf" })}
                    onEdit={(res) => setResForm({ parent: null, categoryId: activeCategoryId, editing: res, defaultKind: res.kind })}
                    onDelete={askDeleteResource}
                    onMove={moveResource}
                    onDragEnd={handleDragEnd}
                    onCopy={setCopyRes}
                    onAddExisting={(parent) => setExistingFor({ categoryId: activeCategoryId, parentId: parent?.id ?? null })}
                    linkCounts={linkCounts}
                  />
                )}
              </section>
            </div>
          )}
          </>
          )}
        </div>
      </main>

      {resForm && (
        <ResourceForm
          form={resForm}
          onClose={() => setResForm(null)}
          onSaved={() => { setResForm(null); invalidate(); }}
        />
      )}
      {catForm && (
        <CategoryForm
          subjectId={subject}
          section="resources"
          category={catForm.editing}
          nextSort={(categories[categories.length - 1]?.sort_order ?? 0) + 1}
          onClose={() => setCatForm(null)}
          onSaved={() => { setCatForm(null); invalidate(); }}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            const fn = confirmState.onConfirm;
            setConfirmState(null);
            await fn();
          }}
        />
      )}
      {bulkOpen && activeCategoryId && (
        <BulkUpload
          categoryId={activeCategoryId}
          nextSort={
            activeResources.length
              ? Math.max(...activeResources.map((r) => r.sort_order ?? 0)) + 1
              : 0
          }
          folders={activeResources.filter((r) => r.kind === "folder")}
          allResources={activeResources}
          onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); invalidate(); }}
        />
      )}
      {existingFor && (
        <ExistingFilePicker
          categoryId={existingFor.categoryId}
          parentResourceId={existingFor.parentId}
          nextSort={
            activeResources.length
              ? Math.max(...activeResources.map((r) => r.sort_order ?? 0)) + 1
              : 0
          }
          onClose={() => setExistingFor(null)}
          onSaved={() => { setExistingFor(null); invalidate(); }}
        />
      )}
      {copyRes && (
        <CopyToDialog
          resource={copyRes as any}
          onClose={() => setCopyRes(null)}
          onSaved={() => { setCopyRes(null); invalidate(); }}
        />
      )}
      {copyCat && (
        <CopySectionDialog
          category={copyCat as any}
          onClose={() => setCopyCat(null)}
          onSaved={() => { setCopyCat(null); invalidate(); }}
        />
      )}

    </div>
  );
}

function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="text-center py-16 rounded-2xl bg-card border border-dashed border-border">
      <div className="mx-auto mb-3 grid place-items-center h-14 w-14 rounded-2xl text-white" style={{ background: BRAND }}>
        <FolderOpen size={26} />
      </div>
      <p className="font-bold text-foreground">Empty section</p>
      <p className="text-sm text-muted-foreground mt-1">
        {canManage ? "Use \"Add item\" to upload a PDF, add a link, or create a folder." : "Content will appear here soon."}
      </p>
    </div>
  );
}

function ConfirmDialog({
  title, message, onCancel, onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <CommitteeDialog title={title} onClose={onCancel}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
          disabled={busy}
          className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Deleting..." : "Delete"}
        </button>
      </div>
    </CommitteeDialog>
  );
}

// ============== DRAGGABLE LIST (top-level siblings) ==============
function DraggableResourceList({
  items,
  all,
  canManage,
  onAddChild,
  onEdit,
  onDelete,
  onMove,
  onDragEnd,
  onCopy,
  onAddExisting,
  linkCounts,
}: {
  items: Resource[];
  all: Resource[];
  canManage: boolean;
  onAddChild: (parent: Resource) => void;
  onEdit: (r: Resource) => void;
  onDelete: (r: Resource) => void;
  onMove: (r: Resource, dir: -1 | 1) => void | Promise<void>;
  onDragEnd: (e: DragEndEvent) => void;
  onCopy: (r: Resource) => void;
  onAddExisting: (parent: Resource | null) => void;
  linkCounts: Map<string, number>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!canManage) {
    return (
      <>
        {items.map((r) => (
          <ResourceNode
            key={r.id}
            resource={r}
            all={all}
            canManage={canManage}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
            onCopy={onCopy}
            onAddExisting={onAddExisting}
            linkCounts={linkCounts}
            depth={0}
          />
        ))}
      </>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((r) => (
            <SortableResourceNode
              key={r.id}
              resource={r}
              all={all}
              canManage={canManage}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
              onCopy={onCopy}
              onAddExisting={onAddExisting}
              linkCounts={linkCounts}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableResourceNode(props: {
  resource: Resource;
  all: Resource[];
  canManage: boolean;
  onAddChild: (parent: Resource) => void;
  onEdit: (r: Resource) => void;
  onDelete: (r: Resource) => void;
  onMove: (r: Resource, dir: -1 | 1) => void | Promise<void>;
  onCopy: (r: Resource) => void;
  onAddExisting: (parent: Resource | null) => void;
  linkCounts: Map<string, number>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.resource.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ResourceNode
        {...props}
        depth={0}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary touch-none cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical size={14} />
          </button>
        }
      />
    </div>
  );
}

function ResourceNode({
  resource, all, canManage, onAddChild, onEdit, onDelete, onMove, onCopy, onAddExisting, linkCounts, depth, dragHandle,
}: {
  resource: Resource;
  all: Resource[];
  canManage: boolean;
  onAddChild: (parent: Resource) => void;
  onEdit: (r: Resource) => void;
  onDelete: (r: Resource) => void;
  onMove: (r: Resource, dir: -1 | 1) => void | Promise<void>;
  onCopy: (r: Resource) => void;
  onAddExisting: (parent: Resource | null) => void;
  linkCounts: Map<string, number>;
  depth: number;
  dragHandle?: React.ReactNode;
}) {
  const [open, setOpen] = useState(depth === 0 ? false : true);
  const isFolder = resource.kind === "folder";
  const qc = useQueryClient();
  const isPdf = resource.kind === "pdf";

  const isLink = resource.kind === "link";
  const isVideo = resource.kind === "video";
  const children = all.filter((r) => r.parent_resource_id === resource.id).slice().sort(bySort);

  // Visual variant per kind
  const iconTile = isFolder
    ? { size: "h-14 w-14", bg: BRAND, icon: open ? <FolderOpen size={22} /> : <Folder size={22} />, color: "text-white" }
    : isPdf
    ? { size: "h-11 w-11", bg: "linear-gradient(135deg,#F43F5E 0%,#DC2626 100%)", icon: <FileText size={18} />, color: "text-white" }
    : isVideo
    ? { size: "h-11 w-11", bg: "linear-gradient(135deg,#8B5CF6 0%,#7C3AED 100%)", icon: <Video size={18} />, color: "text-white" }
    : { size: "h-11 w-11", bg: "linear-gradient(135deg,#3B82F6 0%,#0EA5E9 100%)", icon: <LinkIcon size={18} />, color: "text-white" };

  const cardCls = isFolder
    ? "rounded-2xl bg-card border-2 border-border hover:border-primary/40 shadow-sm"
    : "rounded-xl bg-card border border-border hover:border-primary/40 shadow-sm";

  const linkHost = isLink && resource.url ? safeHost(resource.url) : null;
  const videoHost = isVideo && resource.url ? safeHost(resource.url) : null;
  const useCount = resource.file_path ? linkCounts.get(resource.file_path) ?? 1 : 1;

  return (
    <div className={`${cardCls} overflow-hidden transition-colors`}>
      <div className={`flex items-center gap-3 ${isFolder ? "px-4 py-4" : "px-4 py-3"}`}>
        <div className={`grid place-items-center ${iconTile.size} rounded-xl shrink-0 ${iconTile.color}`} style={{ background: iconTile.bg }}>
          {iconTile.icon}
        </div>
        <button
          onClick={() => {
            if (isFolder) setOpen((v) => !v);
          }}
          className="flex-1 min-w-0 text-left"
        >

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold truncate text-foreground ${isFolder ? "text-base" : "text-sm"}`}>{resource.title}</span>
            {isPdf && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700">PDF</span>}
            {isLink && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Link</span>}
            {isVideo && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">Video</span>}
            {isFolder && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{children.length} item{children.length === 1 ? "" : "s"}</span>}
            {useCount > 1 && (
              <span
                title="This file is stored once and linked in several sections"
                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700"
              >
                <Link2 size={9} /> used in {useCount} places
              </span>
            )}
          </div>
          {resource.description && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{resource.description}</div>
          )}
          {linkHost && !resource.description && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{linkHost}</div>
          )}
          {videoHost && !resource.description && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{videoHost}</div>
          )}
        </button>
        <ResourceAction resource={resource} />
        {canManage && (
          <div className="flex gap-0.5 shrink-0">
            {dragHandle}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove(resource, -1); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary" aria-label="Move up">
              <ArrowUp size={13} />
            </button>
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove(resource, 1); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary" aria-label="Move down">
              <ArrowDown size={13} />
            </button>
            {isFolder && (
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddChild(resource); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary" aria-label="Add inside">
                <Plus size={14} />
              </button>
            )}
            {isFolder && (
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddExisting(resource); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary" aria-label="Add existing file inside">
                <Link2 size={13} />
              </button>
            )}
            {!isFolder && resource.kind === "pdf" && (
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const next = resource.allow_preview === false;
                  const { error } = await (supabase.from as any)("committee_resources")
                    .update({ allow_preview: next })
                    .eq("id", resource.id);
                  if (error) toast.error(error.message);
                  else {
                    toast.success(next ? "View button shown" : "View button hidden");
                    qc.invalidateQueries({ queryKey: ["committee-subject"] });
                  }
                }}
                className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary"
                aria-label={resource.allow_preview === false ? "Enable view button" : "Disable view button"}
                title={resource.allow_preview === false ? "Enable View button" : "Disable View button"}
              >
                {resource.allow_preview === false ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            )}
            {!isFolder && (
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCopy(resource); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary" aria-label="Copy to another section">
                <Copy size={13} />
              </button>
            )}

            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(resource); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary" aria-label="Edit">
              <Pencil size={13} />
            </button>
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(resource); }} className="grid place-items-center h-8 w-8 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete">
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {isFolder && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid place-items-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Toggle"
          >
            <ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>
      {isFolder && open && (
        <div className="border-t border-border bg-muted/30 p-3 pl-6 space-y-2 relative">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 rounded-full opacity-60" style={{ background: BRAND }} />
          {children.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">
              Empty folder.{canManage ? " Use + to add items inside." : ""}
            </p>
          ) : (
            children.map((c) => (
              <ResourceNode
                key={c.id}
                resource={c}
                all={all}
                canManage={canManage}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
                onMove={onMove}
                onCopy={onCopy}
                onAddExisting={onAddExisting}
                linkCounts={linkCounts}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function safeHost(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

/** Downloads a signed URL while reporting progress (0-100, or null when size is unknown). */
async function downloadWithProgress(
  url: string,
  filename: string,
  onProgress: (pct: number | null) => void,
) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? parseInt(totalHeader, 10) : 0;
  let blob: Blob;
  if (res.body && total > 0) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    onProgress(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress(Math.min(99, Math.round((received / total) * 100)));
      }
    }
    blob = new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") ?? "application/pdf" });
  } else {
    onProgress(null);
    blob = await res.blob();
  }
  onProgress(100);
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename.replace(/[/\\?%*:|"<>]/g, "-");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

// ============== ACTION BUTTONS (per kind) ==============
function ResourceAction({ resource }: { resource: Resource }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);


  if (resource.kind === "video") {
    const src = resource.drive_web_link
      ? resource.drive_web_link.replace(/\/view$/, "/preview")
      : resource.url ?? null;
    return (
      <>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (src) setVideoSrc(src);
          }}
          disabled={!src}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 shrink-0 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#8B5CF6 0%,#7C3AED 100%)" }}
        >
          <Play size={11} /> Play
        </button>
        {videoSrc && (
          <VideoModal
            src={videoSrc}
            title={resource.title}
            openUrl={resource.url ?? resource.drive_web_link ?? null}
            onClose={() => setVideoSrc(null)}
          />
        )}
      </>
    );
  }

  if (resource.kind === "link" && resource.url) {
    return (
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 shrink-0"
        style={{ background: "linear-gradient(135deg,#3B82F6 0%,#0EA5E9 100%)" }}
      >
        Open <ExternalLink size={11} />
      </a>
    );
  }

  const canPreview =
    resource.kind === "pdf" &&
    resource.allow_preview !== false &&
    Boolean(resource.drive_web_link || resource.file_path || resource.url);

  const viewButton = canPreview ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPreviewOpen(true);
      }}
      className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 shrink-0 justify-center"
      style={{ background: "linear-gradient(135deg,#0EA5E9 0%,#0284C7 100%)" }}
      aria-label="View PDF"
    >
      <Eye size={11} /> <span className="hidden sm:inline">View</span>
    </button>
  ) : null;

  const previewModal =
    canPreview && previewOpen ? (
      <PdfPreviewModal
        title={resource.title}
        filePath={resource.file_path}
        driveWebLink={resource.drive_web_link ?? null}
        url={resource.url}
        onClose={() => setPreviewOpen(false)}
      />
    ) : null;

  if (resource.kind === "pdf" && resource.drive_download_link) {
    return (
      <div className="flex gap-1 shrink-0">
        {viewButton}
        <a
          href={resource.drive_download_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 shrink-0 min-w-[74px] justify-center"
          style={{ background: "linear-gradient(135deg,#F43F5E 0%,#DC2626 100%)" }}
          aria-label="Save PDF"
        >
          <Download size={11} /> <span className="hidden sm:inline">Save</span>
        </a>
        {previewModal}
      </div>
    );
  }

  if (resource.kind === "pdf" && resource.file_path) {
    async function download(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (downloading) return;
      setDownloading(true);
      setProgress(0);
      setDone(false);
      try {
        const { data, error } = await supabase.storage.from("committee-files").createSignedUrl(resource.file_path!, 3600);
        if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to sign URL");
        await downloadWithProgress(data.signedUrl, `${resource.title}.pdf`, setProgress);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      } catch (err: any) {
        toast.error(err?.message ?? "Download failed");
      } finally {
        setDownloading(false);
        setProgress(null);
      }
    }
    return (
      <div className="flex gap-1 shrink-0">
        {viewButton}
        <button
          onClick={download}
          disabled={downloading}
          className="relative overflow-hidden inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 disabled:opacity-90 min-w-[74px] justify-center"
          style={{ background: "linear-gradient(135deg,#F43F5E 0%,#DC2626 100%)" }}
          aria-label="Save PDF"
        >
          {downloading && progress !== null && (
            <span
              className="absolute inset-y-0 left-0 bg-white/30 transition-[width] duration-150"
              style={{ width: `${progress}%` }}
              aria-hidden
            />
          )}
          <span className="relative z-[1] inline-flex items-center gap-1 tabular-nums">
            {downloading
              ? (progress !== null ? `${progress}%` : "Downloading…")
              : done
                ? "Done"
                : <><Download size={11} /> <span className="hidden sm:inline">Save</span></>}
          </span>
        </button>
        {previewModal}
      </div>
    );

  }
  return null;
}



// ============== SEARCH RESULTS ==============
function SearchResultsList({
  results, categories,
}: {
  results: Resource[];
  categories: Category[];
}) {
  if (results.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl bg-card border border-dashed border-border">
        <p className="text-muted-foreground">No matches.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{results.length} result{results.length === 1 ? "" : "s"}</p>
      {results.map((r) => {
        const cat = categories.find((c) => c.id === r.category_id);
        const Icon = r.kind === "pdf" ? FileText : r.kind === "link" ? LinkIcon : r.kind === "video" ? Video : Folder;
        return (
          <button
            key={r.id}
            onClick={() => {
              if (r.kind === "link" && r.url) window.open(r.url, "_blank");
            }}
            className="w-full flex items-center gap-3 rounded-xl bg-card border border-border p-3 text-left hover:border-primary/40"
          >
            <div className="grid place-items-center h-9 w-9 rounded-lg text-white shrink-0" style={{ background: r.kind === "video" ? "linear-gradient(135deg,#8B5CF6 0%,#7C3AED 100%)" : BRAND }}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm truncate">{r.title}</div>
              <div className="text-xs text-muted-foreground truncate">{cat?.name ?? "—"}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============== CATEGORY FORM ==============
function CategoryForm({
  subjectId, section, category, nextSort, onClose, onSaved,
}: {
  subjectId: string;
  section: "resources" | "books";
  category: Category | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    const op = category
      ? supabase.from("committee_categories").update({ name: name.trim() }).eq("id", category.id)
      : supabase.from("committee_categories").insert({ subject_id: subjectId, name: name.trim(), section, sort_order: nextSort });
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(category ? "Updated" : "Added");
    onSaved();
  }

  return (
    <CommitteeDialog title={category ? `Rename ${category.name}` : `Add ${section === "books" ? "book set" : "category"}`} onClose={onClose}>
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CVS, GI, Macleod" autoFocus /></Field>
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}

// ============== RESOURCE FORM ==============
function cleanTitleFromFilename(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/^[\s\d._-]+/, "").replace(/[_-]+/g, " ").trim();
}

function ResourceForm({
  form, onClose, onSaved,
}: {
  form: { parent: Resource | null; categoryId: string; editing: Resource | null; defaultKind?: "folder" | "pdf" | "link" | "video"; presetFile?: File | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const ed = form.editing;
  const [kind, setKind] = useState<"folder" | "pdf" | "link" | "video">(ed?.kind ?? form.defaultKind ?? "pdf");
  const [title, setTitle] = useState(ed?.title ?? (form.presetFile ? cleanTitleFromFilename(form.presetFile.name) : ""));
  const [description, setDescription] = useState(ed?.description ?? "");
  const [url, setUrl] = useState(ed?.url ?? "");
  const [file, setFile] = useState<File | null>(form.presetFile ?? null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<DriveUploadPhase>("uploading");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (kind === "video") {
      if (!f.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv|avi)$/i.test(f.name)) {
        toast.error("Only video files");
        return;
      }
      setFile(f);
      if (!title.trim()) setTitle(cleanTitleFromFilename(f.name));
      return;
    }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files");
      return;
    }
    setKind("pdf");
    setFile(f);
    if (!title.trim()) setTitle(cleanTitleFromFilename(f.name));
  }, [title, kind]);

  async function save() {
    if (!title.trim()) return toast.error("Title required");
    if (kind === "link" && !url.trim()) return toast.error("URL required");
    if (kind === "video" && !url.trim() && !ed && !file) return toast.error("Provide a video URL or upload a file");
    if ((kind === "pdf" || kind === "video") && !ed && !file && !url.trim()) return toast.error("Pick a file or provide a URL");
    if (file && file.size > 1024 * 1024 * 1024) {
      return toast.error("File is over 1 GB");
    }

    setSaving(true);
    setSaveErr(null);
    setUploadPct(file ? 0 : null);
    setUploadPhase("uploading");
    let drive: Awaited<ReturnType<typeof uploadFileToDrive>> | null = null;
    if ((kind === "pdf" || kind === "video") && file) {
      try {
        drive = await uploadFileToDrive(file, {
          categoryId: form.categoryId,
          fileName: file.name,
          onProgress: setUploadPct,
          onPhase: setUploadPhase,
        });
      } catch (e: any) {
        setSaving(false);
        setUploadPct(null);
        const msg = e?.message ?? "Upload to Google Drive failed";
        setSaveErr(msg);
        return toast.error(msg);
      }
    }
    const driveFields = drive
      ? {
          storage_provider: "drive",
          drive_file_id: drive.fileId,
          drive_web_link: drive.webViewLink,
          drive_download_link: drive.downloadLink,
          file_size: drive.size,
          file_path: null,
        }
      : null;
    const basePayload = {
      title: title.trim(),
      kind,
      description: description.trim() || null,
      url: (kind === "link" || kind === "video") ? url.trim() || null : null,
    };

    let error;
    if (ed) {
      const updatePayload: Record<string, unknown> = { ...basePayload };
      if (driveFields) Object.assign(updatePayload, driveFields);
      ({ error } = await (supabase.from("committee_resources") as any).update(updatePayload).eq("id", ed.id));
    } else {
      // Place new items at the end of their sibling group.
      let q = supabase
        .from("committee_resources")
        .select("sort_order")
        .eq("category_id", form.categoryId)
        .order("sort_order", { ascending: false })
        .limit(1);
      q = form.parent?.id
        ? q.eq("parent_resource_id", form.parent.id)
        : q.is("parent_resource_id", null);
      const { data: lastRow } = await q.maybeSingle();
      const nextOrder = (lastRow?.sort_order ?? -1) + 1;
      ({ error } = await (supabase.from("committee_resources") as any).insert({
        ...basePayload,
        ...(driveFields ?? {}),
        category_id: form.categoryId,
        parent_resource_id: form.parent?.id ?? null,
        sort_order: nextOrder,
      }));
    }

    setSaving(false);
    if (error) {
      setUploadPct(null);
      if (drive?.fileId) await removeDriveFile(drive.fileId);
      const message = `The PDF uploaded, but the committee item could not be saved: ${error.message}`;
      setSaveErr(message);
      return toast.error(message);
    }
    setUploadPct(100);
    toast.success(ed ? "Updated" : "Added");
    onSaved();
  }

  const title2 = ed ? `Edit ${ed.title}` : form.parent ? `Add inside "${form.parent.title}"` : "Add item";

  const kinds: { k: "pdf" | "folder" | "link" | "video"; label: string; hint: string; icon: React.ReactNode; bg: string }[] = [
    { k: "pdf", label: "PDF", hint: "Upload a file", icon: <FileText size={20} />, bg: "linear-gradient(135deg,#F43F5E 0%,#DC2626 100%)" },
    { k: "video", label: "Video", hint: "Upload or URL", icon: <Video size={20} />, bg: "linear-gradient(135deg,#8B5CF6 0%,#7C3AED 100%)" },
    { k: "folder", label: "Folder", hint: "Group items", icon: <Folder size={20} />, bg: BRAND },
    { k: "link", label: "Link", hint: "External URL", icon: <LinkIcon size={20} />, bg: "linear-gradient(135deg,#3B82F6 0%,#0EA5E9 100%)" },
  ];

  return (
    <CommitteeDialog title={title2} onClose={onClose}>
      <Field label="Type">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kinds.map(({ k, label, hint, icon, bg }) => {
            const active = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`p-3 rounded-xl text-left border-2 transition-all ${
                  active ? "border-transparent text-white shadow-md" : "border-border bg-card hover:border-primary/30 text-foreground"
                }`}
                style={active ? { background: bg } : undefined}
              >
                <div className={`grid place-items-center h-8 w-8 rounded-lg mb-1.5 ${active ? "bg-white/20 text-white" : "text-white"}`} style={active ? undefined : { background: bg }}>
                  {icon}
                </div>
                <div className="font-black text-xs uppercase tracking-wider">{label}</div>
                <div className={`text-[10px] ${active ? "text-white/80" : "text-muted-foreground"}`}>{hint}</div>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Title">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="Description (optional)">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {(kind === "link" || kind === "video") && (
        <Field label={kind === "video" ? "Video URL (optional if uploading)" : "URL"}>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "video" ? "YouTube, Drive, or any video link" : "https://..."} />
        </Field>
      )}
      {(kind === "pdf" || kind === "video") && (
        <Field label={kind === "video" ? (ed?.file_path ? "Replace video (optional)" : "Video file") : (ed?.file_path ? "Replace PDF (optional)" : "PDF file")}>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center gap-1.5 px-3 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted"
            }`}
          >
            <Upload size={20} className="text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{file ? file.name : ed?.file_path ? "Keep current · click to replace" : (kind === "video" ? "Click or drop a video" : "Click or drop a PDF")}</span>
            <span className="text-[10px] text-muted-foreground">Max 1 GB</span>
            <input
              type="file"
              accept={kind === "video" ? "video/*" : "application/pdf,.pdf"}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) setTitle(cleanTitleFromFilename(f.name));
              }}
            />
          </label>
        </Field>
      )}
      {saveErr && (
        <div className="mb-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
          {saveErr}
        </div>
      )}
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving
          ? uploadPhase === "recovering"
            ? "Recovering connection…"
            : uploadPhase === "saving"
              ? "Saving…"
              : uploadPhase === "finalizing"
                ? `Finalizing ${uploadPct ?? 98}%…`
                : uploadPct !== null
                  ? `Uploading ${uploadPct}%`
                  : "Saving…"
          : "Save"}
      </button>
    </CommitteeDialog>
  );
}

// ============== BULK PDF UPLOAD ==============
function BulkUpload({
  categoryId, nextSort, folders, allResources, onClose, onSaved,
}: {
  categoryId: string;
  nextSort: number;
  folders: Resource[];
  allResources: Resource[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string; percent: number | null }>({ done: 0, total: 0, current: "", percent: null });
  const [targetParentId, setTargetParentId] = useState<string>(""); // "" = root of section
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build indented folder tree for the dropdown.
  const folderOptions = useMemo(() => {
    const roots = folders.filter((f) => !f.parent_resource_id);
    const opts: { id: string; label: string }[] = [];
    const walk = (list: Resource[], depth: number) => {
      for (const f of list) {
        opts.push({ id: f.id, label: `${"— ".repeat(depth)}${f.title}` });
        const kids = folders.filter((c) => c.parent_resource_id === f.id);
        if (kids.length) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
    return opts;
  }, [folders]);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (arr.length === 0) return toast.error("No PDFs selected");
    setFiles((prev) => [...prev, ...arr]);
  }

  async function createInlineFolder() {
    const name = newFolderName.trim();
    if (!name) return toast.error("Folder name required");
    setCreatingFolder(true);
    const parentSort = allResources.length ? Math.max(...allResources.map((r) => r.sort_order ?? 0)) + 1 : 1;
    const { data, error } = await supabase.from("committee_resources").insert({
      category_id: categoryId,
      parent_resource_id: targetParentId || null,
      title: name,
      kind: "folder",
      file_path: null,
      url: null,
      description: null,
      sort_order: parentSort,
    }).select("id").single();
    setCreatingFolder(false);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    setTargetParentId(data.id);
    setNewFolderName("");
    toast.success(`Folder "${name}" created`);
  }

  async function run() {
    if (files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length, current: files[0].name, percent: 0 });
    let ok = 0, fail = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress({ done: i, total: files.length, current: f.name, percent: 0 });
      try {
        if (f.size > 1024 * 1024 * 1024) throw new Error("over 1 GB");
        const safeName = f.name.replace(/[^\w.\-() ]+/g, "_").slice(-120);
        const drive = await uploadFileToDrive(f, {
          categoryId,
          fileName: safeName,
          onProgress: (percent) => setProgress({ done: i, total: files.length, current: f.name, percent }),
        });
        const ins = await (supabase.from("committee_resources") as any).insert({
          category_id: categoryId,
          parent_resource_id: targetParentId || null,
          title: cleanTitleFromFilename(f.name),
          kind: "pdf",
          file_path: null,
          storage_provider: "drive",
          drive_file_id: drive.fileId,
          drive_web_link: drive.webViewLink,
          drive_download_link: drive.downloadLink,
          file_size: drive.size,
          url: null,
          description: null,
          sort_order: nextSort + i,
        });
        if (ins.error) throw new Error(ins.error.message);
        ok++;
        setProgress({ done: i + 1, total: files.length, current: f.name, percent: 100 });
      } catch (e: any) {
        fail++;
        console.error("bulk upload failed", f.name, e);
        toast.error(`${f.name}: ${e?.message ?? "upload failed"}`);
      }
    }
    setUploading(false);
    setProgress({ done: files.length, total: files.length, current: "", percent: 100 });
    if (ok > 0) toast.success(`Uploaded ${ok} PDF${ok === 1 ? "" : "s"}${fail ? `, ${fail} failed` : ""}`);
    else if (fail > 0) toast.error(`All ${fail} uploads failed`);
    onSaved();
  }

  return (
    <CommitteeDialog title="Bulk upload PDFs" onClose={uploading ? () => {} : onClose}>
      <Field label="Upload into">
        <select
          value={targetParentId}
          onChange={(e) => setTargetParentId(e.target.value)}
          disabled={uploading}
          className={inputCls}
        >
          <option value="">📂 Section root (no folder)</option>
          {folderOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <div className="mt-2 flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="…or create a new folder"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            disabled={uploading || creatingFolder}
          />
          <button
            type="button"
            onClick={createInlineFolder}
            disabled={uploading || creatingFolder || !newFolderName.trim()}
            className="px-3 py-2 rounded-lg bg-card border border-border text-xs font-bold hover:bg-muted disabled:opacity-50 shrink-0"
          >
            {creatingFolder ? "…" : "+ Create"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          New folders are created {targetParentId ? "inside the selected folder" : "at the section root"}.
        </p>
      </Field>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        className="flex flex-col items-center gap-1.5 px-3 py-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-muted"
      >
        <Files size={22} className="text-muted-foreground" />
        <span className="text-sm font-bold">Click or drop multiple PDFs</span>
        <span className="text-[10px] text-muted-foreground">Max 1 GB each · titles auto-filled from filenames</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <FileText size={12} className="text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{cleanTitleFromFilename(f.name)}</span>
              <span className="text-muted-foreground shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              {!uploading && (
                <button onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div className="space-y-1.5">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${((progress.done + (progress.percent ?? 0) / 100) / Math.max(progress.total, 1)) * 100}%`,
                background: BRAND,
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {progress.done}/{progress.total} · {progress.current}
            {progress.percent !== null && progress.current
              ? progress.percent === 99 ? " · Finalizing…" : ` · ${progress.percent}%`
              : ""}
          </p>
        </div>
      )}

      <button onClick={run} disabled={uploading || files.length === 0} className={primaryBtn} style={primaryBtnStyle}>
        {uploading ? "Uploading…" : `Upload ${files.length || ""} PDF${files.length === 1 ? "" : "s"}`}
      </button>
    </CommitteeDialog>
  );
}

