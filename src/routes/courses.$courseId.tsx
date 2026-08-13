import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/courses/$courseId")({
  component: CourseLayout,
});

/**
 * Course layout — enforces the paywall at the route level.
 * If the course has a price and the signed-in user is neither admin, directly
 * enrolled, nor covered by a package purchase, redirect to checkout.
 */
function CourseLayout() {
  const { courseId } = Route.useParams();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user || isAdmin) return;
    let cancelled = false;

    (async () => {
      const { data: c } = await (supabase.from as any)("courses")
        .select("price")
        .eq("id", courseId)
        .maybeSingle();
      const price = Number(c?.price ?? 0);
      if (price <= 0) return;

      // Direct enrollment
      const { data: enr } = await (supabase.from as any)("user_courses")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();
      if (cancelled) return;
      if (enr) return;

      // Package coverage: any active package_purchase whose package contains this course
      const { data: purchases } = await (supabase.from as any)("package_purchases")
        .select("package_id, status")
        .eq("user_id", user.id);
      const pkgIds = (purchases ?? [])
        .filter((p: any) => !p.status || p.status === "active" || p.status === "completed")
        .map((p: any) => p.package_id);
      if (pkgIds.length > 0) {
        const { data: links } = await (supabase.from as any)("package_courses")
          .select("package_id")
          .eq("course_id", courseId)
          .in("package_id", pkgIds);
        if (cancelled) return;
        if (links && links.length > 0) return;
      }

      navigate({ to: "/courses/$courseId/checkout", params: { courseId } });
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId, user, isAdmin, loading, navigate]);

  return <Outlet />;
}
