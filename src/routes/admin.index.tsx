import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { AdminHubEditor } from "@/components/admin/AdminHubEditor";
import { saveAdminHubLayout } from "@/lib/admin-hub.functions";
import { ICONS, mergeLayout, type HubLayout, type HubTile } from "@/lib/admin-hub-defaults";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Administration Site — AquaQBank" },
      { name: "description", content: "Central admin hub: content, navigation, pages, users, courses, theme and more." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Administration Site — AquaQBank" },
      { property: "og:description", content: "Central admin hub for managing the whole site." },
    ],
  }),
  component: AdminHome,
});



function AdminHome() {
  const { isAdmin, isCommitteeHead, loading } = useAuth();
  const canAccess = isAdmin || isCommitteeHead;
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "").startsWith("ar");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [override, setOverride] = useState<HubLayout | null>(null);

  useEffect(() => {
    if (!loading && !canAccess) guardRedirect(navigate);
  }, [loading, canAccess, navigate]);

  const { data: stored } = useQuery({
    queryKey: ["admin-hub-layout"],
    enabled: canAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("admin_hub_layout")
        .select("layout")
        .maybeSingle();
      return (data?.layout ?? null) as unknown;
    },
  });

  const layout = override ?? mergeLayout(stored);
  const favorites = layout.favorites ?? [];

  async function toggleFavorite(tileKey: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const isFav = favorites.includes(tileKey);
    const nextFavs = isFav ? favorites.filter((id) => id !== tileKey) : [...favorites, tileKey];
    const nextLayout: HubLayout = {
      ...layout,
      favorites: nextFavs,
    };
    setOverride(nextLayout);
    try {
      await saveAdminHubLayout({ data: { layout: nextLayout } });
      toast.success(isFav ? "Removed from favourites" : "Added to favourites ⭐");
    } catch (err) {
      console.error(err);
      toast.error("Could not update favourites");
    }
  }

  // Find all favorite tiles from available groups
  const allTiles = layout.groups.flatMap((g) => g.tiles);
  const favoriteTiles = favorites
    .map((favId) => allTiles.find((t) => (t.id === favId || t.to === favId) && !t.hidden))
    .filter((t): t is HubTile => Boolean(t));

  function renderTile(t: HubTile, isFavSection = false) {
    const Icon = ICONS[t.icon] ?? ICONS.Star!;
    const isFav = favorites.includes(t.id) || favorites.includes(t.to);
    const cls =
      "group relative aspect-square rounded-2xl border-2 border-border bg-card p-4 flex flex-col items-center justify-center gap-3 text-center transition-transform hover:-translate-y-1";
    const inner = (
      <>
        {isAdmin && (
          <button
            type="button"
            onClick={(e) => toggleFavorite(t.id || t.to, e)}
            title={isFav ? "Remove from favourites" : "Add to favourites"}
            className={`absolute top-2.5 right-2.5 z-10 p-1.5 rounded-lg transition-all ${
              isFav
                ? "text-amber-500 bg-amber-500/10 opacity-100 hover:scale-115"
                : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:bg-muted hover:scale-115"
            }`}
          >
            <Star size={16} className={isFav ? "fill-amber-400 text-amber-500" : ""} />
          </button>
        )}
        <span
          className="grid place-items-center h-12 w-12 rounded-xl text-primary-foreground"
          style={{ background: "var(--primary)" }}
        >
          <Icon size={22} />
        </span>
        <span className="text-sm font-bold leading-tight text-foreground">
          {isAr && t.labelAr ? t.labelAr : t.label}
        </span>
      </>
    );

    return t.external ? (
      <a
        key={`${isFavSection ? "fav-" : ""}${t.id}`}
        href={t.to}
        target="_blank"
        rel="noreferrer"
        className={cls}
        style={{ boxShadow: "0 4px 0 var(--border)" }}
      >
        {inner}
      </a>
    ) : (
      <Link
        key={`${isFavSection ? "fav-" : ""}${t.id}`}
        to={t.to as any}
        className={cls}
        style={{ boxShadow: "0 4px 0 var(--border)" }}
      >
        {inner}
      </Link>
    );
  }

  async function handleSave(next: HubLayout) {
    setSaving(true);
    try {
      await saveAdminHubLayout({ data: { layout: next } });
      setOverride(next);
      setEditing(false);
    } catch (err) {
      console.error(err);
      alert("Could not save the layout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">Administration Site</h1>
            <p className="mt-2 text-muted-foreground">
              {isCommitteeHead && !isAdmin
                ? "Committee management tools for the head of لجنة الطب والجراحة."
                : "Everything you can manage, in one place."}
            </p>
          </div>
          {isAdmin && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted"
            >
              <Pencil size={15} /> Edit layout
            </button>
          )}
        </div>

        {editing ? (
          <AdminHubEditor
            initial={layout}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {favoriteTiles.length > 0 && (
              <section className="mt-8 rounded-2xl border-2 border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Star size={16} className="fill-amber-400 text-amber-500" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-foreground">
                    {isAr ? "الأدوات المفضلة" : "Favourite Tools"}
                  </h2>
                  <span className="text-xs font-bold text-muted-foreground">({favoriteTiles.length})</span>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {favoriteTiles.map((t) => renderTile(t, true))}
                </div>
              </section>
            )}

            {layout.groups.map((group) => {
              // Committee heads see only the committee/event tiles in the Content group.
              const tiles = group.tiles.filter((t) => {
                if (t.hidden) return false;
                if (isAdmin) return true;
                const allowed = new Set([
                  "/admin/committee-log",
                  "/committee/manage-team",
                ]);
                return allowed.has(t.to);
              });
              if (tiles.length === 0) return null;
              return (
                <section key={group.id} className="mt-10">
                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {isAr && group.labelAr ? group.labelAr : group.label}
                  </h2>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {tiles.map((t) => renderTile(t, false))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
