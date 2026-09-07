import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ShieldAlert, Search, Lock, Unlock, Activity, Fingerprint, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { updateSiteSettings } from "@/lib/site-settings.functions";
import {
  adminContentProtectionOverview,
  adminSetContentLock,
  adminTraceWatermarkCode,
} from "@/lib/content-protection.functions";

export const Route = createFileRoute("/admin/content-protection")({
  head: () => ({
    meta: [
      { title: "Content Protection — Admin" },
      { name: "description", content: "Watermarking, screenshot detection, leak tracing and auto-lock settings." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Content Protection — Admin" },
      { property: "og:description", content: "Track and stop course content leaks." },
    ],
  }),
  component: AdminContentProtection,
});

const KIND_LABEL: Record<string, string> = {
  screenshot_attempt: "Screenshot",
  print_attempt: "Print",
  copy_attempt: "Copy",
  devtools: "DevTools",
  focus_loss: "Left page",
  screen_share: "Screen record",
  rapid_flip: "Rapid flipping",
};

type Toggles = {
  protect_enabled: boolean;
  protect_lectures: boolean;
  protect_qbank: boolean;
  protect_blur_on_blur: boolean;
  protect_block_print: boolean;
  protect_block_copy: boolean;
  protect_consent_required: boolean;
  protect_devtools_guard: boolean;
  protect_watermark_opacity: number;
  protect_auto_lock_threshold: number;
  protect_terms_en: string;
};

const DEFAULT_TOGGLES: Toggles = {
  protect_enabled: true,
  protect_lectures: true,
  protect_qbank: true,
  protect_blur_on_blur: true,
  protect_block_print: true,
  protect_block_copy: true,
  protect_consent_required: true,
  protect_devtools_guard: true,
  protect_watermark_opacity: 0.1,
  protect_auto_lock_threshold: 12,
  protect_terms_en: "",
};

function AdminContentProtection() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminContentProtectionOverview);
  const traceFn = useServerFn(adminTraceWatermarkCode);
  const lockFn = useServerFn(adminSetContentLock);
  const updateFn = useServerFn(updateSiteSettings);

  const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES);
  const [savingTerms, setSavingTerms] = useState(false);
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState<any[] | null>(null);
  const [tracing, setTracing] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("site_settings").select("id,site_name,tagline,logo_url,updated_at,theme,show_signature,protect_enabled,protect_lectures,protect_qbank,protect_watermark_opacity,protect_blur_on_blur,protect_block_print,protect_block_copy,protect_consent_required,protect_devtools_guard,protect_auto_lock_threshold,protect_terms_en,protect_terms_ar,committee_default_storage,brand_style,study_plan_path,study_plan_title,study_plan_subtitle,terms_en,terms_ar,privacy_en,privacy_ar,study_hub_title,study_hub_title_ar,study_hub_subtitle,study_hub_subtitle_ar").eq("id", true).maybeSingle();
      if (data) {
        setToggles({
          protect_enabled: data.protect_enabled ?? true,
          protect_lectures: data.protect_lectures ?? true,
          protect_qbank: data.protect_qbank ?? true,
          protect_blur_on_blur: data.protect_blur_on_blur ?? true,
          protect_block_print: data.protect_block_print ?? true,
          protect_block_copy: data.protect_block_copy ?? true,
          protect_consent_required: data.protect_consent_required ?? true,
          protect_devtools_guard: data.protect_devtools_guard ?? true,
          protect_watermark_opacity: Number(data.protect_watermark_opacity ?? 0.1),
          protect_auto_lock_threshold: Number(data.protect_auto_lock_threshold ?? 12),
          protect_terms_en: data.protect_terms_en ?? "",
        });
      }
    })();
  }, []);

  const overview = useQuery({
    queryKey: ["content-protection-overview"],
    queryFn: () => overviewFn({ data: { days: 30 } }),
    enabled: isAdmin,
  });

  async function patch(next: Partial<Toggles>) {
    setToggles((t) => ({ ...t, ...next }));
    try {
      await updateFn({ data: next as any });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  }

  async function trace() {
    setTracing(true);
    try {
      const res = await traceFn({ data: { code } });
      setMatches(res.matches);
      if (!res.matches.length) toast.error("No account matches that code");
    } catch (e: any) {
      toast.error(e?.message || "Trace failed");
    } finally {
      setTracing(false);
    }
  }

  async function setLock(userId: string, locked: boolean) {
    try {
      await lockFn({ data: { userId, locked } });
      toast.success(locked ? "Account locked" : "Account unlocked");
      overview.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  const rows = (overview.data?.rows ?? []).filter((r: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.username, r.full_name, r.email, r.code].some((v: string) => (v ?? "").toLowerCase().includes(s));
  });
  const totals = overview.data?.totals;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />
      <div className="max-w-6xl mx-auto px-5 md:px-6 pt-28 pb-24">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={14} /> Admin
        </Link>

        <div className="mt-5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-600 px-3 py-1 text-[11px] font-black uppercase tracking-widest">
            <ShieldAlert size={13} /> Anti-leak
          </span>
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight">Content Protection</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Every protected page is stamped with the viewer's name, account code, time and IP. Capture attempts
          are detected, logged and scored — repeat offenders lock themselves out automatically.
        </p>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Flagged users" value={totals?.users ?? 0} />
          <Stat label="Events (30d)" value={totals?.events ?? 0} />
          <Stat label="High risk" value={totals?.high ?? 0} tone="danger" />
          <Stat label="Locked" value={totals?.locked ?? 0} tone="warn" />
        </div>

        {/* Controls */}
        <section className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-black text-lg">Protection switches</h2>
          <p className="text-sm text-slate-500 mt-1">These apply to every protected page instantly. Admins are never affected.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Toggle label="Protection enabled" desc="Master switch for watermarks and detection" checked={toggles.protect_enabled} onChange={(v) => patch({ protect_enabled: v })} />
            <Toggle label="Protect lectures" desc="Watermarks and capture detection on lecture pages" checked={toggles.protect_lectures} onChange={(v) => patch({ protect_lectures: v })} />
            <Toggle label="Protect question bank" desc="Watermarks and capture detection while solving questions" checked={toggles.protect_qbank} onChange={(v) => patch({ protect_qbank: v })} />
            <Toggle label="Warning gate" desc="Users must accept the anti-sharing terms once" checked={toggles.protect_consent_required} onChange={(v) => patch({ protect_consent_required: v })} />
            <Toggle label="Hide when they leave" desc="Blur content when the tab loses focus" checked={toggles.protect_blur_on_blur} onChange={(v) => patch({ protect_blur_on_blur: v })} />
            <Toggle label="Block printing" desc="Ctrl/Cmd+P and print output disabled" checked={toggles.protect_block_print} onChange={(v) => patch({ protect_block_print: v })} />
            <Toggle label="Block copying" desc="Copy is replaced with a traced warning" checked={toggles.protect_block_copy} onChange={(v) => patch({ protect_block_copy: v })} />
            <Toggle label="Developer tools guard" desc="Blur and log when devtools open" checked={toggles.protect_devtools_guard} onChange={(v) => patch({ protect_devtools_guard: v })} />
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                Watermark strength ({Math.round(toggles.protect_watermark_opacity * 100)}%)
              </label>
              <input
                type="range" min={2} max={40} value={Math.round(toggles.protect_watermark_opacity * 100)}
                onChange={(e) => setToggles((t) => ({ ...t, protect_watermark_opacity: Number(e.target.value) / 100 }))}
                onMouseUp={() => patch({ protect_watermark_opacity: toggles.protect_watermark_opacity })}
                onTouchEnd={() => patch({ protect_watermark_opacity: toggles.protect_watermark_opacity })}
                className="mt-3 w-full accent-indigo-600"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Auto-lock sensitivity</label>
              <input
                type="number" min={0} max={100} value={toggles.protect_auto_lock_threshold}
                onChange={(e) => setToggles((t) => ({ ...t, protect_auto_lock_threshold: Number(e.target.value) }))}
                onBlur={() => patch({ protect_auto_lock_threshold: toggles.protect_auto_lock_threshold })}
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold"
              />
              <p className="mt-1 text-xs text-slate-500">Lower = locks faster. 0 disables auto-lock.</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">Warning text shown to users</label>
            <textarea
              rows={4}
              value={toggles.protect_terms_en}
              onChange={(e) => setToggles((t) => ({ ...t, protect_terms_en: e.target.value }))}
              placeholder="Leave empty to use the default warning."
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={async () => { setSavingTerms(true); await patch({ protect_terms_en: toggles.protect_terms_en }); setSavingTerms(false); }}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-black uppercase tracking-widest"
            >
              {savingTerms && <Loader2 size={13} className="animate-spin" />} Save warning
            </button>
          </div>
        </section>

        {/* Trace a leak */}
        <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-black text-lg flex items-center gap-2"><Fingerprint size={18} className="text-indigo-600" /> Trace a leaked screenshot</h2>
          <p className="text-sm text-slate-500 mt-1">
            Read the code printed in the watermark of the leaked image and paste it here to find the account.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 3F9A21B0"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono uppercase"
            />
            <button onClick={trace} disabled={tracing} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-50">
              {tracing ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Trace
            </button>
          </div>
          {matches?.map((m) => (
            <div key={m.id} className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <div className="font-black">{m.full_name || m.username}</div>
              <div className="text-sm text-slate-600">@{m.username} · {m.email} {m.phone ? `· ${m.phone}` : ""}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setLock(m.id, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
                  <Lock size={12} /> Lock account
                </button>
                <button onClick={() => setLock(m.id, false)} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
                  <Unlock size={12} /> Unlock
                </button>
              </div>
            </div>
          ))}
        </section>

        {/* Risk list */}
        <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-black text-lg flex items-center gap-2"><Activity size={18} className="text-rose-600" /> Leak risk (last 30 days)</h2>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, code…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-56"
            />
          </div>

          {overview.isLoading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
          {!overview.isLoading && rows.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">No capture activity recorded. Clean so far.</p>
          )}

          <div className="mt-4 grid gap-3">
            {rows.map((r: any) => (
              <div key={r.user_id} className="rounded-2xl border border-slate-100 p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-black truncate">{r.full_name || r.username}</div>
                  <div className="text-xs text-slate-500 truncate">@{r.username} · {r.email} · <span className="font-mono">{r.code}</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(r.breakdown).map(([k, n]) => (
                      <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {KIND_LABEL[k] ?? k} × {n as number}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                    r.level === "high" ? "bg-rose-600 text-white" : r.level === "watch" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {r.level} · {r.score}
                  </span>
                  <button onClick={() => setLock(r.user_id, !r.locked)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
                    {r.locked ? <><Unlock size={12} /> Unlock</> : <><Lock size={12} /> Lock</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent events */}
        <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-black text-lg">Recent events</h2>
          <div className="mt-4 divide-y divide-slate-100 max-h-96 overflow-auto">
            {(overview.data?.recent ?? []).map((e: any, i: number) => (
              <div key={i} className="py-2 text-sm flex flex-wrap gap-x-3 gap-y-1">
                <span className="font-bold">{KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className="text-slate-500">{e.context}</span>
                <span className="text-slate-400 font-mono text-xs">{e.ip}</span>
                <span className="text-slate-400 text-xs ml-auto">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warn" }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`text-2xl font-black ${tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="text-left rounded-2xl border border-slate-100 p-4 flex items-start gap-3 hover:border-indigo-200 transition-colors"
    >
      <span className={`mt-0.5 h-6 w-11 rounded-full shrink-0 relative transition-colors ${checked ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block font-black text-sm">{label}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
    </button>
  );
}