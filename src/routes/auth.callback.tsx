import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { subscribeAuth, getAuthSnapshot } from "@/lib/auth-store";
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
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    let settledEmptyAt = 0;

    // The shared auth store already listens for the session and loads the
    // profile/roles once. Hand off the instant it knows the user instead of
    // polling, and navigate inside the app instead of reloading it.
    function tryFinish() {
      if (done) return;
      const { user, profile, loading } = getAuthSnapshot();
      if (loading) return;
      if (!user) {
        // Session settled with nobody signed in. The provider redirect can
        // still be a beat behind, so allow a short grace window before giving
        // up instead of leaving the spinner running for the full timeout.
        if (!settledEmptyAt) settledEmptyAt = Date.now();
        setTimeout(() => {
          if (done) return;
          if (getAuthSnapshot().user) return;
          done = true;
          clearTimeout(timer);
          unsub();
          setFailed(true);
        }, 2500);
        return;
      }
      done = true;
      clearTimeout(timer);
      unsub();
      const next = safeNext();
      if (needsOnboarding(user.id, profile)) {
        void navigate({
          to: "/welcome",
          search: next && next !== "/" ? { next } : {},
          replace: true,
        });
        return;
      }
      try {
        sessionStorage.removeItem("aqua-auth-next");
      } catch {
        /* ignore */
      }
      void navigate({ to: next, replace: true });
    }

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        unsub();
        setFailed(true);
      }
    }, 12_000);
    const unsub = subscribeAuth(tryFinish);
    tryFinish();

    return () => {
      done = true;
      clearTimeout(timer);
      unsub();
    };
  }, [navigate]);

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