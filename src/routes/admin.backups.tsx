import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive, Download, Upload, Loader2, CheckCircle2, AlertTriangle,
  Database, Image as ImageIcon, FolderArchive, ShieldCheck, RefreshCw, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  exportSiteBackup,
  importSiteTable,
  signBackupFile,
  uploadBackupFile,
} from "@/lib/site-backup.functions";
import {
  BACKUP_TABLE_LIST,
  BACKUP_FORMAT,
  tableOrder,
  isUserTable,
  type SiteBackup,
  type BackupMode,
  type ImportTableResult,
} from "@/lib/backup-tables";

export const Route = createFileRoute("/admin/backups")({
  head: () => ({
    meta: [
      { title: "Backups — AquaQBank" },
      { name: "description", content: "Export and restore every course, resource and account in your site." },
    ],
  }),
  component: BackupsPage,
});

type Progress = { label: string; done: number; total: number; indeterminate?: boolean };
type Preflight = {
  bundle: SiteBackup;
  counts: Array<[string, number]>;
  fileEntries: Array<{ key: string; bytes: Uint8Array }>;
  totalRows: number;
};

const MODES: Array<{ id: BackupMode; title: string; note: string; icon: any }> = [
  { id: "db", title: "Database only", note: "All rows incl. accounts. Small & fast — take this weekly.", icon: Database },
  { id: "images", title: "Database + images", note: "Adds logos, course and subject images.", icon: ImageIcon },
  { id: "all", title: "Everything (incl. PDFs)", note: "Adds PDFs stored on our server. Google Drive files are kept as links.", icon: FolderArchive },
];

function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

/** v1 backups stored tables as top-level arrays. Normalise them to v2 shape. */
function normalise(raw: any): SiteBackup {
  if (raw?.tables) return raw as SiteBackup;
  const tables: Record<string, any[]> = {};
  for (const t of BACKUP_TABLE_LIST) if (Array.isArray(raw?.[t])) tables[t] = raw[t];
  return {
    format: raw?.format, version: raw?.version ?? 1, exported_at: raw?.exported_at ?? "",
    mode: "all", tables, files: raw?.files ?? [], drive_files: [],
  } as SiteBackup;
}

function BackupsPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const doExport = useServerFn(exportSiteBackup);
  const doImportTable = useServerFn(importSiteTable);
  const sign = useServerFn(signBackupFile);
  const upload = useServerFn(uploadBackupFile);

  const [mode, setMode] = useState<BackupMode>("db");
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [report, setReport] = useState<ImportTableResult[] | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  const failures = useMemo(
    () => (report ?? []).flatMap((r) => r.failed.map((f) => ({ table: r.table, ...f }))),
    [report],
  );

  async function handleExport() {
    if (busy) return;
    setBusy("export"); setResult(null); setReport(null);
      setProgress({ label: "Reading database…", done: 0, total: 1, indeterminate: true });
    try {
      const payload = await doExport({ data: { mode } });
      const rowTotal = Object.values(payload.tables).reduce((a, b) => a + b.length, 0);
      const date = new Date().toISOString().slice(0, 10);

      if (!payload.files.length) {
        downloadBlob(
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
          `site-backup-${date}.json`,
        );
        setResult(`Exported ${rowTotal.toLocaleString()} rows across ${Object.keys(payload.tables).length} tables. ${payload.drive_files.length} PDFs are on Google Drive and stay there.`);
        toast.success("Backup downloaded");
        return;
      }

      // Files present → build a ZIP so nothing has to live in one giant string.
      const { Zip, ZipPassThrough, strToU8 } = await import("fflate");
      const chunks: Uint8Array[] = [];
      let zipDone: () => void = () => {};
      let zipFail: (e: any) => void = () => {};
      const finished = new Promise<void>((res, rej) => { zipDone = res; zipFail = rej; });
      const zip = new Zip((err, chunk, final) => {
        if (err) return zipFail(err);
        chunks.push(chunk);
        if (final) zipDone();
      });

      const addFile = (name: string, bytes: Uint8Array) => {
        const f = new ZipPassThrough(name);
        zip.add(f);
        f.push(bytes, true);
      };

      addFile("backup.json", strToU8(JSON.stringify(payload)));

      let done = 0, bytesTotal = 0;
      setProgress({ label: "Packing files…", done: 0, total: payload.files.length });
      for (const f of payload.files) {
        try {
          const { url } = await sign({ data: { bucket: f.bucket, path: f.path } });
          if (url) {
            const res = await fetch(url);
            if (res.ok) {
              const buf = new Uint8Array(await res.arrayBuffer());
              bytesTotal += buf.length;
              addFile(`files/${f.bucket}/${f.path}`, buf);
            }
          }
        } catch (e) {
          console.warn("skip file", f, e);
        }
        done++;
        setProgress({ label: `Packing files… (${humanBytes(bytesTotal)})`, done, total: payload.files.length });
      }
      zip.end();
      await finished;

      downloadBlob(new Blob(chunks as BlobPart[], { type: "application/zip" }), `site-backup-${date}.zip`);
      setResult(`Exported ${rowTotal.toLocaleString()} rows and ${done} files (${humanBytes(bytesTotal)}).`);
      toast.success("Backup downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  /** Step 1 of restore: read the file and show exactly what it holds. */
  async function handleChooseFile(file: File) {
    setBusy("import"); setResult(null); setReport(null);
    setProgress({ label: "Reading backup file…", done: 0, total: 1 });
    try {
      let bundle: SiteBackup;
      const fileEntries: Array<{ key: string; bytes: Uint8Array }> = [];

      if (file.name.toLowerCase().endsWith(".zip")) {
        const { unzipSync } = await import("fflate");
        const buf = new Uint8Array(await file.arrayBuffer());
        const entries = unzipSync(buf);
        const jsonBytes = entries["backup.json"];
        if (!jsonBytes) throw new Error("This ZIP has no backup.json inside");
        bundle = normalise(JSON.parse(new TextDecoder().decode(jsonBytes)));
        for (const [name, bytes] of Object.entries(entries)) {
          if (name.startsWith("files/") && bytes.length) fileEntries.push({ key: name.slice(6), bytes });
        }
      } else {
        const raw = JSON.parse(await file.text());
        bundle = normalise(raw);
        // legacy base64-in-JSON files
        const fb = raw?.files_b64 as Record<string, string> | undefined;
        if (fb) {
          for (const [key, b64] of Object.entries(fb)) {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            fileEntries.push({ key: key.replace("::", "/"), bytes });
          }
        }
      }

      if (bundle.format !== BACKUP_FORMAT) throw new Error("This is not a valid site backup file");

      const countPairs: Array<[string, number]> = Object.entries(bundle.tables ?? {})
        .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
        .sort(([a], [b]) => tableOrder(a) - tableOrder(b))
        .map(([t, rows]) => [t, rows.length] as [string, number]);
      const totalRows = countPairs.reduce((a, [, n]) => a + n, 0);
      if (!totalRows) throw new Error("This backup contains no rows");

      setPreflight({ bundle, counts: countPairs, fileEntries, totalRows });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read this file");
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  /** Step 2 of restore: write, table by table. */
  async function runRestore(pf: Preflight) {
    setPreflight(null);
    setBusy("import"); setResult(null); setReport(null);
    const results: ImportTableResult[] = [];
    try {
      const tablesToDo = BACKUP_TABLE_LIST.filter((t) => (pf.bundle.tables[t]?.length ?? 0) > 0);
      for (let i = 0; i < tablesToDo.length; i++) {
        const t = tablesToDo[i];
        setProgress({ label: `Restoring ${t.replace(/_/g, " ")}…`, done: i, total: tablesToDo.length });
        try {
          const r = await doImportTable({ data: { table: t, rows: pf.bundle.tables[t] } });
          results.push(r);
        } catch (e: any) {
          results.push({ table: t, attempted: pf.bundle.tables[t].length, written: 0, failed: [{ id: null, error: e?.message ?? "request failed" }] });
        }
      }

      // second pass: retry anything that failed now that all parents exist
      for (const r of results) {
        if (!r.failed.length) continue;
        const ids = new Set(r.failed.map((f) => f.id).filter(Boolean) as string[]);
        if (!ids.size) continue;
        const retryRows = (pf.bundle.tables[r.table] ?? []).filter((row: any) => ids.has(row.id));
        try {
          const again = await doImportTable({ data: { table: r.table, rows: retryRows } });
          r.written += again.written;
          r.failed = again.failed;
        } catch { /* keep original failures */ }
      }

      let uploaded = 0;
      if (pf.fileEntries.length) {
        setProgress({ label: "Uploading files…", done: 0, total: pf.fileEntries.length });
        for (let i = 0; i < pf.fileEntries.length; i++) {
          const { key, bytes } = pf.fileEntries[i];
          const slash = key.indexOf("/");
          const bucket = key.slice(0, slash);
          const path = key.slice(slash + 1);
          try {
            let bin = "";
            const chunk = 32768;
            for (let j = 0; j < bytes.length; j += chunk) {
              bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunk)) as any);
            }
            await upload({ data: { bucket, path, base64: btoa(bin) } });
            uploaded++;
          } catch (e) {
            console.warn("upload skipped", key, e);
          }
          setProgress({ label: "Uploading files…", done: i + 1, total: pf.fileEntries.length });
        }
      }

      setReport(results);
      const written = results.reduce((a, r) => a + r.written, 0);
      const bad = results.reduce((a, r) => a + r.failed.length, 0);
      setResult(
        `Restored ${written.toLocaleString()} of ${pf.totalRows.toLocaleString()} rows` +
        (pf.fileEntries.length ? ` · ${uploaded}/${pf.fileEntries.length} files` : "") +
        (bad ? ` · ${bad} rows could not be written` : " · nothing failed"),
      );
      if (bad) toast.warning(`${bad} rows could not be restored — see the report below`);
      else toast.success("Backup restored completely");
    } catch (e: any) {
      toast.error(e?.message ?? "Restore failed");
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-[#FAFAF9]" />;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-4xl px-6 pt-32 pb-20">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 grid place-items-center">
            <Archive size={20} className="text-indigo-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Backups</h1>
        </div>
        <p className="text-slate-500 mb-8">
          A full snapshot of your site: universities, courses, questions, the committee library
          (years, semesters, subjects, folders and files), site text, announcements, support,
          and every account with the courses they own.
        </p>

        {/* Export */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Download size={18} className="text-emerald-600" />
            <h2 className="font-bold">Export a backup</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3 mb-4">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  disabled={!!busy}
                  className={`text-left rounded-xl border p-4 transition ${
                    active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Icon size={18} className={active ? "text-emerald-600" : "text-slate-400"} />
                  <div className="mt-2 text-sm font-bold">{m.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">{m.note}</div>
                </button>
              );
            })}
          </div>
          <button
            onClick={handleExport}
            disabled={!!busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-3 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === "export" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download size={16} />}
            {busy === "export" ? "Exporting…" : "Export backup"}
          </button>
        </section>

        {/* Import */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={18} className="text-indigo-600" />
            <h2 className="font-bold">Restore a backup</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Pick a <code className="text-[10px]">site-backup-*.json</code> or{" "}
            <code className="text-[10px]">.zip</code> file. You'll see exactly what it contains
            before anything is written. Restore never deletes — it overwrites matching rows and adds missing ones.
          </p>
          <label className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm font-bold hover:bg-indigo-700 cursor-pointer">
            {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload size={16} />}
            {busy === "import" ? "Working…" : "Choose backup file"}
            <input
              type="file"
              accept="application/json,.json,.zip,application/zip"
              className="hidden"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (f) handleChooseFile(f);
              }}
            />
          </label>
        </section>

        {progress && (() => {
          const pct = progress.indeterminate
            ? null
            : Math.round((progress.done / Math.max(progress.total, 1)) * 100);
          return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700">{progress.label}</span>
              <span className="text-slate-500 tabular-nums">
                {pct === null ? "working…" : `${pct}% · ${progress.done}/${progress.total}`}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full bg-indigo-500 transition-all ${pct === null ? "animate-pulse" : ""}`}
                style={{ width: pct === null ? "35%" : `${pct}%` }}
              />
            </div>
          </div>
          );
        })()}

        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex gap-3 text-sm text-emerald-800 mb-4">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <div>{result}</div>
          </div>
        )}

        {report && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={18} className="text-indigo-600" />
              <h2 className="font-bold">Restore report</h2>
            </div>
            <div className="grid gap-1.5 max-h-72 overflow-auto text-xs">
              {report.map((r) => (
                <div key={r.table} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="font-medium text-slate-700">{r.table.replace(/_/g, " ")}</span>
                  <span className={r.failed.length ? "text-amber-600 font-semibold" : "text-emerald-600"}>
                    {r.written}/{r.attempted}
                    {r.failed.length ? ` · ${r.failed.length} failed` : ""}
                  </span>
                </div>
              ))}
            </div>
            {failures.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 mb-2">
                  <XCircle size={14} /> {failures.length} rows could not be written
                </div>
                <div className="max-h-40 overflow-auto space-y-1">
                  {failures.slice(0, 50).map((f, i) => (
                    <div key={i} className="text-[11px] text-amber-800">
                      <b>{f.table}</b> {f.id ? `#${String(f.id).slice(0, 8)}` : ""} — {f.error}
                    </div>
                  ))}
                </div>
                {failures.some((f) => isUserTable(f.table)) && (
                  <p className="text-[11px] text-amber-700 mt-2">
                    Rows in account tables only restore if the same people have signed up in this
                    project — their login records live outside the backup.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <b>Before you remix or make big changes:</b> take a <b>Database only</b> backup — it's small,
            takes seconds, and holds everything except file bytes. PDFs already moved to Google Drive
            stay safe in your Drive and come back automatically with their links.
          </div>
        </div>
      </main>

      {/* Preflight dialog */}
      {preflight && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black mb-1">Review before restoring</h3>
            <p className="text-xs text-slate-500 mb-4">
              Exported {preflight.bundle.exported_at?.slice(0, 10) || "—"} ·{" "}
              {preflight.totalRows.toLocaleString()} rows ·{" "}
              {preflight.fileEntries.length} files. Nothing has been written yet.
            </p>
            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
              {preflight.counts.map(([t, n]) => (
                <div key={t} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-slate-700">{t.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-slate-900">{n.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPreflight(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => runRestore(preflight)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-indigo-700"
              >
                <RefreshCw size={15} /> Restore now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
