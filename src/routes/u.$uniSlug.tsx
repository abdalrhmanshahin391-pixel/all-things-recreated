import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, ArrowLeft, Eye, EyeOff, Sparkles, Pencil, Lock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/components/LanguageProvider";
import {
  TILE_DEFAULTS,
  lockChip,
  pickText,
  tileIcon,
  type TileKind,
  type UniversityTile,
} from "@/lib/university-tiles";


type NextHub = "courses" | "lectures" | "committee";

export const Route = createFileRoute("/u/$uniSlug")({
  validateSearch: (s: Record<string, unknown>): { next?: NextHub } => {
    const n = s.next;
    return n === "courses" || n === "lectures" || n === "committee" ? { next: n } : {};
  },
  loader: async ({ params }) => {
    try {
      const { data } = await supabase
        .from("universities")
        .select("name,description,city,country")
        .eq("slug", params.uniSlug)
        .eq("is_active", true)
        .maybeSingle();
      return {
        name: (data?.name as string | undefined) ?? null,
        description: (data?.description as string | undefined) ?? null,
        city: (data?.city as string | undefined) ?? null,
        country: (data?.country as string | undefined) ?? null,
      };
    } catch {
      return { name: null, description: null, city: null, country: null };
    }
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.name ?? "University";
    const title = `${name} — AquaQBank`;
    const place = [loaderData?.city, loaderData?.country].filter(Boolean).join(", ");
    const description =
      loaderData?.description ||
      `Question banks, video lectures and committee resources for ${name}${place ? ` in ${place}` : ""} on AquaQBank.`;
    const url = `https://aquaqbank.com/u/${params.uniSlug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "EducationalOrganization",
            name,
            description,
            url,
            ...(place ? { address: place } : {}),
          }),
        },
      ],
    };
  },
  component: UniversityHubPage,
});

type University = {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  storage_path: string | null;
  cover_path: string | null;
  lectures_visible: boolean;
};

function UniversityHubPage() {
  const { uniSlug } = Route.useParams();
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { lang } = useLang();

  const { data: uni, isLoading, isError } = useQuery({
    queryKey: ["university", uniSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("universities")
        .select("id,name,slug,short_name,description,city,country,logo_url,storage_path,cover_path,lectures_visible")
        .eq("slug", uniSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as University | null;
    },
  });

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!uni) return;
    setCoverUrl(null);
    (async () => {
      if (uni.cover_path) {
        const { data } = await supabase.storage.from("university-logos").createSignedUrl(uni.cover_path, 3600);
        setCoverUrl(data?.signedUrl ?? null);
      }
      if (uni.storage_path) {
        const { data } = await supabase.storage.from("university-logos").createSignedUrl(uni.storage_path, 3600);
        setLogoUrl(data?.signedUrl ?? uni.logo_url ?? null);
      } else if (uni.logo_url) {
        setLogoUrl(uni.logo_url);
      }
    })();
  }, [uni?.id, uni?.cover_path, uni?.storage_path, uni?.logo_url]);

  useEffect(() => {
    if (uni) localStorage.setItem("ysmu:lastUniversitySlug", uni.slug);
  }, [uni]);

  const { data: counts } = useQuery({
    enabled: !!uni,
    queryKey: ["university-counts", uni?.id],
    queryFn: async () => {
      if (!uni) return { courses: 0, lectures: 0, committee: 0 };
      const [{ count: courses }, { count: lectures }, { count: committee }] = await Promise.all([
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("university_id", uni.id).eq("published", true).eq("kind", "questions"),
        supabase.from("lecture_subjects").select("id", { count: "exact", head: true }).eq("university_id", uni.id),
        supabase.from("committee_years").select("id", { count: "exact", head: true }).eq("university_id", uni.id),
      ]);
      return { courses: courses ?? 0, lectures: lectures ?? 0, committee: committee ?? 0 };
    },
  });

  const { data: tiles } = useQuery({
    enabled: !!uni,
    queryKey: ["university-tiles", uni?.id],
    queryFn: async () => {
      if (!uni) return [] as UniversityTile[];
      const { data, error } = await (supabase.from as any)("university_tiles")
        .select("*")
        .eq("university_id", uni.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UniversityTile[];
    },
    staleTime: 60_000,
  });

  async function toggleLectures() {
    if (!uni || toggling) return;
    setToggling(true);
    const next = !uni.lectures_visible;
    const { error } = await supabase.from("universities").update({ lectures_visible: next }).eq("id", uni.id);
    await (supabase.from as any)("university_tiles")
      .update({ visible: next })
      .eq("university_id", uni.id)
      .eq("kind", "lectures");
    setToggling(false);
    if (error) {
      alert(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["university", uniSlug] });
    qc.invalidateQueries({ queryKey: ["university-tiles", uni.id] });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="pt-32 mx-auto max-w-5xl px-6">
          <div className="h-60 rounded-xl bg-card border border-border animate-pulse" />
        </main>
      </div>
    );
  }

  if (isError || !uni) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="pt-32 mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-2xl font-semibold">University not found</h1>
          <p className="mt-2 text-muted-foreground">It may have been hidden or removed.</p>
          <button onClick={() => navigate({ to: "/universities" })} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ArrowLeft size={14} /> Back to universities
          </button>
        </main>
      </div>
    );
  }

  const location = [uni.city, uni.country].filter(Boolean).join(", ");

  // Fall back to the built-in three cards if this university has no rows yet.
  const fallbackTiles: UniversityTile[] = (["courses", "lectures", "resources"] as const).map(
    (kind, i) => ({
      id: `fallback-${kind}`,
      university_id: uni.id,
      kind,
      badge_en: "",
      badge_ar: "",
      visible: kind === "lectures" ? uni.lectures_visible : true,
      sort_order: i,
      ...TILE_DEFAULTS[kind],
    }),
  );
  const allTiles = (tiles && tiles.length ? tiles : fallbackTiles)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const shownTiles = allTiles.filter((t) => t.visible || isAdmin);
  const gridCols =
    shownTiles.length >= 3 ? "md:grid-cols-3" : shownTiles.length === 2 ? "md:grid-cols-2" : "md:grid-cols-1";

  function countFor(kind: TileKind) {
    if (kind === "courses") return { count: counts?.courses ?? 0, label: `course${(counts?.courses ?? 0) === 1 ? "" : "s"}` };
    if (kind === "lectures") return { count: counts?.lectures ?? 0, label: "subjects" };
    if (kind === "resources") return { count: counts?.committee ?? 0, label: `year${(counts?.committee ?? 0) === 1 ? "" : "s"} available` };
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="pt-20 pb-24">
        {/* Cover banner */}
        <section className="relative overflow-hidden border-b border-border">
          {coverUrl ? (
            <div className="absolute inset-0">
              <img src={coverUrl} alt="" className="h-full w-full object-cover opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/40" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-muted/30" />
          )}
          <div className="relative mx-auto max-w-7xl px-6 md:px-10 py-14 md:py-20">
            <Link to="/universities" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft size={12} /> All universities
            </Link>
            <div className="mt-6 flex items-start gap-5">
              {logoUrl && (
                <div className="h-20 w-20 md:h-24 md:w-24 rounded-xl bg-background border border-border grid place-items-center shadow-sm overflow-hidden shrink-0">
                  <img src={logoUrl} alt={uni.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground">{uni.name}</h1>
                {location && (
                  <p className="mt-2 text-sm text-muted-foreground inline-flex items-center gap-1.5">
                    <MapPin size={13} /> {location}
                  </p>
                )}
                {uni.description && (
                  <p className="mt-4 text-base text-muted-foreground max-w-2xl">{uni.description}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Admin controls */}
        {isAdmin && (
          <div className="mx-auto max-w-7xl px-6 md:px-10 mt-6">
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-primary inline-flex items-center gap-2">
                <Sparkles size={14} /> Admin controls
              </div>
              <button
                onClick={toggleLectures}
                disabled={toggling}
                className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg border-2 transition-all ${
                  uni.lectures_visible
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {uni.lectures_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                Lectures {uni.lectures_visible ? "visible to users" : "hidden from users"}
              </button>
              <Link
                to="/admin/uni-tiles/$uniId"
                params={{ uniId: uni.id }}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg border-2 border-primary/40 bg-primary/10 text-primary"
              >
                <Pencil size={14} /> Edit cards
              </Link>
            </div>
          </div>
        )}

        {/* The pillars */}
        <div className={`mx-auto max-w-7xl px-6 md:px-10 mt-8 grid grid-cols-1 gap-5 ${gridCols}`}>
          {shownTiles.map((tile) => {
            const Icon = tileIcon(tile.icon);
            const auto = countFor(tile.kind);
            const badge = pickText(tile.badge_en, tile.badge_ar, lang).trim();
            const highlighted =
              (tile.kind === "courses" && next === "courses") ||
              (tile.kind === "lectures" && next === "lectures") ||
              (tile.kind === "resources" && next === "committee");
            const lockNote =
              pickText(tile.lock_note_en ?? "", tile.lock_note_ar ?? "", lang).trim() ||
              (lang === "ar" ? "قريبًا" : "Coming soon");
            const shared = {
              to: tile.href || "/",
              search: { u: uni.slug },
              icon: <Icon size={26} strokeWidth={2} />,
              title: pickText(tile.title_en, tile.title_ar, lang),
              subtitle: pickText(tile.subtitle_en, tile.subtitle_ar, lang),
              count: auto?.count ?? 0,
              countLabel: auto?.label ?? "",
              badge: badge || undefined,
              highlighted,
              hiddenFromUsers: isAdmin && !tile.visible,
              showFreeBadge: tile.kind === "resources",
              locked: !!tile.locked,
              lockNote,
              lockColor: tile.lock_color ?? "amber",
              adminBypass: isAdmin,
            };
            return tile.highlighted ? (
              <ResourcesTile key={tile.id} {...shared} />
            ) : (
              <HubTile key={tile.id} {...shared} />
            );
          })}
        </div>
      </main>
    </div>
  );
}

type LockProps = {
  locked?: boolean;
  lockNote?: string;
  lockColor?: string;
  adminBypass?: boolean;
};

/** Big, obvious "coming soon" pill placed over a locked card. */
function LockBadge({ note, color, onDark }: { note: string; color?: string; onDark?: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] shadow-lg ${
        onDark ? "bg-white text-amber-900 border-white" : lockChip(color)
      }`}
    >
      <Lock size={14} strokeWidth={3} /> {note}
    </span>
  );
}

function LockedCorner() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground mt-1">
      <Lock size={16} strokeWidth={2.5} />
    </span>
  );
}

function AdminLockHint() {
  return (
    <span className="absolute bottom-3 left-3 z-20 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
      Locked for users
    </span>
  );
}

function HubTile({
  to, search, icon, title, subtitle, count, countLabel, badge, highlighted, hiddenFromUsers,
  locked, lockNote, lockColor, adminBypass,
}: {
  to: string;
  search: Record<string, string>;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  badge?: string;
  showFreeBadge?: boolean;
  highlighted?: boolean;
  hiddenFromUsers?: boolean;
} & LockProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const blocked = !!locked && !adminBypass;
  const cls = `group relative block rounded-xl border bg-card p-7 transition-all ${
    highlighted
      ? "border-primary ring-2 ring-primary/30 shadow-md"
      : "border-border hover:border-primary/40 hover:shadow-sm"
  } ${locked ? "opacity-70" : ""} ${blocked ? "cursor-not-allowed select-none" : ""}`;

  const body = (
    <>
      {hiddenFromUsers && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
          <EyeOff size={10} /> Hidden
        </span>
      )}
      {locked && <LockBadge note={lockNote ?? "Coming soon"} color={lockColor} />}
      {locked && adminBypass && <AdminLockHint />}
      <div className="flex items-start justify-between">
        <div className="grid place-items-center h-14 w-14 rounded-xl bg-muted text-primary">{icon}</div>
        {locked ? (
          <LockedCorner />
        ) : (
          <ArrowRight size={20} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-2" />
        )}
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {(badge || countLabel) && (
        <div className="mt-5 inline-flex items-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border border-border rounded-full px-2.5 py-1">
          {badge ?? `${count} ${countLabel}`}
        </div>
      )}
    </>
  );

  if (blocked) {
    return (
      <div className={cls} aria-disabled title={lockNote ?? "Coming soon"}>
        {body}
      </div>
    );
  }

  return (
    <Link ref={ref} to={to as any} search={search as any} className={cls}>
      {body}
    </Link>
  );
}

function ResourcesTile({
  to, search, count, highlighted, icon, title, subtitle, countLabel, badge, showFreeBadge, hiddenFromUsers,
  locked, lockNote, adminBypass,
}: {
  to: string;
  search: Record<string, string>;
  count: number;
  highlighted?: boolean;
  icon?: React.ReactNode;
  title?: string;
  subtitle?: string;
  countLabel?: string;
  badge?: string;
  showFreeBadge?: boolean;
  hiddenFromUsers?: boolean;
} & LockProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);
  const resolvedTitle = title ?? "Resources";
  const resolvedSubtitle = subtitle ?? "Free books, past papers & study material";
  const resolvedCountLabel =
    countLabel ?? `year${count === 1 ? "" : "s"} available`;

  const blocked = !!locked && !adminBypass;
  const cls = `tile-gold group relative block rounded-2xl p-7 overflow-hidden transition-all ${
    blocked ? "cursor-not-allowed select-none" : "hover:-translate-y-1"
  } ${highlighted ? "ring-2 ring-amber-400/50 shadow-xl" : "hover:shadow-xl"} ${
    locked ? "saturate-75" : ""
  }`;
  const style = {
    background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 45%, #d97706 100%)",
    boxShadow: highlighted ? "0 12px 32px -8px rgba(217, 119, 6, 0.5)" : "0 8px 0 #b45309",
  } as const;

  const body = (
    <>
      <div
        aria-hidden
        className="absolute -top-10 -right-10 h-40 w-40 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.9), transparent 70%)" }}
      />
      {locked && <div aria-hidden className="absolute inset-0 z-10 bg-black/25" />}
      {locked && <LockBadge note={lockNote ?? "Coming soon"} onDark />}
      {locked && adminBypass && <AdminLockHint />}
      {hiddenFromUsers ? (
        <span className="absolute top-3 right-3 z-20 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-white/95 text-amber-800 shadow-sm">
          <EyeOff size={10} /> Hidden
        </span>
      ) : showFreeBadge && !locked ? (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-white/95 text-amber-800 shadow-sm">
          <Sparkles size={10} /> Free
        </span>
      ) : null}
      <div className="relative flex items-start justify-between">
        <div className="grid place-items-center h-14 w-14 rounded-xl bg-white/95 text-amber-700 shadow-md">
          {icon ?? <Sparkles size={26} strokeWidth={2} />}
        </div>
        {locked ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-amber-800 mt-1">
            <Lock size={16} strokeWidth={2.5} />
          </span>
        ) : (
          <ArrowRight size={20} className="text-white/90 group-hover:translate-x-0.5 transition-all mt-2" />
        )}
      </div>
      <h2 className="relative mt-6 text-2xl font-black tracking-tight text-white drop-shadow-sm">
        {resolvedTitle}
      </h2>
      <p className="relative mt-1 text-sm font-medium text-white/90">
        {resolvedSubtitle}
      </p>
      {(badge || resolvedCountLabel) && (
        <div className="relative mt-5 inline-flex items-center text-[11px] font-black uppercase tracking-widest text-amber-900 bg-white/95 rounded-full px-3 py-1 shadow-sm">
          {badge ?? `${count} ${resolvedCountLabel}`}
        </div>
      )}
    </>
  );

  if (blocked) {
    return (
      <div className={cls} style={style} aria-disabled title={lockNote ?? "Coming soon"}>
        {body}
      </div>
    );
  }

  return (
    <Link ref={ref} to={to as any} search={search as any} className={cls} style={style}>
      {body}
    </Link>
  );
}

