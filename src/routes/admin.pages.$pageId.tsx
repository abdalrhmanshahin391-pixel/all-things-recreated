import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { uploadSiteMedia } from "@/lib/site-media";
import {
  BUILT_IN_ROUTES,
  buildTree,
  useCustomPages,
  type SectionNode,
  type SiteBlock,
  type SitePage,
  type SiteSection,
} from "@/lib/site-structure";

export const Route = createFileRoute("/admin/pages/$pageId")({
  head: () => ({
    meta: [
      { title: "Edit page — Admin" },
      { name: "description", content: "Add sections, sub-sections and content blocks to this page." },
    ],
  }),
  component: PageBuilder,
});

const BLOCK_KINDS: Array<{ kind: string; label: string }> = [
  { kind: "heading", label: "Heading" },
  { kind: "text", label: "Paragraph" },
  { kind: "image", label: "Image" },
  { kind: "button", label: "Button" },
  { kind: "file", label: "PDF / file" },
  { kind: "video", label: "Video" },
  { kind: "cards", label: "Card grid" },
  { kind: "divider", label: "Divider" },
];

const input =
  "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400";

/** Reorder by rewriting sequential sort_order values for the whole group. */
async function reorder(table: string, ids: string[], id: string, dir: -1 | 1) {
  const from = ids.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  await Promise.all(
    next.map((rowId, i) => (supabase.from as any)(table).update({ sort_order: i }).eq("id", rowId)),
  );
}

function PageBuilder() {
  const { pageId } = Route.useParams();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<SitePage | null>(null);
  const [tree, setTree] = useState<SectionNode[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  async function reload() {
    const [{ data: p }, { data: sections }, { data: blocks }] = await Promise.all([
      (supabase.from as any)("site_pages").select("*").eq("id", pageId).maybeSingle(),
      (supabase.from as any)("site_sections").select("*").eq("page_id", pageId).order("sort_order"),
      (supabase.from as any)("site_blocks").select("*").order("sort_order"),
    ]);
    setPage((p ?? null) as SitePage | null);
    setTree(buildTree((sections ?? []) as SiteSection[], (blocks ?? []) as SiteBlock[]));
    setReady(true);
  }

  useEffect(() => {
    void reload();
  }, [pageId]);

  async function patchPage(changes: Partial<SitePage>) {
    setPage((p) => (p ? { ...p, ...changes } : p));
    const { error } = await (supabase.from as any)("site_pages").update(changes).eq("id", pageId);
    if (error) toast.error(error.message);
  }

  async function addSection(parentId: string | null, siblings: number) {
    const { error } = await (supabase.from as any)("site_sections").insert({
      page_id: pageId,
      parent_section_id: parentId,
      title_en: "New section",
      title_ar: "قسم جديد",
      layout: parentId ? "accordion" : "stack",
      visible: true,
      sort_order: siblings,
    });
    if (error) return toast.error(error.message);
    await reload();
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-32">
        <Link to="/admin/pages" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={14} /> All pages
        </Link>

        {!ready ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : !page ? (
          <p className="mt-10 text-slate-500">This page no longer exists.</p>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-black tracking-tight">{page.title_en}</h1>
            {page.is_system ? (
              <p className="mt-2 text-slate-600">
                This is a built-in page. Reorder or hide its sections, and add your own sections
                between them.
              </p>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Title (English)</span>
                    <input className={input} value={page.title_en} onChange={(e) => patchPage({ title_en: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">العنوان</span>
                    <input dir="rtl" className={input} value={page.title_ar ?? ""} onChange={(e) => patchPage({ title_ar: e.target.value })} />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Web address</span>
                    <input className={input} value={page.slug} onChange={(e) => patchPage({ slug: e.target.value })} />
                  </label>
                  <label className="flex items-center gap-2 mt-6">
                    <input type="checkbox" checked={page.published} onChange={(e) => patchPage({ published: e.target.checked })} />
                    <span className="text-sm font-bold">Published (visible to visitors)</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-8 space-y-4">
              {tree.map((node) => (
                <SectionEditor key={node.id} node={node} depth={0} siblings={tree} onChanged={reload} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => addSection(null, tree.length)}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
            >
              <Plus size={15} /> Add section
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SectionEditor({
  node,
  depth,
  siblings,
  onChanged,
}: {
  node: SectionNode;
  depth: number;
  siblings: SectionNode[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(depth === 0);

  async function patch(changes: Partial<SiteSection>) {
    const { error } = await (supabase.from as any)("site_sections").update(changes).eq("id", node.id);
    if (error) return toast.error(error.message);
    await onChanged();
  }

  async function remove() {
    if (!confirm("Delete this section and everything inside it?")) return;
    const { error } = await (supabase.from as any)("site_sections").delete().eq("id", node.id);
    if (error) return toast.error(error.message);
    await onChanged();
  }

  async function move(dir: -1 | 1) {
    await reorder("site_sections", siblings.map((s) => s.id), node.id, dir);
    await onChanged();
  }

  async function addBlock(kind: string) {
    const { error } = await (supabase.from as any)("site_blocks").insert({
      section_id: node.id,
      kind,
      content: kind === "cards" ? { items: [] } : {},
      visible: true,
      sort_order: node.blocks.length,
    });
    if (error) return toast.error(error.message);
    await onChanged();
  }

  async function addChild() {
    const { error } = await (supabase.from as any)("site_sections").insert({
      page_id: node.page_id,
      parent_section_id: node.id,
      title_en: "New sub-section",
      title_ar: "قسم فرعي",
      layout: "accordion",
      visible: true,
      sort_order: node.children.length,
    });
    if (error) return toast.error(error.message);
    await onChanged();
  }

  return (
    <div className={`rounded-2xl border bg-white ${depth === 0 ? "border-slate-200" : "border-slate-100"}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 text-left">
          <span className="font-black text-sm">
            {node.builtin_key ? `${node.builtin_key} (built-in)` : node.title_en || "Untitled section"}
          </span>
        </button>
        <button type="button" onClick={() => patch({ visible: !node.visible })} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          {node.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button type="button" onClick={() => move(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowUp size={16} /></button>
        <button type="button" onClick={() => move(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowDown size={16} /></button>
        {!node.builtin_key && (
          <button type="button" onClick={remove} className="p-2 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={16} /></button>
        )}
      </div>

      {open && !node.builtin_key && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Title (English)</span>
              <input className={input} defaultValue={node.title_en ?? ""} onBlur={(e) => patch({ title_en: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">العنوان</span>
              <input dir="rtl" className={input} defaultValue={node.title_ar ?? ""} onBlur={(e) => patch({ title_ar: e.target.value })} />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Intro (English)</span>
              <textarea rows={2} className={input} defaultValue={node.description_en ?? ""} onBlur={(e) => patch({ description_en: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">نص تعريفي</span>
              <textarea dir="rtl" rows={2} className={input} defaultValue={node.description_ar ?? ""} onBlur={(e) => patch({ description_ar: e.target.value })} />
            </label>
          </div>
          <label className="block max-w-xs">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Layout</span>
            <select className={input} value={node.layout} onChange={(e) => patch({ layout: e.target.value })}>
              <option value="stack">Stacked</option>
              <option value="grid">Two columns</option>
              <option value="accordion">Collapsible</option>
            </select>
          </label>

          <div className="space-y-3">
            {node.blocks
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((b) => (
                <BlockEditor key={b.id} block={b} siblings={node.blocks} onChanged={onChanged} />
              ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {BLOCK_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => addBlock(k.kind)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <Plus size={12} /> {k.label}
              </button>
            ))}
            <button
              type="button"
              onClick={addChild}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
            >
              <Plus size={12} /> Sub-section
            </button>
          </div>

          {node.children.length > 0 && (
            <div className="space-y-3 pl-3 border-l-2 border-slate-100">
              {node.children.map((c) => (
                <SectionEditor key={c.id} node={c} depth={depth + 1} siblings={node.children} onChanged={onChanged} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BlockEditor({
  block,
  siblings,
  onChanged,
}: {
  block: SiteBlock;
  siblings: SiteBlock[];
  onChanged: () => Promise<void>;
}) {
  const pages = useCustomPages(false);
  const [uploading, setUploading] = useState(false);
  const c = block.content ?? {};

  async function setContent(changes: Record<string, any>) {
    const { error } = await (supabase.from as any)("site_blocks")
      .update({ content: { ...c, ...changes } })
      .eq("id", block.id);
    if (error) return toast.error(error.message);
    await onChanged();
  }

  async function remove() {
    const { error } = await (supabase.from as any)("site_blocks").delete().eq("id", block.id);
    if (error) return toast.error(error.message);
    await onChanged();
  }

  async function move(dir: -1 | 1) {
    await reorder("site_blocks", siblings.map((b) => b.id), block.id, dir);
    await onChanged();
  }

  async function pickFile(file: File) {
    setUploading(true);
    try {
      const path = await uploadSiteMedia(file);
      await setContent({ path });
      toast.success("Uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex-1">
          {BLOCK_KINDS.find((k) => k.kind === block.kind)?.label ?? block.kind}
        </span>
        <button type="button" onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowUp size={14} /></button>
        <button type="button" onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowDown size={14} /></button>
        <button type="button" onClick={remove} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
      </div>

      <div className="mt-2 space-y-2">
        {(block.kind === "heading" || block.kind === "text") && (
          <div className="grid gap-2 md:grid-cols-2">
            <textarea rows={block.kind === "text" ? 3 : 1} className={input} placeholder="English" defaultValue={c.text_en ?? ""} onBlur={(e) => setContent({ text_en: e.target.value })} />
            <textarea dir="rtl" rows={block.kind === "text" ? 3 : 1} className={input} placeholder="العربية" defaultValue={c.text_ar ?? ""} onBlur={(e) => setContent({ text_ar: e.target.value })} />
          </div>
        )}

        {(block.kind === "image" || block.kind === "file" || block.kind === "video") && (
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50 w-fit">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {c.path ? "Replace file" : "Upload file"}
              <input
                type="file"
                className="hidden"
                accept={block.kind === "image" ? "image/*" : block.kind === "video" ? "video/*" : undefined}
                onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0]!)}
              />
            </label>
            {c.path && <p className="text-[11px] text-slate-500 break-all">{c.path}</p>}
            {block.kind === "video" && (
              <input className={input} placeholder="…or paste a YouTube/Vimeo link" defaultValue={c.url ?? ""} onBlur={(e) => setContent({ url: e.target.value })} />
            )}
            <div className="grid gap-2 md:grid-cols-2">
              <input className={input} placeholder={block.kind === "image" ? "Alt text (English)" : "Title (English)"} defaultValue={(block.kind === "image" ? c.alt_en : c.title_en) ?? ""} onBlur={(e) => setContent(block.kind === "image" ? { alt_en: e.target.value } : { title_en: e.target.value })} />
              <input dir="rtl" className={input} placeholder="العربية" defaultValue={(block.kind === "image" ? c.alt_ar : c.title_ar) ?? ""} onBlur={(e) => setContent(block.kind === "image" ? { alt_ar: e.target.value } : { title_ar: e.target.value })} />
            </div>
          </div>
        )}

        {block.kind === "button" && (
          <div className="space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              <input className={input} placeholder="Label (English)" defaultValue={c.label_en ?? ""} onBlur={(e) => setContent({ label_en: e.target.value })} />
              <input dir="rtl" className={input} placeholder="العربية" defaultValue={c.label_ar ?? ""} onBlur={(e) => setContent({ label_ar: e.target.value })} />
            </div>
            <TargetPicker
              kind={c.target_kind ?? "route"}
              value={c.target_value ?? ""}
              pages={pages}
              onChange={(target_kind, target_value) => setContent({ target_kind, target_value })}
            />
            <select className={input + " max-w-xs"} value={c.style ?? "primary"} onChange={(e) => setContent({ style: e.target.value })}>
              <option value="primary">Main button</option>
              <option value="secondary">Outlined button</option>
            </select>
          </div>
        )}

        {block.kind === "cards" && (
          <CardsEditor items={c.items ?? []} pages={pages} onChange={(items) => setContent({ items })} />
        )}
      </div>
    </div>
  );
}

function TargetPicker({
  kind,
  value,
  pages,
  onChange,
}: {
  kind: string;
  value: string;
  pages: Array<{ slug: string; title_en: string }>;
  onChange: (kind: string, value: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <select className={input} value={kind} onChange={(e) => onChange(e.target.value, "")}>
        <option value="route">Existing page</option>
        <option value="page">Custom page</option>
        <option value="url">Web address</option>
      </select>
      <div className="md:col-span-2">
        {kind === "route" ? (
          <select className={input} value={value} onChange={(e) => onChange(kind, e.target.value)}>
            <option value="">Choose a page…</option>
            {BUILT_IN_ROUTES.map((r) => (
              <option key={r.path} value={r.path}>{r.label}</option>
            ))}
          </select>
        ) : kind === "page" ? (
          <select className={input} value={value} onChange={(e) => onChange(kind, e.target.value)}>
            <option value="">Choose a custom page…</option>
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>{p.title_en}</option>
            ))}
          </select>
        ) : (
          <input className={input} placeholder="https://…" defaultValue={value} onBlur={(e) => onChange(kind, e.target.value)} />
        )}
      </div>
    </div>
  );
}

function CardsEditor({
  items,
  pages,
  onChange,
}: {
  items: any[];
  pages: Array<{ slug: string; title_en: string }>;
  onChange: (items: any[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-slate-100 p-2 space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <input className={input} placeholder="Card title (English)" defaultValue={item.title_en ?? ""} onBlur={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title_en: e.target.value } : x)))} />
            <input dir="rtl" className={input} placeholder="العنوان" defaultValue={item.title_ar ?? ""} onBlur={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title_ar: e.target.value } : x)))} />
          </div>
          <TargetPicker
            kind={item.target_kind ?? "route"}
            value={item.target_value ?? ""}
            pages={pages}
            onChange={(k, v) => onChange(items.map((x, j) => (j === i ? { ...x, target_kind: k, target_value: v } : x)))}
          />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-xs font-bold text-rose-500">
            Remove card
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { title_en: "New card", target_kind: "route", target_value: "/" }])}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600"
      >
        <Plus size={12} /> Add card
      </button>
    </div>
  );
}