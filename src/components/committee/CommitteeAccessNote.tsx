import { Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";

/**
 * Explains *why* the edit controls are missing instead of silently rendering a
 * read-only page. Only signed-in visitors see it, and only when they cannot
 * manage committee content.
 */
export function CommitteeAccessNote() {
  const { user, loading } = useAuth();
  const { canManage, isRealAdmin, isRealCommittee } = useCommitteeRole();

  if (loading || !user || canManage) return null;

  const adminModeOff = isRealAdmin && !isRealCommittee;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <Info size={14} className="mt-0.5 shrink-0" />
      <p>
        {adminModeOff
          ? "Editing tools are hidden because admin mode is off. Turn it back on from the account menu."
          : "You are viewing this section as a student. Editing is limited to members of لجنة الطب والجراحة — ask the committee head to add you to the team."}
      </p>
    </div>
  );
}