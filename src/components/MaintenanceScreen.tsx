import { useState } from "react";
import { Wrench, RefreshCw, Mail, ShieldCheck, Database, Clock } from "lucide-react";

// Shown to every visitor while IS_MAINTENANCE_MODE is on. It must not depend on the database or on any
// provider (the site settings, the language switch), because the database is what is offline.
export function MaintenanceScreen() {
  const [checking, setChecking] = useState(false);

  const handleRefresh = () => {
    setChecking(true);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary/20">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/aquaqbank-official-logo.png"
              alt="AquaQBank"
              className="h-9 w-9 rounded-xl object-contain shadow-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
            <span className="text-lg font-black tracking-tight">AquaQBank</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>Maintenance • صيانة</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full">
          <div className="rounded-3xl border border-border bg-card/80 backdrop-blur-xl shadow-2xl p-6 sm:p-10 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-500 via-cyan-400 to-amber-400" />

            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-6 shadow-inner">
              <Wrench className="w-8 h-8 animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Clock className="w-3.5 h-3.5" />
              <span>Temporary maintenance • صيانة مؤقتة</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mb-2">
              The site is under maintenance
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto mb-8">
              Our database is temporarily offline while we carry out maintenance. The site will be back as soon as it
              is resumed. Thank you for your patience.
            </p>

            <h2 className="text-2xl sm:text-3xl font-black text-primary mb-2" dir="rtl" lang="ar">
              الموقع تحت الصيانة
            </h2>
            <p
              className="text-sm sm:text-base text-foreground/90 leading-relaxed max-w-xl mx-auto mb-8"
              dir="rtl"
              lang="ar"
            >
              قاعدة البيانات متوقفة مؤقتاً بسبب أعمال الصيانة، وسيعود الموقع للعمل بمجرد استئنافها. شكراً لصبركم.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mb-8">
              <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-border/70 bg-muted/30">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status • الحالة</div>
                  <div className="text-sm font-bold text-foreground">Database offline • قاعدة البيانات متوقفة</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-border/70 bg-muted/30">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Your data • بياناتكم</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    Safe and kept • آمنة ومحفوظة
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={checking}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:bg-primary/90 active:scale-98 transition disabled:opacity-70 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                <span>{checking ? "Checking… • جارٍ التحقق" : "Check again • أعد المحاولة"}</span>
              </button>

              <a
                href="mailto:aquaqbank@gmail.com"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-border bg-card hover:bg-muted font-semibold text-sm text-foreground transition cursor-pointer"
              >
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>Contact support • الدعم الفني</span>
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AquaQBank Academy © 2026</span>
          <span className="text-muted-foreground/80">aquaqbank@gmail.com</span>
        </div>
      </footer>
    </div>
  );
}
