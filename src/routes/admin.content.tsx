import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Save, RotateCcw, Search, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { saveSiteContent, resetSiteContent } from "@/lib/site-content.functions";
import { CONTENT_GROUPS, type ContentItem } from "@/lib/site-content-catalog";
import { applySiteContentOverrides } from "@/i18n";

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [
      { title: "Website Text — Admin" },
      { name: "description", content: "Edit every word shown on the public pages, in English and Arabic." },
    ],
  }),
  component: AdminContent,
});

type Values = Record<string, { en: string; ar: string }>;

function AdminContent() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const saveFn = useServerFn(saveSiteContent);
  const resetFn = useServerFn(resetSiteContent);

  const [overrides, setOverrides] = useState<Values>({});
  const [draft, setDraft] = useState<Values>({});
  const [query, setQuery] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(CONTENT_GROUPS[0]?.key ?? null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("site_content").select("key,value_en,value_ar");
      const map: Values = {};
      for (const r of (data ?? []) as Array<{ key: string; value_en: string; value_ar: string }>) {
        map[r.key] = { en: r.value_en ?? "", ar: r.value_ar ?? "" };
      }
      setOverrides(map);
      setReady(true);
    })();
  }, []);

  function current(item: ContentItem) {
    return (
      draft[item.key] ??
      overrides[item.key] ?? { en: item.en, ar: item.ar ?? item.en }
    );
  }

  function edit(item: ContentItem, lang: "en" | "ar", value: string) {
    const now = current(item);
    setDraft((d) => ({ ...d, [item.key]: { ...now, [lang]: value } }));
  }

  const dirtyKeys = Object.keys(draft);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CONTENT_GROUPS;
    return CONTENT_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.en.toLowerCase().includes(q) ||
          (i.ar ?? "").includes(query.trim()) ||
          (overrides[i.key]?.en ?? "").toLowerCase().includes(q) ||
          (overrides[i.key]?.ar ?? "").includes(query.trim()),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query, overrides]);

  async function handleSave() {
    if (dirtyKeys.length === 0) return;
    setBusy(true);
    try {
      const rows = CONTENT_GROUPS.flatMap((g) =>
        g.items
          .map((item, idx) => ({ g, item, idx }))
          .filter(({ item }) => dirtyKeys.includes(item.key))
          .map(({ g, item, idx }) => ({
            key: item.key,
            group_key: g.key,
            group_label: g.label,
            label: item.label,
            kind: item.kind ?? "text",
            sort_order: idx,
            value_en: draft[item.key]!.en,
            value_ar: draft[item.key]!.ar,
            default_en: item.en,
            default_ar: item.ar ?? item.en,
          })),
      );
      await saveFn({ data: { rows } });
      const next = { ...overrides };
      rows.forEach((r) => (next[r.key] = { en: r.value_en, ar: r.value_ar }));
      setOverrides(next);
      setDraft({});
      applySiteContentOverrides(
        rows.map((r) => ({ key: r.key, value_en: r.value_en, value_ar: r.value_ar })),
      );
      toast.success(`Saved ${rows.length} text${rows.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(item: ContentItem) {
    setBusy(true);
    try {
      await resetFn({ data: { keys: [item.key] } });
      setOverrides((o) => {
        const n = { ...o };
        delete n[item.key];
        return n;
      });
      setDraft((d) => {
        const n = { ...d };
        delete n[item.key];
        return n;
      });
      applySiteContentOverrides([
        { key: item.key, value_en: item.en, value_ar: item.ar ?? item.en },
      ]);
      toast.success("Reset to the original wording");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-32">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600"
        >
          <ArrowLeft size={14} /> Home
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">Website Text</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Every word on the public pages, grouped by where it appears. Edit the English and
          Arabic wording side by side — changes go live for everyone as soon as you save.
        </p>

        <div className="mt-6 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any word on the site…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {!ready ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading text…
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {groups.map((g) => {
              const expanded = query.trim().length > 0 || openGroup === g.key;
              const changed = g.items.filter(
                (i) => draft[i.key] || overrides[i.key],
              ).length;
              return (
                <section
                  key={g.key}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenGroup(expanded && !query ? null : g.key)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
                  >
                    <span className="font-black text-sm">{g.label}</span>
                    <span className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      {changed > 0 && (
                        <span className="text-indigo-600">{changed} edited</span>
                      )}
                      {g.items.length} fields
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {g.items.map((item) => {
                        const v = current(item);
                        const isCustom = !!draft[item.key] || !!overrides[item.key];
                        const Multi = (item.kind ?? "text") === "multiline";
                        return (
                          <div key={item.key} className="px-5 py-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                                {item.label}
                              </span>
                              {isCustom && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleReset(item)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 disabled:opacity-50"
                                >
                                  <RotateCcw size={12} /> Reset
                                </button>
                              )}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <LangField
                                tag="English"
                                dir="ltr"
                                multiline={Multi}
                                value={v.en}
                                onChange={(x) => edit(item, "en", x)}
                              />
                              <LangField
                                tag="العربية"
                                dir="rtl"
                                multiline={Multi}
                                value={v.ar}
                                onChange={(x) => edit(item, "ar", x)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
            {groups.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
                Nothing matches “{query}”.
              </div>
            )}
          </div>
        )}
      </div>

      {dirtyKeys.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-slate-600">
              {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft({})}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={15} />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LangField({
  tag,
  dir,
  value,
  multiline,
  onChange,
}: {
  tag: string;
  dir: "ltr" | "rtl";
  value: string;
  multiline: boolean;
  onChange: (v: string) => void;
}) {
  const cls =
    "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
        {tag}
      </span>
      {multiline ? (
        <textarea
          dir={dir}
          rows={3}
          value={value}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          className={cls + " resize-y"}
        />
      ) : (
        <input
          dir={dir}
          value={value}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </label>
  );
}