import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Send, Clock, X, Loader2, CheckCircle2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { guardRedirect } from "@/lib/guard-redirect";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useUserGroups } from "@/lib/user-groups";
import {
  sendPushMessage,
  sendPushTest,
  cancelScheduledPush,
  saveNotificationSettings,
} from "@/lib/push.functions";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Administration Site" },
      { name: "description", content: "Write and send phone notifications to your members in English and Arabic." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Notifications — Administration Site" },
      { property: "og:description", content: "Send phone notifications to chosen groups of members." },
    ],
  }),
  component: AdminNotifications,
});

const inputCls = "w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm text-foreground";

type Msg = {
  id: string;
  title_en: string;
  body_en: string;
  title_ar: string;
  body_ar: string;
  url: string;
  status: string;
  source: string;
  sent_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
};

const AUTO_TOGGLES = [
  { key: "on_event", label: "A new event is published" },
  { key: "on_committee_resource", label: "A new resource is added to لجنة الطب والجراحة" },
  { key: "on_new_course", label: "A new course or university opens" },
  { key: "on_urgent_announcement", label: "An urgent site announcement goes live" },
] as const;

function AdminNotifications() {
  const { isAdmin, loading } = useAuth();
  const { isCommitteeHead } = useCommitteeRole();
  const canSend = isAdmin || isCommitteeHead;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [titleEn, setTitleEn] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [url, setUrl] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<"send" | "test" | null>(null);

  useEffect(() => {
    if (!loading && !canSend) guardRedirect(navigate);
  }, [loading, canSend, navigate]);

  const { data: groups } = useUserGroups();

  const { data: reach } = useQuery({
    enabled: canSend,
    queryKey: ["push-reach", groupIds.join(",")],
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("push_audience_count", { _group_ids: groupIds });
      return Number(data ?? 0);
    },
  });

  const { data: history } = useQuery({
    enabled: canSend,
    queryKey: ["push-messages"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("push_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40);
      return (data ?? []) as Msg[];
    },
  });

  const { data: settings } = useQuery({
    enabled: isAdmin,
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("notification_settings").select("*").eq("id", true).maybeSingle();
      return (data ?? {}) as Record<string, boolean>;
    },
  });

  const draft = useMemo(
    () => ({
      title_en: titleEn.trim(),
      body_en: bodyEn.trim(),
      title_ar: titleAr.trim(),
      body_ar: bodyAr.trim(),
      url: url.trim(),
      group_ids: groupIds,
    }),
    [titleEn, bodyEn, titleAr, bodyAr, url, groupIds],
  );

  if (loading || !canSend) return <div className="min-h-screen bg-muted/40" />;

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  async function send() {
    if (!draft.title_en && !draft.title_ar) return toast.error("Please write a title.");
    setBusy("send");
    try {
      const res = await sendPushMessage({ data: { ...draft, scheduled_at: when ? new Date(when).toISOString() : null } });
      if (res.scheduled) toast.success("Scheduled.");
      else toast.success(`Delivered to ${res.sent} device(s)${res.failed ? `, ${res.failed} failed` : ""}.`);
      setWhen("");
      qc.invalidateQueries({ queryKey: ["push-messages"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const res = await sendPushTest({ data: draft });
      toast[res.sent ? "success" : "error"](
        res.sent ? `Test sent to ${res.sent} of your device(s).` : "You have no device with notifications enabled yet.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    await cancelScheduledPush({ data: { id } });
    qc.invalidateQueries({ queryKey: ["push-messages"] });
  }

  async function flipSetting(key: string, value: boolean) {
    try {
      await saveNotificationSettings({ data: { [key]: value } });
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <Link to="/admin" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <ArrowLeft size={15} /> Administration site
        </Link>
        <h1 className="mb-1 inline-flex items-center gap-3 text-3xl font-black tracking-tight">
          <Bell size={26} className="text-primary" /> Notifications
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Write it once in English and once in Arabic — each member gets it in the language they use.
        </p>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-muted-foreground">English title</label>
                <input className={inputCls} value={titleEn} maxLength={120} onChange={(e) => setTitleEn(e.target.value)} />
                <label className="mt-3 mb-1 block text-xs font-bold text-muted-foreground">English message</label>
                <textarea className={`${inputCls} h-24`} value={bodyEn} maxLength={400} onChange={(e) => setBodyEn(e.target.value)} />
              </div>
              <div dir="rtl">
                <label className="mb-1 block text-xs font-bold text-muted-foreground">العنوان بالعربية</label>
                <input className={inputCls} value={titleAr} maxLength={120} onChange={(e) => setTitleAr(e.target.value)} />
                <label className="mt-3 mb-1 block text-xs font-bold text-muted-foreground">نص الإشعار</label>
                <textarea className={`${inputCls} h-24`} value={bodyAr} maxLength={400} onChange={(e) => setBodyAr(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">Link to open (optional)</label>
              <input className={inputCls} value={url} placeholder="/events/orientation" onChange={(e) => setUrl(e.target.value)} />
            </div>

            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">Audience — leave empty to reach everyone</p>
              <div className="flex flex-wrap gap-2">
                {(groups ?? []).map((g) => {
                  const on = groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
                {(groups ?? []).length === 0 && (
                  <Link to="/admin/groups" className="text-xs font-bold text-primary">
                    Create your first group →
                  </Link>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">Send later (optional)</label>
              <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={send}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : when ? <Clock size={15} /> : <Send size={15} />}
                {when ? "Schedule" : "Send now"}
              </button>
              <button
                onClick={test}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {busy === "test" ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />}
                Send test to me
              </button>
              <span className="text-xs text-muted-foreground">{reach ?? 0} device(s) will receive this</span>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="mb-3 text-xs font-bold text-muted-foreground">Preview</p>
              <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
                <p className="text-sm font-bold">{titleEn || "AquaQBank"}</p>
                <p className="text-xs text-muted-foreground">{bodyEn || "Your English message appears here."}</p>
              </div>
              <div className="mt-3 rounded-xl border border-border bg-background p-3 shadow-sm" dir="rtl">
                <p className="text-sm font-bold">{titleAr || "أكوا كيو بانك"}</p>
                <p className="text-xs text-muted-foreground">{bodyAr || "يظهر نص الإشعار بالعربية هنا."}</p>
              </div>
            </div>

            {isAdmin && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="mb-3 text-xs font-bold text-muted-foreground">Automatic notifications</p>
                <div className="space-y-2">
                  {AUTO_TOGGLES.map((t) => {
                    const on = !!settings?.[t.key];
                    return (
                      <label key={t.key} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => flipSetting(t.key, e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>{t.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        </div>

        <h2 className="mt-10 mb-3 text-lg font-black">History</h2>
        <div className="space-y-2">
          {(history ?? []).map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{m.title_en || m.title_ar}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.status === "scheduled"
                    ? `Scheduled for ${new Date(m.scheduled_at ?? "").toLocaleString()}`
                    : `${m.sent_count} delivered${m.failed_count ? ` · ${m.failed_count} failed` : ""} · ${new Date(
                        m.created_at,
                      ).toLocaleString()}`}
                  {m.source !== "manual" && " · automatic"}
                </p>
              </div>
              {m.status === "scheduled" ? (
                <button onClick={() => cancel(m.id)} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-destructive">
                  <X size={13} /> Cancel
                </button>
              ) : (
                <CheckCircle2 size={15} className="shrink-0 text-primary" />
              )}
            </div>
          ))}
          {(history ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing sent yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
