import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, MessageCircle, Mail, Phone, Instagram, Link2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useLang } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  useSupportSettings,
  useSupportChannels,
  submitSupportRequest,
  validateDraft,
  cooldownLeft,
  pick,
  type SupportChannel,
} from "@/lib/support";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — AquaQBank" },
      { name: "description", content: "Get help with payments, course access, or anything technical. Reach our team by message, email, or chat." },
      { property: "og:title", content: "Support — AquaQBank" },
      { property: "og:description", content: "Get help with payments, course access, or anything technical." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function iconFor(name: string) {
  const size = 18;
  if (name === "telegram" || name === "whatsapp") return <MessageCircle size={size} />;
  if (name === "mail") return <Mail size={size} />;
  if (name === "phone") return <Phone size={size} />;
  if (name === "instagram") return <Instagram size={size} />;
  return <Link2 size={size} />;
}

function ChannelCard({ c, lang }: { c: SupportChannel; lang: string }) {
  const label = pick(lang, c.label_en, c.label_ar);
  const inner = (
    <>
      <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
        {iconFor(c.icon)}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground truncate">{c.value}</span>
      </span>
    </>
  );
  const cls =
    "flex items-center gap-3 rounded-2xl border-2 border-border bg-card p-4 transition-transform hover:-translate-y-0.5";
  return c.href ? (
    <a href={c.href} target="_blank" rel="noreferrer noopener" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function SupportPage() {
  const { lang } = useLang();
  const { user, profile } = useAuth();
  const settings = useSupportSettings();
  const channels = useSupportChannels().filter((c) => c.visible);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState(settings.categories[0]?.key ?? "other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (profile) {
      setName((v) => v || (profile as any).full_name || (profile as any).username || "");
      setEmail((v) => v || (profile as any).email || "");
    }
  }, [profile]);

  const categories = useMemo(() => settings.categories, [settings.categories]);

  async function send() {
    const left = cooldownLeft();
    if (left > 0) {
      toast.error(`Please wait ${Math.ceil(left / 1000)}s before sending again.`);
      return;
    }
    const draft = { name, email, category, subject, message, userId: user?.id ?? null };
    const problem = validateDraft(draft);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const no = await submitSupportRequest(draft);
      setTicket(no);
      setDone(true);
      setSubject("");
      setMessage("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send your message");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full px-3 py-2.5 rounded-xl border-2 border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 md:px-8 pt-28 pb-20">
        {!settings.page_enabled ? (
          <p className="text-muted-foreground">Support is currently unavailable. Please check back soon.</p>
        ) : (
          <>
            <h1 className="font-display font-black lowercase leading-[1.05]" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)" }}>
              {pick(lang, settings.intro_title_en, settings.intro_title_ar)}
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
              {pick(lang, settings.intro_text_en, settings.intro_text_ar)}
            </p>

            {settings.channels_enabled && channels.length > 0 && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {channels.map((c) => (
                  <ChannelCard key={c.id} c={c} lang={lang} />
                ))}
              </div>
            )}

            {settings.form_enabled && (
              <section className="mt-10 rounded-3xl border-2 border-border bg-card p-6 md:p-8" style={{ boxShadow: "0 6px 0 var(--border)" }}>
                {done ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="mx-auto text-primary" size={44} />
                    <h2 className="mt-4 text-2xl font-black">Message sent</h2>
                    <p className="mt-2 text-muted-foreground">
                      {ticket ? `Your ticket number is #${ticket}. ` : ""}
                      {pick(lang, settings.response_note_en, settings.response_note_ar)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDone(false)}
                      className="mt-6 px-5 py-2.5 rounded-xl border-2 border-border font-bold text-sm"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-black">Send us a message</h2>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Your name</span>
                        <input className={input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Email</span>
                        <input className={input} value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Topic</span>
                        <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                          {categories.map((c) => (
                            <option key={c.key} value={c.key}>
                              {pick(lang, c.en, c.ar)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Subject</span>
                        <input className={input} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
                      </label>
                    </div>
                    <label className="block mt-4">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">How can we help?</span>
                      <textarea
                        className={`${input} min-h-[150px]`}
                        value={message}
                        maxLength={4000}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                    </label>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={send}
                        disabled={busy}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={16} />} Send message
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {pick(lang, settings.response_note_en, settings.response_note_ar)}
                      </span>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
