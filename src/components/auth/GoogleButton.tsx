import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" — the OAuth round-trip lands on /auth/callback,
 * which finishes onboarding (or sends the user to `next`).
 */
export function GoogleButton({
  label = "Continue with Google",
  next,
  onError,
}: {
  label?: string;
  next?: string;
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        sessionStorage.setItem("aqua-auth-next", next);
      } else {
        sessionStorage.removeItem("aqua-auth-next");
      }
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) {
        onError?.("Google sign-in didn't complete. Please try again.");
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      // Tokens came back in-page (popup flow): the session is already set.
      window.location.replace("/auth/callback");
    } catch {
      onError?.("Google sign-in didn't complete. Please try again.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full h-12 rounded-2xl border-2 border-border bg-card px-4 flex items-center justify-center gap-3 text-sm font-black text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
      style={{ boxShadow: "0 3px 0 var(--border)" }}
    >
      <GoogleMark />
      {loading ? "Opening Google…" : label}
    </button>
  );
}

export function AuthDivider({ label = "or continue with email" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}