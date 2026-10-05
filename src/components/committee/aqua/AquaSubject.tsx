import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, ChevronLeft, ExternalLink, Eye, FileText, Link as LinkIcon, Loader2, Pencil, Play, Plus, Save, Trash2, Upload, Video,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { iconOf } from "@/lib/committee-meta";
import { committeeYearQuery } from "@/lib/committee-queries";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import {
  AQUA_MIGRATION, aquaCountsQuery, aquaSubjectInfoQuery, aquaSubjectQuery, ensureAquaCategory, explainAquaError, firstClosed,
  type AquaResource,
} from "@/lib/committee-aqua";
import { uploadFileToDrive, removeDriveFile, type DriveUploadPhase } from "@/lib/committee-drive";
import { touchCommitteeSnapshot } from "@/lib/committee-snapshot-touch";
import { autoNotify } from "@/lib/push.functions";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";
import { PdfPreviewModal } from "@/components/committee/PdfPreviewModal";
import { VideoModal } from "@/components/committee/VideoModal";
import { SubjectTag } from "@/components/committee/SubjectTag";
import { AquaBackdrop, AquaBadge, AquaSetupNotice, OpenToggle, StateChip } from "@/components/committee/aqua/AquaParts";
import { VersionSwitch } from "@/components/committee/aqua/VersionSwitch";
import { useAquaOpen } from "@/components/committee/aqua/useAquaOpen";

const bySort = (a: AquaResource, b: AquaResource) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title);

function fmtSize(bytes?: number | null) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One subject in the AQUA version: the AQUA summaries, and (for the committee) the tools to manage them. */
export function AquaSubjectPage({ year, subject }: { year: string; subject: string }) {
  const { canManage } = useCommitteeRole();
  const qc = useQueryClient();
  const aqua = useAquaOpen();
  const { data: info, isLoading: infoLoading } = useQuery(aquaSubjectInfoQuery(subject));
  const { data: yearData } = useQuery(committeeYearQuery(year));
  const { data, isLoading } = useQuery(aquaSubjectQuery(subject));
  const [dialog, setDialog] = useState<{ editing: AquaResource | null } | null>(null);

  const resources = useMemo(() => (data?.resources ?? []).slice().sort(bySort), [data]);
  const Icon = iconOf(info?.icon_key ?? "book");
  const semester = (yearData?.semesters ?? []).find((s: { id: string }) => s.id === info?.semester_id) as { name: string } | undefined;
  const yearName = (yearData?.year as { display_name?: string } | null | undefined)?.display_name ?? "";

  const closed = info
    ? firstClosed(aqua.state, [
        { type: "year", id: info.year_id },
        { type: "semester", id: info.semester_id },
        { type: "module", id: info.module_id },
        { type: "subject", id: info.id },
      ])
    : null;
  const subjectOpen = info ? aqua.isOpen("subject", info.id) : false;
  const blocked = !canManage && !!closed;

  const ancestors = info
    ? [
        info.module_id ? { type: "module" as const, id: info.module_id } : null,
        info.semester_id ? { type: "semester" as const, id: info.semester_id } : null,
        { type: "year" as const, id: info.year_id },
      ]
    : [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["committee-aqua-subject", subject] });
    qc.invalidateQueries({ queryKey: aquaCountsQuery.queryKey });
    touchCommitteeSnapshot();
  }

  async function persistOrder(next: AquaResource[]) {
    qc.setQueryData(aquaSubjectQuery(subject).queryKey, (prev: typeof data) =>
      prev ? { ...prev, resources: next.map((r, i) => ({ ...r, sort_order: i })) } : prev,
    );
    const results = await Promise.all(
      next.map((r, i) => supabase.from("committee_resources").update({ sort_order: i }).eq("id", r.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);
    refresh();
  }

  async function move(r: AquaResource, dir: -1 | 1) {
    const i = resources.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= resources.length) return;
    const next = resources.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    await persistOrder(next);
  }

  async function remove(r: AquaResource) {
    if (!confirm(`Delete "${r.title}"? The file is removed too if no other place uses it.`)) return;
    try {
      let shared = false;
      if (r.drive_file_id) {
        const { count } = await supabase.from("committee_resources").select("id", { count: "exact", head: true }).eq("drive_file_id", r.drive_file_id);
        shared = (count ?? 0) > 1;
        if (!shared) await removeDriveFile(r.drive_file_id);
      } else if (r.file_path) {
        const { count } = await supabase.from("committee_resources").select("id", { count: "exact", head: true }).eq("file_path", r.file_path);
        shared = (count ?? 0) > 1;
        if (!shared) await supabase.storage.from("committee-files").remove([r.file_path]);
      }
      const { error } = await supabase.from("committee_resources").delete().eq("id", r.id);
      if (error) throw new Error(error.message);
      toast.success("Deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <AquaBackdrop />

      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-24 pt-16 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-10">
          <Link
            to="/committee/$year"
            params={{ year }}
            search={{ sem: info?.semester_id ?? undefined, mod: info?.module_id ?? undefined }}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft size={16} /> Back to subjects
          </Link>
          <VersionSwitch />
        </div>

        <header className="relative mt-6 overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Icon size={26} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AquaBadge>AQUA summaries</AquaBadge>
                  <SubjectTag label={info?.tag_label} color={info?.tag_color} />
                </div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{info?.name ?? (infoLoading ? "…" : "Subject")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[yearName, semester?.name].filter(Boolean).join(" · ")}
                  {!blocked && resources.length > 0 ? ` · ${resources.length} summar${resources.length === 1 ? "y" : "ies"}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {info && (canManage ? (
                <OpenToggle
                  open={subjectOpen}
                  busy={aqua.busy("subject", info.id)}
                  onToggle={() => aqua.toggle({ type: "subject", id: info.id }, ancestors, !subjectOpen)}
                />
              ) : (
                <StateChip open={!closed} />
              ))}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setDialog({ editing: null })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Plus size={15} /> Add summary
                </button>
              )}
            </div>
          </div>
        </header>

        {aqua.state?.missingTable && canManage && (
          <div className="mt-6">
            <AquaSetupNotice migration={AQUA_MIGRATION} />
          </div>
        )}

        {canManage && closed && (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
            Students cannot see this subject yet because a {closed.type} above it (or the subject itself) is still{" "}
            <b className="text-foreground">coming soon</b>. Use the switch to open it.
          </div>
        )}

        <div className="mt-8">
          {blocked ? (
            <div className="rounded-3xl border border-dashed border-border bg-card py-20 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <FileText size={24} />
              </div>
              <p className="text-lg font-bold">Coming soon · قريباً</p>
              <p className="mt-2 text-sm text-muted-foreground">The AQUA summaries for this subject are on the way.</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />
              ))}
            </div>
          ) : resources.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card py-16 text-center">
              <p className="font-semibold">No summaries here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManage ? "Press “Add summary” to upload the first one." : "The AQUA team is preparing them."}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {resources.map((r, i) => (
                <li key={r.id} className="group flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:flex-nowrap">
                  <KindTile kind={r.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold leading-snug">{r.title}</div>
                    {r.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
                    {r.file_size ? <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtSize(r.file_size)}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SummaryActions r={r} />
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <IconBtn label="Move up" disabled={i === 0} onClick={() => move(r, -1)}><ArrowUp size={14} /></IconBtn>
                        <IconBtn label="Move down" disabled={i === resources.length - 1} onClick={() => move(r, 1)}><ArrowDown size={14} /></IconBtn>
                        <IconBtn label="Edit" onClick={() => setDialog({ editing: r })}><Pencil size={14} /></IconBtn>
                        <IconBtn label="Delete" danger onClick={() => remove(r)}><Trash2 size={14} /></IconBtn>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {dialog && (
        <SummaryDialog
          subjectId={subject}
          editing={dialog.editing}
          nextOrder={resources.length}
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

function KindTile({ kind }: { kind: AquaResource["kind"] }) {
  const Icon = kind === "video" ? Video : kind === "link" ? LinkIcon : FileText;
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <Icon size={22} strokeWidth={1.8} />
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground transition-colors disabled:opacity-30 ${
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** View / save / open / play, depending on what the summary is. */
function SummaryActions({ r }: { r: AquaResource }) {
  const [preview, setPreview] = useState(false);
  const [video, setVideo] = useState<string | null>(null);
  const pill = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-opacity hover:opacity-90";

  if (r.kind === "link") {
    return r.url ? (
      <a href={r.url} target="_blank" rel="noopener noreferrer" className={`${pill} bg-primary text-primary-foreground`}>
        Open <ExternalLink size={12} />
      </a>
    ) : null;
  }

  if (r.kind === "video") {
    const src = r.drive_web_link ? r.drive_web_link.replace(/\/view.*$/, "/preview") : r.url;
    return (
      <>
        <button type="button" disabled={!src} onClick={() => src && setVideo(src)} className={`${pill} bg-primary text-primary-foreground disabled:opacity-50`}>
          <Play size={12} /> Play
        </button>
        {video && <VideoModal src={video} title={r.title} openUrl={r.url ?? r.drive_web_link ?? null} onClose={() => setVideo(null)} />}
      </>
    );
  }

  async function save() {
    if (r.drive_download_link) {
      const a = document.createElement("a");
      a.href = r.drive_download_link;
      a.rel = "noopener";
      a.download = `${r.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (r.file_path) {
      const { data, error } = await supabase.storage.from("committee-files").createSignedUrl(r.file_path, 3600, { download: `${r.title}.pdf` });
      if (error || !data?.signedUrl) return void toast.error(error?.message ?? "Could not open this file.");
      window.location.href = data.signedUrl;
    }
  }

  const canOpen = Boolean(r.drive_web_link || r.file_path || r.url);
  return (
    <>
      {canOpen && r.allow_preview !== false && (
        <button type="button" onClick={() => setPreview(true)} className={`${pill} bg-primary text-primary-foreground`}>
          <Eye size={12} /> View
        </button>
      )}
      {(r.drive_download_link || r.file_path) && (
        <button type="button" onClick={save} className={`${pill} border border-border bg-background text-foreground hover:bg-muted`}>
          <Save size={12} /> Save
        </button>
      )}
      {preview && (
        <PdfPreviewModal title={r.title} filePath={r.file_path} driveWebLink={r.drive_web_link ?? null} url={r.url} onClose={() => setPreview(false)} />
      )}
    </>
  );
}

function SummaryDialog({
  subjectId,
  editing,
  nextOrder,
  onClose,
  onSaved,
}: {
  subjectId: string;
  editing: AquaResource | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"pdf" | "link" | "video">(editing && editing.kind !== "folder" ? editing.kind : "pdf");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [phase, setPhase] = useState<DriveUploadPhase>("uploading");
  const [err, setErr] = useState<string | null>(null);

  const kinds = [
    { k: "pdf" as const, label: "PDF", icon: <FileText size={18} /> },
    { k: "video" as const, label: "Video", icon: <Video size={18} /> },
    { k: "link" as const, label: "Link", icon: <LinkIcon size={18} /> },
  ];

  async function save() {
    if (!title.trim()) return void toast.error("Title required");
    if (kind === "link" && !url.trim()) return void toast.error("URL required");
    if (kind === "pdf" && !editing && !file) return void toast.error("Pick a PDF file");
    if (kind === "video" && !editing && !file && !url.trim()) return void toast.error("Provide a video URL or upload a file");
    if (file && file.size > 1024 * 1024 * 1024) return void toast.error("File is over 1 GB");

    setSaving(true);
    setErr(null);
    let drive: Awaited<ReturnType<typeof uploadFileToDrive>> | null = null;
    try {
      const categoryId = await ensureAquaCategory(subjectId);
      if ((kind === "pdf" || kind === "video") && file) {
        setPct(0);
        setPhase("uploading");
        drive = await uploadFileToDrive(file, { categoryId, fileName: file.name, onProgress: setPct, onPhase: setPhase });
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
        : {};
      const base = {
        title: title.trim(),
        kind,
        description: description.trim() || null,
        url: kind === "pdf" ? null : url.trim() || null,
      };
      const query = (supabase.from("committee_resources") as any);
      const { error } = editing
        ? await query.update({ ...base, ...driveFields }).eq("id", editing.id)
        : await query.insert({ ...base, ...driveFields, category_id: categoryId, parent_resource_id: null, sort_order: nextOrder });
      if (error) {
        if (drive?.fileId) await removeDriveFile(drive.fileId);
        throw new Error(explainAquaError(error));
      }
      // the file this one replaced is not needed any more (unless another place still uses it)
      if (drive && editing?.drive_file_id) {
        const { count } = await supabase.from("committee_resources").select("id", { count: "exact", head: true }).eq("drive_file_id", editing.drive_file_id);
        if ((count ?? 0) === 0) await removeDriveFile(editing.drive_file_id);
      }
      toast.success(editing ? "Updated" : "Summary added");
      if (!editing) {
        autoNotify({
          data: {
            kind: "on_committee_resource",
            title_en: "New AQUA summary",
            body_en: title.trim(),
            title_ar: "ملخص جديد من أكوا",
            body_ar: title.trim(),
            url: window.location.pathname,
          },
        }).catch(() => undefined);
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      setErr(msg);
      toast.error(msg);
      setPct(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <CommitteeDialog title={editing ? `Edit ${editing.title}` : "Add AQUA summary"} onClose={onClose}>
      <Field label="Type">
        <div className="grid grid-cols-3 gap-2">
          {kinds.map(({ k, label, icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-black uppercase tracking-wider transition-all ${
                kind === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Title">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hip bone: full summary" />
      </Field>
      <Field label="Short description (optional)">
        <textarea className={`${inputCls} min-h-[70px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {kind !== "pdf" && (
        <Field label={kind === "video" ? "Video link (or upload a file below)" : "Link"}>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
      )}

      {kind !== "link" && (
        <Field label={editing ? "Replace the file (optional)" : kind === "pdf" ? "PDF file" : "Video file (optional)"}>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground hover:border-primary/50">
            <Upload size={16} className="text-primary" />
            <span className="truncate">{file ? file.name : "Choose a file…"}</span>
            <input
              type="file"
              className="hidden"
              accept={kind === "video" ? "video/*" : "application/pdf,.pdf"}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
              }}
            />
          </label>
        </Field>
      )}

      {saving && pct !== null && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {phase === "uploading" ? "Uploading" : phase === "recovering" ? "Reconnecting" : phase === "finalizing" ? "Finishing" : "Saving"} · {pct}%
          </p>
        </div>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}

      <button type="button" onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving && <Loader2 size={15} className="animate-spin" />}
        {editing ? "Save changes" : "Add summary"}
      </button>
    </CommitteeDialog>
  );
}