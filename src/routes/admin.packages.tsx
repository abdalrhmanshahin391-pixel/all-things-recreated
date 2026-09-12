import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Package as PackageIcon,
  Tag,
  Percent,
  Flame,
  Clock,
  Gem,
  Star,
  Layers,
  GraduationCap,
  ExternalLink,
  HelpCircle,
  Image as ImageIcon,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
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
  type PackageKind,
  type PackageSelectionMode,
} from "@/lib/packages.functions";
import { syncPaddlePackagePrice } from "@/utils/payments.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/packages")({
  head: () => ({ meta: [{ title: "Packages Center — Admin · AquaQBank" }] }),
  component: AdminPackagesCenterPage,
});

type CourseLite = {
  id: string;
  title: string;
  year: number;
  kind?: string;
  image_url?: string | null;
  questions_count_mid?: number;
  questions_count_final?: number;
};

const BADGE_PRESETS = [
  { label: "None", value: "" },
  { label: "Hot Offer 🔥", value: "Hot Offer 🔥" },
  { label: "Limited Time ⏳", value: "Limited Time ⏳" },
  { label: "Best Value 💎", value: "Best Value 💎" },
  { label: "Most Popular 🌟", value: "Most Popular 🌟" },
];

function AdminPackagesCenterPage() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const list = useServerFn(adminListPackages);
  const upsert = useServerFn(adminUpsertPackage);
  const del = useServerFn(adminDeletePackage);
  const setCourses = useServerFn(adminSetPackageCourses);
  const syncPaddle = useServerFn(syncPaddlePackagePrice);

  const [packages, setPackages] = useState<PackageWithCourses[]>([]);
  const [allCourses, setAllCourses] = useState<CourseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "discounted" | "choice">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New package form state
  const [showNew, setShowNew] = useState(false);
  const [nName, setNName] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nPrice, setNPrice] = useState("");
  const [nOriginalPrice, setNOriginalPrice] = useState("");
  const [nBadge, setNBadge] = useState("");
  const [nCustomBadge, setNCustomBadge] = useState("");
  const [nImageUrl, setNImageUrl] = useState("");
  const [nNotes, setNNotes] = useState("");
  const [nType, setNType] = useState<PackageType>("individual");
  const [nGroupSize, setNGroupSize] = useState(3);
  const [nKind, setNKind] = useState<PackageKind>("courses");
  const [nSelectionMode, setNSelectionMode] = useState<PackageSelectionMode>("fixed");
  const [nChoiceCount, setNChoiceCount] = useState(3);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/" });
  }, [authLoading, isAdmin, navigate]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [pkgs, { data: cs }] = await Promise.all([
        list(),
        supabase
          .from("courses")
          .select("id,title,year,kind,image_url,questions_count_mid,questions_count_final")
          .order("year")
          .order("title"),
      ]);
      setPackages(pkgs);
      setAllCourses((cs ?? []) as CourseLite[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const stats = useMemo(() => {
    const total = packages.length;
    const published = packages.filter((p) => p.published).length;
    const discounted = packages.filter(
      (p) => p.original_price && Number(p.original_price) > Number(p.price),
    ).length;
    const paddleReady = packages.filter((p) => !!p.paddle_price_id).length;
    return { total, published, discounted, paddleReady };
  }, [packages]);

  const filtered = useMemo(() => {
    return packages.filter((p) => {
      if (statusFilter === "published" && !p.published) return false;
      if (statusFilter === "draft" && p.published) return false;
      if (statusFilter === "discounted" && (!p.original_price || Number(p.original_price) <= Number(p.price)))
        return false;
      if (statusFilter === "choice" && p.selection_mode !== "student_choice") return false;

      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        p.badge_text?.toLowerCase().includes(q)
      );
    });
  }, [packages, query, statusFilter]);

  async function handleCreate() {
    if (!nName.trim() || !nPrice) {
      toast.error("Name and price are required");
      return;
    }
    const price = Number(nPrice);
    if (Number.isNaN(price) || price < 0) {
      toast.error("Invalid price");
      return;
    }
    const origPrice = nOriginalPrice ? Number(nOriginalPrice) : null;
    if (origPrice !== null && (Number.isNaN(origPrice) || origPrice < 0)) {
      toast.error("Invalid original price");
      return;
    }

    const badge = nCustomBadge.trim() || nBadge;

    try {
      const created = await upsert({
        data: {
          name: nName,
          description: nDesc || null,
          price,
          original_price: origPrice,
          badge_text: badge || null,
          image_url: nImageUrl.trim() || null,
          notes: nNotes.trim() || null,
          package_type: nType,
          group_size: nType === "group" ? nGroupSize : 1,
          package_kind: nKind,
          selection_mode: nSelectionMode,
          choice_count: nSelectionMode === "student_choice" ? nChoiceCount : 3,
          published: false,
        },
      });

      // Auto-sync paddle price if price > 0
      if (created?.id && price > 0) {
        try {
          await syncPaddle({
            data: {
              packageId: created.id,
              name: nName,
              price,
              currency: "USD",
            },
          });
          toast.success("Package created and synced with Paddle!");
        } catch (pErr) {
          toast.success("Package created (Paddle sync ready)");
        }
      } else {
        toast.success("Package created successfully");
      }

      // Reset form
      setNName("");
      setNDesc("");
      setNPrice("");
      setNOriginalPrice("");
      setNBadge("");
      setNCustomBadge("");
      setNImageUrl("");
      setNNotes("");
      setNType("individual");
      setNGroupSize(3);
      setNKind("courses");
      setNSelectionMode("fixed");
      setNChoiceCount(3);
      setShowNew(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create package");
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
          original_price: p.original_price,
          badge_text: p.badge_text,
          image_url: p.image_url,
          notes: p.notes,
          currency: p.currency,
          package_type: p.package_type,
          group_size: p.group_size,
          package_kind: p.package_kind,
          selection_mode: p.selection_mode,
          choice_count: p.choice_count,
          published: !p.published,
          sort_order: p.sort_order,
          paddle_price_id: p.paddle_price_id,
        },
      });
      toast.success(p.published ? "Unpublished (Draft)" : "Published successfully!");
      refresh();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this package? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await del({ data: { id } });
      toast.success("Package deleted");
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
        <div className="pt-32 text-center text-white/50">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 md:px-10 pt-28 pb-24">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30 text-xs font-bold uppercase tracking-widest mb-2">
              <PackageIcon className="w-3.5 h-3.5" /> Packages Center · مركز الباقات
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold">Manage Packages & Bundles</h1>
            <p className="text-sm text-white/60 mt-1 max-w-2xl">
              Create course bundles or lecture packs (fixed or student-choice), add cover images, set discounts with original prices, configure promotional badges (Hot Offer, Limited Time), and connect directly to Paddle.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/packages"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View Public Section
            </Link>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold tracking-wide px-4 py-2.5 text-sm shadow-lg shadow-amber-400/20 transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4" /> {showNew ? "Close Form" : "New Package"}
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
            <div className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Total Packages</div>
            <div className="text-2xl font-bold font-serif mt-1 text-white">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Published Live</div>
            <div className="text-2xl font-bold font-serif mt-1 text-emerald-400">{stats.published}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
            <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Active Discounts</div>
            <div className="text-2xl font-bold font-serif mt-1 text-rose-400">{stats.discounted}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
            <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">Paddle Ready</div>
            <div className="text-2xl font-bold font-serif mt-1 text-sky-400">{stats.paddleReady}</div>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {/* CREATE PACKAGE MODAL / SUITE */}
        {showNew && (
          <div className="mb-8 rounded-3xl border border-amber-400/30 bg-zinc-900/90 p-6 md:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
              <h2 className="text-xl font-bold flex items-center gap-2 text-amber-400">
                <Sparkles className="w-5 h-5" /> Create New Package
              </h2>
              <button
                onClick={() => setShowNew(false)}
                className="text-white/40 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <Field label="Package Name (Shown to students) *" className="lg:col-span-2">
                <input
                  value={nName}
                  onChange={(e) => setNName(e.target.value)}
                  placeholder="e.g. Year 3 Medical Mastery Bundle or 3-Courses Choice Pass"
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm outline-none focus:border-amber-400"
                />
              </Field>

              <Field label="Package Items Type">
                <select
                  value={nKind}
                  onChange={(e) => setNKind(e.target.value as PackageKind)}
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm outline-none focus:border-amber-400"
                >
                  <option value="courses">Question Bank Courses (دورات بنك الأسئلة)</option>
                  <option value="lectures">Lecture Courses (دورات المحاضرات المسجلة)</option>
                  <option value="mixed">Mixed (Courses & Lectures)</option>
                </select>
              </Field>

              {/* Pricing & Discounts */}
              <Field label="Sale Price (USD) *">
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-white/40 text-sm">$</span>
                  <input
                    value={nPrice}
                    onChange={(e) => setNPrice(e.target.value)}
                    placeholder="49"
                    inputMode="decimal"
                    className="w-full rounded-xl bg-black/60 border border-white/15 pl-8 pr-3.5 py-2.5 text-sm outline-none focus:border-amber-400 font-serif"
                  />
                </div>
              </Field>

              <Field label="Original Price (Strikethrough / Discount)">
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-white/40 text-sm">$</span>
                  <input
                    value={nOriginalPrice}
                    onChange={(e) => setNOriginalPrice(e.target.value)}
                    placeholder="89 (Optional for discount tag)"
                    inputMode="decimal"
                    className="w-full rounded-xl bg-black/60 border border-white/15 pl-8 pr-3.5 py-2.5 text-sm outline-none focus:border-amber-400 font-serif"
                  />
                </div>
                {nOriginalPrice && Number(nOriginalPrice) > Number(nPrice) && Number(nPrice) > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400 font-bold">
                    <Percent className="w-3.5 h-3.5" />
                    Save {Math.round(((Number(nOriginalPrice) - Number(nPrice)) / Number(nOriginalPrice)) * 100)}% (${Number(nOriginalPrice) - Number(nPrice)} OFF)
                  </div>
                )}
              </Field>

              {/* Promotional Badge */}
              <Field label="Promotional Phrase / Badge">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {BADGE_PRESETS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => {
                        setNBadge(b.value);
                        setNCustomBadge("");
                      }}
                      className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                        nBadge === b.value && !nCustomBadge
                          ? "bg-amber-400 text-black border-amber-400 font-bold"
                          : "border-white/15 text-white/70 hover:bg-white/5"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <input
                  value={nCustomBadge}
                  onChange={(e) => {
                    setNCustomBadge(e.target.value);
                    setNBadge("");
                  }}
                  placeholder="Or write custom phrase e.g. Special Ramadan Deal"
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs outline-none focus:border-amber-400"
                />
              </Field>

              {/* Selection Mode: Fixed vs Student Choice */}
              <Field label="Selection Strategy">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNSelectionMode("fixed")}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                      nSelectionMode === "fixed"
                        ? "bg-amber-400 text-black border-amber-400"
                        : "border-white/15 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <div>Fixed Bundle</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">Admin pre-selects courses</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNSelectionMode("student_choice")}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                      nSelectionMode === "student_choice"
                        ? "bg-amber-400 text-black border-amber-400"
                        : "border-white/15 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <div>Student Choice</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">Student picks N courses</div>
                  </button>
                </div>
              </Field>

              {nSelectionMode === "student_choice" && (
                <Field label="Student Choice Count">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={nChoiceCount}
                    onChange={(e) => setNChoiceCount(Math.max(1, Number(e.target.value) || 1))}
                    placeholder="3"
                    className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                  <div className="text-[10px] text-white/40 mt-1">
                    Student will be prompted to pick this many items before checkout.
                  </div>
                </Field>
              )}

              {/* Buyer Type: Individual vs Group */}
              <Field label="Buyer Format">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNType("individual")}
                    className={`p-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
                      nType === "individual"
                        ? "bg-amber-400 text-black border-amber-400"
                        : "border-white/15 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <User className="w-3.5 h-3.5" /> Individual (1 Seat)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNType("group")}
                    className={`p-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
                      nType === "group"
                        ? "bg-amber-400 text-black border-amber-400"
                        : "border-white/15 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" /> Group Seats
                  </button>
                </div>
              </Field>

              {nType === "group" && (
                <Field label="Group Seats Count">
                  <input
                    type="number"
                    min={2}
                    value={nGroupSize}
                    onChange={(e) => setNGroupSize(Math.max(2, Number(e.target.value) || 2))}
                    className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                </Field>
              )}

              {/* Image URL */}
              <Field label="Package Picture / Cover URL" className="lg:col-span-2">
                <div className="flex gap-3">
                  <input
                    value={nImageUrl}
                    onChange={(e) => setNImageUrl(e.target.value)}
                    placeholder="https://... or /assets/... (shown on package card)"
                    className="flex-1 rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm outline-none focus:border-amber-400"
                  />
                  {nImageUrl && (
                    <img
                      src={nImageUrl}
                      alt="preview"
                      className="w-11 h-11 rounded-lg object-cover border border-white/20 shrink-0"
                      onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                    />
                  )}
                </div>
              </Field>

              {/* Description */}
              <Field label="Description (Catchy overview)" className="lg:col-span-3">
                <textarea
                  value={nDesc}
                  onChange={(e) => setNDesc(e.target.value)}
                  rows={2}
                  placeholder="Describe what value students get from this package..."
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2 text-sm outline-none focus:border-amber-400"
                />
              </Field>

              {/* Notes */}
              <Field label="Special Notes & Terms (Shown on package)" className="lg:col-span-3">
                <textarea
                  value={nNotes}
                  onChange={(e) => setNNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Valid for full 2026/2027 academic year · Includes all updates & questions"
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2 text-sm outline-none focus:border-amber-400"
                />
              </Field>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-6 py-2.5 text-sm shadow-lg shadow-amber-400/20 transition-all"
              >
                <Save className="w-4 h-4" /> Create Draft Package
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "all", label: "All" },
              { id: "published", label: "Published" },
              { id: "draft", label: "Drafts" },
              { id: "discounted", label: "Discounts & Offers 🔥" },
              { id: "choice", label: "Student Choice" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? "bg-white text-black font-bold shadow"
                    : "bg-zinc-900 border border-white/10 text-white/60 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-xl border border-white/15 bg-zinc-900 px-3 py-2 gap-2 w-full sm:w-72">
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search packages..."
              className="w-full bg-transparent text-xs outline-none placeholder-white/30"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-white/40 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Packages List */}
        {loading ? (
          <div className="text-center py-20 text-white/40 text-sm">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2 text-amber-400" /> Loading packages...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-12 text-center">
            <PackageIcon className="w-12 h-12 mx-auto text-white/20 mb-3" />
            <h3 className="text-base font-bold text-white/80">No packages found</h3>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
              {packages.length === 0
                ? "No packages have been created yet. Click 'New Package' to build your first bundle."
                : "No packages match the current filter or search criteria."}
            </p>
            {packages.length === 0 && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-400 text-black font-bold text-xs px-4 py-2"
              >
                <Plus className="w-3.5 h-3.5" /> Create first package
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const expanded = expandedId === p.id;
              const hasDiscount =
                p.original_price && Number(p.original_price) > Number(p.price);
              const discountPct = hasDiscount
                ? Math.round(((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100)
                : 0;
              const totalQ = p.courses.reduce(
                (a, c) => a + c.questions_count_mid + c.questions_count_final,
                0,
              );

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border transition-all ${
                    expanded
                      ? "border-amber-400/40 bg-zinc-900/90 shadow-xl"
                      : "border-white/10 bg-zinc-900/50 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-3.5 p-4 flex-wrap sm:flex-nowrap">
                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                      className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/60 shrink-0"
                    >
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/60 border border-white/10 shrink-0 flex items-center justify-center relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <PackageIcon className="w-5 h-5 text-amber-400/80" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white truncate">{p.name}</span>
                        {p.badge_text && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <Flame className="w-2.5 h-2.5" /> {p.badge_text}
                          </span>
                        )}
                        {!p.published && (
                          <span className="text-[10px] uppercase tracking-widest font-bold text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                            Draft
                          </span>
                        )}
                        {p.selection_mode === "student_choice" && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded border border-sky-400/20">
                            Pick Any {p.choice_count || 3}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-white/50 mt-1 flex-wrap">
                        <span>{p.package_type === "group" ? `Group (${p.group_size} seats)` : "Individual"}</span>
                        <span>•</span>
                        <span>{p.package_kind || "courses"}</span>
                        <span>•</span>
                        <span>{p.courses.length} items configured</span>
                        {totalQ > 0 && (
                          <>
                            <span>•</span>
                            <span>{totalQ.toLocaleString()} questions</span>
                          </>
                        )}
                        <span>•</span>
                        {p.paddle_price_id ? (
                          <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Paddle Synced
                          </span>
                        ) : (
                          <span className="text-amber-400 text-[10px] flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No Paddle Price
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price & Discounts */}
                    <div className="text-right shrink-0">
                      <div className="flex items-baseline gap-1.5 justify-end">
                        <span className="font-serif text-xl font-bold text-white tabular-nums">
                          ${Number(p.price).toFixed(0)}
                        </span>
                        {hasDiscount && (
                          <span className="text-xs text-white/40 line-through tabular-nums font-serif">
                            ${Number(p.original_price).toFixed(0)}
                          </span>
                        )}
                      </div>
                      {hasDiscount && (
                        <div className="text-[10px] text-rose-400 font-bold">
                          Save {discountPct}%
                        </div>
                      )}
                    </div>

                    {/* Publish toggle */}
                    <button
                      disabled={busyId === p.id}
                      onClick={() => togglePublish(p)}
                      title={p.published ? "Unpublish (Make Draft)" : "Publish (Make Public)"}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                        p.published
                          ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40"
                          : "bg-white/5 text-white/40 hover:bg-white/10 border border-white/10"
                      }`}
                    >
                      {p.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={busyId === p.id}
                      title="Delete package"
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-300 hover:bg-rose-500/15 border border-rose-500/20 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expanded Editor */}
                  {expanded && (
                    <PackageEditor
                      pkg={p}
                      allCourses={allCourses}
                      onSavedMeta={refresh}
                      onSavedCourses={refresh}
                      upsert={upsert}
                      setCourses={setCourses}
                      syncPaddle={syncPaddle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
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
  syncPaddle,
}: {
  pkg: PackageWithCourses;
  allCourses: CourseLite[];
  onSavedMeta: () => void;
  onSavedCourses: () => void;
  upsert: ReturnType<typeof useServerFn<typeof adminUpsertPackage>>;
  setCourses: ReturnType<typeof useServerFn<typeof adminSetPackageCourses>>;
  syncPaddle: ReturnType<typeof useServerFn<typeof syncPaddlePackagePrice>>;
}) {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? "");
  const [price, setPrice] = useState(String(pkg.price));
  const [originalPrice, setOriginalPrice] = useState(pkg.original_price ? String(pkg.original_price) : "");
  const [badgeText, setBadgeText] = useState(pkg.badge_text ?? "");
  const [imageUrl, setImageUrl] = useState(pkg.image_url ?? "");
  const [notes, setNotes] = useState(pkg.notes ?? "");
  const [type, setType] = useState<PackageType>(pkg.package_type);
  const [groupSize, setGroupSize] = useState(pkg.group_size);
  const [kind, setKind] = useState<PackageKind>(pkg.package_kind ?? "courses");
  const [selectionMode, setSelectionMode] = useState<PackageSelectionMode>(pkg.selection_mode ?? "fixed");
  const [choiceCount, setChoiceCount] = useState(pkg.choice_count || 3);
  const [paddlePriceId, setPaddlePriceId] = useState(pkg.paddle_price_id ?? "");

  const [picked, setPicked] = useState<Array<{ courseId: string; note: string | null }>>(
    pkg.courses.map((c) => ({ courseId: c.id, note: c.note })),
  );

  const [saving, setSaving] = useState(false);
  const [syncingPaddle, setSyncingPaddle] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");

  const pickedIds = new Set(picked.map((p) => p.courseId));
  const available = allCourses
    .filter((c) => !pickedIds.has(c.id))
    .filter((c) => {
      if (!courseSearch.trim()) return true;
      const q = courseSearch.toLowerCase();
      return c.title.toLowerCase().includes(q) || String(c.year).includes(q);
    });

  const hasDiscount = originalPrice && Number(originalPrice) > Number(price);
  const discountPct = hasDiscount
    ? Math.round(((Number(originalPrice) - Number(price)) / Number(originalPrice)) * 100)
    : 0;

  async function handleSyncPaddle() {
    setSyncingPaddle(true);
    try {
      const res = await syncPaddle({
        data: {
          packageId: pkg.id,
          name,
          price: Number(price),
          currency: pkg.currency || "USD",
        },
      });
      if (res?.paddlePriceId) {
        setPaddlePriceId(res.paddlePriceId);
        toast.success("Successfully created and linked Paddle Price ID: " + res.paddlePriceId);
        onSavedMeta();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Paddle sync failed");
    } finally {
      setSyncingPaddle(false);
    }
  }

  async function saveMeta() {
    setSaving(true);
    try {
      await upsert({
        data: {
          id: pkg.id,
          name,
          description: description || null,
          price: Number(price) || 0,
          original_price: originalPrice ? Number(originalPrice) : null,
          badge_text: badgeText.trim() || null,
          image_url: imageUrl.trim() || null,
          notes: notes.trim() || null,
          currency: pkg.currency,
          package_type: type,
          group_size: type === "group" ? groupSize : 1,
          package_kind: kind,
          selection_mode: selectionMode,
          choice_count: selectionMode === "student_choice" ? choiceCount : 3,
          published: pkg.published,
          sort_order: pkg.sort_order,
          paddle_price_id: paddlePriceId.trim() || null,
        },
      });
      toast.success("Package details saved");
      onSavedMeta();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
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
      toast.success("Package courses saved");
      onSavedCourses();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save courses");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-black/60 p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-white/10">
      {/* LEFT COLUMN: DETAILS, IMAGES, BADGES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs uppercase tracking-widest font-bold text-amber-400">
            Package Presentation & Details
          </h4>
        </div>

        <Field label="Package Title">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
        </Field>

        <Field label="Picture / Cover Image URL">
          <div className="flex gap-2">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... or /assets/..."
              className="flex-1 rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            {imageUrl && (
              <img
                src={imageUrl}
                alt="preview"
                className="w-10 h-10 rounded-lg object-cover border border-white/20 shrink-0"
                onError={(e) => ((e.target as HTMLElement).style.display = "none")}
              />
            )}
          </div>
        </Field>

        <Field label="Promotional Badge Phrase (Hot Offer, Limited Time...)">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {BADGE_PRESETS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setBadgeText(b.value)}
                className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                  badgeText === b.value
                    ? "bg-amber-400 text-black border-amber-400 font-bold"
                    : "border-white/15 text-white/70 hover:bg-white/5"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <input
            value={badgeText}
            onChange={(e) => setBadgeText(e.target.value)}
            placeholder="e.g. Hot Offer 🔥 or Limited Time ⏳"
            className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs outline-none focus:border-amber-400"
          />
        </Field>

        <Field label="Notes & Highlights (Terms, guarantee, included content)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Special notes displayed to buyer on the package card..."
            className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
        </Field>

        {/* PRICING & DISCOUNTS */}
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-900/60 space-y-3">
          <div className="text-xs uppercase tracking-widest font-bold text-amber-400">Pricing & Discount Engine</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sale Price (USD)">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm font-serif"
              />
            </Field>
            <Field label="Original Price (Strikethrough)">
              <input
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Optional"
                inputMode="decimal"
                className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm font-serif"
              />
            </Field>
          </div>
          {hasDiscount && (
            <div className="text-xs text-rose-400 font-bold flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5" /> Shows active discount: {discountPct}% OFF (${Number(originalPrice) - Number(price)} savings)
            </div>
          )}
        </div>

        {/* PADDLE PAYMENT INTEGRATION */}
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest font-bold text-sky-400">Paddle Integration</div>
            {paddlePriceId ? (
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                Connected ✓
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                Not Connected
              </span>
            )}
          </div>
          <Field label="Paddle Price ID">
            <div className="flex gap-2">
              <input
                value={paddlePriceId}
                onChange={(e) => setPaddlePriceId(e.target.value)}
                placeholder="e.g. pri_01j..."
                className="flex-1 rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs font-mono"
              />
              <button
                type="button"
                disabled={syncingPaddle || Number(price) <= 0}
                onClick={handleSyncPaddle}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold px-3 py-2 text-xs disabled:opacity-50 shrink-0"
              >
                {syncingPaddle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync Paddle
              </button>
            </div>
          </Field>
        </div>

        <button
          disabled={saving}
          onClick={saveMeta}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-5 py-2.5 text-xs shadow-md transition-all disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save Details & Pricing
        </button>
      </div>

      {/* RIGHT COLUMN: COURSES & SELECTION STRATEGY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs uppercase tracking-widest font-bold text-amber-400">
            Bundled Courses & Strategy
          </h4>
          <span className="text-[11px] text-white/50">{picked.length} item(s) in bundle</span>
        </div>

        {/* Mode switcher */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSelectionMode("fixed")}
            className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-colors ${
              selectionMode === "fixed"
                ? "bg-amber-400 text-black border-amber-400"
                : "border-white/15 text-white/70 hover:bg-white/5"
            }`}
          >
            <div>Fixed Bundle</div>
            <div className="text-[10px] font-normal opacity-80">All items granted upon purchase</div>
          </button>
          <button
            type="button"
            onClick={() => setSelectionMode("student_choice")}
            className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-colors ${
              selectionMode === "student_choice"
                ? "bg-amber-400 text-black border-amber-400"
                : "border-white/15 text-white/70 hover:bg-white/5"
            }`}
          >
            <div>Student Choice</div>
            <div className="text-[10px] font-normal opacity-80">Student selects items at checkout</div>
          </button>
        </div>

        {selectionMode === "student_choice" && (
          <div className="p-3 rounded-xl border border-sky-400/30 bg-sky-500/10 text-xs text-sky-200 flex items-center justify-between gap-3">
            <div>
              <span className="font-bold">Student Choice Mode:</span> Student will pick from eligible items.
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider font-bold">Pick Count:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={choiceCount}
                onChange={(e) => setChoiceCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded-lg bg-black/60 border border-sky-400/40 px-2 py-1 text-center font-bold text-white text-xs"
              />
            </div>
          </div>
        )}

        {/* Configured Courses List */}
        <div className="rounded-xl border border-white/10 bg-black/40 max-h-80 overflow-y-auto divide-y divide-white/5">
          {picked.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-white/40">
              No courses configured yet. Pick courses from below to add them to this package.
            </div>
          ) : (
            picked.map((p, idx) => {
              const c = allCourses.find((x) => x.id === p.courseId);
              if (!c) return null;
              const isLectures = c.kind === "lectures";
              return (
                <div key={p.courseId} className="flex items-start gap-3 p-3 hover:bg-white/[0.02]">
                  <div className="grid place-items-center w-6 h-6 rounded-md bg-amber-400/15 text-amber-400 shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white truncate">{c.title}</span>
                      <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                        Year {c.year}
                      </span>
                      {isLectures && (
                        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                          Lectures
                        </span>
                      )}
                    </div>
                    <input
                      value={p.note ?? ""}
                      onChange={(e) =>
                        setPicked((cur) =>
                          cur.map((x, i) => (i === idx ? { ...x, note: e.target.value || null } : x)),
                        )
                      }
                      placeholder="Optional note for this item (e.g. Includes midterm + final)"
                      className="mt-1.5 w-full bg-transparent border-b border-white/10 focus:border-amber-400 text-xs py-0.5 outline-none text-white/80 placeholder-white/25"
                    />
                  </div>
                  <button
                    onClick={() => setPicked((cur) => cur.filter((x) => x.courseId !== p.courseId))}
                    className="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add more courses */}
        {available.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
              Add Course or Lecture Course to Bundle
            </div>
            <div className="flex gap-2">
              <input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search available courses..."
                className="flex-1 rounded-xl bg-black/60 border border-white/15 px-3 py-1.5 text-xs outline-none focus:border-amber-400"
              />
            </div>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setPicked([...picked, { courseId: e.target.value, note: null }]);
              }}
              className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs outline-none focus:border-amber-400"
            >
              <option value="">Select course to add...</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  Year {c.year} · {c.title} {c.kind === "lectures" ? "(Lectures Course)" : "(Question Bank)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          disabled={saving}
          onClick={saveCourses}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-5 py-2.5 text-xs shadow-md transition-all disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save Bundled Courses
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
      <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}
