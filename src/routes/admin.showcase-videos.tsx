import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { SHOWCASE_KEYS, SHOWCASE_VERSION, showcasePath, uploadShowcaseClip, type ShowcaseKey } from "@/lib/showcase-media";

export const Route = createFileRoute("/admin/showcase-videos")({
  head: () => ({
    meta: [{ title: "Home page clips — AquaQBank Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ShowcaseVideosAdmin,
});

function ShowcaseVideosAdmin() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<Partial<Record<ShowcaseKey, string>>>({});

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  async function pick(key: ShowcaseKey, file: File | undefined) {
    if (!file) return;
    setState((s) => ({ ...s, [key]: "Uploading…" }));
    try {
      await uploadShowcaseClip(key, file);
      setState((s) => ({ ...s, [key]: "Uploaded ✓" }));
    } catch (e) {
      setState((s) => ({ ...s, [key]: e instanceof Error ? e.message : "Failed" }));
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-display text-3xl font-extrabold">Home page clips</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload the three .webm clips. They are saved for a year in each visitor's browser, so a file name is only used
          once: to replace a clip, raise <code>SHOWCASE_VERSION</code> in <code>src/lib/showcase-media.ts</code> first.
          Current version: <b>{SHOWCASE_VERSION}</b>.
        </p>
        <div className="mt-8 space-y-4">
          {SHOWCASE_KEYS.map((key) => (
            <label key={key} className="block rounded-2xl border border-border bg-card p-4">
              <span className="block text-sm font-bold">{showcasePath(key)}</span>
              <input
                type="file"
                accept="video/webm"
                className="mt-2 block w-full text-sm"
                onChange={(e) => pick(key, e.target.files?.[0])}
              />
              {state[key] && <span className="mt-2 block text-xs text-muted-foreground">{state[key]}</span>}
            </label>
          ))}
        </div>
      </main>
    </div>
  );
}
