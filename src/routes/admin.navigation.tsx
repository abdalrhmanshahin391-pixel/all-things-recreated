import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createDebouncedSaver } from "@/lib/debounce-save";
import { supabase } from "@/integrations/supabase/client";

import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BUILT_IN_ROUTES,
  DEFAULT_HEADER_NAV,
  DEFAULT_HERO_NAV,
  DEFAULT_FOOTER_NAV,
  useCustomPages,
  type NavItem,
} from "@/lib/site-structure";

export const Route = createFileRoute("/admin/navigation")({
  head: () => ({
    meta: [
      { title: "Navigation & Buttons — Admin" },
      { name: "description", content: "Choose which menu links and hero buttons appear, where they point, and in what order." },
    ],
  }),
  component: AdminNavigation,
});

const PLACEMENTS = [
  { key: "header", label: "Header menu" },
  { key: "hero", label: "Home hero buttons" },
  { key: "footer", label: "Footer links" },
] as const;

function AdminNavigation() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pages = useCustomPages(false);
  const [items, setItems] = useState<NavItem[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const saver = useRef(createDebouncedSaver(500));

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  /** Make the live header/hero/footer pick the change up immediately. */
  function refreshMenus() {
    void qc.invalidateQueries({ queryKey: ["site-nav"] });
  }

  async function reload() {
    const { data } = await (supabase.from as any)("site_nav_items")
      .select("*")
      .order("sort_order", { ascending: true });
    setItems((data ?? []) as NavItem[]);
    setReady(true);
    refreshMenus();
  }

  useEffect(() => {
    void reload();
    const s = saver.current;
    return () => s.flush();
  }, []);

  async function seedDefaults() {
    setBusy(true);
    try {
      const rows = [...DEFAULT_HEADER_NAV, ...DEFAULT_HERO_NAV, ...DEFAULT_FOOTER_NAV];
      const { error } = await (supabase.from as any)("site_nav_items").insert(rows);
      if (error) throw error;
      await reload();
      toast.success("Loaded the current menu so you can edit it");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load defaults");
    } finally {
      setBusy(false);
    }
  }

  async function addItem(placement: string) {
    const siblings = items.filter((i) => i.placement === placement);
    const { data, error } = await (supabase.from as any)("site_nav_items")
      .insert({
        placement,
        label_en: "New link",
        label_ar: "رابط جديد",
        target_kind: "route",
        target_value: "",
        style: placement === "hero" ? "primary" : "link",
        visibility: "all",
        visible: true,
        sort_order: siblings.length,
      })
      .select()
      .single();
    if (error || !data) return toast.error(error?.message ?? "Could not add the link");
    setItems((list) => [...list.filter((i) => i.id !== data.id), data as NavItem]);
    refreshMenus();
  }

  /** Update on screen straight away, save shortly after typing stops. */
  function patch(id: string, changes: Partial<NavItem>, immediate = false) {
    const before = items.find((i) => i.id === id);
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)));

    const write = async () => {
      const { error } = await (supabase.from as any)("site_nav_items").update(changes).eq("id", id);
      if (error) {
        toast.error(error.message);
        // roll the field back so the screen matches the database
        if (before) setItems((list) => list.map((i) => (i.id === id ? before : i)));
        return;
      }
      refreshMenus();
    };

    const key = `${id}:${Object.keys(changes).sort().join(",")}`;
    if (immediate) {
      saver.current.run(key, () => {});
      void write();
    } else {
      saver.current.run(key, write);
    }
  }

  async function remove(id: string) {
    const { error } = await (supabase.from as any)("site_nav_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((list) => list.filter((i) => i.id !== id));
    refreshMenus();
  }

  async function move(item: NavItem, dir: -1 | 1) {
    const group = items
      .filter((i) => i.placement === item.placement)
      .sort((a, b) => a.sort_order - b.sort_order);
    const ids = group.map((i) => i.id);
    const from = ids.indexOf(item.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    await Promise.all(
      ids.map((id, i) => (supabase.from as any)("site_nav_items").update({ sort_order: i }).eq("id", id)),
    );
    await reload();
  }


  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-24">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={14} /> Home
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">Navigation &amp; Buttons</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Decide which links appear in the top menu and which buttons appear in the home hero —
          their wording, where they point, who sees them, and their order.
        </p>

        {!ready ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">
              You’re still using the built-in menu. Load it here to start editing.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={seedDefaults}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Load current menu
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {PLACEMENTS.map((p) => {
              const group = items
                .filter((i) => i.placement === p.key)
                .sort((a, b) => a.sort_order - b.sort_order);
              return (
                <section key={p.key} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-black">{p.label}</h2>
                    <button
                      type="button"
                      onClick={() => addItem(p.key)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {group.map((item) => (
                      <NavRow
                        key={item.id}
                        item={item}
                        pages={pages}
                        onPatch={(c, now) => patch(item.id, c, now)}
                        onRemove={() => remove(item.id)}
                        onMove={(d) => move(item, d)}
                      />
                    ))}
                    {group.length === 0 && (
                      <p className="text-sm text-slate-500">Nothing here yet.</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NavRow({
  item,
  pages,
  onPatch,
  onRemove,
  onMove,
}: {
  item: NavItem;
  pages: Array<{ slug: string; title_en: string }>;
  onPatch: (c: Partial<NavItem>, immediate?: boolean) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const input =
    "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400";
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">English label</span>
          <input className={input} value={item.label_en} onChange={(e) => onPatch({ label_en: e.target.value })} />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">العربية</span>
          <input dir="rtl" className={input} value={item.label_ar ?? ""} onChange={(e) => onPatch({ label_ar: e.target.value })} />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Goes to</span>
          <select
            className={input}
            value={item.target_kind}
            onChange={(e) => onPatch({ target_kind: e.target.value as NavItem["target_kind"], target_value: "" }, true)}
          >
            <option value="route">Existing page</option>
            <option value="page">Custom page</option>
            <option value="url">Web address</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Destination</span>
          {item.target_kind === "route" ? (
            <select className={input} value={item.target_value} onChange={(e) => onPatch({ target_value: e.target.value }, true)}>
              <option value="">Choose a page…</option>
              {BUILT_IN_ROUTES.map((r) => (
                <option key={r.path} value={r.path}>{r.label}</option>
              ))}
            </select>
          ) : item.target_kind === "page" ? (
            <select className={input} value={item.target_value} onChange={(e) => onPatch({ target_value: e.target.value }, true)}>
              <option value="">Choose a custom page…</option>
              {pages.map((p) => (
                <option key={p.slug} value={p.slug}>{p.title_en}</option>
              ))}
            </select>
          ) : (
            <input className={input} placeholder="https://…" value={item.target_value} onChange={(e) => onPatch({ target_value: e.target.value })} />
          )}
        </label>
      </div>

      {!item.target_value && (
        <p className="mt-2 text-xs font-bold text-amber-600">
          Pick a destination — until you do, this link goes nowhere.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Who sees it</span>
          <select className={input} value={item.visibility} onChange={(e) => onPatch({ visibility: e.target.value as NavItem["visibility"] }, true)}>
            <option value="all">Everyone</option>
            <option value="auth">Signed-in only</option>
            <option value="guest">Signed-out only</option>
            <option value="admin">Admins only</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Look</span>
          <select className={input} value={item.style} onChange={(e) => onPatch({ style: e.target.value }, true)}>
            {item.placement === "hero" ? (
              <>
                <option value="primary">Main button</option>
                <option value="secondary">Outlined button</option>
              </>
            ) : (
              <>
                <option value="link">Plain link</option>
                <option value="pill">Highlighted pill</option>
              </>
            )}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={!!item.coming_soon}
            onChange={(e) => onPatch({ coming_soon: e.target.checked }, true)}
          />
          Coming soon (shown but not clickable)
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onPatch({ visible: !item.visible }, true)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title={item.visible ? "Hide" : "Show"}>

            {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button type="button" onClick={() => onMove(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowUp size={16} /></button>
          <button type="button" onClick={() => onMove(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowDown size={16} /></button>
          <button type="button" onClick={onRemove} className="p-2 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={16} /></button>
        </div>
      </div>
    </div>
  );
}