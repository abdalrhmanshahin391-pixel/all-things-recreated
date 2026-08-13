import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.2 35.8 44 30.6 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.3 12.8c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.6-1.9-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.9C6 7.3 4.4 8.3 3.5 9.9c-1.8 3.1-.5 7.8 1.3 10.3.9 1.3 1.9 2.7 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8 2.2-1.3 3.1-2.6c1-1.5 1.3-2.9 1.4-3-.1 0-2.8-1.1-2.8-4.4zM13.9 4.6c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  );
}

export function SocialAuthButtons({ redirectTo }: { redirectTo?: string }) {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(provider: "google" | "apple") {
    setError(null);
    setBusy(provider);
    try {
      if (typeof window !== "undefined" && redirectTo) {
        window.sessionStorage.setItem("aqua-post-auth-next", redirectTo);
      }
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message || "Sign-in failed. Please try again.");
        setBusy(null);
        return;
      }
      if (result.redirected) return;
      window.location.href = redirectTo || "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => go("google")}
          className="inline-flex items-center justify-center gap-2.5 h-12 rounded-2xl border-2 border-border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:border-[var(--primary)] disabled:opacity-60"
        >
          <GoogleIcon />
          {busy === "google" ? "opening google…" : "continue with google"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => go("apple")}
          className="inline-flex items-center justify-center gap-2.5 h-12 rounded-2xl border-2 border-border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:border-[var(--primary)] disabled:opacity-60"
        >
          <AppleIcon />
          {busy === "apple" ? "opening apple…" : "continue with apple"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-bold text-destructive">
          {error}
        </p>
      )}

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          or use your email
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
