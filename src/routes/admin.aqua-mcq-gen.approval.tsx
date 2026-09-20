import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCheck, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { amgListGroups } from "@/lib/aqua-mcq-gen.functions";

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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) guardRedirect(navigate); }, [loading, user, navigate]);

  const listGroups = useServerFn(amgListGroups);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try { setGroups(await listGroups() as any); }
      catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/forbidden/i.test(msg)) setDenied(true);
        else toast.error(msg);
        setGroups([]);
      }
    })();
  }, [user, listGroups]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Link to="/admin/aqua-mcq-gen" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Aqua MCQ Gen Pro
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
              <Link key={g.id} to="/admin/aqua-mcq-gen/$groupId/approval" params={{ groupId: g.id }} className="block">
                <Card className="transition hover:border-primary hover:bg-primary/5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.total ?? 0} questions · {g.approved ?? 0} approved
                        {(g.flagged ?? 0) > 0 ? ` · ${g.flagged} need a look` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{g.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
