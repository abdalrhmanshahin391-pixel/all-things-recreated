import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RaziWordmark } from "@/components/brand/RaziWordmark";
import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const isLogin = /welcome|sign in/i.test(eyebrow + title);

  return (
    <div className="min-h-screen bg-background text-foreground grid lg:grid-cols-[1.05fr_1fr]">
      {/* Left: form */}
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-border lg:border-b-0">
          <Link to="/" className="flex items-center">
            <RaziWordmark size={28} />
          </Link>
          <Link
            to="/"
            className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← back home
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            <span
              className="inline-flex items-center gap-2 rounded-full bg-card border-2 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ borderColor: "var(--primary-soft)", color: "var(--primary)", boxShadow: "0 3px 0 var(--primary-soft)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              {eyebrow}
            </span>
            <h1
              className="mt-4 font-display font-black tracking-tight text-foreground leading-[1.05] lowercase"
              style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}
            >
              {title}
            </h1>
            <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              {subtitle}
            </p>

            <div className="mt-8">{children}</div>

            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>

            {!isLogin && (
              <p className="mt-6 text-xs text-muted-foreground/80">
                by creating an account you agree to our terms and privacy policy.
              </p>
            )}
          </div>
        </main>
      </div>

      {/* Right: brand panel — navy surface + gold glow, all from theme tokens */}
      <aside
        className="hidden lg:flex relative overflow-hidden border-s border-border"
        style={{
          background:
            "radial-gradient(120% 90% at 85% 0%, color-mix(in oklab, var(--primary) 16%, transparent) 0%, transparent 55%)," +
            "radial-gradient(90% 70% at 10% 100%, color-mix(in oklab, var(--primary) 10%, transparent) 0%, transparent 60%)," +
            "linear-gradient(160deg, var(--card) 0%, var(--background) 100%)",
        }}
      >
        {/* faint gold grid */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklab, var(--primary) 10%, transparent) 1px, transparent 1px)," +
              "linear-gradient(to bottom, color-mix(in oklab, var(--primary) 10%, transparent) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(85% 75% at 50% 40%, black 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(85% 75% at 50% 40%, black 40%, transparent 100%)",
          }}
        />
        <FloatingMedicalBackdrop tone="gold" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full bg-card border-2 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ borderColor: "var(--primary-soft)", color: "var(--primary)", boxShadow: "0 3px 0 var(--primary-soft)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              AquaQBank academy
            </span>
          </div>

          <div className="max-w-md">
            <h2
              className="font-display font-black text-foreground tracking-tight leading-[1.05] lowercase"
              style={{ fontSize: "clamp(2rem, 3.6vw, 3rem)" }}
            >
              {isLogin
                ? "welcome back to your study desk."
                : "built for the rigor of medical school."}
            </h2>
          <p className="mt-5 text-sm md:text-base text-foreground/70 leading-relaxed">
              {isLogin
                ? "your courses, lectures, and committee summaries are exactly where you left them."
                : "curated question banks, structured review, and lecture libraries — designed for students who want clarity, not noise."}
            </p>

            <ul className="mt-8 space-y-3 text-sm">
              <BulletRow>curated university courses</BulletRow>
              <BulletRow>structured video lectures</BulletRow>
              <BulletRow>committee red-flag summaries</BulletRow>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground tracking-wide">
            AquaQBank academy · your medical school, all in one place.
          </p>
        </div>
      </aside>
    </div>
  );
}

function BulletRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-1.5 grid place-items-center h-4 w-4 rounded-full text-white text-[10px] font-black shrink-0"
        style={{ background: "var(--primary)" }}
      >
        ✓
      </span>
      <span className="text-foreground/85 font-medium">{children}</span>
    </li>
  );
}

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-bold text-foreground mb-1.5 lowercase tracking-wide">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border-2 border-border bg-card px-4 h-12 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-soft)]";

export const buttonClass =
  "btn-chunky btn-chunky--lg w-full";

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-2xl border-2 border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium"
    >
      {message}
    </div>
  );
}
