import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { updateSiteSettings } from "@/lib/site-settings.functions";
import { ICON_NAMES, ICONS } from "@/lib/admin-hub-defaults";
import { fetchStudyHubTiles, type StudyHubTile } from "@/lib/study-hub-tiles";
import { createDebouncedSaver } from "@/lib/debounce-save";

export const Route = createFileRoute("/admin/study-hub")({
  head: () => ({
    meta: [
      { title: "Study Hub Control — AquaQBank" },
      { name: "description", content: "Manage the Study Hub section and its tools." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Study Hub Control — AquaQBank" },
      { property: "og:description", content: "Manage the Study Hub tools." },
    ],
  }),
  component: AdminStudyHubPage,
});

const input =
  "w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-sm";

function AdminStudyHubPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settings = useSiteSettings();
  const saveSettings = useServerFn(updateSiteSettings);
  const [savingHeader, setSavingHeader] = useState(false);
  const [header, setHeader] = useState({
    study_hub_title: "",
    study_hub_title_ar: "",
    study_hub_subtitle: "",
    study_hub_subtitle_ar: "",
  });

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    setHeader({
      study_hub_title: settings.study_hub_title ?? "",
      study_hub_title_ar: settings.study_hub_title_ar ?? "",
      study_hub_subtitle: settings.study_hub_subtitle ?? "",
      study_hub_subtitle_ar: settings.study_hub_subtitle_ar ?? "",
    });
  }, [
    settings.study_hub_title,
    settings.study_hub_title_ar,
    settings.study_hub_subtitle,
    settings.study_hub_subtitle_ar,
  ]);

  const { data: serverTiles } = useQuery({
    queryKey: ["study-hub-tiles"],
    queryFn: fetchStudyHubTiles,
    enabled: isAdmin,
  });

  // Local copy so typing is never overwritten by a background refetch.
  const [tiles, setTiles] = useState<StudyHubTile[]>([]);
  const saver = useRef(createDebouncedSaver(500));
  useEffect(() => {
    if (serverTiles) setTiles(serverTiles);
  }, [serverTiles]);
  useEffect(() => {
    const s = saver.current;
    return () => s.flush();
  }, []);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["study-hub-tiles"] });
  }

  async function addTile() {
    const { data, error } = await (supabase.from as any)("study_hub_tiles")
      .insert({ label: "New tool", icon: "Star", href: "", sort: tiles.length })
      .select()
      .single();
    if (error || !data) return toast.error(error?.message ?? "Could not add the tool");
    setTiles((list) => [...list.filter((x) => x.id !== data.id), data as StudyHubTile]);
    await refresh();
  }

  function patch(t: StudyHubTile, values: Partial<StudyHubTile>, immediate = false) {
    const before = tiles.find((x) => x.id === t.id);
    setTiles((list) => list.map((x) => (x.id === t.id ? { ...x, ...values } : x)));

    const write = async () => {
      const { error } = await (supabase.from as any)("study_hub_tiles")
        .update(values)
        .eq("id", t.id);
      if (error) {
        toast.error(error.message);
        if (before) setTiles((list) => list.map((x) => (x.id === t.id ? before : x)));
        return;
      }
      await refresh();
    };

    const key = `${t.id}:${Object.keys(values).sort().join(",")}`;
    if (immediate) {
      saver.current.run(key, () => {});
      void write();
    } else {
      saver.current.run(key, write);
    }
  }

  async function remove(t: StudyHubTile) {
    if (!confirm(`Delete "${t.label}"?`)) return;
    const { error } = await (supabase.from as any)("study_hub_tiles").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    setTiles((list) => list.filter((x) => x.id !== t.id));
    await refresh();
  }

  async function move(t: StudyHubTile, dir: -1 | 1) {
    const idx = tiles.findIndex((x) => x.id === t.id);
    const other = tiles[idx + dir];
    if (!other) return;
    await (supabase.from as any)("study_hub_tiles").update({ sort: other.sort }).eq("id", t.id);
    await (supabase.from as any)("study_hub_tiles").update({ sort: t.sort }).eq("id", other.id);
    await refresh();
  }

  async function handleSaveHeader() {
    setSavingHeader(true);
    try {
      await saveSettings({ data: header });
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingHeader(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-3xl font-black tracking-tight text-foreground">Study Hub Control</h1>
        <p className="mt-2 text-muted-foreground">
          Edit the section heading and the tools shown at <code>/study-hub</code>.
        </p>

        <section className="mt-8 rounded-2xl border-2 border-border bg-card p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Section heading
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Title (English)"
              value={header.study_hub_title}
              onChange={(e) => setHeader((h) => ({ ...h, study_hub_title: e.target.value }))}
            />
            <input
              className={input}
              dir="rtl"
              placeholder="العنوان (Arabic)"
              value={header.study_hub_title_ar}
              onChange={(e) => setHeader((h) => ({ ...h, study_hub_title_ar: e.target.value }))}
            />
            <input
              className={input}
              placeholder="Subtitle (English)"
              value={header.study_hub_subtitle}
              onChange={(e) => setHeader((h) => ({ ...h, study_hub_subtitle: e.target.value }))}
            />
            <input
              className={input}
              dir="rtl"
              placeholder="الوصف (Arabic)"
              value={header.study_hub_subtitle_ar}
              onChange={(e) => setHeader((h) => ({ ...h, study_hub_subtitle_ar: e.target.value }))}
            />
          </div>
          <button
            type="button"
            onClick={handleSaveHeader}
            disabled={savingHeader}
            className="mt-4 rounded-xl border-2 border-border bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
          >
            {savingHeader ? "Saving…" : "Save heading"}
          </button>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Tools ({tiles.length})
            </h2>
            <button
              type="button"
              onClick={addTile}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted"
            >
              <Plus size={15} /> Add tool
            </button>
          </div>

          {tiles.length === 0 && (
            <p className="mt-4 rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No tools yet. Add the first one when you're ready.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {tiles.map((t) => {
              const Icon = ICONS[t.icon] ?? ICONS.Star!;
              return (
                <div key={t.id} className="rounded-2xl border-2 border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="grid place-items-center h-10 w-10 shrink-0 rounded-xl text-primary-foreground"
                      style={{ background: "var(--primary)" }}
                    >
                      <Icon size={18} />
                    </span>
                    <input
                      className={input + " flex-1 min-w-[160px]"}
                      value={t.label}
                      onChange={(e) => patch(t, { label: e.target.value })}
                      placeholder="Label"
                    />
                    <input
                      className={input + " flex-1 min-w-[160px]"}
                      dir="rtl"
                      value={t.label_ar ?? ""}
                      onChange={(e) => patch(t, { label_ar: e.target.value })}
                      placeholder="التسمية"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(t, -1)}
                        className="rounded-lg border-2 border-border p-2 hover:bg-muted"
                        aria-label="Move up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(t, 1)}
                        className="rounded-lg border-2 border-border p-2 hover:bg-muted"
                        aria-label="Move down"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t, { hidden: !t.hidden }, true)}
                        className="rounded-lg border-2 border-border p-2 hover:bg-muted"
                        aria-label={t.hidden ? "Show" : "Hide"}
                      >
                        {t.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t)}
                        className="rounded-lg border-2 border-border p-2 text-red-600 hover:bg-red-50"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <input
                      className={input}
                      value={t.href}
                      onChange={(e) => patch(t, { href: e.target.value })}
                      placeholder="Link (/my/courses or https://…)"
                    />
                    <select
                      className={input}
                      value={t.icon}
                      onChange={(e) => patch(t, { icon: e.target.value }, true)}
                    >
                      {ICON_NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <input
                        type="checkbox"
                        checked={t.external}
                        onChange={(e) => patch(t, { external: e.target.checked }, true)}
                        className="h-4 w-4 rounded border-2 border-border"
                      />
                      Opens in a new tab
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
