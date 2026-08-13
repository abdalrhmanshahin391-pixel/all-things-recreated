import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { updateSiteSettings } from "@/lib/site-settings.functions";
import { useQueryClient } from "@tanstack/react-query";
import { TERMS_EN, TERMS_AR, PRIVACY_EN, PRIVACY_AR, REFUND_EN, REFUND_AR } from "@/lib/legal-content";

export const Route = createFileRoute("/admin/legal")({
  head: () => ({
    meta: [
      { title: "Terms & Privacy — AquaQBank" },
      { name: "description", content: "Edit the Terms of Service and Privacy Policy shown at signup." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Terms & Privacy — AquaQBank" },
      { property: "og:description", content: "Edit legal documents." },
    ],
  }),
  component: AdminLegalPage,
});

const fieldClass =
  "w-full min-h-[220px] rounded-xl border-2 border-border bg-background p-3 text-sm leading-relaxed";

function AdminLegalPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const settings = useSiteSettings();
  const save = useServerFn(updateSiteSettings);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    terms_en: "",
    terms_ar: "",
    privacy_en: "",
    privacy_ar: "",
    refund_en: "",
    refund_ar: "",
  });

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    setForm({
      terms_en: settings.terms_en ?? "",
      terms_ar: settings.terms_ar ?? "",
      privacy_en: settings.privacy_en ?? "",
      privacy_ar: settings.privacy_ar ?? "",
      refund_en: settings.refund_en ?? "",
      refund_ar: settings.refund_ar ?? "",
    });
  }, [
    settings.terms_en,
    settings.terms_ar,
    settings.privacy_en,
    settings.privacy_ar,
    settings.refund_en,
    settings.refund_ar,
  ]);

  const DEFAULTS: Record<string, string> = {
    terms_en: TERMS_EN,
    terms_ar: TERMS_AR,
    privacy_en: PRIVACY_EN,
    privacy_ar: PRIVACY_AR,
    refund_en: REFUND_EN,
    refund_ar: REFUND_AR,
  };

  async function handleSave() {
    setSaving(true);
    try {
      await save({ data: form });
      await qc.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <h1 className="text-3xl font-black tracking-tight text-foreground">Terms & Privacy</h1>
        <p className="mt-2 text-muted-foreground">
          Shown on the signup page and at <code>/terms</code>, <code>/privacy</code> and{" "}
          <code>/refund-policy</code>. Leave a box empty to publish the built-in AquaQBank
          (Paddle-compliant) document.
        </p>

        <div className="mt-8 grid gap-6">
          {([
            ["terms_en", "Terms of Service (English)"],
            ["terms_ar", "شروط الاستخدام (Arabic)"],
            ["privacy_en", "Privacy Policy (English)"],
            ["privacy_ar", "سياسة الخصوصية (Arabic)"],
            ["refund_en", "Refund Policy (English)"],
            ["refund_ar", "سياسة الاسترداد (Arabic)"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {label}
                </label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, [key]: DEFAULTS[key] ?? "" }))}
                  className="rounded-lg border-2 border-border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Load AquaQBank default
                </button>
              </div>
              <textarea
                className={fieldClass + " mt-2"}
                dir={key.endsWith("_ar") ? "rtl" : "ltr"}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 rounded-xl border-2 border-border bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </main>
    </div>
  );
}
