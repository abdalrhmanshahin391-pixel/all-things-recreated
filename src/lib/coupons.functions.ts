import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  courses: { id: string; title: string }[];
};

export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CouponRow[]> => {
    await assertAdmin(context);
    const { supabase } = context;
    const [{ data: coupons, error }, { data: links }, { data: courses }] = await Promise.all([
      supabase.from("coupons").select("*").order("created_at", { ascending: false }),
      supabase.from("coupon_courses").select("coupon_id, course_id"),
      supabase.from("courses").select("id, title"),
    ]);
    if (error) throw new Error(error.message);
    const courseMap = new Map((courses ?? []).map((c: any) => [c.id, c.title as string]));
    const byCoupon = new Map<string, { id: string; title: string }[]>();
    for (const l of (links ?? []) as { coupon_id: string; course_id: string }[]) {
      const arr = byCoupon.get(l.coupon_id) ?? [];
      arr.push({ id: l.course_id, title: courseMap.get(l.course_id) ?? "Unknown" });
      byCoupon.set(l.coupon_id, arr);
    }
    return (coupons ?? []).map((c: any) => ({
      ...c,
      discount_value: Number(c.discount_value),
      courses: byCoupon.get(c.id) ?? [],
    }));
  });

export const adminSaveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      code: string;
      discount_type: "percent" | "fixed";
      discount_value: number;
      max_uses: number | null;
      starts_at: string | null;
      expires_at: string | null;
      is_active: boolean;
      course_ids: string[]; // empty = all courses
    }) => {
      const code = (d.code ?? "").trim().toUpperCase();
      if (!code || code.length < 3 || code.length > 40) throw new Error("Code must be 3–40 chars");
      if (!/^[A-Z0-9_-]+$/.test(code)) throw new Error("Code can only contain A–Z, 0–9, _ and -");
      const dv = Number(d.discount_value);
      if (!Number.isFinite(dv) || dv < 0) throw new Error("Invalid discount value");
      if (d.discount_type === "percent" && dv > 100) throw new Error("Percent must be ≤ 100");
      return {
        id: d.id,
        code,
        discount_type: d.discount_type,
        discount_value: dv,
        max_uses: d.max_uses && d.max_uses > 0 ? Math.floor(d.max_uses) : null,
        starts_at: d.starts_at || null,
        expires_at: d.expires_at || null,
        is_active: !!d.is_active,
        course_ids: Array.isArray(d.course_ids) ? d.course_ids : [],
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const payload = {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      max_uses: data.max_uses,
      starts_at: data.starts_at,
      expires_at: data.expires_at,
      is_active: data.is_active,
      created_by: userId,
    };
    let couponId = data.id;
    if (couponId) {
      const { error } = await supabase.from("coupons").update(payload).eq("id", couponId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("coupons")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      couponId = (inserted as any).id as string;
    }

    // Replace course links
    await supabase.from("coupon_courses").delete().eq("coupon_id", couponId);
    if (data.course_ids.length > 0) {
      const rows = data.course_ids.map((cid) => ({ coupon_id: couponId, course_id: cid }));
      const { error } = await supabase.from("coupon_courses").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, id: couponId };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; courseId: string }) => ({
    code: (d.code ?? "").trim(),
    courseId: d.courseId,
  }))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("validate_coupon", {
      _code: data.code,
      _course_id: data.courseId,
    });
    if (error) throw new Error(error.message);
    return res as {
      valid: boolean;
      reason?: string;
      price_before?: number;
      price_after?: number;
      code?: string;
      discount_type?: "percent" | "fixed";
      discount_value?: number;
    };
  });

export const applyCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; courseId: string }) => ({
    code: (d.code ?? "").trim(),
    courseId: d.courseId,
  }))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("apply_coupon", {
      _code: data.code,
      _course_id: data.courseId,
    });
    if (error) throw new Error(error.message);
    return res as {
      valid: boolean;
      reason?: string;
      redeemed?: boolean;
      price_before?: number;
      price_after?: number;
    };
  });

export const adminQuickCreateTestCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const testCode = "FREE100";
    const { data: existing } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", testCode)
      .maybeSingle();

    if (existing) {
      return { ok: true, message: `Coupon ${testCode} already exists`, code: testCode };
    }

    const { error } = await supabase.from("coupons").insert({
      code: testCode,
      discount_type: "percent",
      discount_value: 100,
      is_active: true,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, message: `Created 100% discount coupon ${testCode}`, code: testCode };
  });
