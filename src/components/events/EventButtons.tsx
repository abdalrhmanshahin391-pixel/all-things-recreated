import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/components/LanguageProvider";
import { accentColor, eventsFor, eventsQuery, type SiteEvent } from "@/lib/events";

/** Entry buttons for switched-on events (home page cards or header pills). */
export function EventEntryButtons({ place = "home" }: { place?: "home" | "header" }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const ar = lang === "ar";
  const { data } = useQuery(eventsQuery);
  const list = eventsFor(data, place, !!user);
  if (list.length === 0) return null;

  if (place === "header") {
    return (
      <>
        {list.map((e) => (
          <Link
            key={e.id}
            to="/events/$slug"
            params={{ slug: e.slug }}
            className="rounded-full px-3 py-1.5 text-sm font-bold text-white"
            style={{ background: accentColor[e.accent] ?? accentColor.emerald }}
          >
            {(ar ? e.title_ar : e.title_en) || e.title_en || e.title_ar}
          </Link>
        ))}
      </>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((e) => (
          <EventCard key={e.id} event={e} ar={ar} />
        ))}
      </div>
    </section>
  );
}

function EventCard({ event, ar }: { event: SiteEvent; ar: boolean }) {
  const tint = accentColor[event.accent] ?? accentColor.emerald;
  const title = (ar ? event.title_ar : event.title_en) || event.title_en || event.title_ar;
  const sub = (ar ? event.subtitle_ar : event.subtitle_en) || "";
  const style = event.button_style;

  const base =
    "group flex w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-2xl px-4 py-4 transition hover:opacity-95 sm:gap-4 sm:px-6 sm:py-5";
  const look =
    style === "outline"
      ? { className: `${base} border-2 bg-transparent`, style: { borderColor: tint, color: tint } }
      : style === "gradient"
        ? { className: `${base} text-white`, style: { background: `linear-gradient(135deg, ${tint}, #0f172a)` } }
        : style === "solid"
          ? { className: `${base} text-white`, style: { background: tint } }
          : {
              className: `${base} text-white shadow-lg sm:col-span-2 sm:py-8`,
              style: { background: `linear-gradient(120deg, ${tint}, ${tint}cc)` },
            };

  return (
    <Link
      to="/events/$slug"
      params={{ slug: event.slug }}
      className={look.className}
      style={look.style}
      dir={ar ? "rtl" : "ltr"}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-80 sm:text-[11px]">
          <CalendarDays size={13} className="shrink-0" /> {ar ? "فعالية" : "Event"}
        </span>
        <span className="mt-1 block break-words text-lg font-black leading-tight sm:text-xl">{title}</span>
        {sub && <span className="mt-1 block break-words text-sm opacity-85">{sub}</span>}
      </span>
      <ArrowRight size={20} className="shrink-0 transition group-hover:translate-x-1" />
    </Link>
  );
}
