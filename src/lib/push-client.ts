import { supabase } from "@/integrations/supabase/client";
import { getPushPublicKey } from "@/lib/push.functions";

const SW_PATH = "/push-sw.js";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad only allow notifications once the site is on the Home Screen. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && "ontouchend" in document);
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

/** iOS Safari hides PushManager until the app is installed. */
export function needsInstallFirst(): boolean {
  return isIos() && !isInstalled() && !pushSupported();
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyOf(sub: PushSubscription, name: "p256dh" | "auth"): string {
  const raw = sub.getKey(name);
  if (!raw) return "";
  let s = "";
  for (const b of new Uint8Array(raw)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** Must be called from a user gesture — never on page load. */
export async function enablePush(lang: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const { key } = await getPushPublicKey();
  if (!key) return { ok: false, reason: "not-configured" };

  const reg = await navigator.serviceWorker.register(SW_PATH);
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, reason: "signed-out" };

  const { error } = await (supabase.from as any)("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint: sub.endpoint,
      p256dh: keyOf(sub, "p256dh"),
      auth: keyOf(sub, "auth"),
      lang,
      user_agent: navigator.userAgent.slice(0, 200),
      enabled: true,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await (supabase.from as any)("push_subscriptions").delete().eq("endpoint", endpoint);
}
