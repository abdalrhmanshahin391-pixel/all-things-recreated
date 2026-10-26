import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, ArrowLeft, Eye, EyeOff, Sparkles, Pencil, Lock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { publicUniversityImageUrl, resolveUniversityImageUrl } from "@/lib/university-image";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/components/LanguageProvider";
import { UniversityTags } from "@/components/common/UniversityTags";
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
  is_closed: boolean;
  closed_note_en: string | null;
  closed_note_ar: string | null;
  tags: unknown;
};

function UniversityHubPage() {
  const { uniSlug } = Route.useParams();
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { lang } = useLang();

  const { data: uni, isLoading, isError } = useQuery({
    queryKey: ["university", uniSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("universities")
        .select("id,name,slug,short_name,description,city,country,logo_url,storage_path,cover_path,lectures_visible,is_closed,closed_note_en,closed_note_ar,tags")
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
    // fixed public URLs (kept by the browser for a year); signed ones only if one fails to load
    setCoverUrl(publicUniversityImageUrl(uni.cover_path));
    setLogoUrl(publicUniversityImageUrl(uni.storage_path) ?? uni.logo_url ?? null);
  }, [uni?.id, uni?.cover_path, uni?.storage_path, uni?.logo_url]);

  async function signedFallback(which: "cover" | "logo") {
    if (!uni) return;
    if (which === "cover") setCoverUrl(await resolveUniversityImageUrl(uni.cover_path));
    else setLogoUrl((await resolveUniversityImageUrl(uni.storage_path)) ?? uni.logo_url ?? null);
  }

  useEffect(() => {
    if (uni) localStorage.setItem("ysmu:lastUniversitySlug", uni.slug);
  }, [uni]);

  const { data: counts } = useQuery({
    enabled: !!uni,
    queryKey: ["university-counts", uni?.id, isAdmin],
    queryFn: async () => {
      if (!uni) return { courses: 0, lectures: 0, committee: 0 };
      const [{ count: courses }, { count: lectures }, { count: committee }] = await Promise.all([
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("university_id", uni.id).eq("published", true).eq("kind", "questions").eq("admin_only", false),
        // "Lectures" counts the lecture subjects (courses of kind "lectures"), not the topics inside them.
        (() => {
          let q = supabase.from("courses").select("id", { count: "exact", head: true }).eq("university_id", uni.id).eq("published", true).eq("kind", "lectures");
          if (!isAdmin) q = q.eq("admin_only", false);
          return q;
        })(),
        supabase.from("committee_years").select("id", { count: "exact", head: true }).eq("university_id", uni.id),
      ]);
      return { courses: courses ?? 0, lectures: lectures ?? 0, committee: committee ?? 0 };
    },
  });

  const { data: tiles, isPending: tilesPending } = useQuery({
    enabled: !!uni && (!uni.is_closed || isAdmin),
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

  if (isLoading || authLoading || (!!uni && (!uni.is_closed || isAdmin) && tilesPending)) {
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
  const closedNote = (lang === "ar" ? uni.closed_note_ar || uni.closed_note_en : uni.closed_note_en) ?? null;

  if (uni.is_closed && !isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <main className="pt-32 pb-24 mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]">
            <Lock size={12} /> {lang === "ar" ? "قريبًا" : "Coming soon"}
          </span>
          <h1 className="mt-6 text-3xl md:text-5xl font-semibold tracking-tight">{uni.name}</h1>
          <p className="mt-4 text-base text-muted-foreground">
            {closedNote ??
              (lang === "ar"
                ? "هذه الجامعة ليست متاحة بعد. ترقّبوا فتحها قريبًا."
                : "This university isn't open yet. Check back soon.")}
          </p>
          <UniversityTags tags={uni.tags} lang={lang} className="mt-5 justify-center" size="md" />
          <Link to="/universities" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ArrowLeft size={14} /> {lang === "ar" ? "كل الجامعات" : "All universities"}
          </Link>
        </main>
      </div>
    );
  }

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
    if (kind === "lectures") return { count: counts?.lectures ?? 0, label: `subject${(counts?.lectures ?? 0) === 1 ? "" : "s"}` };
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
              <img src={coverUrl} alt="" className="h-full w-full object-cover opacity-30" onError={() => !coverUrl.includes("/object/sign/") && signedFallback("cover")} />
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
                  <img src={logoUrl} alt={uni.name} className="h-full w-full object-cover" onError={() => !logoUrl.includes("/object/sign/") && signedFallback("logo")} />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold leading-[1.08] tracking-tight text-foreground md:text-5xl" style={{ fontFamily: "var(--font-heading)" }}>{uni.name}</h1>
                <UniversityTags tags={uni.tags} lang={lang} className="mt-3" size="md" />
                {uni.is_closed && isAdmin && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-amber-600">
                    <Lock size={12} /> Closed for users (admin preview)
                  </p>
                )}
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

        {/* The pillars: pick one on the left, see it on the right */}
        <div className="mx-auto mt-10 max-w-7xl px-6 md:px-10">
          <HubSwitcher
            items={shownTiles.map((tile) => {
              const Icon = tileIcon(tile.icon, tile.kind);
              const auto = countFor(tile.kind);
              const badge = pickText(tile.badge_en, tile.badge_ar, lang).trim();
              return {
                id: tile.id,
                to: tile.href || "/",
                search: { u: uni.slug } as Record<string, string>,
                icon: <Icon size={22} strokeWidth={1.8} />,
                title: pickText(tile.title_en, tile.title_ar, lang),
                subtitle: pickText(tile.subtitle_en, tile.subtitle_ar, lang),
                count: auto?.count ?? 0,
                countLabel: auto?.label ?? "",
                badge: badge || undefined,
                highlighted:
                  (tile.kind === "courses" && next === "courses") ||
                  (tile.kind === "lectures" && next === "lectures") ||
                  (tile.kind === "resources" && next === "committee"),
                hiddenFromUsers: isAdmin && !tile.visible,
                free: tile.kind === "resources",
                locked: !!tile.locked,
                lockNote:
                  pickText(tile.lock_note_en ?? "", tile.lock_note_ar ?? "", lang).trim() ||
                  (lang === "ar" ? "قريبًا" : "Coming soon"),
                adminBypass: isAdmin,
              };
            })}
          />
        </div>      </main>
    </div>
  );
}

type SwitchItem = {
  id: string;
  to: string;
  search: Record<string, string>;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  badge?: string;
  highlighted: boolean;
  hiddenFromUsers: boolean;
  free: boolean;
  locked: boolean;
  lockNote: string;
  adminBypass: boolean;
};

/** Choose a section on the left; the right panel shows what is inside and the way in. */
function HubSwitcher({ items }: { items: SwitchItem[] }) {
  const start = Math.max(0, items.findIndex((i) => i.highlighted));
  const [active, setActive] = useState(start);
  const cur = items[Math.min(active, items.length - 1)];
  if (!cur) return null;
  const blocked = cur.locked && !cur.adminBypass;

  return (
    <>
    {/* PHONES AND TABLETS: every section is its own card, one under the other, so nothing has to be swiped */}
    <div className="space-y-4 lg:hidden">
      {items.map((it) => {
        const isBlocked = it.locked && !it.adminBypass;
        const card = (
          <>
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#d8a940]/20 blur-3xl" />
            <div className="relative flex items-start justify-between gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[color:var(--gold)]">{it.icon}</span>
              <div className="text-right">
                {it.badge ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">{it.badge}</p>
                ) : (
                  <>
                    <p className="text-4xl font-semibold leading-none text-[color:var(--gold)]" style={{ fontFamily: "var(--font-heading)" }}>
                      {it.count}
                    </p>
                    <p className="mt-1 text-xs text-white/65">{it.countLabel}</p>
                  </>
                )}
              </div>
            </div>
            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              {it.free && !it.locked && (
                <span className="rounded-full bg-[color:var(--gold)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--gold-foreground)]">
                  Free
                </span>
              )}
              {it.hiddenFromUsers && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  <EyeOff size={10} /> Hidden from users
                </span>
              )}
            </div>
            <h2 className="relative mt-2 text-2xl font-semibold tracking-tight text-white" style={{ fontFamily: "var(--font-heading)" }}>
              {it.title}
            </h2>
            <p className="relative mt-1 text-sm leading-relaxed text-white/70">{it.subtitle}</p>
            {isBlocked ? (
              <span className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/70">
                <Lock size={14} /> {it.lockNote}
              </span>
            ) : (
              <span className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-[color:var(--gold)] px-5 py-2.5 text-sm font-bold text-[color:var(--gold-foreground)]">
                Open {it.title} <ArrowRight size={16} strokeWidth={2.2} />
              </span>
            )}
          </>
        );
        const cardCls = `on-dark-panel relative block overflow-hidden rounded-2xl p-5 shadow-md ${
          it.highlighted ? "ring-2 ring-[color:var(--gold)]" : ""
        } ${isBlocked ? "opacity-80" : "transition-transform active:scale-[0.99]"}`;
        const cardStyle = { background: "linear-gradient(155deg, #0b1b36 0%, #13294b 60%, #1a3566 100%)" };
        return isBlocked ? (
          <div key={it.id} className={cardCls} style={cardStyle} aria-disabled>
            {card}
          </div>
        ) : (
          <Link key={it.id} to={it.to as any} search={it.search as any} className={cardCls} style={cardStyle}>
            {card}
          </Link>
        );
      })}
    </div>

    <div className="hidden overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_40px_80px_-50px_rgba(19,41,75,0.5)] lg:grid lg:grid-cols-[minmax(0,24rem)_1fr]">
      {/* LEFT: a quiet index */}
      <div role="tablist" aria-label="Sections" className="flex overflow-x-auto bg-card lg:flex-col lg:overflow-visible">
        {items.map((it, i) => {
          const on = i === active;
          return (
            <button
              key={it.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              className={`group relative flex shrink-0 items-center gap-4 px-6 py-6 text-left transition-colors duration-300 lg:w-full lg:border-b lg:border-border lg:last:border-b-0 ${
                on ? "bg-[color:var(--cream)]" : "hover:bg-[color:var(--cream)]/60"
              }`}
            >
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-[3px] bg-[color:var(--gold)] transition-all duration-500 lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-full lg:w-[3px]"
                style={{ width: on ? undefined : 0, height: undefined, opacity: on ? 1 : 0 }}
              />
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
                  on ? "border-primary bg-primary text-[color:var(--gold)]" : "border-border bg-card text-primary"
                }`}
              >
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-xl font-semibold leading-tight transition-colors ${on ? "text-primary" : "text-foreground"}`}
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {it.title}
                </span>
                <span className="mt-1 hidden truncate text-xs text-muted-foreground lg:block">
                  {it.badge ?? `${it.count} ${it.countLabel}`}
                </span>
              </span>
              {it.locked ? (
                <Lock size={15} className="text-muted-foreground" />
              ) : (
                <ArrowRight
                  size={16}
                  className={`hidden shrink-0 transition-all duration-300 lg:block ${on ? "translate-x-0 text-[color:var(--gold-ink)]" : "-translate-x-2 text-muted-foreground opacity-0"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* RIGHT: the chosen section, on navy */}
      <div
        key={cur.id}
        className="on-dark-panel relative flex min-h-[21rem] flex-col justify-between overflow-hidden p-8 sm:p-12"
        style={{
          background: "linear-gradient(155deg, #0b1b36 0%, #13294b 60%, #1a3566 100%)",
          animation: "hub-swap 0.6s cubic-bezier(0.22, 0.8, 0.25, 1) both",
        }}
      >
        <style>{`@keyframes hub-swap { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }`}</style>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#d8a940]/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-12 -right-8 text-white/[0.05] [&_svg]:h-72 [&_svg]:w-72 [&_svg]:stroke-[0.7]"
        >
          {cur.icon}
        </div>

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {cur.free && !cur.locked && (
              <span className="rounded-full bg-[color:var(--gold)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[color:var(--gold-foreground)]">
                Free
              </span>
            )}
            {cur.hiddenFromUsers && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                <EyeOff size={10} /> Hidden from users
              </span>
            )}
            {cur.locked && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--gold)]/60 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[color:var(--gold)]">
                <Lock size={10} /> {cur.lockNote}
              </span>
            )}
          </div>
          <div className="text-right">
            {cur.badge ? (
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">{cur.badge}</p>
            ) : (
              <>
                <p className="text-7xl font-semibold leading-none text-[color:var(--gold)] sm:text-8xl" style={{ fontFamily: "var(--font-heading)" }}>
                  {cur.count}
                </p>
                <p className="mt-2 text-sm text-white/65">{cur.countLabel}</p>
              </>
            )}
          </div>
        </div>

        <div className="relative mt-12">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl" style={{ fontFamily: "var(--font-heading)" }}>
            {cur.title}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">{cur.subtitle}</p>
          {blocked ? (
            <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white/70">
              <Lock size={15} /> {cur.lockNote}
            </span>
          ) : (
            <Link to={cur.to as any} search={cur.search as any} className="btn-chunky btn-chunky--lg btn-chunky--gold mt-8">
              Open {cur.title} <ArrowRight size={18} strokeWidth={2.2} />
            </Link>
          )}
        </div>
      </div>
    </div>
    </>
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
        onDark ? "bg-white text-amber-900 border-white" : "border-[color:var(--gold)]/50 bg-card text-primary"
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
  const cls = `group relative block rounded-2xl border bg-card p-7 transition-all duration-300 ${
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
  // An index row, not a card: hairline dividers, a big serif title, the count on the right.
  const cls = `group relative grid grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 overflow-hidden px-2 py-7 transition-colors duration-500 sm:grid-cols-[auto_1fr_auto_auto] sm:gap-x-8 sm:px-6 sm:py-9 ${
    blocked ? "cursor-not-allowed select-none" : "hover:bg-[color:var(--cream)]"
  } ${highlighted ? "bg-[color:var(--cream)]" : ""} ${locked ? "opacity-70" : ""}`;
  const style = {} as const;

  const body = (
    <>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 bg-[color:var(--gold)] transition-transform duration-700 ease-out group-hover:scale-x-100"
      />
      {locked && <LockBadge note={lockNote ?? "Coming soon"} />}
      {locked && adminBypass && <AdminLockHint />}

      <div className="grid h-14 w-14 place-items-center rounded-full border border-border bg-card text-primary transition-all duration-500 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground sm:h-16 sm:w-16">
        {icon ?? <Sparkles size={26} strokeWidth={1.6} />}
      </div>

      <div className="min-w-0 transition-transform duration-500 ease-out group-hover:translate-x-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {resolvedTitle}
          </h2>
          {showFreeBadge && !locked && !hiddenFromUsers && (
            <span className="rounded-full bg-[color:var(--gold)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--gold-foreground)]">
              Free
            </span>
          )}
          {hiddenFromUsers && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              <EyeOff size={10} /> Hidden
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{resolvedSubtitle}</p>
      </div>

      {(badge || resolvedCountLabel) && (
        <div className="hidden text-right sm:block">
          {badge ? (
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--gold-ink)]">{badge}</p>
          ) : (
            <>
              <p className="text-4xl font-semibold leading-none text-primary" style={{ fontFamily: "var(--font-heading)" }}>
                {count}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{resolvedCountLabel}</p>
            </>
          )}
        </div>
      )}

      {locked ? (
        <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <Lock size={16} strokeWidth={2.2} />
        </span>
      ) : (
        <span className="grid h-11 w-11 place-items-center rounded-full border border-border text-primary transition-all duration-500 group-hover:border-[color:var(--gold)] group-hover:bg-[color:var(--gold)] group-hover:text-[color:var(--gold-foreground)]">
          <ArrowRight size={18} strokeWidth={2.2} className="transition-transform duration-500 group-hover:translate-x-0.5" />
        </span>
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

