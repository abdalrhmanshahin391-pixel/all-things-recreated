import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { X, Megaphone, ArrowRight, Pin } from "lucide-react";
import {
  dismiss,
  isLive,
  readDismissed,
  useAnnouncements,
  type Announcement,
} from "@/lib/announcements";

function useVisible() {
  const { data } = useAnnouncements();
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => setClosed(readDismissed()), []);
  const list = useMemo(
    () => (data ?? []).filter((a) => isLive(a) && (a.pinned || !closed.includes(a.id))),
    [data, closed],
  );
  const close = (id: string) => {
    dismiss(id);
    setClosed((c) => [...c, id]);
  };
  return { list, close };
}

function CloseBtn({
  a,
  onClose,
  size = 13,
  className = "",
}: {
  a: Announcement;
  onClose: () => void;
  size?: number;
  className?: string;
}) {
  if (a.pinned) return null;
  return (
    <button
      onClick={onClose}
      aria-label="Dismiss announcement"
      className={`shrink-0 rounded-full p-1 hover:bg-white/20 ${className}`}
    >
      <X size={size} strokeWidth={3} />
    </button>
  );
}

function bg(a: Announcement, mix = 70) {
  return `linear-gradient(135deg, ${a.accent}, color-mix(in oklab, ${a.accent} ${mix}%, black))`;
}

function Body({ a }: { a: Announcement }) {
  return (
    <>
      {a.urgent && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
      )}
      <span className="font-black">{a.title}</span>
      {a.body && <span className="opacity-90 font-semibold">{a.body}</span>}
      {a.href && (
        <a
          href={a.href}
          className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 font-black hover:bg-white/30"
        >
          {a.href_label || "Open"} <ArrowRight size={11} strokeWidth={3} />
        </a>
      )}
    </>
  );
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function ModalAnnouncement({ a, onClose }: { a: Announcement; onClose: () => void }) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `aq-modal-seen-${a.id}`;
    if (!a.pinned && sessionStorage.getItem(key)) return;
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [a.id, a.pinned]);

  if (!mounted || !open) return null;

  const hide = () => {
    try {
      sessionStorage.setItem(`aq-modal-seen-${a.id}`, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={a.pinned ? hide : () => { hide(); onClose(); }}
      />
      <div
        className="relative w-full max-w-md rounded-3xl border-2 border-white/20 p-6 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        style={{ background: bg(a, 55) }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <Megaphone size={16} strokeWidth={3} />
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-2 text-sm leading-relaxed">
            <Body a={a} />
          </div>
        </div>
        <button
          onClick={a.pinned ? hide : () => { hide(); onClose(); }}
          className="mt-5 w-full rounded-2xl bg-white/20 px-4 py-2.5 text-sm font-black hover:bg-white/30"
        >
          {a.pinned ? "Got it" : "Close"}
        </button>
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
      </div>
    </div>,
    document.body,
  );
}

export function AnnouncementBar() {
  const { list, close } = useVisible();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [i, setI] = useState(0);
  const [showFloat, setShowFloat] = useState(false);

  const pick = (style: Announcement["style"]) => list.filter((a) => a.style === style);
  const ribbons = pick("ribbon");
  const floats = pick("floating");
  const spots = pick("spotlight");
  const strips = pick("strip");
  const marquees = pick("marquee");
  const toasts = pick("toast");
  const inlines = pick("inline");
  const modals = pick("modal");

  useEffect(() => {
    if (ribbons.length < 2) return;
    const t = setInterval(() => setI((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, [ribbons.length]);

  useEffect(() => {
    if (!floats.length) return;
    const t = setTimeout(() => setShowFloat(true), 2500);
    return () => clearTimeout(t);
  }, [floats.length]);

  const home = pathname === "/";
  const ribbon = ribbons.length ? ribbons[i % ribbons.length] : null;
  const float = floats[0];
  const spot = home ? spots[0] : undefined;
  const inline = home ? inlines[0] : undefined;
  const strip = strips[0];
  const marquee = marquees[0];
  const toast = toasts[0];
  const modal = modals[0];

  if (!ribbon && !float && !spot && !strip && !marquee && !toast && !inline && !modal) return null;

  return (
    <>
      <style>{`@keyframes aq-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>

      {ribbon && (
        <div
          className="relative z-40 w-full text-white"
          style={{ background: `linear-gradient(90deg, ${ribbon.accent}, color-mix(in oklab, ${ribbon.accent} 70%, black))` }}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2 text-[12px]">
            <Megaphone size={13} strokeWidth={2.8} className="shrink-0" />
            <div key={ribbon.id} className="flex flex-1 flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-500">
              <Body a={ribbon} />
            </div>
            <CloseBtn a={ribbon} onClose={() => close(ribbon.id)} />
          </div>
        </div>
      )}

      {strip && (
        <div className="relative z-40 w-full text-white" style={{ background: bg(strip, 60) }}>
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <Megaphone size={18} strokeWidth={3} />
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2 text-sm md:text-base">
              <Body a={strip} />
            </div>
            {strip.pinned && <Pin size={14} className="opacity-60" />}
            <CloseBtn a={strip} onClose={() => close(strip.id)} size={15} />
          </div>
        </div>
      )}

      {marquee && (
        <div className="relative z-40 flex w-full items-center text-white" style={{ background: bg(marquee, 65) }}>
          <div className="flex-1 overflow-hidden py-2">
            <div
              className="flex w-max gap-10 whitespace-nowrap text-[12px]"
              style={{ animation: "aq-marquee 22s linear infinite" }}
            >
              {[0, 1].map((k) => (
                <span key={k} className="flex items-center gap-2">
                  <Megaphone size={12} strokeWidth={3} />
                  <Body a={marquee} />
                </span>
              ))}
            </div>
          </div>
          <div className="px-3">
            <CloseBtn a={marquee} onClose={() => close(marquee.id)} />
          </div>
        </div>
      )}

      {spot && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div
            className="relative overflow-hidden rounded-3xl px-5 py-5 text-white md:px-8 md:py-6"
            style={{ background: bg(spot, 55) }}
          >
            <div className="relative z-10 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                <Megaphone size={11} strokeWidth={3} /> Announcement
              </span>
              <div className="flex flex-1 flex-wrap items-center gap-2 text-sm md:text-base">
                <Body a={spot} />
              </div>
              <CloseBtn a={spot} onClose={() => close(spot.id)} size={15} className="p-1.5" />
            </div>
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" />
            <div className="pointer-events-none absolute -bottom-14 right-24 h-36 w-36 rounded-full bg-white/10" />
          </div>
        </div>
      )}

      {inline && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm"
            style={{ borderInlineStartWidth: 6, borderInlineStartColor: inline.accent }}
          >
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: inline.accent }}
            >
              <Megaphone size={14} strokeWidth={3} />
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2 text-foreground">
              <span className="font-black">{inline.title}</span>
              {inline.body && <span className="font-semibold text-muted-foreground">{inline.body}</span>}
              {inline.href && (
                <a
                  href={inline.href}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black text-white"
                  style={{ background: inline.accent }}
                >
                  {inline.href_label || "Open"} <ArrowRight size={11} strokeWidth={3} />
                </a>
              )}
            </div>
            {!inline.pinned && (
              <button
                onClick={() => close(inline.id)}
                aria-label="Dismiss announcement"
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={14} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 top-20 z-50 max-w-[280px] animate-in fade-in slide-in-from-right-4 duration-500">
          <div
            className="rounded-2xl border-2 border-white/20 px-3.5 py-2.5 text-white"
            style={{ background: bg(toast, 60), boxShadow: "0 10px 30px rgba(0,0,0,0.22)" }}
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-1 flex-wrap items-center gap-1.5 text-[12px] leading-snug">
                <Body a={toast} />
              </div>
              <CloseBtn a={toast} onClose={() => close(toast.id)} />
            </div>
          </div>
        </div>
      )}

      {float && showFloat && (
        <div className="fixed bottom-4 right-4 z-50 max-w-[300px] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div
            className="rounded-2xl border-2 border-white/20 px-4 py-3 text-white"
            style={{ background: bg(float, 60), boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-1 flex-wrap items-center gap-1.5 text-[13px] leading-snug">
                <Body a={float} />
              </div>
              <CloseBtn a={float} onClose={() => close(float.id)} />
            </div>
          </div>
        </div>
      )}

      {modal && <ModalAnnouncement a={modal} onClose={() => close(modal.id)} />}
    </>
  );
}
