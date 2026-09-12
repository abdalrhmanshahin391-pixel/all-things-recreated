import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PackageType = "individual" | "group";
export type PackageKind = "courses" | "lectures" | "mixed";
export type PackageSelectionMode = "fixed" | "student_choice";

export type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  package_type: PackageType;
  group_size: number;
  paddle_price_id: string | null;
  published: boolean;
  sort_order: number;
  image_url?: string | null;
  notes?: string | null;
  original_price?: number | null;
  badge_text?: string | null;
  package_kind?: PackageKind;
  selection_mode?: PackageSelectionMode;
  choice_count?: number;
  features?: string[] | any;
  created_at?: string;
  updated_at?: string;
};

export type PackageCourseLink = {
  id: string;
  package_id: string;
  course_id: string;
  note: string | null;
  sort_order: number;
};

export type PackageWithCourses = PackageRow & {
  courses: Array<{
    id: string;
    title: string;
    year: number;
    kind?: string;
    image_url?: string | null;
    questions_count_mid: number;
    questions_count_final: number;
    note: string | null;
    sort_order: number;
  }>;
};

async function assertAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden");
}

/** Public: list packages + their courses, only published. */
export const listPublishedPackages = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pkgs, error } = await (supabaseAdmin.from("packages") as any)
      .select("*")
      .eq("published", true)
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    const list = (pkgs ?? []) as PackageRow[];
    if (list.length === 0) return [] as PackageWithCourses[];
    const ids = list.map((p) => p.id);
    const { data: links } = await (supabaseAdmin.from("package_courses") as any)
      .select("id,package_id,course_id,note,sort_order,courses(id,title,year,kind,image_url,questions_count_mid,questions_count_final)")
      .in("package_id", ids)
      .order("sort_order");
    // Patch in real subject/question counts so package cards never show stale totals.
    const courseIds = Array.from(
      new Set(((links ?? []) as any[]).filter((l) => l.courses).map((l) => l.courses.id as string)),
    );
    const realCounts = new Map<string, number>();
    if (courseIds.length) {
      try {
        const { data: counts } = await (supabaseAdmin.rpc as any)("get_course_real_counts", {
          _course_ids: courseIds,
        });
        (counts ?? []).forEach((r: any) => {
          realCounts.set(r.course_id, Number(r.questions_count) || 0);
        });
      } catch (countErr) {
        console.warn("Could not fetch real counts for courses in packages:", countErr);
      }
    }
    return list.map((p) => ({
      ...p,
      courses: ((links ?? []) as any[])
        .filter((l) => l.package_id === p.id && l.courses)
        .map((l) => {
          const real = realCounts.get(l.courses.id);
          return {
            id: l.courses.id,
            title: l.courses.title,
            year: l.courses.year,
            kind: l.courses.kind ?? "questions",
            image_url: l.courses.image_url ?? null,
            // Put real count in mid bucket, zero out final — UI sums them.
            questions_count_mid:
              real !== undefined ? real : l.courses.questions_count_mid ?? 0,
            questions_count_final: real !== undefined ? 0 : l.courses.questions_count_final ?? 0,
            note: l.note,
            sort_order: l.sort_order,
          };
        }),
    })) as PackageWithCourses[];
  },
);

/** Admin: list every package (published or not) + courses. */
export const adminListPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pkgs, error } = await (supabaseAdmin.from("packages") as any)
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    const list = (pkgs ?? []) as PackageRow[];
    if (list.length === 0) return [] as PackageWithCourses[];
    const ids = list.map((p) => p.id);
    const { data: links } = await (supabaseAdmin.from("package_courses") as any)
      .select("id,package_id,course_id,note,sort_order,courses(id,title,year,kind,image_url,questions_count_mid,questions_count_final)")
      .in("package_id", ids)
      .order("sort_order");
    return list.map((p) => ({
      ...p,
      courses: ((links ?? []) as any[])
        .filter((l) => l.package_id === p.id && l.courses)
        .map((l) => ({
          id: l.courses.id,
          title: l.courses.title,
          year: l.courses.year,
          kind: l.courses.kind ?? "questions",
          image_url: l.courses.image_url ?? null,
          questions_count_mid: l.courses.questions_count_mid ?? 0,
          questions_count_final: l.courses.questions_count_final ?? 0,
          note: l.note,
          sort_order: l.sort_order,
        })),
    })) as PackageWithCourses[];
  });

export const adminUpsertPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string;
      name: string;
      description?: string | null;
      price: number;
      currency?: string;
      package_type: PackageType;
      group_size: number;
      published?: boolean;
      sort_order?: number;
      image_url?: string | null;
      notes?: string | null;
      original_price?: number | null;
      badge_text?: string | null;
      package_kind?: PackageKind;
      selection_mode?: PackageSelectionMode;
      choice_count?: number;
      features?: string[];
      paddle_price_id?: string | null;
    }) => {
      if (!data.name?.trim()) throw new Error("name required");
      if (data.price < 0) throw new Error("price must be >= 0");
      if (!["individual", "group"].includes(data.package_type))
        throw new Error("invalid package_type");
      if (data.package_type === "group" && data.group_size < 2)
        throw new Error("group_size must be >= 2 for group packages");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = {
      name: data.name.trim(),
      description: data.description ?? null,
      price: data.price,
      currency: (data.currency ?? "usd").toLowerCase(),
      package_type: data.package_type,
      group_size: data.package_type === "individual" ? 1 : data.group_size,
      published: data.published ?? false,
      sort_order: data.sort_order ?? 0,
      image_url: data.image_url ?? null,
      notes: data.notes ?? null,
      original_price: data.original_price != null && data.original_price > 0 ? data.original_price : null,
      badge_text: data.badge_text?.trim() || null,
      package_kind: data.package_kind ?? "courses",
      selection_mode: data.selection_mode ?? "fixed",
      choice_count: data.choice_count && data.choice_count > 0 ? data.choice_count : 3,
      features: Array.isArray(data.features) ? data.features : [],
    };
    if (data.paddle_price_id !== undefined) {
      payload.paddle_price_id = data.paddle_price_id || null;
    }

    if (data.id) {
      const { data: row, error } = await (supabaseAdmin.from("packages") as any)
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await (supabaseAdmin.from("packages") as any)
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const adminDeletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("packages") as any)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetPackageCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      packageId: string;
      courses: Array<{ courseId: string; note?: string | null; sortOrder?: number }>;
    }) => {
      if (!data?.packageId) throw new Error("packageId required");
      if (!Array.isArray(data.courses)) throw new Error("courses array required");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Replace strategy: delete + insert
    const { error: delErr } = await (supabaseAdmin.from("package_courses") as any)
      .delete()
      .eq("package_id", data.packageId);
    if (delErr) throw delErr;
    if (data.courses.length > 0) {
      const rows = data.courses.map((c, idx) => ({
        package_id: data.packageId,
        course_id: c.courseId,
        note: c.note ?? null,
        sort_order: c.sortOrder ?? idx,
      }));
      const { error: insErr } = await (supabaseAdmin.from("package_courses") as any).insert(rows);
      if (insErr) throw insErr;
    }
    return { ok: true };
  });

/** Auth: search users for group member picker. */
export const searchUsersForGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string }) => {
    if (!data?.query || data.query.trim().length < 2)
      throw new Error("query must be at least 2 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("search_users_for_group", {
      _query: data.query.trim(),
      _exclude: context.userId,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      username: string;
      full_name: string;
      email: string;
    }>;
  });

/**
 * Auth: validate a package buy intent.
 * Returns the package's paddle_price_id + sanitized customData for Paddle.Checkout.open.
 * For group packages, validates member count and that all member ids exist.
 * For student-choice packages, validates selected course IDs.
 */
export const openPackageCheckoutData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { packageId: string; memberIds: string[]; selectedCourseIds?: string[] }) => {
    if (!data?.packageId) throw new Error("packageId required");
    if (!Array.isArray(data.memberIds)) throw new Error("memberIds array required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pkg, error } = await (supabaseAdmin.from("packages") as any)
      .select("*")
      .eq("id", data.packageId)
      .eq("published", true)
      .maybeSingle();
    if (error) throw error;
    if (!pkg) throw new Error("Package not found or not published");

    // Auto-sync Paddle price if missing
    if (!pkg.paddle_price_id && Number(pkg.price) > 0) {
      try {
        const { syncPaddlePackagePrice } = await import("@/utils/payments.functions");
        const syncRes = await syncPaddlePackagePrice({
          data: {
            packageId: pkg.id,
            name: pkg.name,
            price: Number(pkg.price),
            currency: pkg.currency || "USD",
          },
        });
        if (syncRes?.paddlePriceId) {
          pkg.paddle_price_id = syncRes.paddlePriceId;
        }
      } catch (syncErr) {
        console.warn("Auto-sync package to Paddle failed:", syncErr);
      }
    }

    if (!pkg.paddle_price_id)
      throw new Error("This package isn't connected to payments yet. Ask an admin.");
    const buyerId: string = context.userId;
    const memberIds = Array.from(new Set(data.memberIds.filter((m) => m && m !== buyerId)));

    if (pkg.package_type === "group") {
      const needed = pkg.group_size - 1;
      if (memberIds.length !== needed)
        throw new Error(`Pick exactly ${needed} member${needed === 1 ? "" : "s"} for this group package.`);
      // Validate all member ids exist as registered profiles
      const { data: foundProfiles, error: pErr } = await (supabaseAdmin.from("profiles") as any)
        .select("id")
        .in("id", memberIds);
      if (pErr) throw pErr;
      if ((foundProfiles ?? []).length !== memberIds.length)
        throw new Error("One or more selected users could not be verified.");
    } else if (memberIds.length > 0) {
      throw new Error("Individual packages cannot include extra members.");
    }

    const selectedCourseIds = Array.isArray(data.selectedCourseIds)
      ? Array.from(new Set(data.selectedCourseIds.filter(Boolean)))
      : [];

    if (pkg.selection_mode === "student_choice") {
      const needed = pkg.choice_count || 3;
      if (selectedCourseIds.length !== needed) {
        throw new Error(`Please select exactly ${needed} courses/lectures for this package.`);
      }
      // Verify chosen courses exist
      const { data: foundCourses, error: cErr } = await (supabaseAdmin.from("courses") as any)
        .select("id")
        .in("id", selectedCourseIds);
      if (cErr) throw cErr;
      if ((foundCourses ?? []).length !== needed) {
        throw new Error("One or more selected courses are invalid.");
      }
    }

    return {
      paddlePriceId: pkg.paddle_price_id as string,
      customData: {
        packageId: pkg.id,
        memberIds,
        buyerId,
        selectedCourseIds: selectedCourseIds.length > 0 ? selectedCourseIds : undefined,
      },
    };
  });

