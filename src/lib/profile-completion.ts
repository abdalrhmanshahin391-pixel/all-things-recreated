import type { Profile } from "@/lib/auth-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Social sign-ups (Google / Apple) land with a placeholder username (the auth
 * user id) and no phone, because the provider never asks for them. Those users
 * get one short screen to finish their account.
 */
export function needsProfileCompletion(profile: Profile | null): boolean {
  if (!profile) return false;
  const username = (profile.username ?? "").trim();
  if (!username || UUID_RE.test(username)) return true;
  if (!(profile.full_name ?? "").trim()) return true;
  if (!(profile.phone ?? "").trim()) return true;
  return false;
}
