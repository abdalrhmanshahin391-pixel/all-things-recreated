import { Link } from "@tanstack/react-router";
import { Instagram } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useNavItems, canSee, navLabel, targetHref, isExternal } from "@/lib/site-structure";
import { MadeByLaith } from "@/components/MadeByLaith";

type Col = { heading: string; links: { label: string; to: string }[] };

/**
 * Site-wide footer: a multi-column directory (Khan-Academy style) with a
 * brand/mission block. Admin-controlled links from the "Footer links"
 * placement slot into the "Site" column.
 */
export function SiteFooter() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const { user, isAdmin } = useAuth();
  const settings = useSiteSettings();
  const items = useNavItems("footer").filter((i) => canSee(i, { signedIn: !!user, isAdmin }));

  const columns: Col[] = [
    {
      heading: ar ? "الدراسة" : "Study",
      links: [
        { label: ar ? "الجامعات" : "Universities", to: "/universities" },
        { label: ar ? "الدورات" : "Courses", to: "/courses" },
        { label: ar ? "أدلة الدراسة" : "Study Guides", to: "/guides" },
      ],
    },
    {
      heading: ar ? "الأدوات" : "Tools",
      links: [
        { label: ar ? "ملاحظاتي" : "My Notes", to: "/notes" },
        { label: ar ? "اللجنة" : "Committee", to: "/committee" },
        { label: "My Mentor", to: "/mentor" },
      ],
    },
    {
      heading: ar ? "الموقع" : "Site",
      links: [
        { label: ar ? "من نحن" : "About us", to: "/about" },
        { label: ar ? "الدعم" : "Support", to: "/support" },
        { label: ar ? "حسابي" : "My profile", to: "/profile" },
      ],
    },
    {
      heading: ar ? "قانوني" : "Legal",
      links: [
        { label: ar ? "شروط الاستخدام" : "Terms of Service", to: "/terms" },
        { label: ar ? "سياسة الخصوصية" : "Privacy Policy", to: "/privacy" },
        { label: ar ? "سياسة الاسترداد" : "Refund Policy", to: "/refund-policy" },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t-2 border-border bg-card text-card-foreground">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          {/* Brand + mission */}
          <div className="min-w-0">
            <div className="font-display text-2xl font-black lowercase">{settings.site_name}</div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {settings.tagline}
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {ar
                ? "مهمّتنا: أن يتدرّب كل طالب طب بالأسئلة والحالات، لا بالحفظ وحده."
                : "Our mission: let every medical student learn by answering questions and meeting real cases — not by memorising slides."}
            </p>
            <div className="mt-5 space-y-1.5 text-sm">
              <div>
                <a
                  href="mailto:aquaqbank@gmail.com"
                  className="font-bold text-foreground transition-colors hover:text-primary"
                >
                  aquaqbank@gmail.com
                </a>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Instagram"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Instagram size={17} />
              </a>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <nav key={col.heading} className="min-w-0">
                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-foreground">
                  {col.heading}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.to + l.label}>
                      <Link
                        to={l.to as any}
                        className="text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                  {col.heading === (ar ? "الموقع" : "Site") &&
                    items
                      .filter(
                        (item) =>
                          !col.links.some(
                            (l) => l.to === targetHref(item.target_kind, item.target_value),
                          ),
                      )
                      .map((item) => {
                      const href = targetHref(item.target_kind, item.target_value);
                      const label = navLabel(item, lang);
                      if (item.coming_soon) {
                        return (
                          <li key={item.id}>
                            <span
                              aria-disabled="true"
                              className="cursor-not-allowed select-none text-sm text-muted-foreground opacity-60"
                            >
                              {label}
                              <span className="ms-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                {ar ? "قريباً" : "Coming soon"}
                              </span>
                            </span>
                          </li>
                        );
                      }
                      return (
                        <li key={item.id}>
                          {isExternal(item.target_kind, item.target_value) ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-sm text-muted-foreground transition-colors hover:text-primary"
                            >
                              {label}
                            </a>
                          ) : (
                            <Link
                              to={href as any}
                              className="text-sm text-muted-foreground transition-colors hover:text-primary"
                            >
                              {label}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {settings.site_name}
          </span>
          {settings.show_signature && <MadeByLaith />}
        </div>
      </div>
    </footer>
  );
}
