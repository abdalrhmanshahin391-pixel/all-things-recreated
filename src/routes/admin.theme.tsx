import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, Trash2, Megaphone, Tag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { updateSiteSettings } from "@/lib/site-settings.functions";
import { autoNotify } from "@/lib/push.functions";
import { useSiteSettings, type SiteTheme } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ACCENTS,
  ANNOUNCEMENT_STYLES,
  useAllAnnouncements,
  type Announcement,
} from "@/lib/announcements";
import {
  setAudience,
  useAnnouncementAudiences,
  useGroupCounts,
  useUserGroups,
} from "@/lib/user-groups";
import { BADGE_PRESETS } from "@/components/common/CourseBadge";
import { HEADER_DESIGNS, HEADER_SKINS } from "@/components/header/header-designs";
import { SiteWordmark, BRAND_STYLES, type BrandStyle } from "@/components/brand/SiteWordmark";

export const Route = createFileRoute("/admin/theme")({
  head: () => ({
    meta: [
      { title: "Theme — Administration Site" },
      { name: "description", content: "Switch the whole website to a seasonal theme: Ramadan, Eid, Christmas, Summer or Winter." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Theme — Administration Site" },
      { property: "og:description", content: "Seasonal look and feel for the entire website." },
    ],
  }),
  component: AdminTheme,
});

const THEMES: { id: SiteTheme; name: string; note: string; colors: [string, string] }[] = [
  { id: "default", name: "Default", note: "The everyday green brand", colors: ["#58cc02", "#1cb0f6"] },
  { id: "ramadan", name: "Ramadan", note: "Emerald night, gold lanterns overhead", colors: ["#0f4d33", "#d8a13a"] },
  { id: "eid", name: "Eid", note: "Black royal night, moon & mosque", colors: ["#0f0c06", "#d4af37"] },
  { id: "christmas", name: "Christmas", note: "Red & pine green, snow and Santa", colors: ["#c62828", "#2e7d32"] },
  { id: "summer", name: "Summer", note: "Sun orange & sea blue", colors: ["#ff9f1c", "#2ec4f1"] },
  { id: "winter", name: "Winter", note: "Icy blue & frost", colors: ["#3f72af", "#a8d0e6"] },
  { id: "fireworks", name: "Fireworks", note: "Night sky with celebration bursts", colors: ["#120a2a", "#ff4d6d"] },
  { id: "stars", name: "Stars", note: "Drifting starfield & shooting stars", colors: ["#0b1030", "#8ab6ff"] },
  { id: "golden-age", name: "Golden Age", note: "Bayt al-Hikma — ink, brass & geometry", colors: ["#12224a", "#c9a227"] },
  { id: "parchment", name: "Parchment", note: "Aged manuscript, sepia ink & rubrication", colors: ["#8c2f1f", "#c9a227"] },
  { id: "andalus", name: "Andalus", note: "Alhambra turquoise & terracotta zellij", colors: ["#1f8a93", "#c1552e"] },
  { id: "desert-night", name: "Desert Night", note: "Indigo sky, amber moon over dunes", colors: ["#221a4d", "#e0a04a"] },
  { id: "academy", name: "Academy", note: "Bright, calm product look — white space & aqua accent", colors: ["#0e7490", "#f5c518"] },
  { id: "emerald-library", name: "Emerald Library", note: "Green leather, aged brass & gold dust", colors: ["#14452f", "#b99a53"] },
];

function AdminTheme() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const settings = useSiteSettings();
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateSiteSettings);
  const [saving, setSaving] = useState<SiteTheme | null>(null);
  const [savingHeader, setSavingHeader] = useState<string | null>(null);

  const [savingBrand, setSavingBrand] = useState<string | null>(null);

  async function pickBrand(id: BrandStyle) {
    setSavingBrand(id);
    try {
      await updateFn({ data: { brand_style: id } });
      queryClient.setQueryData(["site-settings"], (old: any) =>
        old ? { ...old, brand_style: id } : old,
      );
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Wordmark updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not change the wordmark");
    } finally {
      setSavingBrand(null);
    }
  }

  async function pickHeader(id: string) {
    setSavingHeader(id);
    try {
      await updateFn({ data: { header_style: id } });
      queryClient.setQueryData(["site-settings"], (old: any) =>
        old ? { ...old, header_style: id } : old,
      );
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      await router.invalidate();
      toast.success("Header design updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not change the header design");
    } finally {
      setSavingHeader(null);
    }
  }


  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  async function pick(theme: SiteTheme) {
    setSaving(theme);
    // Apply immediately so the whole site re-skins on click.
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    if (theme === "default") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("ysmu-theme", theme);
    } catch {
      /* ignore */
    }
    try {
      await updateFn({ data: { theme } });
      queryClient.setQueryData(["site-settings"], (old: any) =>
        old ? { ...old, theme } : old,
      );
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      // The root loader carries the theme into a head script that can replay
      // stale data and snap the skin back — refresh it so the pick sticks.
      await router.invalidate();
      if (theme === "default") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", theme);
      toast.success(`Theme switched to ${theme === "default" ? "Default" : theme}`);
    } catch (e: any) {
      if (previous) root.setAttribute("data-theme", previous);
      else root.removeAttribute("data-theme");
      toast.error(e?.message || "Could not change the theme");
    } finally {
      setSaving(null);
    }
  }


  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Administration Site
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-foreground">Theme</h1>
        <p className="mt-2 text-muted-foreground">
          Pick a season — colours, buttons and highlights across the whole website change instantly for every visitor.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl font-black text-foreground">Brand wordmark</h2>
          <p className="text-sm text-muted-foreground">
            How the name is drawn in the header and footer. The “Academy” lockups help people
            remember and search the full name.
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BRAND_STYLES.map((b) => {
              const active = (settings.brand_style || "aqua-flow") === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => pickBrand(b.id)}
                  disabled={savingBrand !== null}
                  className={`text-start rounded-2xl border-2 bg-card p-4 transition-transform hover:-translate-y-1 disabled:opacity-60 ${
                    active ? "border-primary" : "border-border"
                  }`}
                  style={{ boxShadow: active ? "0 4px 0 var(--primary)" : "0 4px 0 var(--border)" }}
                >
                  <div className="h-16 flex items-center overflow-hidden rounded-xl border border-border bg-background px-4">
                    <SiteWordmark size={22} style={b.id} name={settings.site_name || "AquaQBank"} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-black text-foreground">{b.label}</span>
                    {active && <Check size={16} className="text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.hint}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-10">

          <h2 className="text-2xl font-black text-foreground">Header design</h2>
          <p className="text-sm text-muted-foreground">
            The shape and typography of the top bar. Colours still come from the theme below.
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HEADER_DESIGNS.map((h) => {
              const active = (settings.header_style || "institutional") === h.id;
              const skin = HEADER_SKINS[h.id];
              return (
                <button
                  key={h.id}
                  onClick={() => pickHeader(h.id)}
                  disabled={savingHeader !== null}
                  className={`text-start rounded-2xl border-2 bg-card p-4 transition-transform hover:-translate-y-1 disabled:opacity-60 ${
                    active ? "border-primary" : "border-border"
                  }`}
                  style={{ boxShadow: active ? "0 4px 0 var(--primary)" : "0 4px 0 var(--border)" }}
                >
                  {/* miniature of the bar */}
                  <div className="rounded-xl overflow-hidden border border-border bg-background">
                    <div className={`flex items-center gap-3 px-3 ${skin.inner} scale-90 origin-left`}>
                      <span className="font-black text-foreground text-sm shrink-0">AquaQbank</span>
                      <span className={`${skin.navIdle} hidden sm:inline`}>About</span>
                      <span className={`${skin.navActive} hidden sm:inline`}>Support</span>
                      <span className="flex-1" />
                      <span className={skin.registerBtn}>Join</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-black text-foreground">{h.name}</span>
                    {active && <Check size={16} className="text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>
                  {savingHeader === h.id && (
                    <p className="text-xs text-muted-foreground mt-2">Applying…</p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <h2 className="mt-12 text-2xl font-black text-foreground">Colour theme</h2>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEMES.map((t) => {
            const active = settings.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                disabled={saving !== null}
                className={`text-start rounded-2xl border-2 bg-card p-4 transition-transform hover:-translate-y-1 disabled:opacity-60 ${
                  active ? "border-primary" : "border-border"
                }`}
                style={{ boxShadow: active ? "0 4px 0 var(--primary)" : "0 4px 0 var(--border)" }}
              >
                <div className="h-16 rounded-xl" style={{ background: `linear-gradient(135deg, ${t.colors[0]} 0%, ${t.colors[1]} 100%)` }} />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-black text-foreground">{t.name}</span>
                  {active && <Check size={16} className="text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.note}</p>
                {saving === t.id && <p className="text-xs text-muted-foreground mt-2">Applying…</p>}
              </button>
            );
          })}
        </div>

        <AnnouncementsPanel />
        <CourseBadgesPanel />
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm text-foreground";

function AnnouncementsPanel() {
  const { data, refetch, isLoading } = useAllAnnouncements();
  const { data: groups } = useUserGroups();
  const { data: counts } = useGroupCounts();
  const { data: audiences, refetch: refetchAudiences } = useAnnouncementAudiences();
  const [busy, setBusy] = useState(false);

  async function toggleAudience(announcementId: string, groupId: string, on: boolean) {
    try {
      await setAudience(announcementId, groupId, on);
      refetchAudiences();
    } catch (e: any) {
      toast.error(e?.message || "Could not change the audience");
    }
  }

  async function add() {
    setBusy(true);
    const { error } = await (supabase.from as any)("site_announcements").insert({
      title: "New course available",
      body: "Check it out now",
      style: "ribbon",
      accent: ACCENTS[0],
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    refetch();
  }

  async function patch(id: string, values: Partial<Announcement>) {
    const { error } = await (supabase.from as any)("site_announcements")
      .update(values)
      .eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  }

  async function remove(id: string) {
    const { error } = await (supabase.from as any)("site_announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  }

  return (
    <section className="mt-14">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-foreground">
            <Megaphone size={20} className="text-primary" /> Announcements
          </h2>
          <p className="text-sm text-muted-foreground">
            Tell everyone about a new course or an offer — a thin ribbon on top, a floating card, or
            a spotlight banner on the home page. Visitors can dismiss them, and they expire on their
            own.
          </p>
        </div>
        <button onClick={add} disabled={busy} className="btn-chunky shrink-0 disabled:opacity-50">
          <Plus size={14} /> New
        </button>
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !data?.length && (
        <p className="mt-4 text-sm text-muted-foreground">No announcements yet.</p>
      )}

      <div className="mt-5 space-y-4">
        {(data ?? []).map((a) => (
          <div
            key={a.id}
            className="rounded-2xl border-2 border-border bg-card p-4"
            style={{ boxShadow: "0 4px 0 var(--border)" }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Title
                <input
                  className={`${inputCls} mt-1`}
                  defaultValue={a.title}
                  onBlur={(e) => e.target.value !== a.title && patch(a.id, { title: e.target.value })}
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Text
                <input
                  className={`${inputCls} mt-1`}
                  defaultValue={a.body}
                  onBlur={(e) => e.target.value !== a.body && patch(a.id, { body: e.target.value })}
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Link (optional)
                <input
                  className={`${inputCls} mt-1`}
                  placeholder="/courses"
                  defaultValue={a.href ?? ""}
                  onBlur={(e) => patch(a.id, { href: e.target.value || null })}
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Button label
                <input
                  className={`${inputCls} mt-1`}
                  placeholder="See the course"
                  defaultValue={a.href_label ?? ""}
                  onBlur={(e) => patch(a.id, { href_label: e.target.value || null })}
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Starts
                <input
                  type="date"
                  className={`${inputCls} mt-1`}
                  defaultValue={a.starts_at ? a.starts_at.slice(0, 10) : ""}
                  onChange={(e) =>
                    patch(a.id, { starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Ends
                <input
                  type="date"
                  className={`${inputCls} mt-1`}
                  defaultValue={a.ends_at ? a.ends_at.slice(0, 10) : ""}
                  onChange={(e) =>
                    patch(a.id, { ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Shape</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ANNOUNCEMENT_STYLES.map((s) => (
                  <button
                    key={s.id}
                    title={s.note}
                    onClick={() => patch(a.id, { style: s.id })}
                    className={`rounded-xl px-3 py-2 text-start border-2 ${
                      a.style === s.id
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <span className="block text-[11px] font-black uppercase tracking-wider">{s.name}</span>
                    <span className="block text-[10px] font-semibold opacity-70">{s.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Colour ${c}`}
                    onClick={() => patch(a.id, { accent: c })}
                    className={`h-6 w-6 rounded-full border-2 ${
                      a.accent === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                <input
                  type="checkbox"
                  checked={a.urgent}
                  onChange={(e) => {
                    patch(a.id, { urgent: e.target.checked });
                    if (e.target.checked) {
                      autoNotify({
                        data: {
                          kind: "on_urgent_announcement",
                          title_en: a.title || "AquaQBank",
                          body_en: a.body || "",
                          title_ar: a.title || "أكوا كيو بانك",
                          body_ar: a.body || "",
                          url: "/",
                        },
                      }).catch(() => undefined);
                    }
                  }}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Pulse dot
              </label>

              <label
                className="flex items-center gap-2 text-xs font-bold text-foreground"
                title="Users cannot close this announcement"
              >
                <input
                  type="checkbox"
                  checked={!!a.pinned}
                  onChange={(e) => patch(a.id, { pinned: e.target.checked })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Pinned (can't be closed)
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                <input
                  type="checkbox"
                  checked={a.active}
                  onChange={(e) => patch(a.id, { active: e.target.checked })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Live
              </label>


              <button
                onClick={() => remove(a.id)}
                className="ms-auto inline-flex items-center gap-1.5 rounded-full border-2 border-destructive/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-destructive"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>

            <div className="mt-4 border-t-2 border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Audience
                </p>
                <Link to="/admin/groups" className="text-[11px] font-black uppercase tracking-wider text-primary">
                  Manage groups
                </Link>
              </div>
              {(() => {
                const picked = audiences?.[a.id] ?? [];
                const reach = picked.reduce((n, gid) => n + (counts?.[gid] ?? 0), 0);
                return (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        onClick={async () => {
                          for (const gid of picked) await toggleAudience(a.id, gid, false);
                        }}
                        className={`rounded-full border-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider ${
                          picked.length === 0
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        Everyone
                      </button>
                      {(groups ?? []).map((g) => {
                        const on = picked.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            onClick={() => toggleAudience(a.id, g.id, !on)}
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider ${
                              on ? "border-primary text-primary" : "border-border text-muted-foreground"
                            }`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                            {g.name}
                          </button>
                        );
                      })}
                      {!groups?.length && (
                        <span className="text-xs text-muted-foreground">
                          No groups yet — create one in Groups to target people.
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {picked.length === 0
                        ? "Shown to every visitor, including signed-out ones."
                        : `Only members of the selected groups see this — about ${reach} ${reach === 1 ? "person" : "people"}.`}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type CourseRow = {
  id: string;
  title: string;
  badge: string | null;
  badge_color: string | null;
  badge_expires_at: string | null;
};

function CourseBadgesPanel() {
  const [q, setQ] = useState("");
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin-course-badges"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("courses")
        .select("id,title,badge,badge_color,badge_expires_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CourseRow[];
    },
  });

  async function patch(id: string, values: Partial<CourseRow>) {
    const { error } = await (supabase.from as any)("courses").update(values).eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  }

  const rows = (data ?? []).filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="mt-14 pb-16">
      <h2 className="flex items-center gap-2 text-2xl font-black text-foreground">
        <Tag size={20} className="text-primary" /> Course badges
      </h2>
      <p className="text-sm text-muted-foreground">
        Put a badge on any course — New, Hot offer, Most wanted — and it shows on the course card
        everywhere on the site. Add an end date and it disappears by itself.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search courses…"
        className={`${inputCls} mt-4 max-w-sm`}
      />

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      <div className="mt-5 space-y-3">
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-3"
          >
            <span className="min-w-[9rem] flex-1 font-black text-foreground">{c.title}</span>

            <div className="flex flex-wrap items-center gap-1.5">
              {BADGE_PRESETS.map((b) => (
                <button
                  key={b.label}
                  onClick={() => patch(c.id, { badge: b.label, badge_color: b.color })}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white ${
                    c.badge === b.label ? "ring-2 ring-foreground ring-offset-1" : "opacity-70"
                  }`}
                  style={{ background: b.color }}
                >
                  {b.label}
                </button>
              ))}
              <input
                className="w-28 rounded-full border-2 border-border bg-background px-3 py-1 text-[11px] font-bold text-foreground"
                placeholder="Custom…"
                defaultValue={
                  c.badge && !BADGE_PRESETS.some((b) => b.label === c.badge) ? c.badge : ""
                }
                onBlur={(e) =>
                  e.target.value &&
                  patch(c.id, {
                    badge: e.target.value.toUpperCase(),
                    badge_color: c.badge_color || "#f43f5e",
                  })
                }
              />
            </div>

            <input
              type="date"
              className="rounded-xl border-2 border-border bg-background px-2 py-1 text-xs text-foreground"
              defaultValue={c.badge_expires_at ? c.badge_expires_at.slice(0, 10) : ""}
              onChange={(e) =>
                patch(c.id, {
                  badge_expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />

            {c.badge && (
              <button
                onClick={() => patch(c.id, { badge: null, badge_color: null, badge_expires_at: null })}
                className="rounded-full border-2 border-border px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground"
              >
                Clear
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
