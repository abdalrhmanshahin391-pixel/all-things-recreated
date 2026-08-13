import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, MailCheck, UserPlus } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthShell,
  FormField,
  inputClass,
  buttonClass,
  ErrorBox,
} from "@/components/AuthShell";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — AquaQBank academy" },
      { name: "description", content: "Create your AquaQBank academy account." },
    ],
  }),
  component: RegisterPage,
});

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Please enter your full name.").max(100),
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(30, "Username must be less than 30 characters.")
      .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores."),
    email: z.string().trim().email("Please enter a valid email address.").max(255),
    phone: z
      .string()
      .trim()
      .max(20)
      .optional()
      .or(z.literal(""))
      .refine(
        (v) => !v || /^[0-9+\-\s()]{6,20}$/.test(v),
        "Please enter a valid phone number.",
      ),
    password: z.string().min(6, "Password must be at least 6 characters.").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

function RegisterPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);


  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accepted) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your information.");
      return;
    }
    const data = parsed.data;
    const phone = data.phone ? data.phone : null;

    setLoading(true);
    try {
      // Pre-check uniqueness on username and phone via security-definer RPC
      // (email uniqueness is enforced by Supabase Auth)
      const { data: taken, error: rpcErr } = await (supabase.rpc as any)("identity_taken", {
        _username: data.username,
        _phone: phone ?? "",
      });
      if (rpcErr) {
        setError(rpcErr.message);
        setLoading(false);
        return;
      }
      if (taken?.username) {
        setError("This username is already taken.");
        setLoading(false);
        return;
      }
      if (taken?.phone) {
        setError("This phone number is already registered.");
        setLoading(false);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: data.full_name,
            username: data.username,
            phone: phone ?? "",
          },
        },
      });

      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (msg.includes("registered") || msg.includes("exists")) {
          setError("This email is already registered.");
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      setSentTo(data.email);
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      // Surface unique-constraint races from the profile trigger
      if (/duplicate|unique/i.test(msg)) {
        setError("That username or phone number is already in use.");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        eyebrow={t("cms.register.eyebrow")}
        title="Check your inbox"
        subtitle="One last step before you can sign in."
        footer={
          <>
            Already verified?{" "}
            <Link to="/login" className="text-white font-semibold hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <div className="space-y-4 text-center">
          <span className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-primary text-primary-foreground">
            <MailCheck size={26} />
          </span>
          <p className="text-sm font-bold text-foreground">
            We sent a verification link to <span className="underline">{sentTo}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Open that email and click the link to activate your account. You won't be able to sign
            in until your email is verified. Check your spam folder if it doesn't arrive within a
            few minutes.
          </p>
          <Link to="/login" className={buttonClass + " block text-center"}>
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("cms.register.eyebrow")}
      title={t("cms.register.title")}
      subtitle={t("cms.register.subtitle")}
      footer={
        <>
          {t("cms.register.footerText")}{" "}
          <Link to="/login" className="text-white font-semibold hover:underline">
            {t("cms.register.footerLink")}
          </Link>
        </>
      }
    >
      <SocialAuthButtons />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorBox message={error} />}

        <FormField label={t("cms.register.fullName")} required>
          <input
            type="text"
            autoComplete="name"
            className={inputClass}
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Your full name"
          />
        </FormField>

        <FormField label={t("cms.register.username")} required>
          <input
            type="text"
            autoComplete="username"
            className={inputClass}
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            placeholder="Choose a username"
          />
        </FormField>

        <FormField label={t("cms.register.email")} required>
          <input
            type="email"
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="your.email@example.com"
          />
        </FormField>

        <FormField label={t("cms.register.phone")}>
          <input
            type="tel"
            autoComplete="tel"
            className={inputClass}
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="07XXXXXXXX"
          />
        </FormField>

        <FormField label={t("cms.register.password")} required>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              className={inputClass + " pr-12"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="At least 6 characters"
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

        <FormField label={t("cms.register.confirm")} required>
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            className={inputClass}
            value={form.confirm}
            onChange={(e) => update("confirm", e.target.value)}
            placeholder="Re-enter your password"
          />
        </FormField>

        <div className="rounded-xl border-2 border-border bg-muted/40 p-3">
          <label className="flex items-start gap-2 text-xs font-bold text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-border accent-[var(--primary)]"
            />
            <span>
              I have read and accept the{" "}
              <Link to="/terms" target="_blank" className="font-black underline">
                Terms of Service
              </Link>
              ,{" "}
              <Link to="/privacy" target="_blank" className="font-black underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/refund-policy" target="_blank" className="font-black underline">
                Refund Policy
              </Link>
              .
            </span>
          </label>
          <p className="mt-2 ps-6 text-[11px] leading-relaxed text-muted-foreground">
            AquaQBank sells online access to solved university archive exam questions with written
            explanations — digital content only, no physical goods. Access is sold per academic year
            or per semester depending on the course. Orders are processed by Paddle.com, our
            reseller and Merchant of Record, which will appear on your statement. Content is
            unlocked immediately, so purchases are non-refundable once accessed, except in the cases
            listed in the Refund Policy. Accounts are personal and must not be shared.
          </p>
        </div>

        <button type="submit" disabled={loading || !accepted} className={buttonClass}>
          <span className="inline-flex items-center justify-center gap-2">
            <UserPlus size={16} />
            {loading ? t("cms.register.submitting") : t("cms.register.submit")}
          </span>
        </button>
      </form>
    </AuthShell>
  );
}
