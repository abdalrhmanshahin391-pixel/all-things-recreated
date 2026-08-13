import { Link } from "@tanstack/react-router";
import { LogIn, Lock, UserPlus } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

/** Shown instead of empty lists when a visitor opens the committee signed out. */
export function SignedOutNotice() {
  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-5 pt-28 pb-24">
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Lock size={24} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Log in to see the content
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            لجنة الطب والجراحة library is for members. Sign in with your account to browse
            years, subjects, files and videos.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              <LogIn size={16} /> Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground hover:bg-muted"
            >
              <UserPlus size={16} /> Create account
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}