import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, refreshAuthProfile } from "@/hooks/useAuth";
import { AuthShell, FormField, inputClass, buttonClass, ErrorBox } from "@/components/AuthShell";

export const Route = createFileRoute("/complete-profile")({
  head: () => ({
    meta: [
      { title: "Finish your account — AquaQBank academy" },
      {
        name: "description",
        content: "Add your name, username and phone number to finish setting up your AquaQBank academy account.",
      },
    ],
  }),
  component: CompleteProfilePage,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (loading || seeded) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaName =
      (typeof meta['full_name'] === "string" && meta['full_name']) ||
      (typeof meta['name'] === "string" && meta['name']) ||
      "";
    setFullName((profile?.full_name || metaName || "").trim());
    const u = (profile?.username ?? "").trim();
    setUsername(UUID_RE.test(u) ? "" : u);
    setPhone((profile?.phone ?? "").trim());
    setSeeded(true);
  }, [loading, user, profile, seeded, navigate]);

  function next() {
    let target = "/";
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("aqua-post-auth-next");
      window.sessionStorage.removeItem("aqua-post-auth-next");
      if (saved && saved.startsWith("/") && !saved.startsWith("//")) target = saved;
    }
    window.location.href = target;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;

    const name = fullName.trim();
    const uname = username.trim();
    const tel = phone.trim();

    if (name.length < 2) return setError("Please enter your full name.");
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(uname))
      return setError("Username must be 3–30 letters, numbers or underscores.");
    if (!/^[0-9+\-\s()]{6,20}$/.test(tel)) return setError("Please enter a valid phone number.");

    setSaving(true);
    try {
      const { data: taken, error: rpcErr } = await (supabase.rpc as any)("identity_taken", {
        _username: uname,
        _phone: tel,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      const ownUsername = (profile?.username ?? "").toLowerCase() === uname.toLowerCase();
      const ownPhone = (profile?.phone ?? "") === tel;
      if (taken?.username && !ownUsername) throw new Error("This username is already taken.");
      if (taken?.phone && !ownPhone) throw new Error("This phone number is already registered.");

      const { error: upErr } = await supabase
        .from("profiles")
        .update({ full_name: name, username: uname, phone: tel })
        .eq("id", user.id);
      if (upErr) throw new Error(upErr.message);

      await refreshAuthProfile();
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(/duplicate|unique/i.test(msg) ? "That username or phone number is already in use." : msg);
      setSaving(false);
    }
  }

  return (
    <AuthShell
      eyebrow="almost there"
      title="finish your account."
      subtitle="just three details and you're in — your name, a username, and a phone number we can reach you on."
      footer={<span>you can change these later from your profile.</span>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorBox message={error} />}

        <FormField label="full name" required>
          <input
            type="text"
            autoComplete="name"
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
          />
        </FormField>

        <FormField label="username" required>
          <input
            type="text"
            autoComplete="username"
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
          />
        </FormField>

        <FormField label="phone number" required>
          <input
            type="tel"
            autoComplete="tel"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XXXXXXXX"
          />
        </FormField>

        <button type="submit" disabled={saving} className={buttonClass}>
          <span className="inline-flex items-center justify-center gap-2">
            <UserCheck size={16} />
            {saving ? "saving…" : "finish and continue"}
          </span>
        </button>
      </form>
    </AuthShell>
  );
}
