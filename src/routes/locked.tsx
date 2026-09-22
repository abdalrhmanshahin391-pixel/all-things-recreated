import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, ShieldCheck, Send, LifeBuoy, KeyRound, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getLockInfo, redeemUnlockCode } from "@/lib/devices.functions";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { toast } from "sonner";

export const Route = createFileRoute("/locked")({
  head: () => ({
    meta: [
      { title: "Account temporarily locked — AquaQBank" },
      {
        name: "description",
        content:
          "Your account is locked because it was opened on more devices than allowed. Contact us to receive a reactivation code.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Account temporarily locked — AquaQBank" },
      { property: "og:description", content: "Enter your reactivation code to restore access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LockedPage,
});

function LockedPage() {
  const navigate = useNavigate();
  const info = useServerFn(getLockInfo);
  const redeem = useServerFn(redeemUnlockCode);

  const [state, setState] = useState<{
    locked: boolean;
    lockReason: string | null;
    lockKind: string | null;
    lockUntil: string | null;
    lockMessage: string | null;
    limit: number;
    deviceCount: number;
    name: string;
    telegramUrl: string;
    supportUrl: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const lockMessage = !state
    ? "Checking your account…"
    : state.lockReason === "device_limit"
      ? `This account has used all ${state.limit} allowed device slots. A new device cannot access the account until it is reactivated.`
      : state.lockReason === "content_protection"
        ? "Access was paused by the content-protection system. Contact us so we can review and reactivate the account."
        : state.lockKind === "suspend" && state.lockUntil
          ? `This account is temporarily suspended until ${new Date(state.lockUntil).toLocaleString()}. ${state.lockMessage ?? "Contact us if you need help."}`
          : state.lockMessage || "This account was paused by an administrator. Contact us to restore access.";

  useEffect(() => {
    let alive = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await info();
        if (!alive) return;
        if (!res.locked) {
          window.location.replace("/");
          return;
        }
        setState(res);
      } catch {
        if (alive) navigate({ to: "/login" });
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const res = await redeem({ data: { code: code.trim(), deviceId: getOrCreateDeviceId() } });
      if (res.ok) {
        toast.success("Account reactivated — welcome back!");
        window.location.href = "/";
      } else if (res.reason === "rate_limited") {
        toast.error("Too many attempts. Please wait 15 minutes and contact us.");
      } else {
        toast.error("That code is not valid.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader variant="light" />
      <main className="mx-auto max-w-2xl px-6 pt-32 pb-24">
        {!state ? (
          <div className="rounded-3xl border border-border bg-card px-8 py-16 text-center shadow-xl">
            <Loader2 size={30} className="mx-auto animate-spin text-primary" />
            <h1 className="mt-5 text-xl font-black">Checking your account…</h1>
            <p className="mt-2 text-sm text-muted-foreground">You will return to the site automatically if your account is active.</p>
          </div>
        ) : (
        <div className="rounded-3xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="bg-primary/10 px-8 py-10 text-center">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/15 grid place-items-center">
              <Lock size={28} className="text-primary" />
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight">
              Account temporarily locked
            </h1>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              {lockMessage}
            </p>
          </div>

          <div className="px-8 py-8 space-y-8">
            <form onSubmit={submit} className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound size={16} className="text-primary" />
                Reactivation code
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter the code we sent you"
                  autoComplete="off"
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="submit"
                  disabled={busy || !code.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Reactivate
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {state?.lockReason === "device_limit"
                  ? `A valid code clears the saved devices and registers this one as device 1 of ${state.limit}.`
                  : "Enter the reactivation code provided by the support team."}
              </p>
            </form>

            <div className="rounded-2xl border border-border bg-muted/40 p-6">
              <h2 className="text-sm font-bold mb-2">Need a code? Talk to us</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Message us and we will verify the account and send your reactivation code.
              </p>
              <div className="flex flex-wrap gap-3">
                {state?.telegramUrl ? (
                  <a
                    href={state.telegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
                  >
                    <Send size={15} /> Telegram
                  </a>
                ) : null}
                {state?.supportUrl ? (
                  <a
                    href={state.supportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-muted"
                  >
                    <LifeBuoy size={15} /> Contact us
                  </a>
                ) : null}
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-muted"
                >
                  Back to home
                </Link>
              </div>
            </div>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
