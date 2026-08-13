import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { MailCheck, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthShell,
  FormField,
  inputClass,
  buttonClass,
  ErrorBox,
} from "@/components/AuthShell";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — AquaQBank academy" },
      {
        name: "description",
        content: "Send yourself a password reset link for your AquaQBank academy account.",
      },
      { property: "og:title", content: "Reset your password — AquaQBank academy" },
      { property: "og:description", content: "Get a reset link by email and set a new password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      eyebrow="forgot password"
      title="reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-semibold hover:underline text-[var(--primary)]">
            back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-2xl border-2 border-border bg-card p-5 text-center">
          <MailCheck className="mx-auto text-[var(--primary)]" size={28} />
          <h2 className="mt-3 font-black text-foreground">Check your inbox</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for <span className="font-bold">{email}</span>, a reset link is on
            its way. The link opens a page where you can set a new password.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <ErrorBox message={error} />}
          <FormField label="email">
            <input
              type="email"
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </FormField>
          <button type="submit" disabled={loading} className={buttonClass}>
            <span className="inline-flex items-center justify-center gap-2">
              <Send size={16} />
              {loading ? "Sending…" : "Send reset link"}
            </span>
          </button>
        </form>
      )}
    </AuthShell>
  );
}
