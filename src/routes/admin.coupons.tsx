import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Ticket, Plus, Trash2, Pencil, X, Check, Copy, Percent, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListCoupons,
  adminSaveCoupon,
  adminDeleteCoupon,
  type CouponRow,
} from "@/lib/coupons.functions";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({ meta: [{ title: "Coupons — AquaQBank" }] }),
  component: AdminCouponsPage,
});

type CourseOption = { id: string; title: string; year: number };

function AdminCouponsPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const list = useServerFn(adminListCoupons);
  const save = useServerFn(adminSaveCoupon);
  const del = useServerFn(adminDeleteCoupon);

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  async function refresh() {
    setFetching(true);
    try {
      const [c, { data: cs }] = await Promise.all([
        list(),
        supabase.from("courses").select("id, title, year").order("year").order("title"),
      ]);
      setCoupons(c);
      setCourses((cs ?? []) as CourseOption[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this coupon? Existing redemptions will be removed too.")) return;
    try {
      await del({ data: { id } });
      setCoupons((p) => p.filter((c) => c.id !== id));
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-[#FAFAF9]" />;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-5xl px-6 pt-32 pb-20">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 grid place-items-center">
              <Ticket size={20} className="text-amber-600" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Coupons</h1>
              <p className="text-slate-500 text-sm mt-1">
                Give users discounts or free access to specific courses.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            <Plus size={16} /> New coupon
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {fetching ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
          ) : coupons.length === 0 ? (
            <div className="p-12 text-center">
              <Ticket size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm">No coupons yet. Create your first one.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {coupons.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(c.code);
                        toast.success("Copied");
                      }}
                      className="inline-flex items-center gap-1.5 font-mono font-bold text-sm px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100"
                    >
                      {c.code}
                      <Copy size={11} className="opacity-50" />
                    </button>
                    <div className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
                      {c.discount_type === "percent" ? (
                        <><Percent size={13} /> {c.discount_value}% off</>
                      ) : (
                        <><DollarSign size={13} /> ${c.discount_value.toFixed(2)} off</>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Used {c.used_count}
                      {c.max_uses ? ` / ${c.max_uses}` : ""}
                    </div>
                    <div className="text-xs text-slate-500 flex-1 min-w-0">
                      {c.courses.length === 0 ? (
                        <span className="italic">All courses</span>
                      ) : (
                        <span className="truncate block">
                          {c.courses.map((cr) => cr.title).join(", ")}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                        c.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {c.is_active ? "Active" : "Off"}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditing(c);
                          setShowForm(true);
                        }}
                        className="grid place-items-center h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-600"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="grid place-items-center h-8 w-8 rounded-lg hover:bg-rose-50 text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {showForm && (
        <CouponForm
          coupon={editing}
          courses={courses}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await refresh();
          }}
          save={save}
        />
      )}
    </div>
  );
}

function CouponForm({
  coupon,
  courses,
  onClose,
  onSaved,
  save,
}: {
  coupon: CouponRow | null;
  courses: CourseOption[];
  onClose: () => void;
  onSaved: () => void;
  save: ReturnType<typeof useServerFn<typeof adminSaveCoupon>>;
}) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<"percent" | "fixed">(coupon?.discount_type ?? "percent");
  const [value, setValue] = useState<string>(String(coupon?.discount_value ?? 100));
  const [maxUses, setMaxUses] = useState<string>(coupon?.max_uses ? String(coupon.max_uses) : "");
  const [startsAt, setStartsAt] = useState(coupon?.starts_at?.slice(0, 16) ?? "");
  const [expiresAt, setExpiresAt] = useState(coupon?.expires_at?.slice(0, 16) ?? "");
  const [isActive, setIsActive] = useState(coupon?.is_active ?? true);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(
    new Set(coupon?.courses.map((c) => c.id) ?? []),
  );
  const [applyAll, setApplyAll] = useState((coupon?.courses.length ?? 0) === 0);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<number, CourseOption[]>();
    for (const c of courses) {
      const arr = m.get(c.year) ?? [];
      arr.push(c);
      m.set(c.year, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [courses]);

  async function handleSubmit() {
    setSaving(true);
    try {
      await save({
        data: {
          id: coupon?.id,
          code,
          discount_type: type,
          discount_value: Number(value),
          max_uses: maxUses ? Number(maxUses) : null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          is_active: isActive,
          course_ids: applyAll ? [] : Array.from(selectedCourses),
        },
      });
      toast.success(coupon ? "Coupon updated" : "Coupon created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">{coupon ? "Edit coupon" : "New coupon"}</h2>
          <button onClick={onClose} className="grid place-items-center h-8 w-8 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
              Code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME2025"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono uppercase text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                Discount type
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setType("percent")}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${
                    type === "percent"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  Percent
                </button>
                <button
                  onClick={() => setType("fixed")}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${
                    type === "fixed"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  Fixed $
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                Value {type === "percent" ? "(0–100)" : "(USD)"}
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">100% = free access</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                Max uses (optional)
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 py-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="font-semibold">Active</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                Starts (optional)
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                Expires (optional)
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
              Applies to
            </label>
            <label className="inline-flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm font-semibold">All courses</span>
            </label>
            {!applyAll && (
              <div className="rounded-lg border border-slate-200 max-h-56 overflow-y-auto">
                {grouped.map(([year, list]) => (
                  <div key={year}>
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Year {year}
                    </div>
                    {list.map((c) => {
                      const on = selectedCourses.has(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              setSelectedCourses((prev) => {
                                const s = new Set(prev);
                                if (on) s.delete(c.id);
                                else s.add(c.id);
                                return s;
                              });
                            }}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="capitalize">{c.title}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            <Check size={14} /> {saving ? "Saving…" : coupon ? "Save changes" : "Create coupon"}
          </button>
        </div>
      </div>
    </div>
  );
}
