import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BadgeCheck, LogOut } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { refreshAuthProfile } from "@/lib/auth-store";
import {
  AuthShell,
  FormField,
  inputClass,
  buttonClass,
  ErrorBox,
} from "@/components/AuthShell";

export const Route = createFileRoute("/welcome")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finish your profile — AquaQBank academy" },
      {
        name: "description",
        content: "Add your name, username and phone number to finish setting up your AquaQBank academy account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next:
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : "",
  }),
  component: WelcomePage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name.").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(30, "Username must be less than 30 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, "Please enter a valid phone number."),
});

function suggestUsername(seed: string) {
  const base = seed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return base.length >= 3 ? base : "";
}

function WelcomePage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [form, setForm] = useState({ full_name: "", username: "", phone: "" });
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        window.location.replace("/login");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, username, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
      const fullName =
        (prof?.full_name ?? "").trim() || meta['full_name'] || meta['name'] || "";
      const currentUsername = (prof?.username ?? "").trim();
      setEmail(user.email ?? "");
      setForm({
        full_name: fullName,
        username:
          currentUsername && currentUsername !== user.id
            ? currentUsername
            : suggestUsername((user.email ?? "").split("@")[0] ?? ""),
        phone: prof?.phone ?? "",
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your information.");
      return;
    }
    const data = parsed.data;

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        window.location.replace("/login");
        return;
      }

      const { data: taken, error: rpcErr } = await (supabase.rpc as any)("identity_taken", {
        _username: data.username,
        _phone: data.phone,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        setSaving(false);
        return;
      }
      if (taken?.username) {
        setError("This username is already taken — try another one.");
        setSaving(false);
        return;
      }
      if (taken?.phone) {
        setError("This phone number is already registered.");
        setSaving(false);
        return;
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          username: data.username,
          phone: data.phone,
        })
        .eq("id", uid);

      if (updErr) {
        setError(
          /duplicate|unique/i.test(updErr.message)
            ? "That username or phone number is already in use."
            : updErr.message,
        );
        setSaving(false);
        return;
      }

      await refreshAuthProfile();
      try {
        sessionStorage.removeItem("aqua-auth-next");
      } catch {
        /* ignore */
      }
      if (next) {
        window.location.href = next;
        return;
      }
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <AuthShell
      eyebrow="one last step"
      title="let's set up your profile."
      subtitle="Tell us who you are so your courses, notes and certificates carry the right name."
      footer={
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.replace("/login");
          }}
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground underline"
        >
          <LogOut size={14} />
          sign out
        </button>
      }
    >
      {!ready ? (
        <div className="space-y-4">
          <div className="h-12 rounded-2xl bg-muted/50 animate-pulse" />
          <div className="h-12 rounded-2xl bg-muted/50 animate-pulse" />
          <div className="h-12 rounded-2xl bg-muted/50 animate-pulse" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <ErrorBox message={error} />}

          {email && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
              >
                <BadgeCheck size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  signed in as
                </p>
                <p className="truncate text-sm font-bold text-foreground">{email}</p>
              </div>
            </div>
          )}

          <FormField label="full name" required>
            <input
              type="text"
              autoComplete="name"
              className={inputClass}
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              placeholder="Your full name"
            />
          </FormField>

          <FormField label="username" required>
            <input
              type="text"
              autoComplete="username"
              className={inputClass}
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="Choose a username"
            />
          </FormField>

          <FormField label="phone number" required>
            <input
              type="tel"
              autoComplete="tel"
              className={inputClass}
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="07XXXXXXXX"
            />
          </FormField>

          <button type="submit" disabled={saving} className={buttonClass}>
            <span className="inline-flex items-center justify-center gap-2">
              {saving ? "Saving…" : "Continue"}
              <ArrowRight size={16} />
            </span>
          </button>
        </form>
      )}
    </AuthShell>
  );
}