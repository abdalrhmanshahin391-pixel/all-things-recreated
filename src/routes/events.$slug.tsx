import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/components/LanguageProvider";
import {
  accentColor,
  eventBySlugQuery,
  fallbackQr,
  type EventContact,
  type EventMember,
} from "@/lib/events";

export const Route = createFileRoute("/events/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Event — AquaQBank Academy` },
      { name: "description", content: `Information page for the ${params.slug} event at AquaQBank Academy.` },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Event — AquaQBank Academy" },
      { property: "og:description", content: "Everything new students need to know about this event." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventPage,
});

function EventPage() {
  const { slug } = Route.useParams();
  const { lang } = useLang();
  const ar = lang === "ar";
  const { data, isLoading } = useQuery(eventBySlugQuery(slug));

  const event = data?.event;
  const tint = event ? accentColor[event.accent] ?? accentColor.emerald : accentColor.emerald;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {isLoading ? (
        <div className="mx-auto max-w-4xl px-4 py-24">
          <div className="h-40 animate-pulse rounded-3xl bg-muted" />
        </div>
      ) : !event ? (
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <h1 className="text-2xl font-black">{ar ? "هذه الصفحة غير متاحة" : "This page is not available"}</h1>
          <p className="mt-3 text-muted-foreground">
            {ar ? "قد تكون الفعالية مغلقة حالياً." : "The event may be switched off right now."}
          </p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground">
            <ArrowLeft size={15} /> {ar ? "الرئيسية" : "Back home"}
          </Link>
        </div>
      ) : (
        <>
          <header
            className="relative overflow-hidden border-b border-border px-4 py-16 text-center"
            style={{ background: `linear-gradient(180deg, ${tint}22, transparent)` }}
          >
            <div className="mx-auto max-w-3xl">
              <h1 className="text-3xl font-black sm:text-4xl" dir={ar ? "rtl" : "ltr"}>
                {(ar ? event.title_ar : event.title_en) || event.title_en || event.title_ar}
              </h1>
              {(event.subtitle_en || event.subtitle_ar) && (
                <p className="mx-auto mt-4 max-w-2xl text-muted-foreground" dir={ar ? "rtl" : "ltr"}>
                  {(ar ? event.subtitle_ar : event.subtitle_en) || event.subtitle_en || event.subtitle_ar}
                </p>
              )}
            </div>
          </header>

          <main className="mx-auto max-w-4xl px-4 py-12 space-y-10">
            {(data?.sections ?? [])
              .filter((s) => s.visible)
              .map((s) => {
                const title = (ar ? s.title_ar : s.title_en) || s.title_en || s.title_ar;
                const body = (ar ? s.body_ar : s.body_en) || s.body_en || s.body_ar;
                return (
                  <section key={s.id} className="rounded-2xl border border-border bg-card p-6" dir={ar ? "rtl" : "ltr"}>
                    {title && <h2 className="text-xl font-black">{title}</h2>}
                    {body && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{body}</p>
                    )}
                  </section>
                );
              })}

            {(data?.members?.length ?? 0) > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xl font-black">
                  <Users size={18} /> {ar ? "الفريق" : "The team"}
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[...(data?.members ?? [])]
                    .sort((a, b) => Number(b.is_head) - Number(a.is_head) || a.sort_order - b.sort_order)
                    .map((m) => (
                      <MemberTile key={m.id} member={m} ar={ar} tint={tint} />
                    ))}
                </div>
              </section>
            )}

            {(data?.contacts?.length ?? 0) > 0 && (
              <section className="grid gap-4 sm:grid-cols-2">
                {(data?.contacts ?? []).map((c) => (
                  <ContactTile key={c.id} contact={c} ar={ar} />
                ))}
              </section>
            )}
          </main>
        </>
      )}

      <SiteFooter />
    </div>
  );
}

function MemberTile({ member, ar, tint }: { member: EventMember; ar: boolean; tint: string }) {
  const name = (ar ? member.name_ar : member.name_en) || member.name_en || member.name_ar;
  const desc = (ar ? member.description_ar : member.description_en) || "";
  const withPhoto = member.photo_fit !== "none" && !!member.photo_url;
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card text-center shadow-sm">
      {withPhoto ? (
        <img
          src={member.photo_url}
          alt={name}
          loading="lazy"
          className={`h-44 w-full ${member.photo_fit === "contain" ? "object-contain" : "object-cover"}`}
        />
      ) : (
        <div className="h-2 w-full" style={{ background: tint }} />
      )}
      <div className="p-4">
        <p className="text-base font-black">{name}</p>
        {member.role_label && (
          <p className="mt-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: tint }}>
            {member.role_label}
          </p>
        )}
        {member.is_head && (
          <p className="mt-1 text-[11px] font-black text-primary">{ar ? "المسؤول" : "Head of the event"}</p>
        )}
        {desc && <p className="mt-2 text-sm text-muted-foreground">{desc}</p>}
      </div>
    </article>
  );
}

function ContactTile({ contact, ar }: { contact: EventContact; ar: boolean }) {
  const title = (ar ? contact.title_ar : contact.title_en) || contact.title_en || contact.title_ar;
  const note = (ar ? contact.note_ar : contact.note_en) || "";
  const showQr = contact.kind !== "contact" && !!(contact.qr_url || contact.link);
  const qr = contact.qr_url || (contact.link ? fallbackQr(contact.link) : "");
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-center">
      <p className="text-base font-black">{title}</p>
      {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
      {showQr && qr && (
        <img src={qr} alt={title} loading="lazy" className="mx-auto mt-4 h-36 w-36 rounded-xl border border-border bg-background object-contain p-2" />
      )}
      {contact.link && (
        <a
          href={contact.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground hover:opacity-90"
        >
          <Send size={15} /> {contact.button_label || (ar ? "انضم" : "Open")}
        </a>
      )}
    </div>
  );
}
