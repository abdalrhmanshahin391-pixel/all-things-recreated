import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { committeeYearQuery } from "@/lib/committee-queries";
import { useRef, useState } from "react";
import { ArrowRight, Plus, Pencil, Trash2, Download, Upload, Loader2, Map as MapIcon, FileText, Lock as LockIcon, LogIn, UserPlus, UsersRound, History } from "lucide-react";
import { toast } from "sonner";
// JSZip is loaded dynamically inside export/import handlers to keep it out of the main bundle.
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { TelegramQrCard } from "@/components/committee/TelegramQrCard";
import { MadeByLaith } from "@/components/MadeByLaith";
import { supabase } from "@/integrations/supabase/client";
import { iconOf, ICON_KEYS } from "@/lib/committee-meta";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";
import { ClosedWrap, ClosedFields, closedDefaults, closedPayload, CLOSED_SELECT, type ClosedInfo } from "@/components/committee/ClosedState";
import { exportCommitteeBackupData, signCommitteeFile, importCommitteeBackup, uploadCommitteeFile } from "@/lib/committee-backup.functions";

export const Route = createFileRoute("/committee/")({
  head: () => ({
    meta: [
      { title: "لجنة الطب والجراحة — AquaQBank" },
      { name: "description", content: "Free study resources organized by year and subject." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(committeeYearsQuery),
  component: CommitteePage,
});

type Year = {
  id: string;
  year_number: number;
  display_name: string;
  icon_key: string;
  sort_order: number;
} & ClosedInfo;

const committeeYearsQuery = queryOptions({
  queryKey: ["committee-years"],
  queryFn: async (): Promise<Year[]> => {
    const { data, error } = await supabase
      .from("committee_years")
      .select(`id, year_number, display_name, icon_key, sort_order, ${CLOSED_SELECT}`)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as Year[];
  },
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: false,
});

const BRAND = "linear-gradient(135deg,#635BFF 0%,#FF5C8A 60%,#FF8A3D 100%)";

function CommitteePage() {
  const { canManage, canManageMembers, isCommittee, isCommitteeHead, isAdmin } = useCommitteeRole();
  // Years and backups are head/admin work; members only edit inside a year.
  const canManageYears = canManageMembers;
  const { user, loading: authLoading } = useAuth();
  const guest = !authLoading && !user;
  const [gateOpen, setGateOpen] = useState(false);
  const settings = useSiteSettings();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Year | null>(null);

  const { data: years, isLoading } = useQuery(committeeYearsQuery);

  async function del(y: Year) {
    if (!confirm(`Delete ${y.display_name} and all its content?`)) return;
    const { error } = await supabase.from("committee_years").delete().eq("id", y.id);
    if (error) return toast.error(error.message);
    toast.success("Year deleted");
    qc.invalidateQueries({ queryKey: ["committee-years"] });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main className="pt-16 pb-24 px-6 md:px-10 max-w-6xl mx-auto">
        <header className="pt-12 md:pt-16 mb-12 relative text-center">
          {settings.show_signature && (
            <MadeByLaith className="absolute left-0 top-0 hidden sm:block text-left" />
          )}
          {(isCommittee || isAdmin) && (
            <div className="absolute right-0 top-0 flex flex-col items-end gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-primary text-primary-foreground">
                {isAdmin ? "Admin" : isCommitteeHead ? "رئيس اللجنة" : "عضو في اللجنة"}
              </span>
              {canManageMembers && (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/committee/manage-team"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold hover:border-primary/50"
                  >
                    <UsersRound size={13} /> Manage team
                  </Link>
                  <Link
                    to="/admin/committee-log"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold hover:border-primary/50"
                  >
                    <History size={13} /> Log
                  </Link>
                </div>
              )}
            </div>
          )}
          <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Free Resources
          </span>
          <h1
            dir="rtl"
            lang="ar"
            className="mt-5 text-4xl md:text-6xl font-bold tracking-tight leading-tight text-foreground"
            style={{ fontFamily: "'Tajawal','Inter',system-ui,sans-serif", letterSpacing: 0 }}
          >
            لجنة الطب والجراحة
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Pick your year to explore subjects, books and resources curated by senior students.
          </p>
          {canManageYears && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <Plus size={16} /> Add year
              </button>
              <BackupButtons />
            </div>
          )}

          <div className="mt-7 flex justify-center">
            <Link
              to="/committee/team"
              className="inline-flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-3 leading-tight shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <span className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                Staff Team
              </span>
              <span
                dir="rtl"
                lang="ar"
                className="mt-0.5 text-base font-bold text-foreground"
                style={{ fontFamily: "'Tajawal','Inter',system-ui,sans-serif" }}
              >
                لجنة الطب والجراحة
              </span>
            </Link>
          </div>
        </header>


        <StudyPlanBanner canManage={canManage} />

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {years?.map((y) => {
              const Icon = iconOf(y.icon_key);
              return (
                <div key={y.id} className="relative group">
                  <ClosedWrap info={y} canManage={canManage}>
                  {guest ? (
                  <button
                    type="button"
                    onClick={() => setGateOpen(true)}
                    className="w-full text-left flex items-center gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="grid place-items-center h-12 w-12 rounded-lg bg-muted text-primary shrink-0">
                      <Icon size={22} strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {y.year_number === 0 ? "Preparation Year" : `Year ${y.year_number}`}
                      </div>
                      <div className="mt-0.5 text-lg font-semibold text-foreground truncate">
                        {y.display_name}
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                  ) : (
                  <Link
                    to="/committee/$year"
                    params={{ year: String(y.year_number) }}
                    search={{ sem: undefined, mod: undefined }}
                    onMouseEnter={() => qc.prefetchQuery(committeeYearQuery(y.year_number))}
                    onTouchStart={() => qc.prefetchQuery(committeeYearQuery(y.year_number))}
                    className="flex items-center gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="grid place-items-center h-12 w-12 rounded-lg bg-muted text-primary shrink-0">
                      <Icon size={22} strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {y.year_number === 0 ? "Preparation Year" : `Year ${y.year_number}`}
                      </div>
                      <div className="mt-0.5 text-lg font-semibold text-foreground truncate">
                        {y.display_name}
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                  )}
                  </ClosedWrap>
                  {canManageYears && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-40">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(y); }}
                        className="grid place-items-center h-8 w-8 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label="Edit year"
                        type="button"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); del(y); }}
                        className="grid place-items-center h-8 w-8 rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label="Delete year"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12">
          <TelegramQrCard canManage={canManage} />
        </div>
      </main>


      {(adding || editing) && (
        <YearForm
          year={editing}
          existing={years ?? []}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["committee-years"] });
          }}
        />
      )}

      {gateOpen && <MembersOnlyDialog onClose={() => setGateOpen(false)} />}
    </div>
  );
}

function MembersOnlyDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-card p-7 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LockIcon size={24} />
        </div>
        <h2 className="text-xl font-black tracking-tight text-foreground">
          Friendly reminder
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          لجنة الطب والجراحة library is available for members only. Sign in to open this
          year and browse subjects, files and videos.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <LogIn size={16} /> Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground hover:bg-muted"
          >
            <UserPlus size={16} /> Create account
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

function YearForm({
  year,
  existing,
  onClose,
  onSaved,
}: {
  year: Year | null;
  existing: Year[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(year?.display_name ?? "");
  const [num, setNum] = useState<number>(year?.year_number ?? (Math.max(-1, ...existing.map((e) => e.year_number)) + 1));
  const [icon, setIcon] = useState(year?.icon_key ?? "graduation-cap");
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(closedDefaults(year));

  async function save() {
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    const payload = { display_name: name.trim(), year_number: num, icon_key: icon, ...closedPayload(closed) };
    let op;
    if (year) {
      op = supabase.from("committee_years").update(payload).eq("id", year.id);
    } else {
      // New year: attach to the first (default) university
      const { data: uni } = await supabase
        .from("universities")
        .select("id")
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (!uni) {
        setSaving(false);
        return toast.error("No university found. Create one in Admin → Universities first.");
      }
      op = supabase.from("committee_years").insert({
        ...payload,
        sort_order: num,
        color_key: "indigo",
        shape_key: "squircle",
        university_id: uni.id,
      });
    }
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(year ? "Year updated" : "Year added");
    onSaved();
  }

  return (
    <CommitteeDialog title={year ? `Edit ${year.display_name}` : "Add year"} onClose={onClose}>
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Year 1" /></Field>
      <Field label="Year number (0 = Preparation)"><input type="number" min={0} max={7} className={inputCls} value={num} onChange={(e) => setNum(Number(e.target.value))} /></Field>
      <Field label="Icon">
        <IconPicker value={icon} onChange={setIcon} />
      </Field>
      <ClosedFields value={closed} onChange={setClosed} />
      <button onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Saving..." : "Save"}
      </button>
    </CommitteeDialog>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5 p-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
      {ICON_KEYS.map((k) => {
        const I = iconOf(k);
        const active = value === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            type="button"
            className={`grid place-items-center h-10 w-10 rounded-lg transition-all ${active ? "text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            style={undefined}
            title={k}
          >
            <I size={16} />
          </button>
        );
      })}
    </div>
  );
}

function BackupButtons() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState("");
  const exportFn = useServerFn(exportCommitteeBackupData);
  const signFn = useServerFn(signCommitteeFile);
  const importFn = useServerFn(importCommitteeBackup);
  const uploadFn = useServerFn(uploadCommitteeFile);
  const qc = useQueryClient();

  async function handleExport() {
    setBusy("export");
    setPct(0);
    setPhase("Reading the committee…");
    try {
      const data = await exportFn({ data: {} });
      setPct(5);
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({ format: data.format, version: data.version, exported_at: data.exported_at, university: data.university }, null, 2));
      zip.file("data.json", JSON.stringify(data, null, 2));
      // Download files via signed urls in parallel (small concurrency)
      const filesFolder = zip.folder("files")!;
      const items = data.files;
      const CONCURRENCY = 4;
      let i = 0;
      let done = 0;
      const total = items.length;
      setPhase(total ? `Packing ${total} files…` : "Packing…");
      async function worker() {
        while (i < items.length) {
          const idx = i++;
          const { bucket, path } = items[idx];
          try {
            const { url } = await signFn({ data: { bucket, path } });
            const res = await fetch(url);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              filesFolder.file(`${bucket}/${path}`, buf);
            }
          } catch (e) {
            console.warn("Skip file", bucket, path, e);
          } finally {
            done++;
            setPct(5 + Math.round((done / Math.max(total, 1)) * 85));
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setPhase("Building the ZIP…");
      setPct(95);
      const blob = await zip.generateAsync({ type: "blob" });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `committee-backup-${data.university.slug}-${stamp}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setPct(100);
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setPhase("");
      setPct(0);
    }
  }

  async function handleImportFile(file: File) {
    setBusy("import");
    setPct(0);
    setPhase("Reading the backup file…");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const dataFile = zip.file("data.json");
      if (!dataFile) throw new Error("data.json missing from ZIP");
      const payload = JSON.parse(await dataFile.async("string"));
      if (payload?.format !== "lovable-committee-backup") {
        throw new Error("This file is not a committee backup");
      }
      setPct(5);

      // Re-upload every file in files/<bucket>/<path>
      const filesFolder = zip.folder("files");
      if (filesFolder) {
        const entries: Array<{ bucket: string; path: string; data: ArrayBuffer }> = [];
        const promises: Promise<void>[] = [];
        filesFolder.forEach((relPath, entry) => {
          if (entry.dir) return;
          // relPath = "<bucket>/<storage-path>"
          const slash = relPath.indexOf("/");
          if (slash < 0) return;
          const bucket = relPath.slice(0, slash);
          const path = relPath.slice(slash + 1);
          promises.push(entry.async("arraybuffer").then((buf) => {
            entries.push({ bucket, path, data: buf });
          }));
        });
        await Promise.all(promises);
        // Upload in batches
        const CONCURRENCY = 3;
        let i = 0;
        let done = 0;
        const total = entries.length;
        setPhase(total ? `Uploading ${total} files…` : "Uploading…");
        async function worker() {
          while (i < entries.length) {
            const idx = i++;
            const e = entries[idx];
            const base64 = arrayBufferToBase64(e.data);
            try {
              await uploadFn({ data: { bucket: e.bucket, path: e.path, base64 } });
            } catch (err) {
              console.warn("Skip upload", e.path, err);
            }
            done++;
            setPct(5 + Math.round((done / Math.max(total, 1)) * 70));
          }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      }

      setPhase("Rebuilding years, semesters and subjects…");
      setPct(80);
      const result = await importFn({ data: { payload } });
      setPct(100);
      toast.success(
        `Restored to ${result.university}: ${result.yearsAdded} new years, ${result.subjectsAdded} subjects, ${result.resourcesAdded} resources`,
      );
      if (result.skipped?.length) {
        toast.warning(`${result.skipped.length} item(s) skipped — ${result.skipped[0]}`);
      }
      qc.invalidateQueries({ queryKey: ["committee-years"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setPhase("");
      setPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {busy === "export" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {busy === "export" ? `Exporting ${pct}%` : "Export backup"}
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {busy === "import" ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy === "import" ? `Importing ${pct}%` : "Import backup"}
      </button>
      {busy && (
        <span className="text-xs text-muted-foreground w-full sm:w-auto">{phase}</span>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
        }}
      />
    </>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/* ---------------- Study plan banner ---------------- */

function StudyPlanBanner({ canManage: _canManage }: { canManage: boolean }) {
  return (
    <div className="relative mb-8">
      <Link
        to="/committee/study-plan"
        className="block rounded-2xl border border-border bg-card p-5 sm:p-6 hover:border-primary/50 hover:shadow-md transition-all group overflow-hidden"
      >
        <div className="flex items-center gap-4">
          <div
            className="grid place-items-center h-14 w-14 shrink-0 rounded-xl text-white"
            style={{ background: BRAND }}
          >
            <MapIcon size={26} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Study plan
            </div>
            <div className="mt-0.5 text-lg sm:text-xl font-bold text-foreground truncate">
              Medicine study plan
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              From Zero course to Sixth course — every subject, semester and exam type
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-muted text-foreground shrink-0">
            <FileText size={15} />
            Open plan
          </span>
        </div>
      </Link>
    </div>
  );
}
