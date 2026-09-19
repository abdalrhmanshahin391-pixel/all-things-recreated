import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  device_limit: number;
  device_limit_override: number | null;
  locked_at: string | null;
  lock_kind: string | null;
  lock_until: string | null;
  lock_message: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  roles: string[];
};



export type AdminDeviceRow = {
  id: string;
  user_id: string;
  device_id: string;
  user_agent: string | null;
  platform: string | null;
  ip: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

/**
 * Admin-only. Uses service role to bypass RLS so the admin dashboard
 * always shows every registered user, even right after a remix.
 */
export const adminListUsersAndDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[]; devices: AdminDeviceRow[]; globalDeviceLimit: number }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Canonical user list comes from an admin RPC that reads auth.users +
    // profiles + roles, so the admin sees every real account even when
    // the profiles row is missing after a remix.
    const [rpcRes, devicesRes, profilesRes, settingsRes, qaContentRes, committeeEnContentRes] = await Promise.all([
      context.supabase.rpc("admin_list_all_users"),
      supabaseAdmin
        .from("user_devices")
        .select("id, user_id, device_id, nickname, user_agent, platform, ip, first_seen_at, last_seen_at")
        .order("last_seen_at", { ascending: false }),
      (supabaseAdmin.from as any)("profiles").select(
        "id, device_limit, locked_at, lock_kind, lock_until, lock_message",
      ),
      supabaseAdmin
        .from("device_security_settings")
        .select("default_device_limit")
        .eq("id", true)
        .maybeSingle(),
      (supabaseAdmin.from as any)("site_content")
        .select("value_en")
        .eq("key", "qa_user_ids")
        .maybeSingle(),
      (supabaseAdmin.from as any)("site_content")
        .select("value_en")
        .eq("key", "committee_en_user_ids")
        .maybeSingle(),
    ]);
    if (rpcRes.error) throw new Error(rpcRes.error.message);

    let persistentQaIds: string[] = [];
    if (qaContentRes?.data?.value_en) {
      try {
        const parsed = JSON.parse(qaContentRes.data.value_en);
        if (Array.isArray(parsed)) persistentQaIds = parsed;
      } catch {}
    }
    const qaSet = new Set(persistentQaIds);

    let persistentCommitteeEnIds: string[] = [];
    if (committeeEnContentRes?.data?.value_en) {
      try {
        const parsed = JSON.parse(committeeEnContentRes.data.value_en);
        if (Array.isArray(parsed)) persistentCommitteeEnIds = parsed;
      } catch {}
    }
    const committeeEnSet = new Set(persistentCommitteeEnIds);

    const globalLimit =
      (settingsRes.data as { default_device_limit?: number } | null)?.default_device_limit ?? 2;
    const profMap = new Map<string, any>();
    for (const p of (profilesRes.data ?? []) as any[]) {
      profMap.set(p.id, p);
    }

    // Email verification state lives on the auth account, not in profiles.
    const confirmedMap = new Map<string, string | null>();
    for (let page = 1; page <= 20; page++) {
      const { data: pageData, error: pageErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (pageErr) break;
      const list = pageData?.users ?? [];
      for (const au of list) {
        confirmedMap.set(au.id, (au as any).email_confirmed_at ?? null);
      }
      if (list.length < 1000) break;
    }

    const users: AdminUserRow[] = ((rpcRes.data ?? []) as any[]).map((r) => {
      const p = profMap.get(r.id) ?? {};
      const baseRoles = (r.roles ?? []) as string[];
      let roles = qaSet.has(r.id) && !baseRoles.includes("qa") ? [...baseRoles, "qa"] : baseRoles;
      if (committeeEnSet.has(r.id) && !roles.includes("committee_en")) {
        roles = [...roles, "committee_en"];
      }

      return {
        id: r.id,
        full_name: r.full_name ?? null,
        username: r.username ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        device_limit: p.device_limit ?? globalLimit,
        device_limit_override: p.device_limit ?? null,
        locked_at: p.locked_at ?? null,
        lock_kind: p.lock_kind ?? null,
        lock_until: p.lock_until ?? null,
        lock_message: p.lock_message ?? null,
        created_at: r.created_at,
        email_confirmed_at: confirmedMap.get(r.id) ?? null,
        roles,
      };
    });



    return {
      users,
      devices: (devicesRes.data ?? []) as AdminDeviceRow[],
      globalDeviceLimit: globalLimit,
    };
  });


export const adminSetDeviceLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; limit: number | null }) => {
    // null = follow the site-wide default limit
    const n = d.limit == null ? null : Math.max(0, Math.min(999, Math.floor(d.limit)));
    return { userId: d.userId, limit: n };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ device_limit: data.limit })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, limit: data.limit };
  });

export const adminRevokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceRowId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_devices")
      .delete()
      .eq("id", data.deviceRowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetUserDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_devices")
      .delete()
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetUserPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; phone: string }) => {
    const phone = (d.phone ?? "").trim();
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
      throw new Error("Invalid phone number format");
    }
    return { userId: d.userId, phone: phone || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.phone) {
      // Uniqueness check
      const { data: dup } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", data.phone)
        .neq("id", data.userId)
        .maybeSingle();
      if (dup) throw new Error("That phone number is already used by another user.");
    }

    // Ensure a profile row exists (users without one show `—` for phone).
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!existing) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, any>;
      await supabaseAdmin.from("profiles").insert({
        id: data.userId,
        email: authUser?.user?.email ?? "",
        full_name: meta.full_name || meta.name || "",
        username: meta.username || (authUser?.user?.email ? authUser.user.email.split("@")[0] : data.userId),
        phone: data.phone,
      });
    } else {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ phone: data.phone, updated_at: new Date().toISOString() })
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, phone: data.phone };
  });

/** Permanently delete a user account (auth user + all cascading data). */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You can't delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await (supabaseAdmin.from as any)("profiles").delete().eq("id", data.userId);
    return { ok: true };
  });

export type BlockInput = {
  userId: string;
  /** "block" = permanent, "suspend" = temporary, "none" = unblock */
  kind: "block" | "suspend" | "none";
  message?: string;
  /** ISO date-time, required for "suspend" */
  until?: string | null;
};

/** Block, temporarily suspend, or release a user account. */
export const adminSetUserBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: BlockInput) => {
    if (!["block", "suspend", "none"].includes(d.kind)) throw new Error("Unknown block type");
    if (d.kind === "suspend") {
      if (!d.until) throw new Error("Please pick when the suspension ends.");
      if (Number.isNaN(new Date(d.until).getTime())) throw new Error("Invalid end date.");
    }
    const message = (d.message ?? "").trim().slice(0, 1000);
    return { userId: d.userId, kind: d.kind, message, until: d.until ?? null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.kind !== "none") {
      throw new Error("You can't block your own account.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch =
      data.kind === "none"
        ? { locked_at: null, lock_kind: null, lock_until: null, lock_message: null }
        : {
            locked_at: new Date().toISOString(),
            lock_kind: data.kind,
            lock_until: data.kind === "suspend" ? data.until : null,
            lock_message: data.message || null,
          };
    const { error } = await (supabaseAdmin.from as any)("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, ...patch };
  });

export type AdminUpdateUserInput = {
  userId: string;
  full_name?: string;
  username?: string;
  email?: string;
  phone?: string;
  password?: string;
};

/** Admin-only: edit a user's profile details, login email, and password. */
export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AdminUpdateUserInput) => {
    const out: AdminUpdateUserInput = { userId: d.userId };
    if (!d.userId) throw new Error("Missing user");
    if (d.full_name !== undefined) out.full_name = d.full_name.trim().slice(0, 120);
    if (d.username !== undefined) {
      const u = d.username.trim();
      if (u.length < 2 || u.length > 40) throw new Error("Username must be 2-40 characters.");
      if (!/^[A-Za-z0-9._-]+$/.test(u)) {
        throw new Error("Username can only contain letters, numbers, dots, dashes and underscores.");
      }
      out.username = u;
    }
    if (d.email !== undefined) {
      const e = d.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Invalid email address.");
      out.email = e;
    }
    if (d.phone !== undefined) {
      const p = d.phone.trim();
      if (p && !/^[0-9+\-\s()]{6,20}$/.test(p)) throw new Error("Invalid phone number format.");
      out.phone = p;
    }
    if (d.password) {
      if (d.password.length < 6) throw new Error("Password must be at least 6 characters.");
      out.password = d.password;
    }
    return out;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.username) {
      const { data: dup } = await (supabaseAdmin.from as any)("profiles")
        .select("id")
        .ilike("username", data.username)
        .neq("id", data.userId)
        .maybeSingle();
      if (dup) throw new Error("That username is already taken.");
    }
    if (data.phone) {
      const { data: dup } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", data.phone)
        .neq("id", data.userId)
        .maybeSingle();
      if (dup) throw new Error("That phone number is already used by another user.");
    }

    const authPatch: Record<string, unknown> = {};
    if (data.email) authPatch['email'] = data.email;
    if (data.password) authPatch['password'] = data.password;
    if (Object.keys(authPatch).length > 0) {
      // Keep the account verified when an admin changes the address directly.
      if (data.email) authPatch['email_confirm'] = true;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authPatch as any);
      if (error) throw new Error(error.message);
    }

    const profilePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.full_name !== undefined) profilePatch['full_name'] = data.full_name;
    if (data.username !== undefined) profilePatch['username'] = data.username;
    if (data.email !== undefined) profilePatch['email'] = data.email;
    if (data.phone !== undefined) profilePatch['phone'] = data.phone || null;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await (supabaseAdmin.from as any)("profiles")
        .update(profilePatch)
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, any>;
      const { error } = await (supabaseAdmin.from as any)("profiles").insert({
        id: data.userId,
        email: data.email ?? authUser?.user?.email ?? "",
        full_name: data.full_name ?? meta['full_name'] ?? "",
        username:
          data.username ??
          meta['username'] ??
          (authUser?.user?.email ? authUser.user.email.split("@")[0] : data.userId),
        phone: data.phone || null,
      });
      if (error) throw new Error(error.message);
    }

    return {
      ok: true,
      full_name: data.full_name ?? null,
      username: data.username ?? null,
      email: data.email ?? null,
      phone: data.phone ? data.phone : null,
      emailChanged: !!data.email,
    };
  });

/** Admin-only: mark a user's email as verified without them clicking the link. */
export const adminSetEmailVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; verified?: boolean }) => ({
    userId: d.userId,
    verified: d.verified !== false,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: data.verified,
    } as any);
    if (error) throw new Error(error.message);
    return {
      ok: true,
      email_confirmed_at: ((res?.user as any)?.email_confirmed_at ?? null) as string | null,
    };
  });

/** Admin-only: send the signup confirmation email again. */
export const adminResendConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; redirectTo?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (getErr) throw new Error(getErr.message);
    const email = authUser?.user?.email;
    if (!email) throw new Error("This account has no email address.");

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY']!;
    const anon = createClient(process.env['SUPABASE_URL']!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init?: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { error } = await anon.auth.resend({
      type: "signup",
      email,
      ...(data.redirectTo ? { options: { emailRedirectTo: data.redirectTo } } : {}),
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true, email };
  });

/** Admin-only: toggle role with resilient fallback for custom/QA roles. */
export const adminToggleUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: string; grant: boolean }) => {
    if (!d?.userId || !d?.role) throw new Error("userId and role are required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId, role, grant } = data;

    let rpcSucceeded = false;
    try {
      const res = grant
        ? await context.supabase.rpc("admin_grant_role", { _user_id: userId, _role: role as any })
        : await context.supabase.rpc("admin_revoke_role", { _user_id: userId, _role: role as any });
      if (!res.error) {
        rpcSucceeded = true;
      }
    } catch (e) {
      console.warn(`[adminToggleUserRole] RPC failed for ${role}:`, e);
    }

    if (role === "qa") {
      try {
        const { data: existingRow } = await (supabaseAdmin.from as any)("site_content")
          .select("value_en")
          .eq("key", "qa_user_ids")
          .maybeSingle();

        let qaIds: string[] = [];
        if (existingRow?.value_en) {
          try {
            const parsed = JSON.parse(existingRow.value_en);
            if (Array.isArray(parsed)) qaIds = parsed;
          } catch {}
        }

        if (grant) {
          if (!qaIds.includes(userId)) qaIds.push(userId);
        } else {
          qaIds = qaIds.filter((id) => id !== userId);
        }

        await (supabaseAdmin.from as any)("site_content").upsert(
          {
            key: "qa_user_ids",
            group_key: "roles",
            group_label: "System Roles",
            label: "QA Reviewer User IDs",
            value_en: JSON.stringify(qaIds),
            value_ar: JSON.stringify(qaIds),
            default_en: "[]",
            default_ar: "[]",
            sort_order: 999,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
      } catch (storeErr) {
        console.warn("[adminToggleUserRole] Error saving to resilient QA store:", storeErr);
        if (!rpcSucceeded) throw storeErr;
      }
    } else if (role === "committee_en") {
      try {
        const { data: existingRow } = await (supabaseAdmin.from as any)("site_content")
          .select("value_en")
          .eq("key", "committee_en_user_ids")
          .maybeSingle();

        let ids: string[] = [];
        if (existingRow?.value_en) {
          try {
            const parsed = JSON.parse(existingRow.value_en);
            if (Array.isArray(parsed)) ids = parsed;
          } catch {}
        }

        if (grant) {
          if (!ids.includes(userId)) ids.push(userId);
        } else {
          ids = ids.filter((id) => id !== userId);
        }

        await (supabaseAdmin.from as any)("site_content").upsert(
          {
            key: "committee_en_user_ids",
            group_key: "roles",
            group_label: "System Roles",
            label: "Committee (English) User IDs",
            value_en: JSON.stringify(ids),
            value_ar: JSON.stringify(ids),
            default_en: "[]",
            default_ar: "[]",
            sort_order: 998,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
      } catch (storeErr) {
        console.warn("[adminToggleUserRole] Error saving to resilient committee_en store:", storeErr);
        throw storeErr;
      }
    } else if (!rpcSucceeded) {
      throw new Error(`Failed to update ${role} role`);
    }

    return { ok: true, userId, role, granted: grant };
  });

