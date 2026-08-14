export type OnboardingProfile = {
  full_name?: string | null;
  username?: string | null;
  phone?: string | null;
} | null;

/**
 * A brand-new social sign-in lands with a placeholder profile: the username
 * defaults to the account id and the name/phone can be blank. Those accounts
 * get sent to /welcome before they can use the site.
 */
export function needsOnboarding(userId: string, profile: OnboardingProfile): boolean {
  if (!profile) return true;
  const username = (profile.username ?? "").trim();
  const fullName = (profile.full_name ?? "").trim();
  if (!username || username === userId) return true;
  if (fullName.length < 2) return true;
  return false;
}