/** Shows a name with a capital first letter ("anatomy" becomes "Anatomy") and leaves the rest as typed. */
export function capitalizeFirst(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}