import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/** MCQ Gen Pro is admin-only: QA goes to Question Approval, everyone else home. */
export function AmgAdminOnly({ children }: { children: ReactNode }) {
  const { user, loading, isRealAdmin, isQa } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || isRealAdmin) return;
    if (user && isQa) navigate({ to: "/admin/aqua-mcq-gen/approval", replace: true });
    else navigate({ to: "/", replace: true });
  }, [loading, user, isRealAdmin, isQa, navigate]);
  if (loading || !isRealAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
