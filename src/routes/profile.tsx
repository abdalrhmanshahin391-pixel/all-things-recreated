import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile Settings — AquaQBank" },
      {
        name: "description",
        content: "Update your name, contact details, devices and password on AquaQBank.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Profile Settings — AquaQBank" },
      { property: "og:description", content: "Manage your account details and security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function sendResetLink() {
    if (!user?.email) return;
    setPwMsg(null);
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    setPwMsg(
      error
        ? { type: "err", text: error.message }
        : { type: "ok", text: `We sent a reset link to ${user.email}. Check your inbox.` },
    );
  }


  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  // Seed from auth user immediately, then refine when profile row loads.
  useEffect(() => {
    if (user) {
      setEmail((prev) => prev || user.email || "");
      const meta = (user.user_metadata ?? {}) as Record<string, any>;
      setFullName((prev) => prev || meta.full_name || meta.name || "");
      setUsername((prev) => prev || meta.username || (user.email ? user.email.split("@")[0] : ""));
      setPhone((prev) => prev || meta.phone || "");
    }
  }, [user]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setUsername(profile.username ?? "");
      setEmail(profile.email ?? "");
      setPhone(profile.phone ?? "");
      return;
    }
    // No profile row exists yet → create one so the form has something to save against.
    if (!loading && user && !profile) {
      const meta = (user.user_metadata ?? {}) as Record<string, any>;
      supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email ?? "",
            full_name: meta.full_name || meta.name || "",
            username: meta.username || (user.email ? user.email.split("@")[0] : user.id),
            phone: meta.phone || null,
          },
          { onConflict: "id" },
        )
        .then(() => {});
    }
  }, [profile, loading, user]);

  async function saveInfo(e: FormEvent) {
    e.preventDefault();
    setInfoMsg(null);
    if (!user) return;
    setSavingInfo(true);
    try {
      // unique checks
      if (username !== profile?.username) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .neq("id", user.id)
          .maybeSingle();
        if (data) {
          setInfoMsg({ type: "err", text: "That username is already taken." });
          setSavingInfo(false);
          return;
        }
      }
      if (phone && phone !== profile?.phone) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("phone", phone)
          .neq("id", user.id)
          .maybeSingle();
        if (data) {
          setInfoMsg({ type: "err", text: "That phone number is already in use." });
          setSavingInfo(false);
          return;
        }
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          username,
          phone: phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) {
        setInfoMsg({ type: "err", text: error.message });
      } else {
        setInfoMsg({ type: "ok", text: "Profile updated successfully." });
      }
    } finally {
      setSavingInfo(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 6) {
      setPwMsg({ type: "err", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "err", text: "New passwords do not match." });
      return;
    }
    if (!user?.email) return;
    setSavingPw(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (signInErr) {
        setPwMsg({ type: "err", text: "Current password is incorrect." });
        setSavingPw(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        setPwMsg({ type: "err", text: error.message });
      } else {
        setPwMsg({ type: "ok", text: "Password changed successfully." });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      }
    } finally {
      setSavingPw(false);
    }
  }


  if (loading || !user) {
    return <div className="min-h-screen bg-background" />;
  }

  const initial = (fullName || username || email || "?").trim().charAt(0).toUpperCase();
  const pwScore =
    newPw.length === 0
      ? null
      : newPw.length < 6
        ? { label: "Too short", tone: "text-destructive", bar: "w-1/4 bg-destructive" }
        : newPw.length < 10
          ? { label: "Okay", tone: "text-amber-600", bar: "w-2/4 bg-amber-500" }
          : /[^a-zA-Z0-9]/.test(newPw) && /\d/.test(newPw)
            ? { label: "Strong", tone: "text-emerald-600", bar: "w-full bg-emerald-500" }
            : { label: "Good", tone: "text-emerald-600", bar: "w-3/4 bg-emerald-500" };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-24">
        {/* Header */}
        <header className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Your account
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight">Profile Settings</h1>
          <p className="mt-3 text-muted-foreground">
            Update your details, manage your devices and keep your account secure.
          </p>
        </header>

        {/* Identity card */}
        <div className="mb-8 flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{fullName || username || "Student"}</div>
            <div className="truncate text-sm text-muted-foreground">
              {username ? `@${username}` : ""}
              {username && email ? " · " : ""}
              {email}
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <SectionCard icon={<UserRound size={18} />} title="Personal Information">
          <form onSubmit={saveInfo} className="space-y-5">
            {infoMsg && <MessageBox msg={infoMsg} />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Full Name">
                <input
                  className={inputCls}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </Field>
              <Field label="Username">
                <input
                  className={inputCls}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                />
              </Field>
            </div>
            <Field label="Email" hint="Your email is used to sign in and can't be changed here.">
              <input className={`${inputCls} opacity-60`} value={email} disabled />
            </Field>
            <Field label="Phone Number">
              <input
                className={inputCls}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
              />
            </Field>
            <button
              type="submit"
              disabled={savingInfo}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              <Save size={16} />
              {savingInfo ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </SectionCard>

        {/* Change Password */}
        <SectionCard icon={<KeyRound size={18} />} title="Change Password">
          <form onSubmit={changePassword} className="space-y-5">
            {pwMsg && <MessageBox msg={pwMsg} />}
            <Field label="Current Password">
              <PasswordInput value={currentPw} onChange={setCurrentPw} />
            </Field>
            <Field label="New Password" hint="Use at least 6 characters.">
              <PasswordInput value={newPw} onChange={setNewPw} />
              {pwScore && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all ${pwScore.bar}`} />
                  </div>
                  <span className={`mt-1 inline-block text-xs font-semibold ${pwScore.tone}`}>
                    {pwScore.label}
                  </span>
                </div>
              )}
            </Field>
            <Field label="Confirm New Password">
              <PasswordInput value={confirmPw} onChange={setConfirmPw} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingPw}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                <ShieldCheck size={16} />
                {savingPw ? "Updating…" : "Change Password"}
              </button>
              <button
                type="button"
                onClick={sendResetLink}
                disabled={sendingReset}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-bold text-muted-foreground transition hover:text-foreground hover:bg-muted disabled:opacity-60"
              >
                <KeyRound size={16} />
                {sendingReset ? "Sending…" : "Email me a reset link"}
              </button>
            </div>
          </form>
        </SectionCard>


        <div className="mt-10 text-center">
          <Link
            to="/"
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function PasswordInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={`${inputCls} pr-12`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function MessageBox({ msg }: { msg: { type: "ok" | "err"; text: string } }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
        msg.type === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      {msg.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span>{msg.text}</span>
    </div>
  );
}
