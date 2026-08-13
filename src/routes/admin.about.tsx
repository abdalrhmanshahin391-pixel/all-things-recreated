import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchAboutBlocks, type AboutBlock } from "@/lib/support";

export const Route = createFileRoute("/admin/about")({
  head: () => ({
    meta: [
      { title: "About Page — Admin" },
      { name: "description", content: "Build the About us page: hero, story, mission cards, stats, team, and call to action." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAbout,
});

const input =
  "w-full px-3 py-2 border-2 border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary";
const labelCls = "block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1";

const KINDS = [
  { key: "hero", label: "Hero" },
  { key: "story", label: "Story / text" },
  { key: "cards", label: "Mission & vision cards" },
  { key: "stats", label: "Stats strip" },
  { key: "team", label: "Team members" },
  { key: "cta", label: "Call to action" },
];

function AdminAbout() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<AboutBlock[] | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  async function reload() {
    setBlocks(await fetchAboutBlocks());
  }
  useEffect(() => { void reload(); }, []);

  async function add(kind: string) {
    const { error } = await (supabase.from as any)("about_blocks").insert({
      kind,
      title_en: KINDS.find((k) => k.key === kind)?.label ?? "New section",
      sort_order: (blocks?.length ?? 0),
      extra: kind === "cards" || kind === "stats" || kind === "team" ? { items: [] } : {},
    });
    if (error) return toast.error(error.message);
    await reload();
  }

  async function patch(id: string, changes: Partial<AboutBlock>) {
    setBlocks((list) => (list ?? []).map((b) => (b.id === id ? { ...b, ...changes } : b)));
    const { error } = await (supabase.from as any)("about_blocks").update(changes).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function remove(id: string) {
    const { error } = await (supabase.from as any)("about_blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setBlocks((list) => (list ?? []).filter((b) => b.id !== id));
  }

  async function move(b: AboutBlock, dir: -1 | 1) {
    const ids = [...(blocks ?? [])].sort((x, y) => x.sort_order - y.sort_order).map((x) => x.id);
    const from = ids.indexOf(b.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    await Promise.all(ids.map((id, i) => (supabase.from as any)("about_blocks").update({ sort_order: i }).eq("id", id)));
    await reload();
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-5 pt-28 pb-24">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Administration
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">About Page</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Build the About us page block by block. Every block can be hidden, reordered, and written in both languages.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => add(k.key)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border bg-card text-xs font-black">
              <Plus size={13} /> {k.label}
            </button>
          ))}
        </div>

        {blocks === null ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="mt-8 space-y-4">
            {blocks.length === 0 && <p className="text-sm text-muted-foreground">No blocks yet — add one above.</p>}
            {[...blocks].sort((a, b) => a.sort_order - b.sort_order).map((b) => (
              <BlockEditor key={b.id} block={b} onPatch={(c) => patch(b.id, c)} onRemove={() => remove(b.id)} onMove={(d) => move(b, d)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockEditor({
  block, onPatch, onRemove, onMove,
}: {
  block: AboutBlock;
  onPatch: (c: Partial<AboutBlock>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const hasItems = ["cards", "stats", "team"].includes(block.kind);
  const items: any[] = Array.isArray(block.extra?.items) ? block.extra.items : [];

  function setItems(next: any[]) {
    onPatch({ extra: { ...block.extra, items: next } });
  }

  return (
    <section className="rounded-2xl border-2 border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black">{KINDS.find((k) => k.key === block.kind)?.label ?? block.kind}</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onPatch({ visible: !block.visible })} className="p-1.5 rounded-lg border-2 border-border">
            {block.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button type="button" onClick={() => onMove(-1)} className="p-1.5 rounded-lg border-2 border-border"><ArrowUp size={14} /></button>
          <button type="button" onClick={() => onMove(1)} className="p-1.5 rounded-lg border-2 border-border"><ArrowDown size={14} /></button>
          <button type="button" onClick={onRemove} className="p-1.5 rounded-lg border-2 border-border text-destructive"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block"><span className={labelCls}>Title (English)</span>
          <input className={input} defaultValue={block.title_en} onBlur={(e) => e.target.value !== block.title_en && onPatch({ title_en: e.target.value })} /></label>
        <label className="block"><span className={labelCls}>العنوان</span>
          <input dir="rtl" className={input} defaultValue={block.title_ar} onBlur={(e) => e.target.value !== block.title_ar && onPatch({ title_ar: e.target.value })} /></label>
      </div>

      {!hasItems && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block"><span className={labelCls}>Text (English)</span>
            <textarea className={`${input} min-h-[110px]`} defaultValue={block.body_en} onBlur={(e) => e.target.value !== block.body_en && onPatch({ body_en: e.target.value })} /></label>
          <label className="block"><span className={labelCls}>النص</span>
            <textarea dir="rtl" className={`${input} min-h-[110px]`} defaultValue={block.body_ar} onBlur={(e) => e.target.value !== block.body_ar && onPatch({ body_ar: e.target.value })} /></label>
        </div>
      )}

      {(block.kind === "hero" || block.kind === "story") && (
        <label className="block mt-3"><span className={labelCls}>Image address (optional)</span>
          <input className={input} placeholder="https://…" defaultValue={block.image_url} onBlur={(e) => e.target.value !== block.image_url && onPatch({ image_url: e.target.value })} /></label>
      )}

      {block.kind === "cta" && (
        <label className="block mt-3"><span className={labelCls}>Button goes to</span>
          <input className={input} placeholder="/courses" defaultValue={block.link_url} onBlur={(e) => e.target.value !== block.link_url && onPatch({ link_url: e.target.value })} /></label>
      )}

      {hasItems && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black">
              {block.kind === "stats" ? "Numbers" : block.kind === "team" ? "People" : "Cards"}
            </h3>
            <button type="button" onClick={() => setItems([...items, {}])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-black">
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {items.map((it, i) => {
              const set = (patchItem: any) => {
                const next = [...items];
                next[i] = { ...it, ...patchItem };
                setItems(next);
              };
              return (
                <div key={i} className="rounded-xl border-2 border-border p-3">
                  {block.kind === "stats" && (
                    <div className="grid gap-2 md:grid-cols-3">
                      <input className={input} placeholder="1,200" defaultValue={it.value ?? ""} onBlur={(e) => set({ value: e.target.value })} />
                      <input className={input} placeholder="Students" defaultValue={it.label_en ?? ""} onBlur={(e) => set({ label_en: e.target.value })} />
                      <input dir="rtl" className={input} placeholder="طالب" defaultValue={it.label_ar ?? ""} onBlur={(e) => set({ label_ar: e.target.value })} />
                    </div>
                  )}
                  {block.kind === "cards" && (
                    <div className="grid gap-2 md:grid-cols-2">
                      <input className={input} placeholder="Title (English)" defaultValue={it.title_en ?? ""} onBlur={(e) => set({ title_en: e.target.value })} />
                      <input dir="rtl" className={input} placeholder="العنوان" defaultValue={it.title_ar ?? ""} onBlur={(e) => set({ title_ar: e.target.value })} />
                      <textarea className={input} placeholder="Text (English)" defaultValue={it.body_en ?? ""} onBlur={(e) => set({ body_en: e.target.value })} />
                      <textarea dir="rtl" className={input} placeholder="النص" defaultValue={it.body_ar ?? ""} onBlur={(e) => set({ body_ar: e.target.value })} />
                    </div>
                  )}
                  {block.kind === "team" && (
                    <div className="grid gap-2 md:grid-cols-2">
                      <input className={input} placeholder="Name" defaultValue={it.name ?? ""} onBlur={(e) => set({ name: e.target.value })} />
                      <input className={input} placeholder="Photo address (https://…)" defaultValue={it.image_url ?? ""} onBlur={(e) => set({ image_url: e.target.value })} />
                      <input className={input} placeholder="Role (English)" defaultValue={it.role_en ?? ""} onBlur={(e) => set({ role_en: e.target.value })} />
                      <input dir="rtl" className={input} placeholder="الدور" defaultValue={it.role_ar ?? ""} onBlur={(e) => set({ role_ar: e.target.value })} />
                      <textarea className={input} placeholder="Short bio (English)" defaultValue={it.bio_en ?? ""} onBlur={(e) => set({ bio_en: e.target.value })} />
                      <textarea dir="rtl" className={input} placeholder="نبذة" defaultValue={it.bio_ar ?? ""} onBlur={(e) => set({ bio_ar: e.target.value })} />
                      <input className={input} placeholder="Link (optional)" defaultValue={it.link ?? ""} onBlur={(e) => set({ link: e.target.value })} />
                    </div>
                  )}
                  <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border text-xs font-black text-destructive">
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              );
            })}
            {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing added yet.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
