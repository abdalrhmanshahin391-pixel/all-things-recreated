import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardDriveUpload, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileToDrive } from "@/lib/committee-drive";
import { driveAccountStatus } from "@/lib/committee-drive.functions";

type Row = {
  id: string;
  title: string;
  file_path: string;
  category_id: string;
};

function fmtBytes(n: number | null | undefined) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

/** Moves committee PDFs that still live on the Lovable server into Google Drive. */
export function DriveMigrationPanel() {
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [log, setLog] = useState<Array<{ title: string; ok: boolean; note?: string }>>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  const pending = useQuery({
    queryKey: ["drive-migration-pending"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("committee_resources")
        .select("id,title,file_path,category_id")
        .eq("kind", "pdf")
        .not("file_path", "is", null)
        .is("drive_file_id", null);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const account = useQuery({
    queryKey: ["drive-account"],
    queryFn: async () => await driveAccountStatus(),
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of pending.data ?? []) {
      const list = m.get(r.file_path) ?? [];
      list.push(r);
      m.set(r.file_path, list);
    }
    return Array.from(m.entries());
  }, [pending.data]);

  const run = useCallback(async () => {
    if (groups.length === 0) return;
    setRunning(true);
    setStopRequested(false);
    setLog([]);
    let stop = false;
    for (const [path, rows] of groups) {
      if (stop) break;
      const first = rows[0];
      setCurrent(first.title);
      setPct(0);
      try {
        const signed = await supabase.storage.from("committee-files").createSignedUrl(path, 3600);
        if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? "could not read file");
        const res = await fetch(signed.data.signedUrl);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        const blob = await res.blob();
        const name = path.split("/").pop() || `${first.title}.pdf`;
        const drive = await uploadFileToDrive(blob, {
          categoryId: first.category_id,
          fileName: name,
          onProgress: setPct,
        });
        const { error: updErr } = await (supabase.from("committee_resources") as any)
          .update({
            storage_provider: "drive",
            drive_file_id: drive.fileId,
            drive_web_link: drive.webViewLink,
            drive_download_link: drive.downloadLink,
            file_size: drive.size ?? blob.size,
            file_path: null,
          })
          .in("id", rows.map((r) => r.id));
        if (updErr) throw new Error(updErr.message);
        await supabase.storage.from("committee-files").remove([path]);
        setLog((l) => [
          { title: first.title, ok: true, note: rows.length > 1 ? `${rows.length} places updated` : fmtBytes(blob.size) },
          ...l,
        ]);
      } catch (e: any) {
        setLog((l) => [{ title: first.title, ok: false, note: e?.message ?? "failed" }, ...l]);
      }
      setStopRequested((s) => { stop = s; return s; });
    }
    setCurrent(null);
    setRunning(false);
    await pending.refetch();
    toast.success("Migration pass finished");
  }, [groups, pending]);

  const q = account.data;
  const quotaPct = q?.limit && q?.usage ? Math.min(100, Math.round((q.usage / q.limit) * 100)) : null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-black text-sm uppercase tracking-widest text-slate-700 flex items-center gap-2">
            <HardDriveUpload size={16} /> Move files to Google Drive
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Each file is copied into your Drive, made link-accessible, the library rows are pointed at it, and only then
            is the old copy removed. Safe to stop and continue later.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {q?.email ? <div className="font-bold text-slate-700">{q.email}</div> : null}
          {quotaPct !== null ? <div>{fmtBytes(q?.usage)} of {fmtBytes(q?.limit)} used ({quotaPct}%)</div> : null}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-bold text-slate-800">
          {pending.isLoading ? "Checking…" : `${groups.length} file${groups.length === 1 ? "" : "s"} still on the Lovable server`}
        </span>
        <button
          onClick={run}
          disabled={running || groups.length === 0}
          className="px-4 py-2 rounded-xl text-sm font-black text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#6366F1 0%,#4F46E5 100%)" }}
        >
          {running ? "Moving…" : "Start moving"}
        </button>
        {running ? (
          <button onClick={() => setStopRequested(true)} className="px-3 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-700">
            Stop after this file
          </button>
        ) : (
          <button onClick={() => pending.refetch()} className="px-3 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-700 inline-flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
        )}
      </div>

      {current ? (
        <div className="space-y-1">
          <div className="text-xs text-slate-600 truncate">Moving: {current}</div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {log.length > 0 ? (
        <div className="max-h-64 overflow-y-auto space-y-1 border-t border-slate-100 pt-3">
          {log.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {l.ok ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> : <AlertTriangle size={13} className="text-rose-600 shrink-0" />}
              <span className="font-semibold text-slate-700 truncate">{l.title}</span>
              {l.note ? <span className="text-slate-400 truncate">— {l.note}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
