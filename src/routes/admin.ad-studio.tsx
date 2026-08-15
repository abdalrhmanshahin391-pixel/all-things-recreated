import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
  Download, Sparkles, Image as ImageIcon, Save, Copy, Trash2, RefreshCw, Wand2, Upload, Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { AdCanvas, CANVAS } from "@/components/admin/adstudio/AdCanvas";
import { generateAdCopy, generateAdBackground, type AdCopyVariant } from "@/lib/ad-studio.functions";
import {
  BRAND, GRADIENTS, PATTERNS, TEMPLATES, baseDesign, telegramCaption, type AdDesign,
} from "@/lib/ad-studio";

export const Route = createFileRoute("/admin/ad-studio")({
  head: () => ({
    meta: [
      { title: "Ad Studio — AquaQBank" },
      { name: "description", content: "Design square promo posters for Telegram from your courses, offers and announcements." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Ad Studio — AquaQBank" },
      { property: "og:description", content: "Create beautiful ads for your channel." },
    ],
  }),
  component: AdStudioPage,
});

const BUCKET = "ad-media";
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

  const [design, setDesign] = useState<AdDesign>(() => baseDesign());
  const [title, setTitle] = useState("Untitled ad");
  const [adId, setAdId] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"content" | "background" | "style" | "ai" | "saved">("content");
  const [busy, setBusy] = useState<string | null>(null);
  const [variants, setVariants] = useState<AdCopyVariant[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const aiCopy = useServerFn(generateAdCopy);
  const aiBg = useServerFn(generateAdBackground);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  const patch = useCallback((p: Partial<AdDesign>) => setDesign((d) => ({ ...d, ...p })), []);
  const patchField = useCallback(
    (key: "eyebrow" | "headline" | "subheadline" | "body", p: Record<string, unknown>) =>
      setDesign((d) => ({ ...d, [key]: { ...d[key], ...p } })),
    [],
  );

  /* resolve the background image whenever it changes */
  useEffect(() => {
    let alive = true;
    const value = design.bg.image;
    if (!value) {
      setBgUrl(null);
      return;
    }
    (async () => {
      let url: string | null = null;
      if (value.startsWith("ad:")) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(value.slice(3), 3600);
        url = data?.signedUrl ?? null;
      } else if (value.startsWith("course:")) {
        url = await resolveCourseImageUrl(value.slice(7));
      } else {
        url = value;
      }
      if (alive) setBgUrl(url);
    })();
    return () => {
      alive = false;
    };
  }, [design.bg.image]);

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

  /* ---------------- saved ads ---------------- */
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

  /* ---------------- actions ---------------- */

  async function renderPng(): Promise<string> {
    const node = canvasRef.current;
    if (!node) throw new Error("Canvas not ready");
    return toPng(node, {
      width: CANVAS,
      height: CANVAS,
      pixelRatio: 1,
      cacheBust: true,
      style: { transform: "none" },
    });
  }

  async function download() {
    setBusy("export");
    try {
      const url = await renderPng();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\w\u0600-\u06FF-]+/g, "-").toLowerCase() || "ad"}-1080.png`;
      a.click();
      toast.success("Downloaded — ready for Telegram");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
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
      await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/png", upsert: false });

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

  async function uploadBackground(file: File) {
    setBusy("upload");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `backgrounds/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw error;
      setDesign((d) => ({ ...d, bg: { ...d.bg, type: "image", image: `ad:${path}` } }));
      toast.success("Background uploaded");
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
      const path = `backgrounds/ai-${Date.now()}.png`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/png" });
      if (error) throw error;
      setDesign((d) => ({ ...d, bg: { ...d.bg, type: "image", image: `ad:${path}`, overlay: Math.max(d.bg.overlay, 0.35) } }));
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
    }));
    toast.success("Filled from package");
  }
  function fillFromCoupon(c: any) {
    const off = c.discount_type === "percent" ? `${c.discount_value}% OFF` : `${c.discount_value} OFF`;
    setDesign((d) => ({
      ...d,
      template: "coupon",
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
      eyebrow: { ...d.eyebrow, text: "ANNOUNCEMENT" },
      headline: { ...d.headline, text: a.title ?? "" },
      subheadline: { ...d.subheadline, text: a.body ?? "" },
      price: { ...d.price, show: false },
    }));
    toast.success("Filled from announcement");
  }

  async function openSaved(a: SavedAd) {
    setDesign({ ...baseDesign(), ...(a.design as AdDesign) });
    setTitle(a.title);
    setAdId(a.id);
    setTab("content");
    toast.success("Opened");
  }
  async function deleteSaved(a: SavedAd) {
    if (!confirm(`Delete “${a.title}”?`)) return;
    await (supabase.from as any)("ad_creatives").delete().eq("id", a.id);
    if (a.preview_path) await supabase.storage.from(BUCKET).remove([a.preview_path]);
    if (adId === a.id) setAdId(null);
    await qc.invalidateQueries({ queryKey: ["ad-creatives"] });
  }

  const caption = useMemo(() => telegramCaption(design, "https://aquaqbank.com"), [design]);

  if (loading || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-[1500px] px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Ad Studio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Square posters for your Telegram channel — courses, offers, announcements, reminders.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} w-48`} placeholder="Ad name" />
            <button className={btn} onClick={() => { setDesign(baseDesign()); setAdId(null); setTitle("Untitled ad"); }}>
              <Plus size={14} /> New
            </button>
            <button className={btn} disabled={busy === "save"} onClick={save}><Save size={14} /> Save</button>
            <button className={btn} disabled={busy === "copy"} onClick={copyImage}><Copy size={14} /> Copy image</button>
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
                <div style={{ position: "relative", width: "100%", paddingTop: "100%" }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      transform: "scale(var(--adscale))",
                      transformOrigin: "top left",
                      width: CANVAS,
                      height: CANVAS,
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const parent = el.parentElement!;
                      const set = () => el.style.setProperty("--adscale", String(parent.clientWidth / CANVAS));
                      set();
                      window.addEventListener("resize", set);
                    }}
                  >
                    <AdCanvas ref={canvasRef} design={design} bgUrl={bgUrl} />
                  </div>
                </div>
              </div>
            </div>

            {/* templates */}
            <div className="rounded-2xl border-2 border-border bg-card p-4">
              <div className={labelCls}>Templates</div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TEMPLATES.map((t) => (
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
            <div className="flex flex-wrap gap-1.5">
              {(["content", "background", "style", "ai", "saved"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-black capitalize ${
                    tab === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-5 max-h-[70vh] overflow-y-auto pr-1">
              {tab === "content" && (
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

              {tab === "background" && (
                <BackgroundTab
                  design={design}
                  patch={patch}
                  onUpload={uploadBackground}
                  busy={busy}
                  bgPrompt={bgPrompt}
                  setBgPrompt={setBgPrompt}
                  onAi={makeAiBackground}
                  courses={sources?.courses ?? []}
                />
              )}

              {tab === "style" && <StyleTab design={design} patch={patch} patchField={patchField} />}

              {tab === "ai" && (
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
                        <button
                          className={btn}
                          onClick={() => { navigator.clipboard.writeText(v.caption_en || ""); toast.success("Caption copied"); }}
                        >
                          <Copy size={12} /> Caption
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "saved" && (
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
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Size" value={f.size} min={14} max={180} onChange={(v) => onPatch({ size: v })} />
        <Slider label="Weight" value={f.weight} min={300} max={900} step={100} onChange={(v) => onPatch({ weight: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Color label="Colour" value={f.color} onChange={(v) => onPatch({ color: v })} />
        <Slider label="Tracking" value={f.letterSpacing ?? 0} min={-6} max={16} onChange={(v) => onPatch({ letterSpacing: v })} />
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] font-bold">
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.uppercase} onChange={(e) => onPatch({ uppercase: e.target.checked })} /> UPPERCASE</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.shadow} onChange={(e) => onPatch({ shadow: e.target.checked })} /> shadow</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.outline} onChange={(e) => onPatch({ outline: e.target.checked })} /> outline</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.italic} onChange={(e) => onPatch({ italic: e.target.checked })} /> italic</label>
      </div>
    </div>
  );
}

function ContentTab({
  design: d, patch, patchField, sources, onCourse, onPackage, onCoupon, onUniversity, onAnnouncement,
}: any) {
  const [src, setSrc] = useState<"courses" | "packages" | "coupons" | "universities" | "announcements">("courses");
  const list: any[] = sources?.[src] ?? [];
  return (
    <div className="space-y-4">
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

      <TextBlock name="Eyebrow" f={d.eyebrow} onPatch={(p) => patchField("eyebrow", p)} />
      <TextBlock name="Headline" f={d.headline} onPatch={(p) => patchField("headline", p)} />
      <TextBlock name="Subheadline" f={d.subheadline} onPatch={(p) => patchField("subheadline", p)} />
      <TextBlock name="Body" f={d.body} onPatch={(p) => patchField("body", p)} />

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
          <Slider label="Price size" value={d.price.size} min={40} max={200} onChange={(v) => patch({ price: { ...d.price, size: v } })} />
          <Color label="Price colour" value={d.price.color} onChange={(v) => patch({ price: { ...d.price, color: v } })} />
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
          <Slider label="Roundness" value={d.cta.radius} min={0} max={999} onChange={(v) => patch({ cta: { ...d.cta, radius: v } })} />
          <Slider label="Size" value={d.cta.size} min={16} max={64} onChange={(v) => patch({ cta: { ...d.cta, size: v } })} />
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

function BackgroundTab({
  design: d, patch, onUpload, busy, bgPrompt, setBgPrompt, onAi, courses,
}: any) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["gradient", "solid", "pattern", "image"] as const).map((k) => (
          <button key={k} onClick={() => patch({ bg: { ...d.bg, type: k === "pattern" ? "gradient" : k } })}
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
      <Slider label="Gradient angle" value={d.bg.angle} min={0} max={360} onChange={(v) => patch({ bg: { ...d.bg, angle: v } })} />
      <Color label="Solid colour" value={d.bg.color} onChange={(v) => patch({ bg: { ...d.bg, color: v } })} />

      <Row label="Pattern">
        <select value={d.bg.pattern} onChange={(e) => patch({ bg: { ...d.bg, pattern: e.target.value } })} className={inputCls}>
          {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>

      <div className="rounded-xl border-2 border-border bg-background p-3 space-y-2">
        <div className={labelCls}>Image background</div>
        <label className={`${btn} cursor-pointer w-fit`}>
          <Upload size={13} /> Upload image
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
        </label>
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
        <Slider label="Darken" value={Math.round(d.bg.overlay * 100)} min={0} max={90} onChange={(v) => patch({ bg: { ...d.bg, overlay: v / 100 } })} />
        <Slider label="Blur" value={d.bg.blur} min={0} max={30} onChange={(v) => patch({ bg: { ...d.bg, blur: v } })} />
        <Slider label="Zoom" value={d.bg.zoom} min={100} max={200} onChange={(v) => patch({ bg: { ...d.bg, zoom: v } })} />
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

      <Slider label="Padding" value={d.padding} min={30} max={180} onChange={(v) => patch({ padding: v })} />
      <Slider label="Corner radius" value={d.radius} min={0} max={120} onChange={(v) => patch({ radius: v })} />
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
        <Slider label="Panel opacity" value={Math.round(d.cardOpacity * 100)} min={0} max={95} onChange={(v) => patch({ cardOpacity: v / 100 })} />
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
