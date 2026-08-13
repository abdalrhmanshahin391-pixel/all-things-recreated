import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Loader2, Save, Inbox, Settings2, BellRing, Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import {
  fetchSupportSettings, fetchSupportChannels, CHANNEL_ICONS, SUPPORT_STATUSES,
  type SupportSettings, type SupportChannel, type SupportRequest,
} from "@/lib/support";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support Center — Admin" },
      { name: "description", content: "Read help requests, manage contact channels, and control the support page." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSupport,
});

const input =
  "w-full px-3 py-2 border-2 border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary";
const labelCls = "block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1";

function AdminSupport() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"inbox" | "page" | "alerts">("inbox");

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-5 pt-28 pb-24">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Administration
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">Support Center</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Read what users send you, decide which contact options appear, and control the whole support page.
        </p>

        <div className="mt-6 inline-flex rounded-xl border-2 border-border bg-card p-1">
          {([
            ["inbox", "Inbox", <Inbox key="i" size={14} />],
            ["page", "Page settings", <Settings2 key="s" size={14} />],
            ["alerts", "Notifications", <BellRing key="b" size={14} />],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as any)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold ${
                tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {tab === "inbox" && <InboxTab />}
          {tab === "page" && <PageTab />}
          {tab === "alerts" && <AlertsTab />}
        </div>
      </div>
    </div>
  );
}

function InboxTab() {
  const [rows, setRows] = useState<SupportRequest[] | null>(null);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function reload() {
    const { data, error } = await (supabase.from as any)("support_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast.error(error.message);
    setRows((data ?? []) as SupportRequest[]);
  }
  useEffect(() => { void reload(); }, []);

  async function patch(id: string, changes: Partial<SupportRequest>) {
    setRows((list) => (list ?? []).map((r) => (r.id === id ? { ...r, ...changes } : r)));
    const { error } = await (supabase.from as any)("support_requests").update(changes).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function remove(id: string) {
    const { error } = await (supabase.from as any)("support_requests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((list) => (list ?? []).filter((r) => r.id !== id));
  }

  if (rows === null) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const term = q.trim().toLowerCase();
  const list = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!term ||
        [r.name, r.email, r.subject, r.message, String(r.ticket_no)].some((v) =>
          (v ?? "").toLowerCase().includes(term),
        )),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={`${input} pl-9 w-64`} placeholder="Search name, email, subject…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${input} w-48`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {SUPPORT_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{list.length} request{list.length === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-5 space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
        {list.map((r) => (
          <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-4">
            <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="w-full text-left">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-black text-muted-foreground">#{r.ticket_no}</span>
                  <span className="ml-2 font-black">{r.subject || "(no subject)"}</span>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.name} · {r.email} · {r.category} · {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  r.status === "new" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>{r.status.replace("_", " ")}</span>
              </div>
            </button>

            {openId === r.id && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="whitespace-pre-line text-sm text-foreground">{r.message}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>Status</span>
                    <select className={input} value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })}>
                      {SUPPORT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelCls}>Internal notes</span>
                    <input
                      className={input}
                      defaultValue={r.admin_notes}
                      onBlur={(e) => e.target.value !== r.admin_notes && patch(r.id, { admin_notes: e.target.value })}
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject} (#${r.ticket_no})`)}`}
                     className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black">Reply by email</a>
                  {r.user_id && (
                    <Link to="/admin/users" className="px-4 py-2 rounded-lg border-2 border-border text-xs font-black">
                      Open users &amp; roles
                    </Link>
                  )}
                  <button type="button" onClick={() => remove(r.id)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-border text-xs font-black text-destructive">
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageTab() {
  const [s, setS] = useState<SupportSettings | null>(null);
  const [channels, setChannels] = useState<SupportChannel[]>([]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setS(await fetchSupportSettings());
    setChannels(await fetchSupportChannels());
  }
  useEffect(() => { void reload(); }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    const { error } = await (supabase.from as any)("support_settings").update({ ...s, id: true }).eq("id", true);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Support page updated");
  }

  async function addChannel() {
    const { error } = await (supabase.from as any)("support_channels").insert({
      kind: "link", icon: "telegram", label_en: "Telegram", label_ar: "تيليجرام",
      value: "@yourhandle", href: "https://t.me/yourhandle", sort_order: channels.length,
    });
    if (error) return toast.error(error.message);
    await reload();
  }

  async function patchChannel(id: string, changes: Partial<SupportChannel>) {
    setChannels((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
    const { error } = await (supabase.from as any)("support_channels").update(changes).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function removeChannel(id: string) {
    const { error } = await (supabase.from as any)("support_channels").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setChannels((list) => list.filter((c) => c.id !== id));
  }

  async function moveChannel(c: SupportChannel, dir: -1 | 1) {
    const ids = [...channels].sort((a, b) => a.sort_order - b.sort_order).map((x) => x.id);
    const from = ids.indexOf(c.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    await Promise.all(ids.map((id, i) => (supabase.from as any)("support_channels").update({ sort_order: i }).eq("id", id)));
    await reload();
  }

  if (!s) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border-2 border-border bg-card p-5">
        <h2 className="font-black">Page</h2>
        <div className="mt-4 flex flex-wrap gap-5">
          {([
            ["page_enabled", "Show the support page"],
            ["channels_enabled", "Show contact options"],
            ["form_enabled", "Show the message form"],
          ] as const).map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={(s as any)[key]} onChange={(e) => setS({ ...s, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block"><span className={labelCls}>Title (English)</span>
            <input className={input} value={s.intro_title_en} onChange={(e) => setS({ ...s, intro_title_en: e.target.value })} /></label>
          <label className="block"><span className={labelCls}>العنوان</span>
            <input dir="rtl" className={input} value={s.intro_title_ar} onChange={(e) => setS({ ...s, intro_title_ar: e.target.value })} /></label>
          <label className="block"><span className={labelCls}>Intro text (English)</span>
            <textarea className={`${input} min-h-[90px]`} value={s.intro_text_en} onChange={(e) => setS({ ...s, intro_text_en: e.target.value })} /></label>
          <label className="block"><span className={labelCls}>النص التعريفي</span>
            <textarea dir="rtl" className={`${input} min-h-[90px]`} value={s.intro_text_ar} onChange={(e) => setS({ ...s, intro_text_ar: e.target.value })} /></label>
          <label className="block"><span className={labelCls}>Response promise (English)</span>
            <input className={input} value={s.response_note_en} onChange={(e) => setS({ ...s, response_note_en: e.target.value })} /></label>
          <label className="block"><span className={labelCls}>وعد الرد</span>
            <input dir="rtl" className={input} value={s.response_note_ar} onChange={(e) => setS({ ...s, response_note_ar: e.target.value })} /></label>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm">Topics users can choose</h3>
            <button type="button" onClick={() => setS({ ...s, categories: [...s.categories, { key: `topic${s.categories.length + 1}`, en: "New topic", ar: "موضوع جديد" }] })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-black">
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {s.categories.map((c, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input className={input} value={c.en} onChange={(e) => {
                  const next = [...s.categories]; next[i] = { ...c, en: e.target.value, key: c.key || `topic${i}` }; setS({ ...s, categories: next });
                }} />
                <input dir="rtl" className={input} value={c.ar} onChange={(e) => {
                  const next = [...s.categories]; next[i] = { ...c, ar: e.target.value }; setS({ ...s, categories: next });
                }} />
                <button type="button" onClick={() => setS({ ...s, categories: s.categories.filter((_, j) => j !== i) })}
                  className="px-3 rounded-lg border-2 border-border text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <button type="button" onClick={save} disabled={busy}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={15} />} Save page settings
        </button>
      </section>

      <section className="rounded-2xl border-2 border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-black">Contact options</h2>
          <button type="button" onClick={addChannel} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-black">
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {channels.length === 0 && <p className="text-sm text-muted-foreground">No contact options yet.</p>}
          {[...channels].sort((a, b) => a.sort_order - b.sort_order).map((c) => (
            <div key={c.id} className="rounded-xl border-2 border-border p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block"><span className={labelCls}>Icon</span>
                  <select className={input} value={c.icon} onChange={(e) => patchChannel(c.id, { icon: e.target.value })}>
                    {CHANNEL_ICONS.map((i) => (<option key={i} value={i}>{i}</option>))}
                  </select></label>
                <label className="block"><span className={labelCls}>Label (English)</span>
                  <input className={input} value={c.label_en} onChange={(e) => patchChannel(c.id, { label_en: e.target.value })} /></label>
                <label className="block"><span className={labelCls}>التسمية</span>
                  <input dir="rtl" className={input} value={c.label_ar} onChange={(e) => patchChannel(c.id, { label_ar: e.target.value })} /></label>
                <label className="block"><span className={labelCls}>Shown value</span>
                  <input className={input} value={c.value} onChange={(e) => patchChannel(c.id, { value: e.target.value })} /></label>
                <label className="block md:col-span-2"><span className={labelCls}>Link (https://, mailto:, tel:)</span>
                  <input className={input} value={c.href} onChange={(e) => patchChannel(c.id, { href: e.target.value })} /></label>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold">
                  <input type="checkbox" checked={c.visible} onChange={(e) => patchChannel(c.id, { visible: e.target.checked })} /> Visible
                </label>
                <button type="button" onClick={() => moveChannel(c, -1)} className="p-1.5 rounded-lg border-2 border-border"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => moveChannel(c, 1)} className="p-1.5 rounded-lg border-2 border-border"><ArrowDown size={13} /></button>
                <button type="button" onClick={() => removeChannel(c.id)} className="p-1.5 rounded-lg border-2 border-border text-destructive"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AlertsTab() {
  const [s, setS] = useState<SupportSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void (async () => {
      const [base, notify] = await Promise.all([fetchSupportSettings(), fetchSupportNotify()]);
      setS({ ...base, ...notify });
    })();
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    const { error } = await (supabase.from as any)("support_settings")
      .update({ notify_enabled: s.notify_enabled, notify_email: s.notify_email }).eq("id", true);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Notification settings saved");
  }

  if (!s) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <section className="rounded-2xl border-2 border-border bg-card p-5 max-w-xl">
      <h2 className="font-black">Email alerts for new requests</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Sending alert emails needs a sender domain you own. Until that is set up, requests still arrive in the inbox above.
      </p>
      <label className="mt-4 inline-flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={s.notify_enabled} onChange={(e) => setS({ ...s, notify_enabled: e.target.checked })} />
        Email me when a new request arrives
      </label>
      <label className="block mt-4"><span className={labelCls}>Send alerts to</span>
        <input className={input} placeholder="you@example.com" value={s.notify_email} onChange={(e) => setS({ ...s, notify_email: e.target.value })} /></label>
      <button type="button" onClick={save} disabled={busy}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={15} />} Save
      </button>
    </section>
  );
}
