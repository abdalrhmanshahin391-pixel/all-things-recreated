import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export function friendlyDeviceName(ua: string | null | undefined, platform?: string | null): string {
  if (!ua) return platform || "Unknown device";
  const s = ua;
  if (/iPad/i.test(s)) {
    if (/OS (\d+)_/i.test(s)) return `iPad · iOS ${RegExp.$1}`;
    return "iPad";
  }
  if (/iPhone/i.test(s)) {
    if (/OS (\d+)_(\d+)/i.test(s)) return `iPhone · iOS ${RegExp.$1}.${RegExp.$2}`;
    return "iPhone";
  }
  if (/Android/i.test(s)) {
    const m = s.match(/Android\s*(\d+(?:\.\d+)?)[^;)]*;\s*([^;)]+)/i);
    if (m) return `${m[2].trim()} · Android ${m[1]}`;
    return "Android";
  }
  if (/Macintosh|Mac OS X/i.test(s)) {
    if (/Chrome\/(\d+)/.test(s)) return `Mac · Chrome ${RegExp.$1}`;
    if (/Safari\//.test(s)) return `Mac · Safari`;
    if (/Firefox\/(\d+)/.test(s)) return `Mac · Firefox ${RegExp.$1}`;
    return "Mac";
  }
  if (/Windows NT/i.test(s)) {
    if (/Chrome\/(\d+)/.test(s)) return `Windows · Chrome ${RegExp.$1}`;
    if (/Edg\/(\d+)/.test(s)) return `Windows · Edge ${RegExp.$1}`;
    if (/Firefox\/(\d+)/.test(s)) return `Windows · Firefox ${RegExp.$1}`;
    return "Windows PC";
  }
  if (/Linux/i.test(s)) return "Linux";
  return platform || "Unknown device";
}

function parsePlatform(ua: string | null | undefined): string {
  if (!ua) return "Unknown";
  const s = ua.toLowerCase();
  if (s.includes("iphone")) return "iPhone";
  if (s.includes("ipad")) return "iPad";
  if (s.includes("android")) return "Android";
  if (s.includes("mac os") || s.includes("macintosh")) return "Mac";
  if (s.includes("windows")) return "Windows";
  if (s.includes("linux")) return "Linux";
  return "Unknown";
}

export type DeviceCheck =
  | { ok: true; status: "ok"; limit: number; count: number }
  | { ok: false; status: "limit" | "locked"; limit: number; count: number };

type DeviceRowLite = { id: string; device_id: string; first_seen_at: string };

async function isAdminUser(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

/** Site-wide fallback device limit (used when a profile has no personal override). */
async function globalDeviceLimit(admin: any): Promise<number> {
  const { data } = await admin
    .from("device_security_settings")
    .select("default_device_limit")
    .eq("id", true)
    .maybeSingle();
  const n = (data as { default_device_limit?: number } | null)?.default_device_limit;
  return typeof n === "number" && n > 0 ? n : 2;
}

/**
 * Records the current device and enforces the device slot limit.
 *
 * Devices are ordered by first_seen_at; only the first `limit` devices hold an
 * active slot. Any device outside those slots (new OR already recorded) locks
 * the account. Admins bypass everything.
 */
export const recordDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string }) => {
    if (!d?.deviceId || typeof d.deviceId !== "string" || d.deviceId.length > 128) {
      throw new Error("Invalid deviceId");
    }
    return { deviceId: d.deviceId };
  })
  .handler(async ({ data, context }): Promise<DeviceCheck> => {
    const { supabase, userId } = context;
    const ua = getRequestHeader("user-agent") ?? null;
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const platform = parsePlatform(ua);
    const now = new Date().toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: prof }, { data: existing }, admin, globalLimit] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("device_limit, locked_at")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_devices")
        .select("id, device_id, first_seen_at")
        .eq("user_id", userId)
        .order("first_seen_at", { ascending: true }),
      isAdminUser(supabase, userId),
      globalDeviceLimit(supabaseAdmin),
    ]);

    const limit = (prof as { device_limit?: number | null } | null)?.device_limit ?? globalLimit;
    const list = (existing ?? []) as DeviceRowLite[];

    // Admins: unlimited devices, never locked.
    if (admin) {
      await supabaseAdmin.from("user_devices").upsert(
        { user_id: userId, device_id: data.deviceId, user_agent: ua, platform, ip, last_seen_at: now },
        { onConflict: "user_id,device_id" },
      );
      return { ok: true, status: "ok", limit: 999, count: list.length };
    }

    const lockedAt = (prof as { locked_at?: string | null } | null)?.locked_at ?? null;
    const index = list.findIndex((d) => d.device_id === data.deviceId);
    const hasSlot = index > -1 ? index < limit : list.length < limit;

    if (lockedAt || !hasSlot) {
      if (!lockedAt) {
        await supabaseAdmin
          .from("profiles")
          .update({ locked_at: now, lock_reason: "device_limit" })
          .eq("id", userId);
      }
      return { ok: false, status: "locked", limit, count: list.length };
    }

    const { error: upErr } = await supabaseAdmin.from("user_devices").upsert(
      { user_id: userId, device_id: data.deviceId, user_agent: ua, platform, ip, last_seen_at: now },
      { onConflict: "user_id,device_id" },
    );
    if (upErr) throw new Error(upErr.message);

    return { ok: true, status: "ok", limit, count: index > -1 ? list.length : list.length + 1 };
  });

/** Public info for the locked screen: contact links only, never the code. */
export const getLockInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prof }, { count }, { data: settings }, globalLimit] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("device_limit, locked_at, lock_reason, username, full_name")
        .eq("id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_devices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId),
      supabaseAdmin
        .from("device_security_settings")
        .select("telegram_url, support_url")
        .eq("id", true)
        .maybeSingle(),
      globalDeviceLimit(supabaseAdmin),
    ]);
    const p = (prof ?? {}) as any;
    return {
      locked: !!p.locked_at,
      lockedAt: (p.locked_at as string | null) ?? null,
      limit: (p.device_limit as number | null) ?? globalLimit,
      deviceCount: count ?? 0,
      name: (p.full_name || p.username || "") as string,
      telegramUrl: ((settings as any)?.telegram_url as string) ?? "",
      supportUrl: ((settings as any)?.support_url as string) ?? "",
    };
  });

/** Redeem the unlock code: wipes devices, unlocks, claims the current device. */
export const redeemUnlockCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; deviceId: string }) => ({
    code: String(d?.code ?? "").trim().slice(0, 200),
    deviceId: String(d?.deviceId ?? "").slice(0, 128),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ua = getRequestHeader("user-agent") ?? null;
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const now = new Date().toISOString();

    // Rate limit: max 5 failed attempts per 15 minutes.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentFails } = await supabaseAdmin
      .from("device_unlock_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("success", false)
      .gte("created_at", since);
    if ((recentFails ?? 0) >= 5) {
      return { ok: false as const, reason: "rate_limited" as const };
    }

    const { data: settings } = await supabaseAdmin
      .from("device_security_settings")
      .select("unlock_code")
      .eq("id", true)
      .maybeSingle();
    const expected = ((settings as any)?.unlock_code ?? "").trim();
    const good = expected.length > 0 && data.code === expected;

    await supabaseAdmin.from("device_unlock_attempts").insert({
      user_id: userId,
      success: good,
      code_used: good ? null : data.code.slice(0, 40),
      ip,
      user_agent: ua,
    });

    if (!good) return { ok: false as const, reason: "invalid" as const };

    await supabaseAdmin.from("user_devices").delete().eq("user_id", userId);
    await supabaseAdmin
      .from("profiles")
      .update({ locked_at: null, lock_reason: null })
      .eq("id", userId);

    if (data.deviceId) {
      await supabaseAdmin.from("user_devices").upsert(
        {
          user_id: userId,
          device_id: data.deviceId,
          user_agent: ua,
          platform: parsePlatform(ua),
          ip,
          last_seen_at: now,
        },
        { onConflict: "user_id,device_id" },
      );
    }
    return { ok: true as const };
  });

/* ---------------------------- user self-service --------------------------- */

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: devices }, { data: prof }, globalLimit] = await Promise.all([
      supabaseAdmin
        .from("user_devices")
        .select("id, device_id, nickname, user_agent, platform, ip, first_seen_at, last_seen_at")
        .eq("user_id", context.userId)
        .order("first_seen_at", { ascending: true }),
      supabaseAdmin.from("profiles").select("device_limit").eq("id", context.userId).maybeSingle(),
      globalDeviceLimit(supabaseAdmin),
    ]);
    return {
      devices: (devices ?? []) as any[],
      limit: ((prof as any)?.device_limit as number | null) ?? globalLimit,
    };
  });

export const removeMyDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceRowId: string }) => ({ deviceRowId: String(d.deviceRowId) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_devices")
      .delete()
      .eq("id", data.deviceRowId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameMyDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceRowId: string; nickname: string }) => ({
    deviceRowId: String(d.deviceRowId),
    nickname: String(d.nickname ?? "").slice(0, 40),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_devices")
      .update({ nickname: data.nickname || null })
      .eq("id", data.deviceRowId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- admin ---------------------------------- */

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  if (!(await isAdminUser(ctx.supabase, ctx.userId))) throw new Error("Forbidden");
}

export const adminGetDeviceSecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: settings }, { data: attempts }] = await Promise.all([
      supabaseAdmin
        .from("device_security_settings")
        .select("unlock_code, telegram_url, support_url, default_device_limit")
        .eq("id", true)
        .maybeSingle(),
      supabaseAdmin
        .from("device_unlock_attempts")
        .select("id, user_id, success, ip, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return {
      settings: (settings ?? {
        unlock_code: "",
        telegram_url: "",
        support_url: "",
        default_device_limit: 2,
      }) as {
        unlock_code: string;
        telegram_url: string;
        support_url: string;
        default_device_limit: number;
      },
      attempts: (attempts ?? []) as {
        id: string;
        user_id: string;
        success: boolean;
        ip: string | null;
        created_at: string;
      }[],
    };
  });

export const adminUpdateDeviceSecurity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    unlockCode: string;
    telegramUrl: string;
    supportUrl: string;
    defaultLimit?: number;
    applyToAll?: boolean;
  }) => ({
    unlockCode: String(d.unlockCode ?? "").trim().slice(0, 100),
    telegramUrl: String(d.telegramUrl ?? "").trim().slice(0, 300),
    supportUrl: String(d.supportUrl ?? "").trim().slice(0, 300),
    defaultLimit: Math.max(1, Math.min(50, Math.floor(Number(d.defaultLimit ?? 2)) || 2)),
    applyToAll: !!d.applyToAll,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.unlockCode) throw new Error("Unlock code cannot be empty");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("device_security_settings")
      .upsert(
        {
          id: true,
          unlock_code: data.unlockCode,
          telegram_url: data.telegramUrl,
          support_url: data.supportUrl,
          default_device_limit: data.defaultLimit,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    if (data.applyToAll) {
      // Clear every personal override so all accounts follow the global limit.
      await supabaseAdmin
        .from("profiles")
        .update({ device_limit: null })
        .not("id", "is", null);
    }
    return { ok: true };
  });

export const adminSetUserLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; locked: boolean }) => ({
    userId: String(d.userId),
    locked: !!d.locked,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(
        data.locked
          ? { locked_at: new Date().toISOString(), lock_reason: "manual" }
          : { locked_at: null, lock_reason: null },
      )
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUnlockAndReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => ({ userId: String(d.userId) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_devices").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ locked_at: null, lock_reason: null })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListLockStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, locked_at, lock_reason");
    return { locks: (data ?? []) as { id: string; locked_at: string | null; lock_reason: string | null }[] };
  });
