import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export type PeopleOverview = {
  active_now: number;
  opened_today: number;
  total_users: number;
  new_today: number;
  new_week: number;
  new_month: number;
  new_prev_week: number;
  new_prev_month: number;
  logins_today: number;
  logins_week: number;
  logins_month: number;
  logins_prev_week: number;
  verified: number;
  unverified: number;
  blocked: number;
  suspended: number;
  never_logged_in: number;
  dormant_30d: number;
  revenue_cents: number;
  revenue_month_cents: number;
  paying_users: number;
  course_grants: number;
  owners: number;
  coupon_redemptions: number;
  coupon_discount: number;
  generated_at: string;
};

export type SeriesPoint = { day: string; signups: number; logins: number; active_users: number };
export type CohortRow = { cohort: string; size: number; w0: number; w1: number; w2: number; w3: number };
export type CourseStat = { course_id: string; title: string; price: number | null; owners: number; revenue_cents: number };
export type PeopleInsights = {
  avg_logins_with_courses: number;
  avg_logins_without_courses: number;
  avg_logins_overall: number;
  median_days_to_first_login: number;
  share_returning: number;
  share_active_7d: number;
  peak_hour: number;
  peak_weekday: string;
};
export type DirectoryRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  verified: boolean;
  locked_at: string | null;
  lock_until: string | null;
  lock_reason: string | null;
  roles: string[];
  courses: number;
  paid_cents: number;
  created_at: string;
  last_seen: string | null;
  login_count: number;
};

export type PeopleDashboard = {
  overview: PeopleOverview;
  series: SeriesPoint[];
  cohorts: CohortRow[];
  courses: CourseStat[];
  insights: PeopleInsights;
  directory: DirectoryRow[];
};

export const getPeopleDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => d ?? {})
  .handler(async ({ data, context }): Promise<PeopleDashboard> => {
    await assertAdmin(context);
    const days = Math.min(Math.max(Number(data?.days ?? 30) || 30, 7), 365);
    const sb = context.supabase as any;
    const [overview, series, cohorts, courses, insights, directory] = await Promise.all([
      sb.rpc("admin_people_overview"),
      sb.rpc("admin_people_timeseries", { _days: days }),
      sb.rpc("admin_people_retention"),
      sb.rpc("admin_people_course_stats"),
      sb.rpc("admin_people_insights"),
      sb.rpc("admin_people_directory"),
    ]);
    const first = [overview, series, cohorts, courses, insights, directory].find((r: any) => r.error);
    if (first) throw new Error(first.error.message);
    return {
      overview: overview.data as PeopleOverview,
      series: (series.data ?? []) as SeriesPoint[],
      cohorts: (cohorts.data ?? []) as CohortRow[],
      courses: (courses.data ?? []) as CourseStat[],
      insights: insights.data as PeopleInsights,
      directory: (directory.data ?? []) as DirectoryRow[],
    };
  });

export type PersonDetail = {
  courses: Array<{ course_id: string; title: string | null; created_at: string }>;
  payments: Array<{ id: string; amount_cents: number; currency: string | null; status: string | null; created_at: string }>;
  devices: Array<{ id: string; platform: string | null; user_agent: string | null; last_seen_at: string }>;
  logins: string[];
};

export const getPersonDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }): Promise<PersonDetail> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [uc, pe, dv, le] = await Promise.all([
      supabaseAdmin.from("user_courses").select("course_id, created_at, courses(title)").eq("user_id", data.userId),
      supabaseAdmin.from("payment_events").select("id, amount_cents, currency, status, created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("user_devices").select("id, platform, user_agent, last_seen_at").eq("user_id", data.userId).order("last_seen_at", { ascending: false }).limit(20),
      supabaseAdmin.from("user_login_events").select("occurred_at").eq("user_id", data.userId).order("occurred_at", { ascending: false }).limit(30),
    ]);
    return {
      courses: ((uc.data ?? []) as any[]).map((r) => ({
        course_id: r.course_id,
        title: r.courses?.title ?? null,
        created_at: r.created_at,
      })),
      payments: (pe.data ?? []) as any[],
      devices: (dv.data ?? []) as any[],
      logins: ((le.data ?? []) as any[]).map((r) => r.occurred_at),
    };
  });
