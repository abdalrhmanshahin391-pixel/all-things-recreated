import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Save, Eye, EyeOff, Home, Lock, Tag, BadgeCheck, Loader2, Clock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BADGE_PRESETS } from "@/components/common/CourseBadge";

export const Route = createFileRoute("/admin/course-control")({
  head: () => ({
    meta: [
      { title: "Course Control — AquaQBank" },
      { name: "description", content: "Publish courses, set prices and discounts, badges and visibility." },
      { property: "og:title", content: "Course Control — AquaQBank" },
      { property: "og:description", content: "Publish courses, set prices and discounts, badges and visibility." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CourseControlPage,
});

type Row = {
  id: string;
  title: string;
  year: number | null;
  semester: number | null;
  kind: string | null;
  currency: string | null;
  price: number | null;
  published: boolean;
  university_id: string | null;
  badge: string | null;
  badge_color: string | null;
  badge_expires_at: string | null;
  compare_at_price: number | null;
  discount_active: boolean;
  discount_ends_at: string | null;
  show_on_home: boolean;
  admin_only: boolean;
  /** Only present once the coming_soon migration has been applied. */
  coming_soon?: boolean;
};

const CURRENCIES = ["usd", "eur", "gbp", "jod", "sar"];

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

function CourseControlPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [unis, setUnis] = useState<Array<{ id: string; name: string }>>([]);
  const [fetching, setFetching] = useState(true);
  const [q, setQ] = useState("");
  const [uniFilter, setUniFilter] = useState("all");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setFetching(true);
      const [{ data: cs, error }, { data: us }] = await Promise.all([
        supabase
          .from("courses")
          .select("*")
          .order("year", { ascending: true })
          .order("title", { ascending: true }),
        supabase.from("universities").select("id, name").order("name"),
      ]);
      if (error) toast.error(error.message);
      setRows((cs ?? []) as unknown as Row[]);
      setUnis((us ?? []) as Array<{ id: string; name: string }>);
      setFetching(false);
    })();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (uniFilter !== "all" && (r.university_id ?? "none") !== uniFilter) return false;
      if (!needle) return true;
      return r.title.toLowerCase().includes(needle);
    });
  }, [rows, q, uniFilter]);

  function patch(id: string, next: Partial<Row>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...next } : r)));
    setDirty((d) => ({ ...d, [id]: true }));
  }

  async function save(row: Row) {
    setSaving(row.id);
    const { error } = await supabase
      .from("courses")
      .update({
        published: row.published,
        price: Number(row.price ?? 0),
        currency: row.currency ?? "usd",
        compare_at_price: row.compare_at_price === null || row.compare_at_price === undefined || Number.isNaN(Number(row.compare_at_price))
          ? null
          : Number(row.compare_at_price),
        discount_active: row.discount_active,
        discount_ends_at: row.discount_ends_at,
        badge: row.badge?.trim() ? row.badge.trim() : null,
        badge_color: row.badge?.trim() ? (row.badge_color || "#f43f5e") : null,
        badge_expires_at: row.badge?.trim() ? row.badge_expires_at : null,
        show_on_home: row.show_on_home,
        admin_only: row.admin_only,
        ...(row.coming_soon === undefined ? {} : { coming_soon: row.coming_soon }),
      })
      .eq("id", row.id);
    setSaving(null);
    if (error) toast.error(error.message);
    else {
      setDirty((d) => ({ ...d, [row.id]: false }));
      toast.success(`Saved — ${row.title}`);
    }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-[#FAFAF9]" />;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-6xl px-4 md:px-6 pt-32 pb-24">
        <h1 className="font-display font-black text-3xl md:text-4xl mb-1">Course Control</h1>
        <p className="text-slate-500 mb-6 text-sm">
          Publish a course, set its price, show a “was” price when you discount it, pick a badge, and choose where it
          shows up. <Link to="/admin/courses" className="underline">Courses Control</Link> still handles content.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search courses…"
              className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
            />
          </div>
          <select
            value={uniFilter}
            onChange={(e) => setUniFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
          >
            <option value="all">All universities</option>
            <option value="none">No university</option>
            {unis.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {fetching ? (
          <div className="text-slate-500 text-sm inline-flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Loading courses…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-sm">No courses match.</div>
        ) : (
          <div className="space-y-4">
            {filtered.map((r) => {
              const was = Number(r.compare_at_price ?? 0);
              const now = Number(r.price ?? 0);
              const offerLive =
                r.discount_active && was > now && (!r.discount_ends_at || new Date(r.discount_ends_at).getTime() > Date.now());
              return (
                <div key={r.id} className="rounded-2xl bg-white border border-slate-200 p-4 md:p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <h2 className="font-black text-lg me-auto">{r.title}</h2>
                    <span className="text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                      Year {r.year ?? "—"}{r.semester ? ` · Sem ${r.semester}` : ""} · {r.kind ?? "questions"}
                    </span>
                    {offerLive && (
                      <span className="text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                        offer live
                      </span>
                    )}
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Visibility */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Visibility</div>
                      <Toggle
                        on={r.published}
                        onChange={(v) => patch(r.id, { published: v })}
                        icon={r.published ? <Eye size={14} /> : <EyeOff size={14} />}
                        label={r.published ? "Published (live)" : "Draft (hidden)"}
                      />
                      <Toggle
                        on={r.show_on_home}
                        onChange={(v) => patch(r.id, { show_on_home: v })}
                        icon={<Home size={14} />}
                        label={r.show_on_home ? "Shows on home page" : "University pages only"}
                      />
                      <Toggle
                        on={r.admin_only}
                        onChange={(v) => patch(r.id, { admin_only: v })}
                        icon={<Lock size={14} />}
                        label={r.admin_only ? "Admin only (nobody else sees it)" : "Everyone can see it"}
                        danger
                      />
                      <Toggle
                        on={!!r.coming_soon}
                        onChange={(v) => patch(r.id, { coming_soon: v })}
                        icon={<Clock size={14} />}
                        label={r.coming_soon ? "Coming soon (students cannot open it)" : "Open for students"}
                      />
                    </div>

                    {/* Price & discount */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Price</div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.price ?? 0}
                          onChange={(e) => patch(r.id, { price: e.target.value === "" ? 0 : Number(e.target.value) })}
                          className="w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                        />
                        <select
                          value={(r.currency ?? "usd").toLowerCase()}
                          onChange={(e) => patch(r.id, { currency: e.target.value })}
                          className="px-2 py-2 rounded-lg border border-slate-200 text-sm uppercase"
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c} value={c}>{c.toUpperCase()}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => patch(r.id, { price: 0 })}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Free
                        </button>
                      </div>
                      <Toggle
                        on={r.discount_active}
                        onChange={(v) => patch(r.id, { discount_active: v })}
                        icon={<Tag size={14} />}
                        label={r.discount_active ? "Discount running" : "No discount"}
                      />
                      <label className="block text-xs font-bold text-slate-500">
                        Was (original price)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.compare_at_price ?? ""}
                          onChange={(e) =>
                            patch(r.id, { compare_at_price: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          placeholder="e.g. 20"
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-normal"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-500">
                        Offer ends (optional)
                        <input
                          type="datetime-local"
                          value={toLocalInput(r.discount_ends_at)}
                          onChange={(e) => patch(r.id, { discount_ends_at: fromLocalInput(e.target.value) })}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-normal"
                        />
                      </label>
                      {r.discount_active && was > now && (
                        <p className="text-xs text-slate-500">
                          Students see <s>{was.toFixed(0)} {(r.currency ?? "usd").toUpperCase()}</s>{" "}
                          <b>{now > 0 ? `${now.toFixed(0)} ${(r.currency ?? "usd").toUpperCase()}` : "FREE"}</b>
                        </p>
                      )}
                    </div>

                    {/* Badge */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Badge</div>
                      <div className="flex flex-wrap gap-1.5">
                        {BADGE_PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => patch(r.id, { badge: p.label, badge_color: p.color })}
                            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white"
                            style={{ background: p.color, opacity: r.badge === p.label ? 1 : 0.55 }}
                          >
                            {p.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => patch(r.id, { badge: null, badge_color: null, badge_expires_at: null })}
                          className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-slate-200 text-slate-500"
                        >
                          None
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={r.badge ?? ""}
                          onChange={(e) => patch(r.id, { badge: e.target.value })}
                          placeholder="Custom text"
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                        />
                        <input
                          type="color"
                          value={r.badge_color ?? "#f43f5e"}
                          onChange={(e) => patch(r.id, { badge_color: e.target.value })}
                          className="w-11 h-10 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <label className="block text-xs font-bold text-slate-500">
                        Badge expires (optional)
                        <input
                          type="datetime-local"
                          value={toLocalInput(r.badge_expires_at)}
                          onChange={(e) => patch(r.id, { badge_expires_at: fromLocalInput(e.target.value) })}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-normal"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => save(r)}
                      disabled={saving === r.id || !dirty[r.id]}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-40"
                    >
                      {saving === r.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      Save
                    </button>
                    {dirty[r.id] ? (
                      <span className="text-xs font-bold text-amber-600">Unsaved changes</span>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1">
                        <BadgeCheck size={13} /> Saved
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  icon,
  danger,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold text-start transition-colors"
      style={{
        borderColor: on ? (danger ? "#fecaca" : "#bbf7d0") : "#e2e8f0",
        background: on ? (danger ? "#fef2f2" : "#f0fdf4") : "#fff",
        color: on ? (danger ? "#b91c1c" : "#15803d") : "#475569",
      }}
    >
      <span
        className="inline-flex w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors"
        style={{ background: on ? (danger ? "#ef4444" : "#22c55e") : "#cbd5e1" }}
      >
        <span
          className="w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: on ? "translateX(16px)" : "none" }}
        />
      </span>
      {icon}
      {label}
    </button>
  );
}
