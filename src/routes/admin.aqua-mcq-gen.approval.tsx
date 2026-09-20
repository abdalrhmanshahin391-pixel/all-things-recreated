import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { amgListGroups, amgClearGroupItems } from "@/lib/aqua-mcq-gen.functions";

export const Route = createFileRoute("/admin/aqua-mcq-gen/approval")({
  head: () => ({
    meta: [
      { title: "Question approval — Aqua MCQ Gen Pro" },
      { name: "description", content: "Pick a question group and review every extracted question beside the original page." },
      { property: "og:title", content: "Question approval — Aqua MCQ Gen Pro" },
      { property: "og:description", content: "Choose a group to open its side-by-side question approval screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalPicker,
});

type GroupRow = {
  id: string; name: string; status: string;
  total?: number; pending?: number; approved?: number; flagged?: number;
};

function ApprovalPicker() {
  const { user, loading, isRealAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) guardRedirect(navigate); }, [loading, user, navigate]);

  const listGroups = useServerFn(amgListGroups);
  const clearGroup = useServerFn(amgClearGroupItems);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try { setGroups(await listGroups() as any); }
    catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/forbidden/i.test(msg)) setDenied(true);
      else toast.error(msg);
      setGroups([]);
    }
  }, [listGroups]);

  useEffect(() => { if (user) void reload(); }, [user, reload]);

  /** Admin only: wipe the review copy but keep the pages in Aqua MCQ Gen Pro. */
  async function clearReview(g: GroupRow) {
    const ok = window.confirm(
      `Delete the questions of "${g.name}" from Question approval?\n\n` +
      "The group and its uploaded pages stay in Aqua MCQ Gen Pro, so you can send them again. " +
      "This cannot be undone.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await clearGroup({ data: { groupId: g.id } });
      toast.success(`${res.removed ?? 0} question(s) removed from approval.`);
      await reload();
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to admin
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CheckCheck className="h-6 w-6" /> Question approval
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose a group to review its questions beside the original pages.</p>

        <div className="mt-6 space-y-3">
          {denied ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              This tool is for admins and quality-assurance members only.
            </CardContent></Card>
          ) : groups === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your groups…
            </p>
          ) : groups.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              No groups yet. Create one on the{" "}
              <Link to="/admin/aqua-mcq-gen" className="underline">Aqua MCQ Gen Pro</Link> page and upload a paper first.
            </CardContent></Card>
          ) : (
            groups.map((g) => (
              <Card key={g.id} className="transition hover:border-primary hover:bg-primary/5">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <Link
                    to="/admin/aqua-mcq-gen/$groupId/approval"
                    params={{ groupId: g.id }}
                    className="min-w-0 flex-1"
                  >
                    <p className="font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.total ?? 0} questions · {g.approved ?? 0} approved
                      {(g.flagged ?? 0) > 0 ? ` · ${g.flagged} need a look` : ""}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{g.status}</Badge>
                    {isRealAdmin ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        title="Delete these questions from approval only"
                        onClick={() => clearReview(g)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Delete
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
