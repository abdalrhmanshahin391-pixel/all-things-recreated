import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { needsOnboarding } from "@/lib/onboarding";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — AquaQBank academy" },
      { name: "description", content: "Finishing your AquaQBank academy sign-in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function safeNext(): string {
  try {
    const v = sessionStorage.getItem("aqua-auth-next");
    if (v && v.startsWith("/") && !v.startsWith("//")) return v;
  } catch {
    /* ignore */
  }
  return "/";
}

function AuthCallback() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // The session can land a beat after the redirect; give it a few tries.
      for (let i = 0; i < 25; i++) {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, username, phone")
            .eq("id", user.id)
            .maybeSingle();
          if (cancelled) return;
          const next = safeNext();
          if (needsOnboarding(user.id, prof)) {
            const q = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
            window.location.replace(`/welcome${q}`);
          } else {
            try {
              sessionStorage.removeItem("aqua-auth-next");
            } catch {
              /* ignore */
            }
            window.location.replace(next);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) setFailed(true);
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-6 text-center">
      <div>
        <div
          className="mx-auto h-10 w-10 rounded-full border-4 border-border animate-spin"
          style={{ borderTopColor: "var(--primary)" }}
        />
        <p className="mt-5 text-sm font-bold text-foreground">
          {failed ? "We couldn't finish signing you in." : "Signing you in…"}
        </p>
        {failed && (
          <a href="/login" className="mt-4 inline-block text-sm font-black underline">
            Back to sign in
          </a>
        )}
      </div>
    </div>
  );
}