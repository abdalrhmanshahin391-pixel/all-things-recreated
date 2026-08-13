import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthShell,
  FormField,
  inputClass,
  buttonClass,
  ErrorBox,
} from "@/components/AuthShell";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — AquaQBank academy" },
      {
        name: "description",
        content: "Choose a new password for your AquaQBank academy account.",
      },
      { property: "og:title", content: "Set a new password — AquaQBank academy" },
      { property: "og:description", content: "Finish resetting your AquaQBank password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // The recovery link puts a session in place (hash or code exchange).
  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) setReady(true);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) setReady(true);
    })();
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate({ to: "/login" }), 1800);
  }

  return (
    <AuthShell
      eyebrow="new password"
      title="set a new password"
      subtitle="Pick a password you'll remember — you'll use it the next time you sign in."
      footer={
        <>
          Changed your mind?{" "}
          <Link to="/login" className="font-semibold hover:underline text-[var(--primary)]">
            back to sign in
          </Link>
        </>
      }
    >
      {done ? (
        <div className="rounded-2xl border-2 border-border bg-card p-5 text-center">
          <h2 className="font-black text-foreground">Password updated</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Taking you to the sign-in page…
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <ErrorBox message={error} />}
          {!ready && (
            <p className="text-xs text-muted-foreground">
              Open this page from the reset link in your email. If you got here another way, request
              a new link on the{" "}
              <Link to="/forgot-password" className="underline font-bold">
                forgot password
              </Link>{" "}
              page.
            </p>
          )}

          <FormField label="new password">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                className={inputClass + " pr-12"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </FormField>

          <FormField label="confirm new password">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </FormField>

          <button type="submit" disabled={loading || !ready} className={buttonClass}>
            <span className="inline-flex items-center justify-center gap-2">
              <KeyRound size={16} />
              {loading ? "Saving…" : "Save new password"}
            </span>
          </button>
        </form>
      )}
    </AuthShell>
  );
}
