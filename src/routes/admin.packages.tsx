import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Users,
  User,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Search,
  X,
  Check,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListPackages,
  adminUpsertPackage,
  adminDeletePackage,
  adminSetPackageCourses,
  type PackageWithCourses,
  type PackageType,
} from "@/lib/packages.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/packages")({
  head: () => ({ meta: [{ title: "Packages — Admin · AquaQBank" }] }),
  component: AdminPackagesPage,
});

type CourseLite = { id: string; title: string; year: number };

function AdminPackagesPage() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const list = useServerFn(adminListPackages);
  const upsert = useServerFn(adminUpsertPackage);
  const del = useServerFn(adminDeletePackage);
  const setCourses = useServerFn(adminSetPackageCourses);

  const [packages, setPackages] = useState<PackageWithCourses[]>([]);
  const [allCourses, setAllCourses] = useState<CourseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New package form
  const [showNew, setShowNew] = useState(false);
  const [nName, setNName] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nPrice, setNPrice] = useState("");
  const [nType, setNType] = useState<PackageType>("individual");
  const [nGroupSize, setNGroupSize] = useState(3);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/" });
  }, [authLoading, isAdmin, navigate]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [pkgs, { data: cs }] = await Promise.all([
        list(),
        supabase.from("courses").select("id,title,year").order("year").order("title"),
      ]);
      setPackages(pkgs);
      setAllCourses((cs ?? []) as CourseLite[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(
    () =>
      packages.filter(
        (p) =>
          !query.trim() ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description?.toLowerCase().includes(query.toLowerCase()),
      ),
    [packages, query],
  );

  async function handleCreate() {
    if (!nName.trim() || !nPrice) {
      toast.error("Name and price are required");
      return;
    }
    const price = Number(nPrice);
    if (Number.isNaN(price)) {
      toast.error("Invalid price");
      return;
    }
    try {
      await upsert({
        data: {
          name: nName,
          description: nDesc || null,
          price,
          package_type: nType,
          group_size: nType === "group" ? nGroupSize : 1,
          published: false,
        },
      });
      setNName("");
      setNDesc("");
      setNPrice("");
      setNType("individual");
      setNGroupSize(3);
      setShowNew(false);
      toast.success("Package created");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function togglePublish(p: PackageWithCourses) {
    setBusyId(p.id);
    try {
      await upsert({
        data: {
          id: p.id,
          name: p.name,
          description: p.description,
          price: Number(p.price),
          currency: p.currency,
          package_type: p.package_type,
          group_size: p.group_size,
          published: !p.published,
          sort_order: p.sort_order,
        },
      });
      toast.success(p.published ? "Unpublished" : "Published");
      refresh();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this package? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await del({ data: { id } });
      toast.success("Deleted");
      refresh();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <div className="min-h-screen bg-black text-white">
        <SiteHeader />
        <div className="pt-32 text-center text-white/50">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 md:px-10 pt-28 pb-24">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">
              Admin
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold">Packages Table</h1>
            <p className="text-sm text-white/55 mt-1">
              Bundle courses into a package. Individual = one buyer. Group = one buyer pays for
              several registered users.
            </p>
          </div>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold tracking-wide px-4 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" /> New package
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <AlertCircle className="w-4 h-4 mt-0.5" /> {error}
          </div>
        )}

        {/* New package form */}
        {showNew && (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name (shown to buyers)">
                <input
                  value={nName}
                  onChange={(e) => setNName(e.target.value)}
                  placeholder="e.g. Year 3 Mastery Bundle"
                  className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Price (USD)">
                <input
                  value={nPrice}
                  onChange={(e) => setNPrice(e.target.value)}
                  placeholder="99"
                  inputMode="decimal"
                  className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Description (attractive copy)" className="md:col-span-2">
                <textarea
                  value={nDesc}
                  onChange={(e) => setNDesc(e.target.value)}
                  rows={2}
                  placeholder="What's special about this bundle?"
                  className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Package type">
                <div className="flex gap-2">
                  {(["individual", "group"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNType(t)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                        nType === t
                          ? "bg-amber-400 text-black border-amber-400"
                          : "border-white/15 text-white/70 hover:border-white/40"
                      }`}
                    >
                      {t === "group" ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              {nType === "group" && (
                <Field label="Group size (total seats)">
                  <input
                    type="number"
                    min={2}
                    value={nGroupSize}
                    onChange={(e) => setNGroupSize(Math.max(2, Number(e.target.value) || 2))}
                    className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
                  />
                </Field>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNew(false)}
                className="rounded-md px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-2 rounded-md bg-amber-400 hover:bg-amber-300 text-black font-bold px-4 py-2 text-xs"
              >
                <Save className="w-3.5 h-3.5" /> Create draft
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-4 flex items-center rounded-xl border border-white/15 bg-zinc-900/60 px-3 py-2 gap-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packages…"
            className="flex-1 bg-transparent text-sm outline-none placeholder-white/30"
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-white/40 text-sm">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading packages…
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 overflow-hidden">
            {filtered.length === 0 && (
              <div className="p-8 text-center text-white/50 text-sm">
                No packages yet. Click "New package" to create one.
              </div>
            )}
            {filtered.map((p) => {
              const expanded = expandedId === p.id;
              const totalQ = p.courses.reduce(
                (a, c) => a + c.questions_count_mid + c.questions_count_final,
                0,
              );
              return (
                <div key={p.id} className="border-b border-white/5 last:border-b-0">
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                    <button
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                      className="w-8 h-8 rounded-md hover:bg-white/5 flex items-center justify-center text-white/60"
                    >
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ${
                        p.package_type === "group"
                          ? "bg-rose-500/10 text-rose-300 ring-rose-500/40"
                          : "bg-sky-500/10 text-sky-300 ring-sky-500/40"
                      }`}
                    >
                      {p.package_type === "group" ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">
                        {p.name}
                        {!p.published && (
                          <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-400/80">
                            draft
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-white/50">
                        {p.package_type === "group" ? `${p.group_size} seats` : "1 seat"} ·{" "}
                        {p.courses.length} courses · {totalQ.toLocaleString()} Q ·{" "}
                        {p.paddle_price_id ? (
                          <span className="text-emerald-400">payments ready</span>
                        ) : (
                          <span className="text-amber-400">no payment price</span>
                        )}
                      </div>
                    </div>
                    <div className="font-serif text-xl font-bold tabular-nums">
                      ${Number(p.price).toFixed(0)}
                    </div>
                    <button
                      disabled={busyId === p.id}
                      onClick={() => togglePublish(p)}
                      title={p.published ? "Unpublish" : "Publish"}
                      className={`w-9 h-9 rounded-md flex items-center justify-center ${
                        p.published
                          ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                          : "bg-white/5 text-white/50 hover:bg-white/10"
                      }`}
                    >
                      {p.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={busyId === p.id}
                      className="w-9 h-9 rounded-md flex items-center justify-center text-rose-300 hover:bg-rose-500/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {expanded && (
                    <PackageEditor
                      pkg={p}
                      allCourses={allCourses}
                      onSavedMeta={refresh}
                      onSavedCourses={refresh}
                      upsert={upsert}
                      setCourses={setCourses}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-xs text-white/40 leading-relaxed">
          <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" /> To connect a package to
          payments, set its <span className="text-white/70 font-semibold">Paddle price ID</span> in
          the editor. Use a price ID created with the payments tools (e.g.
          <code className="px-1 mx-0.5 rounded bg-white/5">year3_bundle_one_time</code>).
        </div>
      </main>
    </div>
  );
}

function PackageEditor({
  pkg,
  allCourses,
  onSavedMeta,
  onSavedCourses,
  upsert,
  setCourses,
}: {
  pkg: PackageWithCourses;
  allCourses: CourseLite[];
  onSavedMeta: () => void;
  onSavedCourses: () => void;
  upsert: ReturnType<typeof useServerFn<typeof adminUpsertPackage>>;
  setCourses: ReturnType<typeof useServerFn<typeof adminSetPackageCourses>>;
}) {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? "");
  const [price, setPrice] = useState(String(pkg.price));
  const [type, setType] = useState<PackageType>(pkg.package_type);
  const [groupSize, setGroupSize] = useState(pkg.group_size);
  const [paddlePriceId, setPaddlePriceId] = useState(pkg.paddle_price_id ?? "");
  const [picked, setPicked] = useState<
    Array<{ courseId: string; note: string | null }>
  >(pkg.courses.map((c) => ({ courseId: c.id, note: c.note })));
  const [saving, setSaving] = useState(false);

  const pickedIds = new Set(picked.map((p) => p.courseId));
  const available = allCourses.filter((c) => !pickedIds.has(c.id));

  async function saveMeta() {
    setSaving(true);
    try {
      await upsert({
        data: {
          id: pkg.id,
          name,
          description,
          price: Number(price) || 0,
          currency: pkg.currency,
          package_type: type,
          group_size: type === "group" ? groupSize : 1,
          published: pkg.published,
          sort_order: pkg.sort_order,
        },
      });
      // Save paddle_price_id via direct supabase since it's a separate column we expose
      await (supabase.from("packages") as any)
        .update({ paddle_price_id: paddlePriceId || null })
        .eq("id", pkg.id);
      toast.success("Saved");
      onSavedMeta();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCourses() {
    setSaving(true);
    try {
      await setCourses({
        data: {
          packageId: pkg.id,
          courses: picked.map((p, idx) => ({
            courseId: p.courseId,
            note: p.note,
            sortOrder: idx,
          })),
        },
      });
      toast.success("Courses updated");
      onSavedCourses();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-black/40 px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-white/5">
      {/* META */}
      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest font-bold text-amber-400">Details</h4>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (USD)">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Type">
            <div className="flex gap-2">
              {(["individual", "group"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-md px-2 py-2 text-[11px] font-bold uppercase tracking-wider border ${
                    type === t
                      ? "bg-amber-400 text-black border-amber-400"
                      : "border-white/15 text-white/70 hover:border-white/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          {type === "group" && (
            <Field label="Group size">
              <input
                type="number"
                min={2}
                value={groupSize}
                onChange={(e) => setGroupSize(Math.max(2, Number(e.target.value) || 2))}
                className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
              />
            </Field>
          )}
        </div>
        <Field label="Paddle price ID (created with payment tools)">
          <input
            value={paddlePriceId}
            onChange={(e) => setPaddlePriceId(e.target.value)}
            placeholder="e.g. year3_bundle_one_time"
            className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm font-mono"
          />
        </Field>
        <button
          disabled={saving}
          onClick={saveMeta}
          className="inline-flex items-center gap-2 rounded-md bg-amber-400 hover:bg-amber-300 text-black font-bold px-4 py-2 text-xs disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save details
        </button>
      </div>

      {/* COURSES */}
      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-widest font-bold text-amber-400">
          Courses in package · {picked.length}
        </h4>
        <div className="rounded-lg border border-white/10 max-h-72 overflow-y-auto">
          {picked.length === 0 && (
            <div className="px-3 py-4 text-xs text-white/40">No courses yet.</div>
          )}
          {picked.map((p, idx) => {
            const c = allCourses.find((x) => x.id === p.courseId);
            if (!c) return null;
            return (
              <div
                key={p.courseId}
                className="flex items-start gap-2 px-3 py-2 border-b border-white/5 last:border-b-0"
              >
                <Check className="w-4 h-4 text-amber-400 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold capitalize truncate">
                    {c.title}{" "}
                    <span className="text-[10px] uppercase tracking-widest text-white/40">
                      Year {c.year}
                    </span>
                  </div>
                  <input
                    value={p.note ?? ""}
                    onChange={(e) =>
                      setPicked((cur) =>
                        cur.map((x, i) => (i === idx ? { ...x, note: e.target.value || null } : x)),
                      )
                    }
                    placeholder="Optional note (shown to buyer)"
                    className="mt-1 w-full bg-transparent border-b border-white/10 focus:border-amber-400/60 text-xs py-1 outline-none"
                  />
                </div>
                <button
                  onClick={() =>
                    setPicked((cur) => cur.filter((x) => x.courseId !== p.courseId))
                  }
                  className="w-7 h-7 rounded-md hover:bg-rose-500/15 text-rose-300 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {available.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
              Add a course
            </div>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setPicked([...picked, { courseId: e.target.value, note: null }]);
              }}
              className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
            >
              <option value="">Pick a course…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  Year {c.year} · {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          disabled={saving}
          onClick={saveCourses}
          className="inline-flex items-center gap-2 rounded-md bg-amber-400 hover:bg-amber-300 text-black font-bold px-4 py-2 text-xs disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save courses
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
