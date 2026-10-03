import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decodeZeroWidth } from "@/components/protect/watermark";

export const CONTENT_EVENT_KINDS = [
  "screenshot_attempt",
  "print_attempt",
  "copy_attempt",
  "devtools",
  "focus_loss",
  "screen_share",
  "rapid_flip",
  "consent_accepted",
] as const;

export type ContentEventKind = (typeof CONTENT_EVENT_KINDS)[number];

/**
 * Weight each signal carries in the leak-risk score.
 * Policy: ONLY recording, screenshots, and copying carry risk points.
 * Leaving the page, zooming on iPad/tablets, or window resizing are NOT risky.
 */
const WEIGHTS: Record<string, number> = {
  // 1. Recording
  screen_share: 12,
  // 2. Screenshots & Printing
  screenshot_attempt: 10,
  print_attempt: 6,
  // 3. Copying
  copy_attempt: 3,
  // Non-risky (leaving page, zooming/resizing, etc. are NOT risky)
  devtools: 0,
  rapid_flip: 0,
  focus_loss: 0,
  consent_accepted: 0,
};

/** Strikes that lock an account. Recording locks at once; the others count since the last unlock. */
export const PROTECTION_LIMITS = { screenshot: 3, copy: 6 } as const;

export type ProtectionWarning = { kind: "screenshot" | "copy" | "recording"; count: number; limit: number };

async function applyProtectionPolicy(
  supabaseAdmin: any,
  context: { supabase: any; userId: string },
  kind: string,
  meta: Record<string, unknown>,
): Promise<{ ok: true; locked: boolean; warning: ProtectionWarning | null }> {
  const group =
    kind === "screenshot_attempt" || kind === "print_attempt"
      ? "screenshot"
      : kind === "copy_attempt"
        ? "copy"
        : kind === "screen_share"
          ? "recording"
          : null;
  if (!group) return { ok: true, locked: false, warning: null };

  // Admins are never locked (they only get here in local test mode).
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (isAdmin) return { ok: true, locked: false, warning: null };

  let count = 1;
  let limit = 1;
  if (group === "recording") {
    // Asking for the screen is only a warning; actually being handed the screen locks the account.
    if (meta?.started !== true) return { ok: true, locked: false, warning: { kind: "recording", count: 0, limit: 1 } };
  } else {
    limit = PROTECTION_LIMITS[group];
    const kinds = group === "screenshot" ? ["screenshot_attempt", "print_attempt"] : ["copy_attempt"];
    // Count since the newest admin unlock (or 90 days), so an unlocked student starts again from zero.
    const { data: reset } = await supabaseAdmin
      .from("content_events")
      .select("created_at")
      .eq("user_id", context.userId)
      .eq("kind", "admin_unlock")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const floor = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const since = reset?.created_at && reset.created_at > floor ? reset.created_at : floor;
    const { count: n } = await supabaseAdmin
      .from("content_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .in("kind", kinds)
      .gt("created_at", since);
    count = n ?? 1;
  }

  const locked = count >= limit;
  if (locked) {
    await supabaseAdmin
      .from("profiles")
      .update({ locked_at: new Date().toISOString(), lock_reason: "content_protection" })
      .eq("id", context.userId);
  }
  return { ok: true, locked, warning: { kind: group, count: Math.min(count, limit), limit } };
}

export const logContentEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: string; context?: string | null; meta?: Record<string, unknown> }) => {
    if (!d?.kind || !(CONTENT_EVENT_KINDS as readonly string[]).includes(d.kind)) {
      throw new Error("Unknown event kind");
    }
    return {
      kind: d.kind,
      context: (d.context ?? null)?.toString().slice(0, 200) ?? null,
      meta: d.meta ?? {},
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    const recentSame =
      data.meta?.started === true
        ? { count: 0 }
        : await (supabaseAdmin.from as any)("content_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("kind", data.kind)
            .gte("created_at", new Date(Date.now() - 3000).toISOString());
    if ((recentSame.count ?? 0) > 0) {
      return { ok: true, duplicate: true, locked: false, warning: null as ProtectionWarning | null };
    }

    await (supabaseAdmin.from as any)("content_events").insert({
      user_id: context.userId,
      kind: data.kind,
      context: data.context,
      meta: data.meta,
      ip,
      ua,
    });

    return applyProtectionPolicy(supabaseAdmin, context, data.kind, data.meta);
  });

export const acceptContentTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope?: string }) => ({ scope: (d?.scope ?? "global").slice(0, 100) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from as any)("content_consents").upsert(
      {
        user_id: context.userId,
        scope: data.scope,
        accepted_at: new Date().toISOString(),
        ip: getRequestIP({ xForwardedFor: true }) ?? null,
        ua: getRequestHeader("user-agent") ?? null,
      },
      { onConflict: "user_id,scope" },
    );
    return { ok: true };
  });

export type ProtectionRow = {
  user_id: string;
  username: string;
  full_name: string;
  email: string;
  code: string;
  score: number;
  level: "low" | "watch" | "high";
  events: number;
  last_event_at: string | null;
  locked: boolean;
  breakdown: Record<string, number>;
};

function levelFor(score: number): "low" | "watch" | "high" {
  if (score >= 80) return "high";
  if (score >= 25) return "watch";
  return "low";
}

export const adminContentProtectionOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => ({ days: Math.min(Math.max(d?.days ?? 30, 1), 365) }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: events }, { data: profiles }] = await Promise.all([
      (supabaseAdmin.from as any)("content_events")
        .select("user_id,kind,context,ip,ua,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(4000),
      (supabaseAdmin.from as any)("profiles").select("id,username,full_name,email,locked_at,lock_reason"),
    ]);

    const byUser = new Map<string, ProtectionRow>();
    const profMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

    for (const e of events ?? []) {
      if (
        e.kind === "consent_accepted" ||
        e.kind === "admin_unlock" ||
        e.kind === "focus_loss" ||
        e.kind === "devtools" ||
        e.kind === "rapid_flip"
      ) {
        continue;
      }
      let row = byUser.get(e.user_id);
      if (!row) {
        const p = profMap.get(e.user_id) ?? {};
        row = {
          user_id: e.user_id,
          username: p.username ?? "—",
          full_name: p.full_name ?? "",
          email: p.email ?? "",
          code: e.user_id.slice(0, 8).toUpperCase(),
          score: 0,
          level: "low",
          events: 0,
          last_event_at: e.created_at,
          locked: !!p.locked_at,
          breakdown: {},
        };
        byUser.set(e.user_id, row);
      }
      row.events += 1;
      row.score += WEIGHTS[e.kind] ?? 0;
      row.breakdown[e.kind] = (row.breakdown[e.kind] ?? 0) + 1;
    }

    for (const p of profiles ?? []) {
      if (!p.locked_at || byUser.has(p.id)) continue;
      byUser.set(p.id, {
        user_id: p.id,
        username: p.username ?? "—",
        full_name: p.full_name ?? "",
        email: p.email ?? "",
        code: p.id.slice(0, 8).toUpperCase(),
        score: 0,
        level: "low",
        events: 0,
        last_event_at: null,
        locked: true,
        breakdown: {},
      });
    }

    const rows = [...byUser.values()]
      .map((r) => ({ ...r, level: levelFor(r.score) }))
      .sort((a, b) => b.score - a.score);

    const captureEvents = (events ?? []).filter(
      (e: any) =>
        e.kind !== "consent_accepted" &&
        e.kind !== "admin_unlock" &&
        e.kind !== "focus_loss" &&
        e.kind !== "devtools" &&
        e.kind !== "rapid_flip",
    );

    return {
      rows,
      recent: captureEvents.slice(0, 200),
      totals: {
        users: rows.length,
        events: captureEvents.length,
        high: rows.filter((r) => r.level === "high").length,
        locked: rows.filter((r) => r.locked).length,
      },
    };
  });

/** Trace a leaked screenshot or text snippet back to an account using its code or hidden steganography. */
export const adminTraceWatermarkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => {
    const raw = d?.code ?? "";
    const stegoCode = decodeZeroWidth(raw);
    const target = (stegoCode || raw).trim().replace(/[^0-9a-fA-F-]/g, "");
    if (target.length < 4) {
      throw new Error("Enter at least 4 characters of the code, or paste text containing a hidden trace");
    }
    return { code: target.toLowerCase(), extractedFromStego: !!stegoCode, targetCode: target.toUpperCase() };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await (supabaseAdmin.from as any)("profiles")
      .select("id,username,full_name,email,phone,locked_at");

    const matches = (profiles ?? []).filter((p: any) =>
      p.id.replace(/-/g, "").startsWith(data.code.replace(/-/g, "")),
    );
    return {
      matches,
      extractedFromStego: data.extractedFromStego,
      resolvedCode: data.targetCode,
    };
  });

export const adminSetContentLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; locked: boolean }) => {
    if (!d?.userId) throw new Error("userId required");
    return { userId: d.userId, locked: !!d.locked };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)("profiles")
      .update(
        data.locked
          ? { locked_at: new Date().toISOString(), lock_reason: "content_protection" }
          : { locked_at: null, lock_reason: null, lock_kind: null, lock_until: null, lock_message: null },
      )
      .eq("id", data.userId);
    if (error) throw error;
    // An unlocked student starts counting strikes again from zero.
    if (!data.locked) {
      await (supabaseAdmin.from as any)("content_events").insert({ user_id: data.userId, kind: "admin_unlock", context: "admin", meta: {} });
    }
    return { ok: true };
  });