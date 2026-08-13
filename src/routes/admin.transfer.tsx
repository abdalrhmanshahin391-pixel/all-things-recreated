import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Rocket, Download, Upload, Loader2, CheckCircle2, AlertTriangle,
  Database, Image as ImageIcon, FolderArchive, KeyRound, XCircle, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { signBackupFile, uploadBackupFile } from "@/lib/site-backup.functions";
import {
  getTransferOverview, exportTransferChunk, getDriveManifest,
  getTransferCode, setTransferCode, unlockTransferRestore, restoreTransferTable,
} from "@/lib/site-transfer.functions";
import {
  BACKUP_TABLE_LIST, EXPORT_TABLE_LIST, TRANSFER_FORMAT, TRANSFER_VERSION,
  isUserTable, type TransferMode, type ImportTableResult,
} from "@/lib/backup-tables";

export const Route = createFileRoute("/admin/transfer")({
  head: () => ({
    meta: [
      { title: "Site Transfer — AquaQBank" },
      { name: "description", content: "Download the whole website as one file and rebuild it anywhere." },
      { property: "og:title", content: "Site Transfer — AquaQBank" },
      { property: "og:description", content: "Move your entire site, files and Google Drive links to another account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransferPage,
});

type Progress = { label: string; done: number; total: number; indeterminate?: boolean };
type Pending = {
  tables: Record<string, any[]>;
  files: Array<{ key: string; bytes: Uint8Array }>;
  drive: any;
  manifest: any;
  totalRows: number;
};

const MODES: Array<{ id: TransferMode; title: string; note: string; icon: any }> = [
  { id: "data", title: "Data + Drive links", note: "Everything except file bytes. Fast — a few minutes.", icon: Database },
  { id: "images", title: "+ Images", note: "Adds logos, course and subject images.", icon: ImageIcon },
  { id: "all", title: "Everything", note: "Adds PDFs/videos stored on our server. Large download.", icon: FolderArchive },
];

function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

function readmeText(manifest: any) {
  return [
    "AQUAQBANK — FULL SITE TRANSFER PACKAGE",
    "======================================",
    `Created: ${manifest.exported_at}`,
    `Package: ${manifest.format} v${manifest.version} (${manifest.mode})`,
    `Rows: ${manifest.total_rows} · Files: ${manifest.file_count} · Google Drive files: ${manifest.drive_files}`,
    "",
    "WHAT IS INSIDE",
    "--------------",
    "database/   one JSON file per table — all content, settings, pages, users and roles",
    "storage/    the site's own files (images, and PDFs/videos when included)",
    "drive/      the Google Drive manifest: every file's Drive id and link, plus the",
    "            full committee tree, so the new site reattaches to the SAME Drive",
    "            files without re-uploading anything",
    "MANIFEST.json  counts and versions",
    "",
    "HOW TO MOVE THE SITE TO ANOTHER ACCOUNT",
    "---------------------------------------",
    "1. Remix (or GitHub-export) the project into the new account. This carries the",
    "   app code. A downloaded file can never contain the code — it lives in the repo.",
    "2. Open the new site and sign in as an administrator.",
    "3. Go to Admin -> Site Transfer, choose this .zip and enter the transfer code.",
    "4. Press Restore. Content, settings, files and Drive links are rebuilt.",
    "5. Connect Google Drive in Admin -> Committee. The Drive ids in this package",
    "   already point at your existing files, so nothing is re-uploaded.",
    "",
    "SECRETS TO RE-ADD ON THE NEW SITE (never stored in this file)",
    "------------------------------------------------------------",
    "- Google Drive connection (Admin -> Committee -> link to Google Drive)",
    "- Payment provider keys, if payments are used",
    "- Any AI provider keys used by the admin tools",
    "",
    "HOSTING SOMEWHERE ELSE",
    "----------------------",
    "database/*.json are plain arrays of rows named after their tables, so they can",
    "be loaded into any Postgres/Supabase database with the same schema. storage/",
    "mirrors bucket/path exactly. drive/manifest.json maps each resource to its",
    "Google Drive file id. You still need the app code from the repository.",
    "",
    "NOTE: accounts restore only once the same people have signed up on the new",
    "site — login records live outside any downloadable file.",
    "",
    "TWO-STEP REBUILD (CODE + CONTENT)",
    "---------------------------------",
    "STEP 1 - CODE: attach the code snapshot zip (aquaqbank-code-<date>.zip) to a",
    "         new Lovable project, or remix/GitHub-import the project. This gives",
    "         you the app itself: pages, themes, admin tools, study hub.",
    "STEP 2 - CONTENT: open the new site, sign in as an administrator, go to",
    "         Admin -> Site Transfer -> Restore, pick THIS zip and enter your",
    "         transfer code. Everything else comes back: settings, themes, pages,",
    "         sections, committee tree, courses, questions, packages, users, roles.",
    "Then re-add the secrets listed above and reconnect Google Drive.",
  ].join("\n");
}

function TransferPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const overview = useServerFn(getTransferOverview);
  const chunk = useServerFn(exportTransferChunk);
  const driveManifest = useServerFn(getDriveManifest);
  const readCode = useServerFn(getTransferCode);
  const saveCode = useServerFn(setTransferCode);
  const unlock = useServerFn(unlockTransferRestore);
  const restoreTable = useServerFn(restoreTransferTable);
  const sign = useServerFn(signBackupFile);
  const upload = useServerFn(uploadBackupFile);

  const [mode, setMode] = useState<TransferMode>("data");
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [report, setReport] = useState<ImportTableResult[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    readCode({})
      .then((r) => {
        setSavedCode(r.code);
        setCode((prev) => (prev.trim() ? prev : r.code));
      })
      .catch(() => {});
  }, [isAdmin]);

  const failures = useMemo(
    () => (report ?? []).flatMap((r) => r.failed.map((f) => ({ table: r.table, ...f }))),
    [report],
  );

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function handleExport() {
    if (busy) return;
    setBusy("export"); setResult(null); setReport(null);
    setProgress({ label: "Measuring your site…", done: 0, total: 1, indeterminate: true });
    try {
      const ov = await overview({ data: { mode } });

      const { Zip, ZipPassThrough, strToU8 } = await import("fflate");
      const chunks: Uint8Array[] = [];
      let zipDone: () => void = () => {};
      let zipFail: (e: any) => void = () => {};
      const finished = new Promise<void>((res, rej) => { zipDone = res; zipFail = rej; });
      const zip = new Zip((err, part, final) => {
        if (err) return zipFail(err);
        chunks.push(part);
        if (final) zipDone();
      });
      const addFile = (name: string, bytes: Uint8Array) => {
        const f = new ZipPassThrough(name);
        zip.add(f);
        f.push(bytes, true);
      };

      // 1) database, table by table, page by page
      const tables = EXPORT_TABLE_LIST.filter((t) => (ov.counts[t] ?? 0) > 0);
      let totalRows = 0;
      for (let i = 0; i < tables.length; i++) {
        const t = tables[i];
        setProgress({ label: `Packing ${t.replace(/_/g, " ")}…`, done: i, total: tables.length + ov.files.length + 2 });
        const rows: any[] = [];
        let offset = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const page = await chunk({ data: { table: t, offset, limit: 500 } });
          rows.push(...page.rows);
          if (page.done) break;
          offset += 500;
        }
        totalRows += rows.length;
        addFile(`database/${t}.json`, strToU8(JSON.stringify(rows)));
      }

      // 2) Google Drive manifest
      setProgress({ label: "Packing Google Drive links…", done: tables.length, total: tables.length + ov.files.length + 2 });
      let drive: any = { resources: [], committee_snapshot: null };
      try { drive = await driveManifest({}); } catch (e) { console.warn("drive manifest", e); }
      addFile("drive/manifest.json", strToU8(JSON.stringify(drive)));

      // 3) storage files
      let bytesTotal = 0, filesDone = 0;
      for (const f of ov.files) {
        try {
          const { url } = await sign({ data: { bucket: f.bucket, path: f.path } });
          if (url) {
            const res = await fetch(url);
            if (res.ok) {
              const buf = new Uint8Array(await res.arrayBuffer());
              bytesTotal += buf.length;
              addFile(`storage/${f.bucket}/${f.path}`, buf);
            }
          }
        } catch (e) {
          console.warn("skip file", f, e);
        }
        filesDone++;
        setProgress({
          label: `Packing files… (${humanBytes(bytesTotal)})`,
          done: tables.length + 1 + filesDone,
          total: tables.length + ov.files.length + 2,
        });
      }

      const manifest = {
        format: TRANSFER_FORMAT,
        version: TRANSFER_VERSION,
        mode,
        exported_at: ov.exported_at,
        site_name: ov.site_name,
        tables: Object.fromEntries(tables.map((t) => [t, ov.counts[t] ?? 0])),
        total_rows: totalRows,
        file_count: filesDone,
        drive_files: ov.drive_files,
      };
      addFile("MANIFEST.json", strToU8(JSON.stringify(manifest, null, 2)));
      addFile("README.txt", strToU8(readmeText(manifest)));

      zip.end();
      await finished;

      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(new Blob(chunks as BlobPart[], { type: "application/zip" }), `aquaqbank-site-${date}.zip`);
      setResult(
        `Package ready — ${totalRows.toLocaleString()} rows across ${tables.length} tables, ` +
        `${filesDone} files (${humanBytes(bytesTotal)}) and ${ov.drive_files} Google Drive links.`,
      );
      toast.success("Website package downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  async function handleChooseFile(file: File) {
    setBusy("import"); setResult(null); setReport(null);
    setProgress({ label: "Reading package…", done: 0, total: 1, indeterminate: true });
    try {
      const { unzipSync, strFromU8 } = await import("fflate");
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const manifestBytes = entries["MANIFEST.json"];
      if (!manifestBytes) throw new Error("This ZIP is not a site transfer package");
      const manifest = JSON.parse(strFromU8(manifestBytes));
      if (manifest.format !== TRANSFER_FORMAT) throw new Error("This ZIP is not a site transfer package");

      const tables: Record<string, any[]> = {};
      const files: Array<{ key: string; bytes: Uint8Array }> = [];
      let drive: any = null;
      let totalRows = 0;
      for (const [name, bytes] of Object.entries(entries)) {
        if (name.startsWith("database/") && name.endsWith(".json")) {
          const t = name.slice("database/".length, -".json".length);
          const rows = JSON.parse(strFromU8(bytes as Uint8Array));
          if (Array.isArray(rows) && rows.length) { tables[t] = rows; totalRows += rows.length; }
        } else if (name === "drive/manifest.json") {
          drive = JSON.parse(strFromU8(bytes as Uint8Array));
        } else if (name.startsWith("storage/") && (bytes as Uint8Array).length) {
          files.push({ key: name.slice("storage/".length), bytes: bytes as Uint8Array });
        }
      }
      if (!totalRows) throw new Error("This package contains no rows");
      setPending({ tables, files, drive, manifest, totalRows });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read this package");
    } finally {
      setBusy(null); setProgress(null);
    }
  }

  async function runRestore(pf: Pending) {
    setRestoreError(null);
    if (!code.trim()) {
      setRestoreError("Enter your transfer code in the box above, then press Restore now.");
      toast.error("Enter the transfer code first");
      return;
    }
    setBusy("import"); setResult(null); setReport(null);
    setProgress({ label: "Checking transfer code…", done: 0, total: 1, indeterminate: true });
    try {
      await unlock({ data: { code } });
    } catch (e: any) {
      setBusy(null); setProgress(null);
      setRestoreError(e?.message ?? "Wrong transfer code");
      toast.error(e?.message ?? "Wrong transfer code");
      return;
    }
    setPending(null);
    setRestoreError(null);

    const results: ImportTableResult[] = [];
    try {
      const todo = BACKUP_TABLE_LIST.filter((t) => (pf.tables[t]?.length ?? 0) > 0);
      const steps = todo.length + pf.files.length;
      for (let i = 0; i < todo.length; i++) {
        const t = todo[i];
        setProgress({ label: `Restoring ${t.replace(/_/g, " ")}…`, done: i, total: steps });
        try {
          results.push(await restoreTable({ data: { table: t, rows: pf.tables[t], code } }));
        } catch (e: any) {
          results.push({ table: t, attempted: pf.tables[t].length, written: 0, failed: [{ id: null, error: e?.message ?? "request failed" }] });
        }
      }

      // second pass — parents all exist now
      for (const r of results) {
        if (!r.failed.length) continue;
        const ids = new Set(r.failed.map((f) => f.id).filter(Boolean) as string[]);
        if (!ids.size) continue;
        const retry = (pf.tables[r.table] ?? []).filter((row: any) => ids.has(row.id));
        try {
          const again = await restoreTable({ data: { table: r.table, rows: retry, code } });
          r.written += again.written;
          r.failed = again.failed;
        } catch { /* keep original failures */ }
      }

      let uploaded = 0;
      for (let i = 0; i < pf.files.length; i++) {
        const { key, bytes } = pf.files[i];
        setProgress({ label: "Uploading files…", done: todo.length + i, total: steps });
        const slash = key.indexOf("/");
        const bucket = key.slice(0, slash);
        const path = key.slice(slash + 1);
        try {
          let bin = "";
          const size = 32768;
          for (let j = 0; j < bytes.length; j += size) {
            bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + size)) as any);
          }
          await upload({ data: { bucket, path, base64: btoa(bin) } });
          uploaded++;
        } catch (e) {
          console.warn("upload skipped", key, e);
        }
      }

      setReport(results);
      const written = results.reduce((a, r) => a + r.written, 0);
      const bad = results.reduce((a, r) => a + r.failed.length, 0);
      const driveCount = pf.drive?.resources?.length ?? 0;
      setResult(
        `Restored ${written.toLocaleString()} of ${pf.totalRows.toLocaleString()} rows` +
        (pf.files.length ? ` · ${uploaded}/${pf.files.length} files` : "") +
        (driveCount ? ` · ${driveCount} Google Drive links reattached` : "") +
        (bad ? ` · ${bad} rows could not be written` : " · nothing failed"),
      );
      if (bad) toast.warning(`${bad} rows could not be restored — see the report`);
      else toast.success("Website restored from the package");
    } catch (e: any) {
      setRestoreError(e?.message ?? "Restore failed");
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
          <div className="h-10 w-10 rounded-xl bg-sky-50 grid place-items-center">
            <Rocket size={20} className="text-sky-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Site Transfer</h1>
        </div>
        <p className="text-slate-500 mb-8">
          Download your whole website as one file — every table, every setting, your files and
          all Google Drive links — then rebuild it identically on another Lovable account or host.
        </p>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Download size={18} className="text-emerald-600" />
            <h2 className="font-bold">Download the whole website</h2>
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
            {busy === "export" ? "Building package…" : "Download website package"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={18} className="text-sky-600" />
            <h2 className="font-bold">Restore a package here</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            On the new site: remix the project first (that carries the app code), then upload the
            <code className="text-[10px] mx-1">aquaqbank-site-*.zip</code> and enter your transfer code.
            Restore overwrites matching rows and adds missing ones — it never deletes.
          </p>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Transfer code</label>
          <div className="flex gap-2 mb-3">
            <input
              type={showCode ? "text" : "password"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter the transfer code"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              className="rounded-xl border border-slate-200 px-3 hover:bg-slate-50"
              aria-label={showCode ? "Hide code" : "Show code"}
            >
              {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <label className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white px-4 py-3 text-sm font-bold hover:bg-sky-700 cursor-pointer">
            {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload size={16} />}
            {busy === "import" ? "Working…" : "Choose website package"}
            <input
              type="file"
              accept=".zip,application/zip"
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound size={18} className="text-amber-600" />
            <h2 className="font-bold">Your transfer code</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Anyone restoring a package into a site must type this code. Keep it private.
          </p>
          <div className="flex gap-2">
            <input
              value={savedCode ?? ""}
              onChange={(e) => setSavedCode(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
            />
            <button
              onClick={async () => {
                try {
                  await saveCode({ data: { code: savedCode ?? "" } });
                  toast.success("Transfer code saved");
                } catch (e: any) {
                  toast.error(e?.message ?? "Could not save");
                }
              }}
              className="rounded-xl bg-amber-500 text-white px-4 text-sm font-bold hover:bg-amber-600"
            >
              Save
            </button>
          </div>
        </section>

        {progress && (() => {
          const pct = progress.indeterminate ? null : Math.round((progress.done / Math.max(progress.total, 1)) * 100);
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
                  className={`h-full bg-sky-500 transition-all ${pct === null ? "animate-pulse" : ""}`}
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
            <h2 className="font-bold mb-3">Restore report</h2>
            <div className="grid gap-1.5 max-h-72 overflow-auto text-xs">
              {report.map((r) => (
                <div key={r.table} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="font-medium text-slate-700">{r.table.replace(/_/g, " ")}</span>
                  <span className={r.failed.length ? "text-amber-600 font-semibold" : "text-emerald-600"}>
                    {r.written}/{r.attempted}{r.failed.length ? ` · ${r.failed.length} failed` : ""}
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
                    Account rows only restore once the same people have signed up on this site.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            The app code itself can't live inside a downloaded file — copy it with
            <b> Remix</b> or a GitHub export, then restore this package on top. Secrets
            (Google Drive connection, payment and AI keys) are never written into the file:
            add them again on the new site. The README inside the ZIP lists every step.
          </div>
        </div>
      </main>

      {pending && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black mb-1">Review before restoring</h3>
            <p className="text-xs text-slate-500 mb-4">
              {pending.manifest.site_name ? `${pending.manifest.site_name} · ` : ""}
              exported {String(pending.manifest.exported_at ?? "").slice(0, 10)} ·{" "}
              {pending.totalRows.toLocaleString()} rows · {pending.files.length} files ·{" "}
              {pending.drive?.resources?.length ?? 0} Drive links. Nothing has been written yet.
            </p>
            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
              {Object.entries(pending.tables).map(([t, rows]) => (
                <div key={t} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-slate-700">{t.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-slate-900">{rows.length.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {restoreError && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {restoreError}
              </div>
            )}
            {!code.trim() && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Enter your transfer code in the box above, then press Restore now.
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setRestoreError(null); setPending(null); }}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => runRestore(pending)}
                disabled={!code.trim() || busy === "import"}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
