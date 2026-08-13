import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminSetUserBlock, adminDeleteUser, type AdminUserRow } from "@/lib/admin-users.functions";

const input = "w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-sm";

export function UserModerationDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onDone: (patch: Partial<AdminUserRow> | "deleted") => void;
}) {
  const setBlock = useServerFn(adminSetUserBlock);
  const deleteUser = useServerFn(adminDeleteUser);
  const [kind, setKind] = useState<"block" | "suspend">(
    user.lock_kind === "suspend" ? "suspend" : "block",
  );
  const [message, setMessage] = useState(user.lock_message ?? "");
  const [until, setUntil] = useState(
    user.lock_until ? new Date(user.lock_until).toISOString().slice(0, 16) : "",
  );
  const [busy, setBusy] = useState(false);

  const name = user.full_name || user.username || user.email || "this user";

  async function apply(next: "block" | "suspend" | "none") {
    setBusy(true);
    try {
      const res = await setBlock({
        data: {
          userId: user.id,
          kind: next,
          message,
          until: next === "suspend" && until ? new Date(until).toISOString() : null,
        },
      });
      onDone({
        locked_at: (res as any).locked_at ?? null,
        lock_kind: (res as any).lock_kind ?? null,
        lock_until: (res as any).lock_until ?? null,
        lock_message: (res as any).lock_message ?? null,
      });
      toast.success(next === "none" ? "Account restored" : "Account restricted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the account");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteUser({ data: { userId: user.id } });
      toast.success("Account deleted");
      onDone("deleted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border-2 border-border bg-card p-6">
        <h2 className="text-lg font-black text-foreground">Manage {name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {user.locked_at
            ? user.lock_kind === "suspend"
              ? `Currently suspended${user.lock_until ? ` until ${new Date(user.lock_until).toLocaleString()}` : ""}.`
              : "Currently blocked."
            : "This account is active."}
        </p>

        <div className="mt-5 flex gap-2">
          {(["block", "suspend"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold ${
                kind === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {k === "block" ? "Block permanently" : "Stop temporarily"}
            </button>
          ))}
        </div>

        {kind === "suspend" && (
          <div className="mt-4">
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Access returns on
            </label>
            <input
              type="datetime-local"
              className={input + " mt-2"}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Reason shown to the user
          </label>
          <textarea
            className={input + " mt-2 min-h-[100px]"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Your account was stopped for sharing course material."
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => apply(kind)}
            className="rounded-xl border-2 border-border bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
          >
            {kind === "block" ? "Block account" : "Stop account"}
          </button>
          {user.locked_at && (
            <button
              type="button"
              disabled={busy}
              onClick={() => apply("none")}
              className="rounded-xl border-2 border-border bg-background px-4 py-2 text-sm font-bold disabled:opacity-60"
            >
              Unblock
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-black text-red-700 disabled:opacity-60"
          >
            Delete account
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-xl border-2 border-border px-4 py-2 text-sm font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
