import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Eye, EyeOff, Loader2, Star, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BUILT_IN_TILE_LABEL,
  LOCK_COLOR_NAMES,
  TILE_DEFAULTS,
  TILE_ICON_NAMES,
  lockChip,
  tileIcon,
  type UniversityTile,
} from "@/lib/university-tiles";


export const Route = createFileRoute("/admin/uni-tiles/$uniId")({
  head: () => ({
    meta: [
      { title: "University cards — Admin" },
      {
        name: "description",
        content: "Rename, reorder, hide or add the cards shown on a university page.",
      },
    ],
  }),
  component: AdminUniTiles,
});

function AdminUniTiles() {
  const { uniId } = Route.useParams();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [uni, setUni] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [tiles, setTiles] = useState<UniversityTile[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  async function reload() {
    const [{ data: u }, { data: rows }] = await Promise.all([
      supabase.from("universities").select("id,name,slug").eq("id", uniId).maybeSingle(),
      (supabase.from as any)("university_tiles")
        .select("*")
        .eq("university_id", uniId)
        .order("sort_order", { ascending: true }),
    ]);
    setUni((u as any) ?? null);
    setTiles((rows ?? []) as UniversityTile[]);
    setReady(true);
  }

  useEffect(() => {
    void reload();
  }, [uniId]);

  async function seedBuiltIns() {
    setBusy(true);
    try {
      const existing = new Set(tiles.map((t) => t.kind));
      const rows = (["courses", "lectures", "resources"] as const)
        .filter((k) => !existing.has(k))
        .map((kind, i) => ({
          university_id: uniId,
          kind,
          ...TILE_DEFAULTS[kind],
          visible: true,
          sort_order: tiles.length + i,
        }));
      if (!rows.length) return toast.info("All built-in cards already exist");
      const { error } = await (supabase.from as any)("university_tiles").insert(rows);
      if (error) throw error;
      await reload();
      toast.success("Built-in cards added");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the built-in cards");
    } finally {
      setBusy(false);
    }
  }

  async function addCustom() {
    const { error } = await (supabase.from as any)("university_tiles").insert({
      university_id: uniId,
      kind: "custom",
      title_en: "New card",
      title_ar: "بطاقة جديدة",
      subtitle_en: "Describe what is inside",
      subtitle_ar: "اكتب وصفاً قصيراً",
      icon: "Sparkles",
      href: "/",
      visible: true,
      highlighted: false,
      sort_order: tiles.length,
    });
    if (error) return toast.error(error.message);
    await reload();
  }

  async function patch(id: string, changes: Partial<UniversityTile>) {
    setTiles((list) => list.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    const { error } = await (supabase.from as any)("university_tiles").update(changes).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function remove(tile: UniversityTile) {
    if (tile.kind !== "custom") return;
    if (!confirm(`Delete "${tile.title_en}"?`)) return;
    const { error } = await (supabase.from as any)("university_tiles").delete().eq("id", tile.id);
    if (error) return toast.error(error.message);
    setTiles((list) => list.filter((t) => t.id !== tile.id));
  }

  async function move(tile: UniversityTile, dir: -1 | 1) {
    const ids = [...tiles].sort((a, b) => a.sort_order - b.sort_order).map((t) => t.id);
    const from = ids.indexOf(tile.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    await Promise.all(
      ids.map((id, i) => (supabase.from as any)("university_tiles").update({ sort_order: i }).eq("id", id)),
    );
    await reload();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-24">
        <Link
          to="/admin/universities"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={14} /> Universities
        </Link>

        <h1 className="mt-4 text-3xl font-black tracking-tight">
          Cards on {uni?.name ?? "this university"} page
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rename the cards, edit the text under them, hide them from users, reorder them, or add
          your own. Arabic is optional — blank Arabic falls back to English.
        </p>

        {uni && (
          <Link
            to="/u/$uniSlug"
            params={{ uniSlug: uni.slug }}
            className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
          >
            View the page →
          </Link>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={addCustom}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground"
          >
            <Plus size={14} /> Add card
          </button>
          <button
            onClick={seedBuiltIns}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Restore built-in cards
          </button>
        </div>

        {!ready ? (
          <div className="mt-8 h-40 rounded-2xl border border-border bg-card animate-pulse" />
        ) : tiles.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No cards yet. Use “Restore built-in cards” to start from Courses, Lectures and Resources.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {tiles.map((tile, i) => (
              <TileEditor
                key={tile.id}
                tile={tile}
                first={i === 0}
                last={i === tiles.length - 1}
                onPatch={patch}
                onMove={move}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TileEditor({
  tile,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  tile: UniversityTile;
  first: boolean;
  last: boolean;
  onPatch: (id: string, changes: Partial<UniversityTile>) => void;
  onMove: (tile: UniversityTile, dir: -1 | 1) => void;
  onRemove: (tile: UniversityTile) => void;
}) {
  const Icon = tileIcon(tile.icon);
  const inputClass =
    "mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";
  const labelClass = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-primary">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{tile.title_en || "Untitled card"}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {BUILT_IN_TILE_LABEL[tile.kind]}
          </div>
        </div>

        <button
          onClick={() => onPatch(tile.id, { visible: !tile.visible })}
          title={tile.visible ? "Visible to users" : "Hidden from users"}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
            tile.visible
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {tile.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          {tile.visible ? "Visible" : "Hidden"}
        </button>

        <button
          onClick={() => onPatch(tile.id, { highlighted: !tile.highlighted })}
          title="Gold highlighted style"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
            tile.highlighted
              ? "border-amber-400 bg-amber-100 text-amber-800"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          <Star size={13} /> Gold
        </button>

        <button
          onClick={() => onMove(tile, -1)}
          disabled={first}
          className="rounded-lg border border-border p-1.5 text-muted-foreground disabled:opacity-30"
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={() => onMove(tile, 1)}
          disabled={last}
          className="rounded-lg border border-border p-1.5 text-muted-foreground disabled:opacity-30"
        >
          <ArrowDown size={14} />
        </button>
        {tile.kind === "custom" && (
          <button
            onClick={() => onRemove(tile)}
            className="rounded-lg border border-destructive/40 p-1.5 text-destructive"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Title (English)</span>
          <input
            className={inputClass}
            defaultValue={tile.title_en}
            onBlur={(e) => e.target.value !== tile.title_en && onPatch(tile.id, { title_en: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Title (Arabic)</span>
          <input
            dir="rtl"
            className={inputClass}
            defaultValue={tile.title_ar}
            onBlur={(e) => e.target.value !== tile.title_ar && onPatch(tile.id, { title_ar: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Description (English)</span>
          <input
            className={inputClass}
            defaultValue={tile.subtitle_en}
            onBlur={(e) =>
              e.target.value !== tile.subtitle_en && onPatch(tile.id, { subtitle_en: e.target.value })
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>Description (Arabic)</span>
          <input
            dir="rtl"
            className={inputClass}
            defaultValue={tile.subtitle_ar}
            onBlur={(e) =>
              e.target.value !== tile.subtitle_ar && onPatch(tile.id, { subtitle_ar: e.target.value })
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>
            Badge (English) — leave blank to show the automatic count
          </span>
          <input
            className={inputClass}
            placeholder={tile.kind === "custom" ? "e.g. FREE" : "auto count"}
            defaultValue={tile.badge_en}
            onBlur={(e) => e.target.value !== tile.badge_en && onPatch(tile.id, { badge_en: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Badge (Arabic)</span>
          <input
            dir="rtl"
            className={inputClass}
            defaultValue={tile.badge_ar}
            onBlur={(e) => e.target.value !== tile.badge_ar && onPatch(tile.id, { badge_ar: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Icon</span>
          <select
            className={inputClass}
            value={tile.icon}
            onChange={(e) => onPatch(tile.id, { icon: e.target.value })}
          >
            {TILE_ICON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Link</span>
          <input
            className={inputClass}
            placeholder="/courses or https://…"
            defaultValue={tile.href}
            onBlur={(e) => e.target.value !== tile.href && onPatch(tile.id, { href: e.target.value })}
          />
        </label>
      </div>

      {/* Locked / coming soon */}
      <div className="mt-4 rounded-xl border border-border p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={!!tile.locked}
            onChange={(e) => onPatch(tile.id, { locked: e.target.checked })}
          />
          <Lock size={14} /> Locked (visible to everyone, but can&apos;t be opened)
        </label>

        {tile.locked && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Badge text (English)</span>
              <input
                className={inputClass}
                placeholder="Coming soon"
                defaultValue={tile.lock_note_en ?? ""}
                onBlur={(e) =>
                  e.target.value !== (tile.lock_note_en ?? "") &&
                  onPatch(tile.id, { lock_note_en: e.target.value })
                }
              />
            </label>
            <label className="block">
              <span className={labelClass}>Badge text (Arabic)</span>
              <input
                dir="rtl"
                className={inputClass}
                placeholder="قريبًا"
                defaultValue={tile.lock_note_ar ?? ""}
                onBlur={(e) =>
                  e.target.value !== (tile.lock_note_ar ?? "") &&
                  onPatch(tile.id, { lock_note_ar: e.target.value })
                }
              />
            </label>
            <div className="sm:col-span-2">
              <span className={labelClass}>Badge colour</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {LOCK_COLOR_NAMES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onPatch(tile.id, { lock_color: c })}
                    className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-wider ${lockChip(c)} ${
                      (tile.lock_color ?? "amber") === c ? "ring-2 ring-offset-1 ring-primary" : "opacity-70"
                    }`}
                  >
                    <Lock size={10} /> {(tile.lock_note_en ?? "").trim() || "Coming soon"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Gold cards always use a white badge for contrast.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
