import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
  Download, Sparkles, Image as ImageIcon, Save, Copy, Trash2, RefreshCw, Wand2, Upload, Plus, Camera, Undo2, Redo2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { AdCanvas } from "@/components/admin/adstudio/AdCanvas";
import { generateAdCopy, generateAdBackground, type AdCopyVariant } from "@/lib/ad-studio.functions";
import { AD_BUCKET, captureSitePage, resolveAdImage, uploadAdMedia } from "@/lib/ad-media";
import {
  AD_KINDS, BRAND, GRADIENTS, PATTERNS, SIZES, TEMPLATES, THEMES, baseDesign, blankDevice, blankPlan,
  normalizeDesign, telegramCaption, type AdDesign, type AdTemplate,
} from "@/lib/ad-studio";

export const Route = createFileRoute("/admin/ad-studio")({
  head: () => ({
    meta: [
      { title: "Ad Studio — AquaQBank" },
      { name: "description", content: "Design promo posters for Telegram from your courses, offers and announcements." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Ad Studio — AquaQBank" },
      { property: "og:description", content: "Create beautiful ads for your channel." },
    ],
  }),
  component: AdStudioPage,
});

const inputCls = "w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-sm";
const labelCls = "text-[10px] font-black uppercase tracking-widest text-muted-foreground";
const btn = "inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50";
const btnPrimary = "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black text-white disabled:opacity-50";

type SavedAd = {
  id: string;
  title: string;
  template: string;
  design: AdDesign;
  preview_path: string | null;
  updated_at: string;
};

/* ------------------------------------------------------------------ */

function AdStudioPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [design, setDesignRaw] = useState<AdDesign>(() => baseDesign());
  const history = useRef<{ past: AdDesign[]; future: AdDesign[] }>({ past: [], future: [] });
  const [title, setTitle] = useState("Untitled ad");
  const [adId, setAdId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [kind, setKind] = useState<AdTemplate["kind"]>("offer");
  const [tab, setTab] = useState<"content" | "layers" | "background" | "style" | "ai" | "saved">("content");
  const [busy, setBusy] = useState<string | null>(null);
  const [variants, setVariants] = useState<AdCopyVariant[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const aiCopy = useServerFn(generateAdCopy);
  const aiBg = useServerFn(generateAdBackground);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  const setDesign = useCallback((updater: (d: AdDesign) => AdDesign) => {
    setDesignRaw((d) => {
      history.current.past = [...history.current.past.slice(-40), d];
      history.current.future = [];
      return updater(d);
    });
  }, []);
  const patch = useCallback((p: Partial<AdDesign>) => setDesign((d) => ({ ...d, ...p })), [setDesign]);
  const patchField = useCallback(
    (key: "eyebrow" | "headline" | "subheadline" | "body", p: Record<string, unknown>) =>
      setDesign((d) => ({ ...d, [key]: { ...d[key], ...p } })),
    [setDesign],
  );
  function undo() {
    const prev = history.current.past.pop();
    if (!prev) return;
    setDesignRaw((cur) => { history.current.future = [cur, ...history.current.future].slice(0, 40); return prev; });
  }
  function redo() {
    const next = history.current.future.shift();
    if (!next) return;
    setDesignRaw((cur) => { history.current.past.push(cur); return next; });
  }

  /* ---------- resolve every image reference to a data URL ---------- */
  const imageRefs = useMemo(() => {
    const refs = new Set<string>();
    if (design.bg.image) refs.add(design.bg.image);
    design.devices.forEach((v) => v.image && refs.add(v.image));
    design.plans.forEach((p) => p.image && refs.add(p.image));
    return Array.from(refs);
  }, [design.bg.image, design.devices, design.plans]);

  useEffect(() => {
    let alive = true;
    const missing = imageRefs.filter((r) => !(r in urls));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(missing.map(async (r) => [r, await resolveAdImage(r)] as const));
      if (alive) setUrls((u) => ({ ...u, ...Object.fromEntries(entries) }));
    })();
    return () => { alive = false; };
  }, [imageRefs, urls]);

  const bgUrl = design.bg.image ? (urls[design.bg.image] ?? null) : null;

  /* ---------------- site data for auto-fill ---------------- */
  const { data: sources } = useQuery({
    queryKey: ["ad-studio-sources"],
    enabled: isAdmin,
    staleTime: 120_000,
    queryFn: async () => {
      const [courses, packages, coupons, unis, ann] = await Promise.all([
        supabase.from("courses").select("id,title,price,compare_at_price,currency,badge,image_url,discount_active").order("created_at", { ascending: false }).limit(60),
        supabase.from("packages").select("id,name,description,price,currency,package_type").order("sort_order").limit(40),
        supabase.from("coupons").select("id,code,discount_type,discount_value,expires_at,is_active").order("created_at", { ascending: false }).limit(40),
        supabase.from("universities").select("id,name,short_name,description,city,country,cover_path,storage_path").order("sort_order").limit(40),
        supabase.from("site_announcements").select("id,title,body,href,active").order("created_at", { ascending: false }).limit(20),
      ]);
      return {
        courses: courses.data ?? [],
        packages: packages.data ?? [],
        coupons: coupons.data ?? [],
        universities: unis.data ?? [],
        announcements: ann.data ?? [],
      };
    },
  });

  const { data: saved } = useQuery({
    queryKey: ["ad-creatives"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("ad_creatives")
        .select("id,title,template,design,preview_path,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedAd[];
    },
  });

  /* ---------------- export ---------------- */

  async function renderPng(sizeKey = design.size): Promise<string> {
    const node = canvasRef.current;
    if (!node) throw new Error("Canvas not ready");
    const s = SIZES[sizeKey];
    try { await (document as any).fonts?.ready; } catch { /* ignore */ }
    // two passes: the first warms images, the second renders them reliably
    const opts = { width: s.w, height: s.h, pixelRatio: 1, cacheBust: false, style: { transform: "none" } };
    await toPng(node, opts);
    return toPng(node, opts);
  }

  async function download() {
    setBusy("export");
    try {
      const missing = imageRefs.filter((r) => !urls[r]);
      if (missing.length) toast.warning("Some images could not be embedded — they may be missing from the PNG.");
      const url = await renderPng();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\w\u0600-\u06FF-]+/g, "-").toLowerCase() || "ad"}-${SIZES[design.size].w}.png`;
      a.click();
      toast.success("Downloaded — ready for Telegram");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAllSizes() {
    setBusy("export-all");
    const keys = Object.keys(SIZES) as (keyof typeof SIZES)[];
    const original = design.size;
    try {
      for (const k of keys) {
        setDesignRaw((d) => ({ ...d, size: k }));
        await new Promise((r) => setTimeout(r, 350));
        const url = await renderPng(k);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/[^\w-]+/g, "-").toLowerCase() || "ad"}-${SIZES[k].w}x${SIZES[k].h}.png`;
        a.click();
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success("All sizes downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDesignRaw((d) => ({ ...d, size: original }));
      setBusy(null);
    }
  }

  async function copyImage() {
    setBusy("copy");
    try {
      const url = await renderPng();
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Image copied");
    } catch {
      toast.error("Your browser blocked copying — use Download instead.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      const dataUrl = await renderPng();
      const blob = await (await fetch(dataUrl)).blob();
      const path = `previews/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      await supabase.storage.from(AD_BUCKET).upload(path, blob, { contentType: "image/png", upsert: false });

      const { data: userRes } = await supabase.auth.getUser();
      const owner = userRes.user?.id;
      const row = { title, template: design.template, design, preview_path: path, owner };
      if (adId) {
        const { error } = await (supabase.from as any)("ad_creatives").update(row).eq("id", adId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from as any)("ad_creatives").insert(row).select("id").single();
        if (error) throw error;
        setAdId(data.id);
      }
      await qc.invalidateQueries({ queryKey: ["ad-creatives"] });
      toast.success("Saved to your gallery");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------------- media ---------------- */

  async function uploadImage(file: File, target: "bg" | { device: number } | { plan: number }) {
    setBusy("upload");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const ref = await uploadAdMedia(file, target === "bg" ? "backgrounds" : "media", ext);
      applyImageRef(ref, target);
      toast.success("Image added");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function applyImageRef(ref: string, target: "bg" | { device: number } | { plan: number }) {
    setDesign((d) => {
      if (target === "bg") return { ...d, bg: { ...d.bg, type: "image", image: ref } };
      if ("device" in target) {
        const devices = d.devices.map((v, i) => (i === target.device ? { ...v, image: ref } : v));
        return { ...d, devices };
      }
      const plans = d.plans.map((p, i) => (i === target.plan ? { ...p, image: ref } : p));
      return { ...d, plans };
    });
  }

  const [capturePath, setCapturePath] = useState("/");
  async function captureSite(target: "bg" | { device: number }) {
    setBusy("capture");
    try {
      const blob = await captureSitePage(capturePath);
      const ref = await uploadAdMedia(blob, "screenshots", "png");
      applyImageRef(ref, target);
      toast.success("Page captured");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const [bgPrompt, setBgPrompt] = useState(
    "abstract navy and gold medical study atmosphere, soft light, elegant, cinematic depth",
  );
  async function makeAiBackground() {
    setBusy("ai-bg");
    try {
      const { b64 } = await aiBg({ data: { prompt: bgPrompt } });
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const ref = await uploadAdMedia(blob, "backgrounds", "png");
      setDesign((d) => ({ ...d, bg: { ...d.bg, type: "image", image: ref, overlay: Math.max(d.bg.overlay, 0.35) } }));
      toast.success("Background generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("confident");
  async function makeCopy() {
    setBusy("ai-copy");
    try {
      const { variants: v } = await aiCopy({ data: { brief, tone, kind: design.template } });
      setVariants(v);
      toast.success(`${v.length} copy ideas ready`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function applyVariant(v: AdCopyVariant, lang: "en" | "ar") {
    const s = (k: string) => (v as any)[`${k}_${lang}`] ?? "";
    setDesign((d) => ({
      ...d,
      dir: lang === "ar" ? "rtl" : "ltr",
      eyebrow: { ...d.eyebrow, text: s("eyebrow") },
      headline: { ...d.headline, text: s("headline") },
      subheadline: { ...d.subheadline, text: s("subheadline") },
      body: { ...d.body, text: s("body") },
      cta: { ...d.cta, text: s("cta") || d.cta.text },
    }));
  }

  function applyTemplate(id: string) {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setDesign((d) => tpl.apply({ ...d, template: id }));
  }

  /* ---------------- auto-fill ---------------- */
  function fillFromCourse(c: any) {
    const cur = c.currency || "JOD";
    setDesign((d) => ({
      ...d,
      eyebrow: { ...d.eyebrow, text: (c.badge || "NEW COURSE").toUpperCase() },
      headline: { ...d.headline, text: c.title ?? "" },
      subheadline: { ...d.subheadline, text: "Question bank, lectures and explanations — all in one place." },
      price: {
        ...d.price,
        show: true,
        value: c.price != null ? `${c.price} ${cur}` : "",
        old: c.compare_at_price ? `${c.compare_at_price} ${cur}` : "",
      },
      bg: c.image_url ? { ...d.bg, type: "image", image: `course:${c.image_url}`, overlay: 0.5 } : d.bg,
    }));
    toast.success("Filled from course");
  }
  function fillFromPackage(p: any) {
    setDesign((d) => ({
      ...d,
      eyebrow: { ...d.eyebrow, text: "BUNDLE" },
      headline: { ...d.headline, text: p.name ?? "" },
      subheadline: { ...d.subheadline, text: p.description ?? "" },
      price: { ...d.price, show: true, value: p.price != null ? `${p.price} ${p.currency || "JOD"}` : "", old: "" },
      plans: d.plans.map((pl, i) => (i === 0 ? { ...pl, title: p.name ?? pl.title, price: p.price != null ? `${p.price} ${p.currency || "JOD"}` : pl.price } : pl)),
    }));
    toast.success("Filled from package");
  }
  function fillFromCoupon(c: any) {
    const off = c.discount_type === "percent" ? `${c.discount_value}% OFF` : `${c.discount_value} OFF`;
    setDesign((d) => ({
      ...d,
      template: "coupon",
      layout: "stack",
      eyebrow: { ...d.eyebrow, text: off },
      headline: { ...d.headline, text: c.code },
      subheadline: { ...d.subheadline, text: c.expires_at ? `Valid until ${new Date(c.expires_at).toLocaleDateString()}` : "Use it at checkout" },
      ribbon: { ...d.ribbon, show: true, text: off },
    }));
    toast.success("Filled from coupon");
  }
  function fillFromUniversity(u: any) {
    setDesign((d) => ({
      ...d,
      template: "university",
      layout: "stack",
      eyebrow: { ...d.eyebrow, text: [u.city, u.country].filter(Boolean).join(", ").toUpperCase() },
      headline: { ...d.headline, text: u.name ?? "" },
      subheadline: { ...d.subheadline, text: u.description ?? "" },
      price: { ...d.price, show: false },
    }));
    toast.success("Filled from university");
  }
  function fillFromAnnouncement(a: any) {
    setDesign((d) => ({
      ...d,
      template: "announce",
      layout: "stack",
      eyebrow: { ...d.eyebrow, text: "ANNOUNCEMENT" },
      headline: { ...d.headline, text: a.title ?? "" },
      subheadline: { ...d.subheadline, text: a.body ?? "" },
      price: { ...d.price, show: false },
    }));
    toast.success("Filled from announcement");
  }

  function openSaved(a: SavedAd) {
    setDesignRaw(normalizeDesign(a.design));
    setTitle(a.title);
    setAdId(a.id);
    setTab("content");
    toast.success("Opened");
  }
  function duplicate() {
    setAdId(null);
    setTitle(`${title} copy`);
    toast.success("Duplicated — save it to keep the copy");
  }
  async function deleteSaved(a: SavedAd) {
    if (!confirm(`Delete “${a.title}”?`)) return;
    await (supabase.from as any)("ad_creatives").delete().eq("id", a.id);
    if (a.preview_path) await supabase.storage.from(AD_BUCKET).remove([a.preview_path]);
    if (adId === a.id) setAdId(null);
    await qc.invalidateQueries({ queryKey: ["ad-creatives"] });
  }

  const caption = useMemo(() => telegramCaption(design, "https://aquaqbank.com"), [design]);
  const size = SIZES[design.size];
  const gallery = useMemo(() => TEMPLATES.filter((t) => mode === "advanced" || t.kind === kind), [kind, mode]);

  if (loading || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-[1500px] px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Ad Studio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Posters for your Telegram channel — courses, packages, features, milestones, reminders.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} w-40`} placeholder="Ad name" />
            <select value={design.size} onChange={(e) => patch({ size: e.target.value as AdDesign["size"] })} className={`${inputCls} w-36`}>
              {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => (
                <option key={k} value={k}>{SIZES[k].name}</option>
              ))}
            </select>
            <button className={btn} onClick={undo} title="Undo"><Undo2 size={14} /></button>
            <button className={btn} onClick={redo} title="Redo"><Redo2 size={14} /></button>
            <button className={btn} onClick={() => { setDesignRaw(baseDesign()); setAdId(null); setTitle("Untitled ad"); }}>
              <Plus size={14} /> New
            </button>
            <button className={btn} onClick={duplicate}><Copy size={14} /> Duplicate</button>
            <button className={btn} disabled={busy === "save"} onClick={save}><Save size={14} /> Save</button>
            <button className={btn} disabled={busy === "copy"} onClick={copyImage}><Copy size={14} /> Copy image</button>
            <button className={btn} disabled={busy === "export-all"} onClick={downloadAllSizes}>All sizes</button>
            <button className={btnPrimary} style={{ background: BRAND.navy }} disabled={busy === "export"} onClick={download}>
              <Download size={14} /> Download PNG
            </button>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_480px]">
          {/* ---------------- preview ---------------- */}
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-border bg-card p-4">
              <div className="mx-auto" style={{ width: "min(100%, 620px)" }}>
                <div style={{ position: "relative", width: "100%", paddingTop: `${(size.h / size.w) * 100}%` }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      transform: "scale(var(--adscale))",
                      transformOrigin: "top left",
                      width: size.w,
                      height: size.h,
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const parent = el.parentElement!;
                      const set = () => el.style.setProperty("--adscale", String(parent.clientWidth / size.w));
                      set();
                      window.addEventListener("resize", set);
                    }}
                  >
                    <AdCanvas ref={canvasRef} design={design} bgUrl={bgUrl} urls={urls} />
                  </div>
                </div>
              </div>
            </div>

            {/* what is this ad + templates */}
            <div className="rounded-2xl border-2 border-border bg-card p-4">
              <div className={labelCls}>1 · What is this ad?</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AD_KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => { setKind(k.id); const first = TEMPLATES.find((t) => t.kind === k.id); if (first) applyTemplate(first.id); }}
                    title={k.hint}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${kind === k.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
                  >
                    {k.name}
                  </button>
                ))}
              </div>

              <div className={`${labelCls} mt-4`}>2 · Pick a look</div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {gallery.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    className={`rounded-xl border-2 p-3 text-left transition-transform hover:-translate-y-0.5 ${
                      design.template === t.id ? "border-primary bg-primary/10" : "border-border bg-background"
                    }`}
                  >
                    <div className="text-xs font-black text-foreground">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{t.hint}</div>
                  </button>
                ))}
              </div>

              <div className={`${labelCls} mt-4`}>3 · Colour theme</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button key={t.id} title={t.name} onClick={() => setDesign((d) => t.apply(d))}
                    className="flex items-center gap-1 rounded-lg border-2 border-border bg-background p-1.5">
                    {t.swatch.map((c) => <span key={c} className="h-5 w-5 rounded" style={{ background: c }} />)}
                    <span className="px-1 text-[10px] font-bold">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* caption */}
            <div className="rounded-2xl border-2 border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className={labelCls}>Telegram caption</div>
                <button className={btn} onClick={() => { navigator.clipboard.writeText(caption); toast.success("Caption copied"); }}>
                  <Copy size={13} /> Copy
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{caption}</pre>
            </div>
          </div>

          {/* ---------------- editor ---------------- */}
          <div className="rounded-2xl border-2 border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {(["simple", "advanced"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black capitalize ${mode === m ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                    {m}
                  </button>
                ))}
              </div>
              {mode === "advanced" && (
                <div className="flex flex-wrap gap-1.5">
                  {(["content", "layers", "background", "style", "ai", "saved"] as const).map((k) => (
                    <button key={k} onClick={() => setTab(k)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black capitalize ${tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {k}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-5 max-h-[72vh] overflow-y-auto pr-1">
              {mode === "simple" && (
                <SimpleTab
                  design={design}
                  patch={patch}
                  patchField={patchField}
                  setDesign={setDesign}
                  sources={sources}
                  onCourse={fillFromCourse}
                  onPackage={fillFromPackage}
                  onCoupon={fillFromCoupon}
                  onUniversity={fillFromUniversity}
                  onAnnouncement={fillFromAnnouncement}
                  onUpload={(f: File) => uploadImage(f, "bg")}
                  onCapture={() => captureSite("bg")}
                  capturePath={capturePath}
                  setCapturePath={setCapturePath}
                  busy={busy}
                />
              )}

              {mode === "advanced" && tab === "content" && (
                <ContentTab
                  design={design}
                  patch={patch}
                  patchField={patchField}
                  sources={sources}
                  onCourse={fillFromCourse}
                  onPackage={fillFromPackage}
                  onCoupon={fillFromCoupon}
                  onUniversity={fillFromUniversity}
                  onAnnouncement={fillFromAnnouncement}
                />
              )}

              {mode === "advanced" && tab === "layers" && (
                <LayersTab
                  design={design}
                  patch={patch}
                  setDesign={setDesign}
                  onUploadDevice={(i: number, f: File) => uploadImage(f, { device: i })}
                  onUploadPlan={(i: number, f: File) => uploadImage(f, { plan: i })}
                  onCaptureDevice={(i: number) => captureSite({ device: i })}
                  capturePath={capturePath}
                  setCapturePath={setCapturePath}
                  busy={busy}
                />
              )}

              {mode === "advanced" && tab === "background" && (
                <BackgroundTab
                  design={design}
                  patch={patch}
                  onUpload={(f: File) => uploadImage(f, "bg")}
                  busy={busy}
                  bgPrompt={bgPrompt}
                  setBgPrompt={setBgPrompt}
                  onAi={makeAiBackground}
                  courses={sources?.courses ?? []}
                  capturePath={capturePath}
                  setCapturePath={setCapturePath}
                  onCapture={() => captureSite("bg")}
                />
              )}

              {mode === "advanced" && tab === "style" && <StyleTab design={design} patch={patch} />}

              {mode === "advanced" && tab === "ai" && (
                <div className="space-y-3">
                  <div>
                    <div className={labelCls}>What is this ad about?</div>
                    <textarea
                      rows={5}
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder="e.g. Pathology question bank for 4th year, 1200 questions with explanations, 20% off until Friday"
                      className={`${inputCls} mt-1`}
                    />
                  </div>
                  <div>
                    <div className={labelCls}>Tone</div>
                    <select value={tone} onChange={(e) => setTone(e.target.value)} className={`${inputCls} mt-1`}>
                      {["confident", "friendly", "urgent", "academic", "playful", "premium", "motivational"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <button className={btnPrimary} style={{ background: BRAND.navy }} disabled={busy === "ai-copy"} onClick={makeCopy}>
                    {busy === "ai-copy" ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />} Write the copy
                  </button>

                  {variants.map((v, i) => (
                    <div key={i} className="rounded-xl border-2 border-border bg-background p-3">
                      <div className="text-xs font-black text-foreground">{v.headline_en}</div>
                      <div className="text-xs text-muted-foreground">{v.subheadline_en}</div>
                      <div className="mt-1 text-xs font-bold text-foreground" dir="rtl">{v.headline_ar}</div>
                      <div className="mt-2 flex gap-2">
                        <button className={btn} onClick={() => applyVariant(v, "en")}>Use English</button>
                        <button className={btn} onClick={() => applyVariant(v, "ar")}>استخدم العربية</button>
                        <button className={btn} onClick={() => { navigator.clipboard.writeText(v.caption_en || ""); toast.success("Caption copied"); }}>
                          <Copy size={12} /> Caption
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mode === "advanced" && tab === "saved" && (
                <div className="grid grid-cols-2 gap-3">
                  {(saved ?? []).map((a) => (
                    <div key={a.id} className="rounded-xl border-2 border-border bg-background p-3">
                      <div className="text-xs font-black text-foreground truncate">{a.title}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(a.updated_at).toLocaleString()}</div>
                      <div className="mt-2 flex gap-2">
                        <button className={btn} onClick={() => openSaved(a)}>Open</button>
                        <button className={btn} onClick={() => deleteSaved(a)}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                  {(saved ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nothing saved yet — press Save to keep an ad here.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Slider({
  label, value, min, max, step = 1, onChange,
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className={labelCls}>{label} · {value}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border-2 border-border bg-background" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      </div>
    </label>
  );
}

function AlignPicker({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {(["auto", "left", "center", "right"] as const).map((a) => (
        <button key={a} onClick={() => onChange(a)}
          className={`rounded-md px-2 py-1 text-[10px] font-bold capitalize ${(value ?? "auto") === a ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
          {a}
        </button>
      ))}
    </div>
  );
}

function ListEditor({
  items, onChange, placeholder,
}: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={t}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className={inputCls}
          />
          <button className={btn} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
          <button className={btn} disabled={i === 0} onClick={() => {
            const next = [...items]; const tmp = next[i - 1]!; next[i - 1] = next[i]!; next[i] = tmp; onChange(next);
          }}>↑</button>
        </div>
      ))}
      <button className={btn} onClick={() => onChange([...items, ""])}><Plus size={12} /> Add line</button>
    </div>
  );
}

function TextBlock({
  name, f, onPatch,
}: { name: string; f: AdDesign["headline"]; onPatch: (p: Record<string, unknown>) => void }) {
  return (
    <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className={labelCls}>{name}</span>
        <label className="flex items-center gap-1 text-[10px] font-bold">
          <input type="checkbox" checked={f.show} onChange={(e) => onPatch({ show: e.target.checked })} /> show
        </label>
      </div>
      <textarea rows={name === "Body" ? 4 : 2} value={f.text} onChange={(e) => onPatch({ text: e.target.value })} className={inputCls} />
      <div className="flex items-center justify-between gap-2">
        <span className={labelCls}>Align</span>
        <AlignPicker value={f.align} onChange={(v) => onPatch({ align: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Accent word"><input value={f.accentWord ?? ""} onChange={(e) => onPatch({ accentWord: e.target.value })} className={inputCls} /></Row>
        <Color label="Accent colour" value={f.accentColor ?? "#D4AF37"} onChange={(v) => onPatch({ accentColor: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Size" value={f.size} min={14} max={220} onChange={(v) => onPatch({ size: v })} />
        <Slider label="Weight" value={f.weight} min={300} max={900} step={100} onChange={(v) => onPatch({ weight: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Color label="Colour" value={f.color} onChange={(v) => onPatch({ color: v })} />
        <Slider label="Tracking" value={f.letterSpacing ?? 0} min={-6} max={16} onChange={(v) => onPatch({ letterSpacing: v })} />
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] font-bold">
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.uppercase} onChange={(e) => onPatch({ uppercase: e.target.checked })} /> UPPERCASE</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.underline} onChange={(e) => onPatch({ underline: e.target.checked })} /> underline</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.shadow} onChange={(e) => onPatch({ shadow: e.target.checked })} /> shadow</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.outline} onChange={(e) => onPatch({ outline: e.target.checked })} /> outline</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.italic} onChange={(e) => onPatch({ italic: e.target.checked })} /> italic</label>
      </div>
    </div>
  );
}

function SourcePicker({ sources, onCourse, onPackage, onCoupon, onUniversity, onAnnouncement }: any) {
  const [src, setSrc] = useState<"courses" | "packages" | "coupons" | "universities" | "announcements">("courses");
  const list: any[] = sources?.[src] ?? [];
  return (
    <div className="rounded-xl border-2 border-border bg-background p-3">
      <div className={labelCls}>Fill from the site</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["courses", "packages", "coupons", "universities", "announcements"] as const).map((k) => (
          <button key={k} onClick={() => setSrc(k)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize ${src === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
        {list.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              src === "courses" ? onCourse(item)
              : src === "packages" ? onPackage(item)
              : src === "coupons" ? onCoupon(item)
              : src === "universities" ? onUniversity(item)
              : onAnnouncement(item)
            }
            className="w-full truncate rounded-lg border border-border bg-card px-2 py-1.5 text-left text-xs font-semibold hover:bg-muted"
          >
            {item.title ?? item.name ?? item.code}
          </button>
        ))}
        {list.length === 0 && <p className="text-[11px] text-muted-foreground">Nothing here yet.</p>}
      </div>
    </div>
  );
}

/* --------------------------- SIMPLE MODE --------------------------- */

function SimpleTab({
  design: d, patch, patchField, setDesign, sources, onCourse, onPackage, onCoupon, onUniversity, onAnnouncement,
  onUpload, onCapture, capturePath, setCapturePath, busy,
}: any) {
  return (
    <div className="space-y-4">
      <SourcePicker sources={sources} onCourse={onCourse} onPackage={onPackage} onCoupon={onCoupon}
        onUniversity={onUniversity} onAnnouncement={onAnnouncement} />

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className={labelCls}>Words</div>
        <Row label="Small line on top"><input value={d.eyebrow.text} onChange={(e) => patchField("eyebrow", { text: e.target.value })} className={inputCls} /></Row>
        <Row label="Headline"><textarea rows={2} value={d.headline.text} onChange={(e) => patchField("headline", { text: e.target.value })} className={inputCls} /></Row>
        <Row label="Word to highlight"><input value={d.headline.accentWord ?? ""} onChange={(e) => patchField("headline", { accentWord: e.target.value })} className={inputCls} placeholder="e.g. MINORS" /></Row>
        <Row label="Supporting line"><textarea rows={2} value={d.subheadline.text} onChange={(e) => patchField("subheadline", { text: e.target.value })} className={inputCls} /></Row>
        <div className="grid grid-cols-3 gap-2">
          <Row label="Price"><input value={d.price.value} onChange={(e) => patch({ price: { ...d.price, value: e.target.value, show: true } })} className={inputCls} /></Row>
          <Row label="Was"><input value={d.price.old} onChange={(e) => patch({ price: { ...d.price, old: e.target.value } })} className={inputCls} /></Row>
          <Row label="Button"><input value={d.cta.text} onChange={(e) => patch({ cta: { ...d.cta, text: e.target.value } })} className={inputCls} /></Row>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={labelCls}>Everything centred</span>
          <input type="checkbox" checked={d.align === "center"} onChange={(e) => patch({ align: e.target.checked ? "center" : "left" })} />
        </div>
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Tick list</span>
          <label className="flex items-center gap-1 text-[10px] font-bold">
            <input type="checkbox" checked={d.bulletsShow} onChange={(e) => patch({ bulletsShow: e.target.checked })} /> show
          </label>
        </div>
        <ListEditor items={d.bullets} onChange={(v: string[]) => patch({ bullets: v })} placeholder="What they get" />
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className={labelCls}>Background</div>
        <div className="grid grid-cols-5 gap-2">
          {GRADIENTS.slice(0, 10).map((g) => (
            <button key={g.name} title={g.name}
              onClick={() => patch({ bg: { ...d.bg, type: "gradient", from: g.from, to: g.to, angle: g.angle, image: null } })}
              className="h-10 rounded-lg border-2 border-border"
              style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`${btn} cursor-pointer`}>
            <Upload size={13} /> Upload photo
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          </label>
          {d.bg.image && (
            <button className={btn} onClick={() => patch({ bg: { ...d.bg, type: "gradient", image: null } })}><Trash2 size={12} /> Remove</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input value={capturePath} onChange={(e) => setCapturePath(e.target.value)} className={inputCls} placeholder="/ or /u/ysmu" />
          <button className={btn} disabled={busy === "capture"} onClick={onCapture}><Camera size={13} /> Capture page</button>
        </div>
        <Slider label="Darken" value={Math.round(d.bg.overlay * 100)} min={0} max={90} onChange={(v: number) => patch({ bg: { ...d.bg, overlay: v / 100 } })} />
      </div>

      {d.layout === "plans" && <PlansEditor design={d} setDesign={setDesign} />}
      {(d.layout === "stats") && <StatsEditor design={d} patch={patch} />}
    </div>
  );
}

/* --------------------------- ADVANCED TABS --------------------------- */

function ContentTab({
  design: d, patch, patchField, sources, onCourse, onPackage, onCoupon, onUniversity, onAnnouncement,
}: any) {
  return (
    <div className="space-y-4">
      <SourcePicker sources={sources} onCourse={onCourse} onPackage={onPackage} onCoupon={onCoupon}
        onUniversity={onUniversity} onAnnouncement={onAnnouncement} />

      <TextBlock name="Eyebrow" f={d.eyebrow} onPatch={(p) => patchField("eyebrow", p)} />
      <TextBlock name="Headline" f={d.headline} onPatch={(p) => patchField("headline", p)} />
      <TextBlock name="Subheadline" f={d.subheadline} onPatch={(p) => patchField("subheadline", p)} />
      <TextBlock name="Body" f={d.body} onPatch={(p) => patchField("body", p)} />

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Tick list</span>
          <label className="flex items-center gap-1 text-[10px] font-bold">
            <input type="checkbox" checked={d.bulletsShow} onChange={(e) => patch({ bulletsShow: e.target.checked })} /> show
          </label>
        </div>
        <ListEditor items={d.bullets} onChange={(v: string[]) => patch({ bullets: v })} placeholder="What they get" />
        <div className="grid grid-cols-2 gap-2">
          <Row label="Icon">
            <select value={d.bulletIcon} onChange={(e) => patch({ bulletIcon: e.target.value })} className={inputCls}>
              <option value="check">Check</option><option value="dot">Dot</option><option value="star">Star</option>
              <option value="arrow">Arrow</option><option value="spark">Spark</option>
            </select>
          </Row>
          <Slider label="Size" value={d.bulletSize} min={16} max={60} onChange={(v: number) => patch({ bulletSize: v })} />
        </div>
        <Color label="Text colour" value={d.bulletColor} onChange={(v: string) => patch({ bulletColor: v })} />
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Ribbon</span>
          <label className="flex items-center gap-1 text-[10px] font-bold">
            <input type="checkbox" checked={d.ribbon.show} onChange={(e) => patch({ ribbon: { ...d.ribbon, show: e.target.checked } })} /> show
          </label>
        </div>
        <input value={d.ribbon.text} onChange={(e) => patch({ ribbon: { ...d.ribbon, text: e.target.value } })} className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <Color label="Ribbon" value={d.ribbon.color} onChange={(v) => patch({ ribbon: { ...d.ribbon, color: v } })} />
          <Color label="Ribbon text" value={d.ribbon.textColor} onChange={(v) => patch({ ribbon: { ...d.ribbon, textColor: v } })} />
        </div>
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Price</span>
          <label className="flex items-center gap-1 text-[10px] font-bold">
            <input type="checkbox" checked={d.price.show} onChange={(e) => patch({ price: { ...d.price, show: e.target.checked } })} /> show
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Row label="Now"><input value={d.price.value} onChange={(e) => patch({ price: { ...d.price, value: e.target.value } })} className={inputCls} /></Row>
          <Row label="Was"><input value={d.price.old} onChange={(e) => patch({ price: { ...d.price, old: e.target.value } })} className={inputCls} /></Row>
          <Row label="Note"><input value={d.price.note} onChange={(e) => patch({ price: { ...d.price, note: e.target.value } })} className={inputCls} /></Row>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Slider label="Price size" value={d.price.size} min={40} max={220} onChange={(v: number) => patch({ price: { ...d.price, size: v } })} />
          <Color label="Price colour" value={d.price.color} onChange={(v: string) => patch({ price: { ...d.price, color: v } })} />
        </div>
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Call to action</span>
          <label className="flex items-center gap-1 text-[10px] font-bold">
            <input type="checkbox" checked={d.cta.show} onChange={(e) => patch({ cta: { ...d.cta, show: e.target.checked } })} /> show
          </label>
        </div>
        <input value={d.cta.text} onChange={(e) => patch({ cta: { ...d.cta, text: e.target.value } })} className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <Color label="Button" value={d.cta.bg} onChange={(v) => patch({ cta: { ...d.cta, bg: v } })} />
          <Color label="Label" value={d.cta.color} onChange={(v) => patch({ cta: { ...d.cta, color: v } })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Slider label="Roundness" value={d.cta.radius} min={0} max={999} onChange={(v: number) => patch({ cta: { ...d.cta, radius: v } })} />
          <Slider label="Size" value={d.cta.size} min={16} max={64} onChange={(v: number) => patch({ cta: { ...d.cta, size: v } })} />
        </div>
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Footer line</span>
          <label className="flex items-center gap-1 text-[10px] font-bold">
            <input type="checkbox" checked={d.footer.show} onChange={(e) => patch({ footer: { ...d.footer, show: e.target.checked } })} /> show
          </label>
        </div>
        <input value={d.footer.text} onChange={(e) => patch({ footer: { ...d.footer, text: e.target.value } })} className={inputCls} />
      </div>
    </div>
  );
}

function PlansEditor({ design: d, setDesign }: any) {
  const setPlan = (i: number, p: any) =>
    setDesign((cur: AdDesign) => ({ ...cur, plans: cur.plans.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  return (
    <div className="space-y-3">
      {d.plans.map((p: any, i: number) => (
        <div key={i} className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Card {i + 1}</span>
            <button className={btn} onClick={() => setDesign((cur: AdDesign) => ({ ...cur, plans: cur.plans.filter((_, j) => j !== i) }))}>
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Name"><input value={p.title} onChange={(e) => setPlan(i, { title: e.target.value })} className={inputCls} /></Row>
            <Row label="Small line"><input value={p.subtitle} onChange={(e) => setPlan(i, { subtitle: e.target.value })} className={inputCls} /></Row>
            <Row label="Price"><input value={p.price} onChange={(e) => setPlan(i, { price: e.target.value })} className={inputCls} /></Row>
            <Row label="Was"><input value={p.old} onChange={(e) => setPlan(i, { old: e.target.value })} className={inputCls} /></Row>
            <Row label="Badge (auto if empty)"><input value={p.save} onChange={(e) => setPlan(i, { save: e.target.value })} className={inputCls} /></Row>
            <Row label="Note"><input value={p.note} onChange={(e) => setPlan(i, { note: e.target.value })} className={inputCls} /></Row>
          </div>
          <ListEditor items={p.bullets} onChange={(v: string[]) => setPlan(i, { bullets: v })} placeholder="Included" />
          <div className="grid grid-cols-2 gap-2">
            <Color label="Card colour" value={p.bg} onChange={(v) => setPlan(i, { bg: v })} />
            <Color label="Text" value={p.color} onChange={(v) => setPlan(i, { color: v })} />
          </div>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={p.highlight} onChange={(e) => setPlan(i, { highlight: e.target.checked })} /> Highlight this card
          </label>
        </div>
      ))}
      <button className={btn} onClick={() => setDesign((cur: AdDesign) => ({ ...cur, plans: [...cur.plans, blankPlan("New plan")] }))}>
        <Plus size={12} /> Add card
      </button>
    </div>
  );
}

function StatsEditor({ design: d, patch }: any) {
  return (
    <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
      <div className={labelCls}>Numbers</div>
      {d.stats.map((s: any, i: number) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input value={s.value} onChange={(e) => patch({ stats: d.stats.map((x: any, j: number) => (j === i ? { ...x, value: e.target.value } : x)) })} className={inputCls} />
          <input value={s.label} onChange={(e) => patch({ stats: d.stats.map((x: any, j: number) => (j === i ? { ...x, label: e.target.value } : x)) })} className={inputCls} />
          <button className={btn} onClick={() => patch({ stats: d.stats.filter((_: any, j: number) => j !== i) })}><Trash2 size={12} /></button>
        </div>
      ))}
      <button className={btn} onClick={() => patch({ stats: [...d.stats, { value: "100+", label: "Something" }] })}><Plus size={12} /> Add number</button>
    </div>
  );
}

function LayersTab({
  design: d, patch, setDesign, onUploadDevice, onUploadPlan, onCaptureDevice, capturePath, setCapturePath, busy,
}: any) {
  const setDevice = (i: number, p: any) =>
    setDesign((cur: AdDesign) => ({ ...cur, devices: cur.devices.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-border bg-background p-3">
        <div className={labelCls}>Capture a page of your website</div>
        <div className="mt-2 flex items-center gap-2">
          <input value={capturePath} onChange={(e) => setCapturePath(e.target.value)} className={inputCls} placeholder="/ or /u/ysmu" />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Pick a device below and press “Capture page” to put your site inside it.</p>
      </div>

      {d.devices.map((v: any, i: number) => (
        <div key={i} className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Device {i + 1}</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] font-bold">
                <input type="checkbox" checked={v.show} onChange={(e) => setDevice(i, { show: e.target.checked })} /> show
              </label>
              <button className={btn} onClick={() => setDesign((cur: AdDesign) => ({ ...cur, devices: cur.devices.filter((_, j) => j !== i) }))}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <Row label="Frame">
            <select value={v.kind} onChange={(e) => setDevice(i, { kind: e.target.value })} className={inputCls}>
              <option value="ipad">iPad (portrait)</option>
              <option value="ipad-land">iPad (landscape)</option>
              <option value="iphone">iPhone</option>
              <option value="macbook">MacBook</option>
              <option value="browser">Browser window</option>
              <option value="screen">Plain screen</option>
            </select>
          </Row>
          <div className="flex flex-wrap gap-2">
            <label className={`${btn} cursor-pointer`}>
              <Upload size={13} /> Upload screenshot
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadDevice(i, f); }} />
            </label>
            <button className={btn} disabled={busy === "capture"} onClick={() => onCaptureDevice(i)}><Camera size={13} /> Capture page</button>
            {v.image && <button className={btn} onClick={() => setDevice(i, { image: null })}><Trash2 size={12} /> Clear</button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Slider label="X %" value={v.x} min={0} max={100} onChange={(n: number) => setDevice(i, { x: n })} />
            <Slider label="Y %" value={v.y} min={0} max={100} onChange={(n: number) => setDevice(i, { y: n })} />
            <Slider label="Scale" value={v.scale} min={30} max={220} onChange={(n: number) => setDevice(i, { scale: n })} />
            <Slider label="Rotate" value={v.rotate} min={-30} max={30} onChange={(n: number) => setDevice(i, { rotate: n })} />
          </div>
          <div className="flex gap-4 text-[10px] font-bold">
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.shadow} onChange={(e) => setDevice(i, { shadow: e.target.checked })} /> shadow</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.glow} onChange={(e) => setDevice(i, { glow: e.target.checked })} /> glow</label>
          </div>
        </div>
      ))}
      <button className={btn} onClick={() => setDesign((cur: AdDesign) => ({ ...cur, devices: [...cur.devices, blankDevice("iphone")] }))}>
        <Plus size={12} /> Add device
      </button>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className={labelCls}>Comparison cards</div>
        <PlansEditor design={d} setDesign={setDesign} />
        <div className="pt-2">
          <div className={labelCls}>Card images</div>
          {d.plans.map((p: any, i: number) => (
            <label key={i} className={`${btn} mt-2 cursor-pointer`}>
              <Upload size={13} /> Image for “{p.title}”
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPlan(i, f); }} />
            </label>
          ))}
        </div>
      </div>

      <StatsEditor design={d} patch={patch} />
    </div>
  );
}

function BackgroundTab({
  design: d, patch, onUpload, busy, bgPrompt, setBgPrompt, onAi, courses, capturePath, setCapturePath, onCapture,
}: any) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["gradient", "solid", "diagonal", "image"] as const).map((k) => (
          <button key={k} onClick={() => patch({ bg: { ...d.bg, type: k } })}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize ${d.bg.type === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
            {k}
          </button>
        ))}
      </div>

      <div>
        <div className={labelCls}>Gradient presets</div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {GRADIENTS.map((g) => (
            <button
              key={g.name}
              title={g.name}
              onClick={() => patch({ bg: { ...d.bg, type: "gradient", from: g.from, to: g.to, angle: g.angle } })}
              className="h-12 rounded-lg border-2 border-border"
              style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Color label="From" value={d.bg.from} onChange={(v) => patch({ bg: { ...d.bg, from: v } })} />
        <Color label="To" value={d.bg.to} onChange={(v) => patch({ bg: { ...d.bg, to: v } })} />
      </div>
      <Slider label="Angle" value={d.bg.angle} min={0} max={360} onChange={(v: number) => patch({ bg: { ...d.bg, angle: v } })} />
      {d.bg.type === "diagonal" && (
        <Slider label="Split position" value={d.bg.split ?? 45} min={10} max={90} onChange={(v: number) => patch({ bg: { ...d.bg, split: v } })} />
      )}
      <Color label="Solid colour" value={d.bg.color} onChange={(v) => patch({ bg: { ...d.bg, color: v } })} />

      <Row label="Pattern">
        <select value={d.bg.pattern} onChange={(e) => patch({ bg: { ...d.bg, pattern: e.target.value } })} className={inputCls}>
          {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className={labelCls}>Image background</div>
        <div className="flex flex-wrap gap-2">
          <label className={`${btn} cursor-pointer`}>
            <Upload size={13} /> Upload image
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          </label>
          <button className={btn} disabled={busy === "capture"} onClick={onCapture}><Camera size={13} /> Capture page</button>
        </div>
        <input value={capturePath} onChange={(e) => setCapturePath(e.target.value)} className={inputCls} placeholder="/ or /u/ysmu" />
        <div className="text-[11px] text-muted-foreground">Or reuse a course image:</div>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {(courses as any[]).filter((c) => c.image_url).map((c) => (
            <button key={c.id}
              onClick={() => patch({ bg: { ...d.bg, type: "image", image: `course:${c.image_url}`, overlay: Math.max(d.bg.overlay, 0.4) } })}
              className="w-full truncate rounded-lg border border-border bg-card px-2 py-1 text-left text-[11px] font-semibold hover:bg-muted">
              {c.title}
            </button>
          ))}
        </div>
        {d.bg.image && (
          <button className={btn} onClick={() => patch({ bg: { ...d.bg, type: "gradient", image: null } })}>
            <Trash2 size={12} /> Remove image
          </button>
        )}
        <Slider label="Darken" value={Math.round(d.bg.overlay * 100)} min={0} max={90} onChange={(v: number) => patch({ bg: { ...d.bg, overlay: v / 100 } })} />
        <Slider label="Blur" value={d.bg.blur} min={0} max={30} onChange={(v: number) => patch({ bg: { ...d.bg, blur: v } })} />
        <Slider label="Zoom" value={d.bg.zoom} min={100} max={200} onChange={(v: number) => patch({ bg: { ...d.bg, zoom: v } })} />
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className={labelCls}>Generate a background with AI</div>
        <textarea rows={3} value={bgPrompt} onChange={(e) => setBgPrompt(e.target.value)} className={inputCls} />
        <button className={btnPrimary} style={{ background: BRAND.navy }} disabled={busy === "ai-bg"} onClick={onAi}>
          {busy === "ai-bg" ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate background
        </button>
        <p className="text-[10px] text-muted-foreground">
          <ImageIcon size={10} className="inline" /> The AI only draws artwork — your text stays sharp and editable on top.
        </p>
      </div>
    </div>
  );
}

function StyleTab({ design: d, patch }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Row label="Layout">
          <select value={d.layout} onChange={(e) => patch({ layout: e.target.value })} className={inputCls}>
            <option value="stack">Simple stack</option>
            <option value="split">Split headline</option>
            <option value="plans">Comparison cards</option>
            <option value="deal">Deal + image</option>
            <option value="feature">Feature launch</option>
            <option value="stats">Milestone numbers</option>
          </select>
        </Row>
        <Row label="Size">
          <select value={d.size} onChange={(e) => patch({ size: e.target.value })} className={inputCls}>
            {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => (
              <option key={k} value={k}>{SIZES[k].name}</option>
            ))}
          </select>
        </Row>
        <Row label="Language / direction">
          <select value={d.dir} onChange={(e) => patch({ dir: e.target.value })} className={inputCls}>
            <option value="ltr">English (left to right)</option>
            <option value="rtl">العربية (right to left)</option>
          </select>
        </Row>
        <Row label="Font">
          <select value={d.font} onChange={(e) => patch({ font: e.target.value })} className={inputCls}>
            <option value="display">Display</option>
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
          </select>
        </Row>
        <Row label="Text alignment">
          <select value={d.align} onChange={(e) => patch({ align: e.target.value })} className={inputCls}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </Row>
        <Row label="Vertical position">
          <select value={d.vertical} onChange={(e) => patch({ vertical: e.target.value })} className={inputCls}>
            <option value="top">Top</option><option value="center">Middle</option><option value="bottom">Bottom</option>
          </select>
        </Row>
      </div>

      <Slider label="Padding" value={d.padding} min={30} max={180} onChange={(v: number) => patch({ padding: v })} />
      <Slider label="Corner radius" value={d.radius} min={0} max={120} onChange={(v: number) => patch({ radius: v })} />
      <Color label="Accent" value={d.accent} onChange={(v) => patch({ accent: v })} />

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={d.frame} onChange={(e) => patch({ frame: e.target.checked })} /> Show frame
        </label>
        <Color label="Frame colour" value={d.frameColor} onChange={(v) => patch({ frameColor: v })} />
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={d.card} onChange={(e) => patch({ card: e.target.checked })} /> Text panel behind the words
        </label>
        <Color label="Panel colour" value={d.cardColor} onChange={(v) => patch({ cardColor: v })} />
        <Slider label="Panel opacity" value={Math.round(d.cardOpacity * 100)} min={0} max={95} onChange={(v: number) => patch({ cardOpacity: v / 100 })} />
      </div>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={d.logo.show} onChange={(e) => patch({ logo: { ...d.logo, show: e.target.checked } })} /> Brand mark
        </label>
        <input value={d.logo.text} onChange={(e) => patch({ logo: { ...d.logo, text: e.target.value } })} className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <Row label="Corner">
            <select value={d.logo.corner} onChange={(e) => patch({ logo: { ...d.logo, corner: e.target.value } })} className={inputCls}>
              <option value="tl">Top left</option><option value="tr">Top right</option>
              <option value="bl">Bottom left</option><option value="br">Bottom right</option>
            </select>
          </Row>
          <Color label="Colour" value={d.logo.color} onChange={(v) => patch({ logo: { ...d.logo, color: v } })} />
        </div>
      </div>
    </div>
  );
}
