import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadRememberedLogin,
  saveRememberedLogin,
  clearRememberedLogin,
} from "@/lib/remember-login";
import {
  AuthShell,
  FormField,
  inputClass,
  buttonClass,
  ErrorBox,
} from "@/components/AuthShell";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — AquaQBank academy" },
      { name: "description", content: "Sign in to your AquaQBank academy account." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next:
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : "",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const { next } = Route.useSearch();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{
    kind: "block" | "suspend";
    message: string | null;
    until: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadRememberedLogin();
    if (!saved) return;
    setIdentifier(saved.email);
    setPassword(saved.password);
    setRemember(true);
    setHasSaved(true);
  }, []);

  function clearSaved() {
    clearRememberedLogin();
    setIdentifier("");
    setPassword("");
    setHasSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError(t("cms.login.errFill"));
      return;
    }

    setLoading(true);

    const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), ms);
        Promise.resolve(p).then(
          (v) => {
            clearTimeout(t);
            resolve(v);
          },
          (e) => {
            clearTimeout(t);
            reject(e);
          },
        );
      });

    try {
      const email = identifier.trim().toLowerCase();

      const { error: signInError } = (await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        15_000,
      )) as { error: { message: string } | null };

      if (signInError) {
        const msg = (signInError.message ?? "").toLowerCase();
        if (msg.includes("confirm") || msg.includes("verif")) {
          setError(
            "Your email isn't verified yet. Please open the verification link we sent to your inbox, then sign in again.",
          );
        } else {
          setError(t("cms.login.errInvalid"));
        }
        setLoading(false);
        return;
      }

      // Blocked / temporarily suspended accounts
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (uid) {
        const { data: prof } = await (supabase.from as any)("profiles")
          .select("locked_at, lock_kind, lock_until, lock_message")
          .eq("id", uid)
          .maybeSingle();
        const stillLocked =
          prof?.locked_at &&
          (prof.lock_kind !== "suspend" ||
            !prof.lock_until ||
            new Date(prof.lock_until).getTime() > Date.now());
        if (stillLocked) {
          await supabase.auth.signOut();
          setBlocked({
            kind: prof.lock_kind === "suspend" ? "suspend" : "block",
            message: prof.lock_message ?? null,
            until: prof.lock_until ?? null,
          });
          setLoading(false);
          return;
        }
      }

      if (remember) saveRememberedLogin({ email, password });
      else clearRememberedLogin();

      if (next) {
        window.location.href = next;
        return;
      }
      navigate({ to: "/" });
      void router.invalidate();
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "timeout"
          ? t("cms.login.errTimeout")
          : t("cms.login.errGeneric");
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t("cms.login.eyebrow")}
      title={t("cms.login.title")}
      subtitle={t("cms.login.subtitle")}
      footer={
        <>
          {t("cms.login.footerText")}{" "}
          <Link to="/register" className="text-white font-semibold hover:underline">
            {t("cms.login.footerLink")}
          </Link>
        </>
      }
    >
      {blocked && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5"
        >
          <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 text-center">
            <h2 className="text-xl font-black text-foreground">
              {blocked.kind === "suspend"
                ? "Your account is temporarily stopped"
                : "Your account has been blocked"}
            </h2>
            {blocked.message && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{blocked.message}</p>
            )}
            {blocked.kind === "suspend" && blocked.until && (
              <p className="mt-3 text-sm font-bold text-muted-foreground">
                Access returns on {new Date(blocked.until).toLocaleString()}
              </p>
            )}
            <button
              type="button"
              onClick={() => setBlocked(null)}
              className="mt-6 w-full rounded-xl border-2 border-border bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <SocialAuthButtons {...(next ? { redirectTo: next } : {})} />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorBox message={error} />}

        <FormField label={t("cms.login.emailLabel")}>
          <input
            type="email"
            autoComplete="email"
            className={inputClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com"
          />
        </FormField>

        <FormField label={t("cms.login.passwordLabel")}>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              className={inputClass + " pr-12"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </FormField>

        <div className="-mt-3">
          <Link
            to="/forgot-password"
            className="text-xs font-bold text-muted-foreground hover:text-foreground underline"
          >
            forgot your password?
          </Link>
        </div>


        <div className="flex items-center justify-between gap-3 -mt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                if (!e.target.checked) clearRememberedLogin();
              }}
              className="h-4 w-4 rounded border-2 border-border accent-[var(--primary)]"
            />
            save my info on this device
          </label>
          {hasSaved && (
            <button
              type="button"
              onClick={clearSaved}
              className="text-xs font-bold text-muted-foreground hover:text-foreground underline"
            >
              not you? clear saved info
            </button>
          )}
        </div>

        <button type="submit" disabled={loading} className={buttonClass}>
          <span className="inline-flex items-center justify-center gap-2">
            <LogIn size={16} />
            {loading ? t("cms.login.submitting") : t("cms.login.submit")}
          </span>
        </button>
      </form>
    </AuthShell>
  );
}
