import { Link } from "@tanstack/react-router";
import { useLang } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useNavItems, canSee, navLabel, targetHref, isExternal } from "@/lib/site-structure";
import { MadeByLaith } from "@/components/MadeByLaith";

/**
 * Site-wide footer. Links come from the "Footer links" placement in
 * Admin → Navigation & Buttons, so admins control exactly what shows here.
 */
export function SiteFooter() {
  const { lang } = useLang();
  const { user, isAdmin } = useAuth();
  const settings = useSiteSettings();
  const items = useNavItems("footer").filter((i) => canSee(i, { signedIn: !!user, isAdmin }));

  return (
    <footer className="mt-auto border-t-2 border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-[200px]">
            <div className="font-display text-lg font-black lowercase text-foreground">{settings.site_name}</div>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{settings.tagline}</p>
          </div>

          {items.length > 0 && (
            <nav className="flex flex-wrap gap-x-6 gap-y-2">
              {items.map((item) => {
                const href = targetHref(item.target_kind, item.target_value);
                const label = navLabel(item, lang);
                if (item.coming_soon) {
                  return (
                    <span
                      key={item.id}
                      aria-disabled="true"
                      className="text-sm font-bold text-muted-foreground opacity-60 cursor-not-allowed select-none"
                    >
                      {label}
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
                        {lang === "ar" ? "قريباً" : "Coming soon"}
                      </span>
                    </span>
                  );
                }
                return isExternal(item.target_kind, item.target_value) ? (

                  <a
                    key={item.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-bold text-muted-foreground hover:text-foreground"
                  >
                    {label}
                  </a>
                ) : (
                  <Link
                    key={item.id}
                    to={href as any}
                    className="text-sm font-bold text-muted-foreground hover:text-foreground"
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6">
          <Link to="/guides" className="text-xs font-bold text-muted-foreground hover:text-foreground">
            {lang === "ar" ? "أدلة الدراسة" : "Study Guides"}
          </Link>
          <Link to="/terms" className="text-xs font-bold text-muted-foreground hover:text-foreground">
            {lang === "ar" ? "شروط الاستخدام" : "Terms of Service"}
          </Link>

          <Link to="/privacy" className="text-xs font-bold text-muted-foreground hover:text-foreground">
            {lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
          </Link>
          <Link to="/refund-policy" className="text-xs font-bold text-muted-foreground hover:text-foreground">
            {lang === "ar" ? "سياسة الاسترداد" : "Refund Policy"}
          </Link>
        </nav>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {settings.site_name}
          </span>
          {settings.show_signature && <MadeByLaith />}
        </div>
      </div>
    </footer>
  );
}
