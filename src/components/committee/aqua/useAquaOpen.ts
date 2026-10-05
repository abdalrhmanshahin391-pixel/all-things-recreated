import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { aquaKey, aquaStateQuery, isAquaOpen, setAquaOpen, type AquaNodeType } from "@/lib/committee-aqua";

type Node = { type: AquaNodeType; id: string };

/** Reads which AQUA tiles are open and lets the committee open or close them. */
export function useAquaOpen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { canManage, canManageMembers } = useCommitteeRole();
  const { data: state, isLoading } = useQuery(aquaStateQuery);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isOpen = (type: AquaNodeType, id: string | null | undefined) => isAquaOpen(state, type, id);

  /**
   * Opens or closes one tile. Opening a tile also opens everything above it (a subject needs its semester, module
   * and year open to be reachable); closing only closes that tile.
   */
  async function toggle(node: Node, ancestors: (Node | null)[], open: boolean) {
    if (!canManage) return;
    const targets: (Node & { open: boolean })[] = [{ ...node, open }];
    let yearBlocked = false;
    if (open) {
      for (const a of ancestors) {
        if (!a || isAquaOpen(state, a.type, a.id)) continue;
        if (a.type === "year" && !canManageMembers) {
          yearBlocked = true;
          continue;
        }
        targets.push({ ...a, open: true });
      }
    }
    setBusyKey(aquaKey(node.type, node.id));
    try {
      await setAquaOpen(targets, user?.id);
      await qc.invalidateQueries({ queryKey: aquaStateQuery.queryKey });
      if (yearBlocked) toast.warning("Opened, but the year is still closed. Ask the committee head to open the year.");
      else toast.success(open ? "Opened for students" : "Closed (coming soon)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change this.");
    } finally {
      setBusyKey(null);
    }
  }

  return { state, isLoading, isOpen, toggle, busyKey, busy: (type: AquaNodeType, id: string) => busyKey === aquaKey(type, id) };
}