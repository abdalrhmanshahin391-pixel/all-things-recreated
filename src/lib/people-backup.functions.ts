import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

/** Tables included in the people archive, in restore-safe order. */
export const PEOPLE_TABLES = [
  "profiles",
  "user_roles",
  "user_courses",
  "package_purchases",
  "payment_events",
  "coupon_redemptions",
  "user_devices",
  "user_login_events",
  "user_sessions",
] as const;

/** Tables we are willing to write back on import (activity logs are read-only history). */
export const IMPORTABLE_TABLES = [
  "profiles",
  "user_roles",
  "user_courses",
  "package_purchases",
  "payment_events",
  "coupon_redemptions",
] as const;

export type PeopleBackup = {
  format: "aquaqbank.people";
  version: 1;
  exported_at: string;
  accounts: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    created_at: string;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
  }>;
  tables: Record<string, any[]>;
  note: string;
};

export type ImportResult = {
  table: string;
  attempted: number;
  written: number;
  failed: Array<{ id: string | null; error: string }>;
};

async function fetchAll(admin: any, table: string): Promise<any[]> {
  const rows: any[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const res = await admin.from(table).select("*").range(from, from + page - 1);
    if (res.error) throw new Error(`${table}: ${res.error.message}`);
    const data = res.data ?? [];
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

async function audit(admin: any, ctx: any, action: string, count: number, details: unknown) {
  const { data: prof } = await admin.from("profiles").select("username, email").eq("id", ctx.userId).maybeSingle();
  await admin.from("admin_data_exports").insert({
    actor_id: ctx.userId,
    actor_label: prof?.username ?? prof?.email ?? null,
    action,
    record_count: count,
    details: details as any,
  });
}

export const exportPeopleBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PeopleBackup> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tables: Record<string, any[]> = {};
    let total = 0;
    for (const t of PEOPLE_TABLES) {
      try {
        tables[t] = await fetchAll(supabaseAdmin, t);
      } catch {
        tables[t] = [];
      }
      total += tables[t].length;
    }

    const accounts: PeopleBackup["accounts"] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        accounts.push({
          id: u.id,
          email: u.email ?? null,
          phone: u.phone ?? null,
          created_at: u.created_at,
          email_confirmed_at: (u as any).email_confirmed_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
      if (users.length < 200) break;
    }

    await audit(supabaseAdmin, context, "export", total + accounts.length, {
      tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      accounts: accounts.length,
    });

    return {
      format: "aquaqbank.people",
      version: 1,
      exported_at: new Date().toISOString(),
      accounts,
      tables,
      note:
        "Passwords are never included: the login system only stores a one-way hash, so no readable password exists to export. Restored accounts set a new password through the reset-password email.",
    };
  });

export const importPeopleTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: string; rows: any[]; dryRun?: boolean }) => d)
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertAdmin(context);
    if (!(IMPORTABLE_TABLES as readonly string[]).includes(data.table)) {
      throw new Error(`Table not allowed: ${data.table}`);
    }
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const failed: ImportResult["failed"] = [];
    if (!rows.length || data.dryRun) {
      return { table: data.table, attempted: rows.length, written: 0, failed };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const conflict = data.table === "user_roles" ? "user_id,role" : "id";
    let written = 0;
    const chunk = 200;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await (supabaseAdmin.from as any)(data.table).upsert(slice, { onConflict: conflict });
      if (!error) {
        written += slice.length;
        continue;
      }
      for (const row of slice) {
        const one = await (supabaseAdmin.from as any)(data.table).upsert(row, { onConflict: conflict });
        if (one.error) failed.push({ id: row?.id ?? null, error: one.error.message });
        else written++;
      }
    }
    await audit(supabaseAdmin, context, `import:${data.table}`, written, { failed: failed.length });
    return { table: data.table, attempted: rows.length, written, failed };
  });

export type AuditRow = {
  id: string;
  actor_label: string | null;
  action: string;
  record_count: number;
  created_at: string;
};

export const getExportAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditRow[]> => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("admin_data_exports")
      .select("id, actor_label, action, record_count, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    return (data ?? []) as AuditRow[];
  });
