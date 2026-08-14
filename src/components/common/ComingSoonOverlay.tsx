import { Lock } from "lucide-react";

/** Dimming overlay + "Coming soon" pill for a closed university card. */
export function ComingSoonOverlay({ note, lang = "en" }: { note?: string | null; lang?: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-background/70 backdrop-blur-[2px] p-4 text-center">
      <div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest"
          style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          <Lock size={12} /> {lang === "ar" ? "قريبًا" : "Coming soon"}
        </span>
        {note ? <p className="mt-2 text-xs font-semibold text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
