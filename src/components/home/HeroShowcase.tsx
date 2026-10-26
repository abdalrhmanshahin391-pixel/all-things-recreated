import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { showcaseUrl, type ShowcaseKey } from "@/lib/showcase-media";
import { SiteWordmark } from "@/components/brand/SiteWordmark";
import { ArrowRight, BookOpenCheck, Check, FolderOpen, GraduationCap, PlayCircle } from "lucide-react";

/**
 * Landing hero for visitors who are not signed in: brand + promise on the left,
 * a recorded clip of the real site on the right, and pill buttons that switch
 * the clip (public/showcase/*.webm).
 */
const TABS = [
  { key: "qbank", label: "Question bank", Icon: BookOpenCheck },
  { key: "lectures", label: "Lectures", Icon: PlayCircle },
  { key: "resources", label: "Resources", Icon: FolderOpen },
] as const;

function ShowcaseClip({ name, on }: { name: ShowcaseKey; on: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  // the stored copy is cached for a year; the file shipped with the site is the fallback
  const [src, setSrc] = useState(() => showcaseUrl(name));
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (on) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [on]);
  return (
    <video
      ref={ref}
      src={src}
      onError={() => setSrc((s) => (s.startsWith("/") ? s : `/showcase/${name}.webm`))}
      autoPlay={on}
      muted
      loop
      playsInline
      preload={on ? "auto" : "metadata"}
      aria-hidden={!on}
      className={
        "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-200 " +
        (on ? "opacity-100" : "pointer-events-none opacity-0")
      }
    />
  );
}

export function HeroShowcase({ signedIn = false }: { signedIn?: boolean }) {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("qbank");

  return (
    <section className="relative overflow-hidden bg-background pt-24 pb-14 md:pt-32 md:pb-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        {/* Left: brand, promise, call to action, section pills */}
        <div>
          <SiteWordmark size={64} emblem={false} />
          <span aria-hidden="true" className="mt-4 block h-[3px] w-14 rounded-full bg-[color:var(--gold)]" />
          <h1
            className="mt-5 font-display font-extrabold leading-[1.08] tracking-tight text-foreground"
            style={{ fontSize: "clamp(2rem, 4.4vw, 3.4rem)" }}
          >
            Master the art of{" "}
            <span className="relative whitespace-nowrap text-[color:var(--primary)]">
              learning
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-0 h-[5px] w-full rounded-full"
                style={{ background: "color-mix(in oklab, var(--primary) 35%, transparent)" }}
              />
            </span>
          </h1>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              to={signedIn ? "/universities" : "/register"}
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-[color:var(--primary-foreground)] shadow-[0_10px_24px_-10px_rgba(26,47,107,0.7)] transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--primary)" }}
            >
              {signedIn ? "Universities" : "Get started"} <ArrowRight size={18} strokeWidth={2.6} />
            </Link>
            <span className="inline-flex items-center gap-2.5">
              {/* sticker: a small gold seal with a slowly turning dashed ring */}
              <span
                aria-hidden="true"
                className="relative grid h-10 w-10 shrink-0 -rotate-6 place-items-center rounded-full shadow-[0_8px_18px_-8px_rgba(19,41,75,0.55)]"
                style={{ background: "linear-gradient(145deg, var(--gold), color-mix(in oklab, var(--gold) 70%, white))", color: "var(--gold-foreground)" }}
              >
                <span
                  className="absolute inset-[3px] animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-[color:var(--gold-foreground)]/45 motion-reduce:animate-none"
                />
                <GraduationCap size={18} strokeWidth={2} />
              </span>
              <span className="text-xs font-semibold uppercase leading-tight tracking-[0.14em] text-muted-foreground">
                Your Personal
                <br />
                Learning Companion
              </span>
            </span>
          </div>

          <div role="tablist" className="mt-9 flex flex-wrap gap-3">
            {TABS.map(({ key, label, Icon }) => {
              const on = key === active;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(key)}
                  className={
                    "relative inline-flex items-center gap-2.5 rounded-full border-2 px-5 py-2.5 text-sm font-semibold transition-colors " +
                    (on
                      ? "border-[color:var(--primary)] bg-card text-foreground shadow-sm"
                      : "border-dashed border-border text-muted-foreground hover:border-[color:var(--primary)] hover:text-foreground")
                  }
                >
                  <Icon size={18} strokeWidth={2.2} />
                  {label}
                  {on && (
                    <span
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full text-white"
                      style={{ background: "var(--primary)" }}
                    >
                      <Check size={12} strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: stacked cards with the preview clip */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute inset-0 translate-x-4 translate-y-4 rotate-[2deg] rounded-3xl md:translate-x-6 md:translate-y-6"
            style={{ background: "color-mix(in oklab, var(--primary) 55%, white)" }}
          />
          <div
            className="relative rounded-3xl p-3 shadow-[0_30px_70px_-30px_rgba(15,27,61,0.55)] md:p-4"
            style={{ background: "var(--primary-deep)" }}
          >
            <div className="overflow-hidden rounded-2xl bg-card">
              {/* all three clips are mounted and preloaded, so switching only plays another one */}
              <div className="relative aspect-video w-full bg-muted">
                {TABS.map(({ key }) => (
                  <ShowcaseClip key={key} name={key} on={key === active} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
