import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SignedOutNotice } from "@/components/committee/SignedOutNotice";
import { useAuth } from "@/hooks/useAuth";

function YearGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-muted/40" />;
  if (!user) return <SignedOutNotice />;
  return <Outlet />;
}

export const Route = createFileRoute("/committee/$year")({
  component: YearGate,
});
