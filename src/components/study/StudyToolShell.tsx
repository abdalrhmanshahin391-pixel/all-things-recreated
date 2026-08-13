import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function StudyToolShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <Link
          to="/study-hub"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Study Hub
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>

        {loading ? (
          <div className="mt-10 h-32 animate-pulse rounded-2xl border-2 border-border bg-card" />
        ) : user ? (
          <div className="mt-8">{children}</div>
        ) : (
          <div className="mt-10 rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm font-bold text-foreground">Sign in to use this tool</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your plan, exams and focus sessions are private to your account.
            </p>
            <Link
              to="/login"
              className="mt-5 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground"
            >
              Sign in
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
