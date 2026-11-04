import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { findRecentPayments, grantPaymentAccess, type RecentPaymentRow } from "@/utils/payments.functions";

/** Lists the recent Paddle payments and shows which ones did not open the course, with a button to open it. */
export function PaymentsCheck() {
  const findFn = useServerFn(findRecentPayments);
  const grantFn = useServerFn(grantPaymentAccess);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<RecentPaymentRow[] | null>(null);
  const [granting, setGranting] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const res = await findFn({ data: { days } });
      setRows(res.rows);
    } catch (e: any) {
      toast.error(e?.message || "Could not read the payments");
    } finally {
      setBusy(false);
    }
  }

  async function grant(r: RecentPaymentRow) {
    setGranting(r.transactionId);
    try {
      const res = await grantFn({ data: { transactionId: r.transactionId } });
      toast.success(`Course opened: ${res.courseTitle || "done"}`);
      setRows((cur) => (cur ? cur.map((x) => (x.transactionId === r.transactionId ? { ...x, hasAccess: true, note: "" } : x)) : cur));
    } catch (e: any) {
      toast.error(e?.message || "Could not open the course");
    } finally {
      setGranting(null);
    }
  }

  const missing = rows?.filter((r) => !r.hasAccess) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-white p-4 mb-6 text-slate-900">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <ReceiptText className="w-4 h-4" /> Check payments (paid but the course did not open)
        </span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-slate-600">Last</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              {[1, 3, 7, 14, 30, 60].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "day" : "days"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Check now
            </button>
          </div>

          {rows && (
            <div className="text-sm">
              <div className={`mb-2 font-semibold ${missing.length ? "text-rose-600" : "text-emerald-600"}`}>
                {missing.length
                  ? `${missing.length} of ${rows.length} payments did not open the course`
                  : `All ${rows.length} payments opened their course`}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Buyer</th>
                      <th className="px-3 py-2">Course</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.transactionId} className="border-t border-slate-200 text-slate-900">
                        <td className="px-3 py-2 whitespace-nowrap">{r.billedAt ? new Date(r.billedAt).toLocaleString() : ""}</td>
                        <td className="px-3 py-2">{r.email || "—"}</td>
                        <td className="px-3 py-2">{r.packageId ? "Package" : r.courseTitle || "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.amountCents != null ? (r.amountCents / 100).toFixed(2) : "—"} {r.currency?.toUpperCase() ?? ""}
                        </td>
                        <td className="px-3 py-2">
                          {r.hasAccess ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Opened
                            </span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-rose-600">
                                <AlertTriangle className="w-3.5 h-3.5" /> Not opened
                              </span>
                              {r.userId && r.courseId && !r.packageId && (
                                <button
                                  type="button"
                                  onClick={() => grant(r)}
                                  disabled={granting === r.transactionId}
                                  className="rounded-md bg-emerald-500 px-2 py-1 font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                                >
                                  {granting === r.transactionId ? "Opening…" : "Open the course"}
                                </button>
                              )}
                              {r.note && <span className="text-slate-500">{r.note}</span>}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
