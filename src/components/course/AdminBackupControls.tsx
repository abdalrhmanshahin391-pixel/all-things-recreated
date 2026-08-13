import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportCourseBackup, importCourseBackup } from "@/lib/course-backup.functions";

export function AdminBackupControls({
  courseId,
  courseTitle,
  onImported,
}: {
  courseId: string;
  courseTitle: string;
  onImported?: () => void;
}) {
  const exportFn = useServerFn(exportCourseBackup);
  const importFn = useServerFn(importCourseBackup);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  async function handleExport() {
    if (busy) return;
    setBusy("export");
    try {
      const backup = await exportFn({ data: { courseId } });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${slug || "course"}-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const totalQs = backup.subject_groups.reduce(
        (n, g) => n + g.subjects.reduce((m, s) => m + s.questions.length, 0), 0);
      toast.success(`Exported ${totalQs} questions`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy("import");
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload?.format !== "lovable-course-backup") {
        throw new Error("Not a valid backup file");
      }
      const totalQs = (payload.subject_groups ?? []).reduce(
        (n: number, g: any) => n + (g.subjects ?? []).reduce(
          (m: number, s: any) => m + (s.questions?.length ?? 0), 0), 0);
      const ok = window.confirm(
        `Merge backup into "${courseTitle}"?\n\n` +
        `${payload.subject_groups?.length ?? 0} groups, ${totalQs} questions.\n` +
        `Existing questions with the same wording will be skipped — nothing is deleted.`,
      );
      if (!ok) { setBusy(null); return; }
      const res = await importFn({ data: { courseId, payload } });
      toast.success(
        `Added ${res.questionsAdded} questions (${res.questionsSkipped} skipped) · ` +
        `${res.subjectsAdded} subjects · ${res.groupsAdded} groups`,
      );
      onImported?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-white/90 border border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-white shadow-sm disabled:opacity-50 transition-colors";

  return (
    <div className="flex flex-col gap-2 items-end">
      <button onClick={handleExport} disabled={!!busy} className={btn} title="Download a JSON backup of this course">
        {busy === "export" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Export backup
      </button>
      <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={btn} title="Merge a backup file into this course">
        {busy === "import" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Import backup
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
