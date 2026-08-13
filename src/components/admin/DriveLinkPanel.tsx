import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CloudUpload, Link2, Loader2, RefreshCw, HardDriveDownload, AlertTriangle } from "lucide-react";
import { driveLinkStatus, writeDriveSnapshot, relinkFromDrive } from "@/lib/committee-sync.functions";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DriveLinkPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(driveLinkStatus);
  const writeFn = useServerFn(writeDriveSnapshot);
  const relinkFn = useServerFn(relinkFromDrive);

  const [busy, setBusy] = useState<null | "snapshot" | "merge" | "replace">(null);
  const [phase, setPhase] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [report, setReport] = useState<string[] | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["drive-link-status"],
    queryFn: async () => await statusFn({ data: {} } as any),
    retry: false,
  });

  async function handleSnapshot() {
    setBusy("snapshot");
    setPhase("Writing snapshot to Google Drive…");
    try {
      const res: any = await writeFn({ data: {} });
      toast.success(`Snapshot saved to Drive — ${res.years} years, ${res.subjects} subjects, ${res.resources} files`);
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setPhase("");
    }
  }

  async function handleRelink(replace: boolean) {
    if (replace && confirmText.trim().toUpperCase() !== "REPLACE") {
      toast.error('Type REPLACE to confirm');
      return;
    }
    setBusy(replace ? "replace" : "merge");
    setPhase(replace ? "Clearing the committee and restoring from Drive…" : "Restoring from Drive…");
    setReport(null);
    try {
      const res: any = await relinkFn({ data: { replace } });
      setReport(res.skipped ?? []);
      toast.success(
        `Linked to ${res.university}: ${res.yearsAdded} years, ${res.subjectsAdded} subjects, ${res.resourcesAdded} files, ${res.imagesRestored} images`,
      );
      qc.invalidateQueries({ queryKey: ["committee-years"] });
      qc.invalidateQueries({ queryKey: ["admin-committee-years"] });
      setConfirmText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setPhase("");
    }
  }

  const snap = data?.snapshot ?? null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 size={18} className="text-slate-600" />
        <h2 className="font-black text-sm uppercase tracking-widest text-slate-700">Link this site to Google Drive</h2>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        A snapshot of the whole committee lives in your Drive (Committee / _AquaQBank). After a remix, connect the same
        Google account and restore everything with one click — the PDFs and videos stay exactly where they are.
      </p>

      {isLoading ? (
        <div className="text-sm text-slate-500 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking Google Drive…
        </div>
      ) : error ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 inline-flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Google Drive is not reachable yet: {(error as Error).message}</span>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Drive account</div>
            <div className="text-sm font-semibold text-slate-800 mt-1">{data?.account?.email ?? "Connected"}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Snapshot in Drive</div>
            {snap ? (
              <div className="text-sm text-slate-800 mt-1">
                <div className="font-semibold">
                  {snap.counts.years} years · {snap.counts.subjects} subjects · {snap.counts.resources} files
                </div>
                <div className="text-slate-500 text-xs mt-0.5">
                  {snap.counts.driveFiles} on Drive · {snap.counts.localFiles} still on this server · updated{" "}
                  {fmtDate(snap.modifiedTime)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500 mt-1">None yet — press “Update Drive snapshot”.</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSnapshot}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy === "snapshot" ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
          Update Drive snapshot
        </button>
        <button
          onClick={() => handleRelink(false)}
          disabled={busy !== null || !snap}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "merge" ? <Loader2 size={15} className="animate-spin" /> : <HardDriveDownload size={15} />}
          Restore from Drive (merge)
        </button>
        <button
          onClick={() => refetch()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {snap && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-3">
          <div className="text-sm font-semibold text-red-800">Replace the committee</div>
          <p className="text-xs text-red-700/80 mt-0.5 mb-2">
            Deletes every year, subject and file entry first, then restores the Drive snapshot exactly. Type REPLACE to
            confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="REPLACE"
              className="px-3 py-2 rounded-lg border border-red-200 text-sm bg-white w-40"
            />
            <button
              onClick={() => handleRelink(true)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy === "replace" ? <Loader2 size={15} className="animate-spin" /> : <HardDriveDownload size={15} />}
              Replace &amp; restore
            </button>
          </div>
        </div>
      )}

      {phase && (
        <div className="mt-3 text-sm text-slate-600 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {phase}
        </div>
      )}

      {report && (
        <div className="mt-3 text-xs text-slate-600">
          {report.length === 0 ? (
            <span className="text-emerald-700 font-semibold">Everything restored — nothing skipped.</span>
          ) : (
            <>
              <div className="font-semibold text-amber-700 mb-1">Skipped ({report.length}):</div>
              <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
                {report.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
