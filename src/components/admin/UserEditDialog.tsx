import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminUpdateUser, type AdminUserRow } from "@/lib/admin-users.functions";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const label = "text-xs font-black uppercase tracking-widest text-muted-foreground";

export function UserEditDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<AdminUserRow>) => void;
}) {
  const update = useServerFn(adminUpdateUser);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password && password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await update({
        data: {
          userId: user.id,
          full_name: fullName,
          username,
          email,
          phone,
          ...(password ? { password } : {}),
        },
      });
      onSaved({
        full_name: res.full_name,
        username: res.username,
        email: res.email,
        phone: res.phone,
        ...(res.emailChanged ? { email_confirmed_at: new Date().toISOString() } : {}),
      });
      toast.success(
        isSelf && (res.emailChanged || password)
          ? "Saved — this changed your own sign-in details."
          : "User updated",
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-black text-foreground">Edit user</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Change their details or set a new password for them.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <label className={label}>Full name</label>
            <input className={input + " mt-2"} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className={label}>Username</label>
            <input className={input + " mt-2"} value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className={label}>Email</label>
            <input
              type="email"
              className={input + " mt-2"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input className={input + " mt-2"} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className={label}>New password (optional)</div>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Leave empty to keep the current one"
              className={input + " mt-2"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {password && (
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Repeat the new password"
                className={input + " mt-2"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
          </div>
        </div>

        {isSelf && (
          <p className="mt-4 text-xs text-amber-600">
            This is your own account — changing the email or password changes how you sign in.
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-xl border border-border px-4 py-2 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
