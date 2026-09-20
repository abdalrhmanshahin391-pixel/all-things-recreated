import { GraduationCap, ShieldCheck } from "lucide-react";

/** Special badge for site administrators. */
export function AdminBadge({
  size = "sm",
  dot,
  className = "",
}: {
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  if (dot) {
    return (
      <span
        title="Admin"
        aria-label="Admin"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full admin-chip ${className}`}
      >
        <ShieldCheck size={11} />
      </span>
    );
  }
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title="Admin"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-black uppercase tracking-[0.14em] admin-chip ${pad} ${className}`}
    >
      <ShieldCheck size={size === "md" ? 13 : 11} />
      Admin
    </span>
  );
}

/** Neutral badge for signed-in members without any special role. */
export function StudentBadge({
  size = "sm",
  dot,
  className = "",
}: {
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  if (dot) {
    return (
      <span
        title="Student"
        aria-label="Student"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full student-chip ${className}`}
      >
        <GraduationCap size={11} />
      </span>
    );
  }
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title="Student"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold student-chip ${pad} ${className}`}
    >
      <GraduationCap size={size === "md" ? 13 : 11} />
      Student
    </span>
  );
}

/** Full pill on tablet and up, compact chip on phones. */
export function AdminBadgeResponsive({ className = "" }: { className?: string }) {
  return (
    <>
      <AdminBadge className={`hidden sm:inline-flex ${className}`} />
      <AdminBadge dot className={`sm:hidden ${className}`} />
    </>
  );
}

export function StudentBadgeResponsive({ className = "" }: { className?: string }) {
  return (
    <>
      <StudentBadge className={`hidden sm:inline-flex ${className}`} />
      <StudentBadge dot className={`sm:hidden ${className}`} />
    </>
  );
}