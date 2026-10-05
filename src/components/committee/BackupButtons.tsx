import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  exportCommitteeBackupData,
  importCommitteeBackup,
  signCommitteeFile,
  uploadCommitteeFile,
} from "@/lib/committee-backup.functions";

/**
 * Export / import of the whole committee: the University resources AND the AQUA version (summaries and which
 * tiles are open) travel in the same ZIP, so one backup covers both pages. Shown on both pages.
 */
export function BackupButtons() {
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
      // the AQUA version reads the same committee tree, so refresh it too
      qc.invalidateQueries({ queryKey: ["committee-aqua-years"] });
      qc.invalidateQueries({ queryKey: ["committee-aqua-state"] });
      qc.invalidateQueries({ queryKey: ["committee-aqua-tree"] });
      qc.invalidateQueries({ queryKey: ["committee-aqua-counts"] });
      qc.invalidateQueries({ queryKey: ["committee-year"] });
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
