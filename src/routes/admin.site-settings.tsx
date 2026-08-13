import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { updateSiteSettings } from "@/lib/site-settings.functions";
import { SiteWordmark, BRAND_STYLES, type BrandStyle } from "@/components/brand/SiteWordmark";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/site-settings")({
  head: () => ({ meta: [{ title: "Site Settings" }] }),
  component: AdminSiteSettings,
});

function AdminSiteSettings() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const updateFn = useServerFn(updateSiteSettings);
  const queryClient = useQueryClient();

  const [siteName, setSiteName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle>("aqua-flow");
  const [savingStyle, setSavingStyle] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const [savingSig, setSavingSig] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("site_settings")
        .select("site_name,tagline,logo_url,show_signature,brand_style")
        .eq("id", true)
        .maybeSingle();
      if (data) {
        setSiteName(data.site_name ?? "");
        setTagline(data.tagline ?? "");
        setLogoUrl(data.logo_url ?? "");
        setShowSignature(data.show_signature ?? true);
        setBrandStyle((data.brand_style ?? "aqua-flow") as BrandStyle);
      }
    })();
  }, []);

  async function pickStyle(next: BrandStyle) {
    const prev = brandStyle;
    setBrandStyle(next);
    setSavingStyle(true);
    try {
      await updateFn({ data: { brand_style: next } });
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Brand style applied across the site.");
    } catch (e: any) {
      setBrandStyle(prev);
      toast.error(e?.message || "Failed");
    } finally {
      setSavingStyle(false);
    }
  }

  async function toggleSignature(next: boolean) {
    setShowSignature(next);
    setSavingSig(true);
    try {
      await updateFn({ data: { show_signature: next } });
      toast.success(next ? "Signature is now visible" : "Signature is now hidden");
    } catch (e: any) {
      setShowSignature(!next);
      toast.error(e?.message || "Failed");
    } finally {
      setSavingSig(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await updateFn({
        data: { site_name: siteName, tagline, logo_url: logoUrl || null },
      });
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Saved — new name will appear everywhere.");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />
      <div className="max-w-2xl mx-auto px-6 pt-28 pb-24">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={14} /> Home
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">Site Settings</h1>
        <p className="mt-2 text-slate-600">
          Change the site name shown across the app — including every summary cover, watermark, and PDF.
        </p>

        <div className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-5">
          <Field label="Site name">
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>
          <Field label="Tagline">
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>
          <Field label="Logo URL (optional)">
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <div className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Brand style</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pick how the name is drawn in the header, footer, sign-in screens and home page.
            Previews use the name typed above.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {BRAND_STYLES.map((s) => {
              const active = brandStyle === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={savingStyle}
                  onClick={() => pickStyle(s.id)}
                  className={`text-left rounded-2xl border-2 p-4 transition-all disabled:opacity-60 ${
                    active
                      ? "border-cyan-500 bg-cyan-50/50 shadow-md"
                      : "border-slate-200 bg-white hover:border-cyan-300 hover:-translate-y-0.5"
                  }`}
                >
                  <div className="h-14 flex items-center overflow-hidden">
                    <SiteWordmark size={24} style={s.id} name={siteName || "AquaQBank"} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-900">{s.label}</span>
                    {active && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{s.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border-2 border-amber-200 bg-amber-50/60 p-6 shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Sparkles size={18} className="shrink-0 text-amber-500" />
            “Made by Laith Shahin” signature
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Shows the animated wand signature in the لجنة الطب والجراحة page header. Turn it off
            to hide it for everyone.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showSignature}
          aria-label="Show Made by Laith Shahin signature"
              disabled={savingSig}
              onClick={() => toggleSignature(!showSignature)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                showSignature ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
                  showSignature ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            Currently {showSignature ? "visible" : "hidden"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
