import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Settings,
  LogOut,
  ChevronDown,
  BookOpen,
  Sparkles,
  Menu,
  X,
  ShieldCheck,
  LayoutGrid,
  MoonStar,
  Users,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EventEntryButtons } from "@/components/events/EventButtons";
import { GoldenBadge } from "@/components/GoldenBadge";
import { CommitteeBadge } from "@/components/CommitteeBadge";
import { useLang } from "@/components/LanguageProvider";
import { RaziWordmark } from "@/components/brand/RaziWordmark";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { resolveHeaderSkin } from "@/components/header/header-designs";
import { InstallAppButton } from "@/components/InstallAppButton";
import {
  useNavItems,
  canSee,
  navLabel,
  targetHref,
  isExternal,
  type NavItem,
} from "@/lib/site-structure";

/**
 * SiteHeader — institutional white top bar.
 * Variant prop is kept for backwards compatibility but no longer changes
 * appearance: the bar is the same on every page (white, 1px border, navy ink),
 * for a calmer, more authoritative feel.
 */
export function SiteHeader(_props: { variant?: "dark" | "light" } = {}) {
  void _props;
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation();
  const { user, profile, isAdmin, isRealAdmin, isGolden, isCommittee, isCommitteeHead, adminMode, setAdminMode, loading: authLoading } = useAuth();
  const { lang, toggle: toggleLang } = useLang();
  const settings = useSiteSettings();
  const skin = resolveHeaderSkin(settings.header_style);

  
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-account-menu]")) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleLogout() {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  function toggleAdminMode() {
    const next = !adminMode;
    setAdminMode(next);
    if (!next && path.startsWith("/admin")) {
      setOpen(false);
      navigate({ to: "/" });
    }
  }

  const displayName = profile?.username ?? user?.email ?? "";
  const initial = (profile?.full_name || profile?.username || user?.email || "?")
    .charAt(0)
    .toUpperCase();

  const allNav = useNavItems("header");
  const navLinks = allNav.filter((l) => canSee(l, { signedIn: !!user, isAdmin }));

  const isActive = (to: string) => {
    if (to === "/universities") return path === "/universities" || path.startsWith("/u/");
    return path === to || path.startsWith(to + "/");
  };

  function NavEntry({ item, mobile }: { item: NavItem; mobile?: boolean }) {
    const href = targetHref(item.target_kind, item.target_value);
    const label = navLabel(item, lang);
    const active = isActive(href);
    const pill = item.style === "pill";
    const cls = mobile
      ? `${skin.navMobile} w-fit ${active ? "text-foreground" : "text-muted-foreground"}`
      : `inline-flex items-center w-fit ${
          pill ? (active ? skin.pillActive : skin.pillIdle) : active ? skin.navActive : skin.navIdle
        }`;
    const style = undefined;
    const close = () => (mobile ? setMobileOpen(false) : undefined);
    const soonBadge = <span className={skin.soonBadge}>{t("nav.comingSoon")}</span>;

    if (item.coming_soon) {
      return (
        <span
          className={`${cls} opacity-60 cursor-not-allowed select-none`}
          style={style}
          aria-disabled="true"
          title={t("nav.comingSoon")}
        >
          {label}
          {soonBadge}
        </span>
      );
    }
    if (isExternal(item.target_kind, item.target_value)) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style} onClick={close}>
          {label}
        </a>
      );
    }
    return (
      <Link to={href as any} className={cls} style={style} onClick={close}>
        {label}
      </Link>
    );
  }


  function AccountBlock({ compact }: { compact?: boolean }) {
    if (authLoading) {
      // Session is still being restored. Rendering the sign-in buttons here is
      // what caused the "signed out for a split second" flash, so show a
      // neutral placeholder instead.
      return <div aria-hidden="true" className="h-9 w-9 rounded-full bg-muted animate-pulse" />;
    }
    if (!user) {
      return (
        <div className={`${compact ? "flex" : "hidden lg:flex"} items-center gap-2 shrink-0`}>
          <Link to="/login" className={skin.loginBtn}>
            {t("cms.header.login")}
          </Link>
          <Link to="/register" className={skin.registerBtn}>
            {t("cms.header.register")}
          </Link>
        </div>
      );
    }
    return (
      <div className="relative" data-account-menu>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`${skin.avatarBtn} shrink-0 ${compact ? "" : "max-w-[9.5rem] overflow-hidden"}`}
          aria-label="Account menu"
          aria-expanded={open}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center text-sm font-black ${skin.avatarShape}`}
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {initial}
          </span>
          {isGolden && <GoldenBadge />}
          {isCommittee && <CommitteeBadge head={isCommitteeHead} />}
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
        {open && (
          <div
            className={`absolute start-0 lg:start-auto lg:end-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-card text-popover-foreground flex flex-col max-h-[calc(100vh-8rem)] overflow-hidden z-50 ${skin.menuPanel}`}
          >
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-sm">
                <span className="truncate">{profile?.full_name || displayName}</span>
                {isGolden && <GoldenBadge />}
                {isCommittee && <CommitteeBadge head={isCommitteeHead} />}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAdmin
                  ? t("cms.header.roleAdmin")
                  : isGolden
                    ? "Golden member"
                    : isCommitteeHead
                      ? "رئيس لجنة الطب والجراحة"
                      : isCommittee
                        ? "لجنة الطب والجراحة"
                        : t("cms.header.roleUser")}
              </p>
            </div>
            <div className="py-1 overflow-y-auto overscroll-contain flex-1 min-h-0">
              {isRealAdmin && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={adminMode}
                  onClick={toggleAdminMode}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <span className="inline-flex items-center gap-3">
                    <ShieldCheck size={16} className={adminMode ? "text-emerald-600" : "text-muted-foreground"} />
                    Admin mode
                  </span>
                  <span
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      adminMode ? "bg-emerald-500" : "bg-muted-foreground/40"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-card shadow-sm transition-all ${
                        adminMode ? "left-6" : "left-1"
                      }`}
                    />
                  </span>
                </button>
              )}
              <MenuLink to="/profile" icon={<Settings size={16} />} onClick={() => setOpen(false)}>
                {t("cms.header.profileSettings")}
              </MenuLink>
              {isAdmin && (
                <MenuLink to="/summaries" icon={<Sparkles size={16} />} onClick={() => setOpen(false)}>
                  {t("cms.header.summaries")}
                </MenuLink>
              )}
              <MenuLink to="/notes" icon={<BookOpen size={16} />} onClick={() => setOpen(false)}>
                {t("cms.header.myNotes")}
              </MenuLink>
              <InstallAppButton />
              {isAdmin && (
                <>
                  <div className="my-1 mx-3 border-t border-border" />
                  <MenuLink to="/summaries" icon={<Sparkles size={16} />} onClick={() => setOpen(false)}>
                    {t("cms.header.summaries")}
                  </MenuLink>
                </>
              )}
              {(isAdmin || isCommitteeHead) && (
                <>
                  <div className="my-1 mx-3 border-t border-border" />
                  <MenuLink to="/admin" icon={<LayoutGrid size={16} />} onClick={() => setOpen(false)}>
                    Admin
                  </MenuLink>
                  {isCommitteeHead && (
                    <>
                      <MenuLink to="/committee/manage-team" icon={<Users size={16} />} onClick={() => setOpen(false)}>
                        Committee team
                      </MenuLink>
                      <MenuLink to="/admin/committee-log" icon={<History size={16} />} onClick={() => setOpen(false)}>
                        Committee log
                      </MenuLink>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="border-t border-border py-1 shrink-0">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut size={16} />
                {t("cms.header.logout")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <header className={`left-0 right-0 ${skin.header}`}>
      <div
        className={`mx-auto max-w-7xl px-4 md:px-8 flex items-center ${skin.inner} ${
          skin.rail ? "" : "justify-between"
        }`}
      >
        {/* Brand */}
        <Link to="/" className={`${skin.brandWrap} min-w-0 max-w-[calc(100%-5rem)] overflow-hidden sm:max-w-none`}>
          <span className="sm:hidden">
            <RaziWordmark size={Math.max(20, Math.round(skin.brandSize * 0.72))} />
          </span>
          <span className="hidden sm:inline">
            <RaziWordmark size={skin.brandSize} />
          </span>
        </Link>

        {/* Center nav */}
        <nav className={skin.navWrap}>
          <EventEntryButtons place="header" />
          {navLinks.map((l) => (
            <NavEntry key={l.id} item={l} />
          ))}
        </nav>

        {/* Right cluster */}
        <div
          className={`flex min-w-0 shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2 md:gap-3 ${
            skin.rail ? "lg:ps-6 lg:border-s lg:border-border" : ""
          }`}
        >
          {user && (
            <Link
              to="/mentor"
              title="My Mentor · مرشدي"
              className="hidden lg:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              <MoonStar size={16} className="text-primary" />
              <span className="hidden xl:inline">My Mentor</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleLang}
            aria-label="Switch language"
            className={`${skin.iconBtn} shrink-0`}
          >
            {lang === "ar" ? "EN" : "ع"}
          </button>

          {/* Desktop: account lives in the top bar */}
          <div className="hidden lg:flex items-center gap-3">
            <AccountBlock />
          </div>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden order-last inline-grid shrink-0 place-items-center h-9 w-9 rounded-md border border-border text-foreground hover:bg-muted"
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Phone / iPad: account row under the bar, full-width so badges show fully */}
      <div className="lg:hidden border-t border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-8 flex min-h-12 flex-wrap items-center justify-between gap-2 py-1.5">
          <AccountBlock compact />
          {user && (
            <Link
              to="/mentor"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              <MoonStar size={16} className="text-primary" />
              My Mentor
            </Link>
          )}
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className={skin.mobileSheet}>

          <nav className="flex flex-col px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-2">
              <EventEntryButtons place="header" />
            </div>
            {navLinks.map((l) => (
              <NavEntry key={l.id} item={l} mobile />
            ))}
            {user && (
              <Link
                to="/mentor"
                onClick={() => setMobileOpen(false)}
                className={`${skin.navMobile} w-fit inline-flex items-center gap-2 text-foreground`}
              >
                <MoonStar size={16} className="text-primary" />
                My Mentor · مرشدي
              </Link>
            )}
            {!user && !authLoading && (
              <div className="pt-3 mt-2 border-t border-border flex gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center text-sm font-medium border border-border rounded-md py-2"
                >
                  {t("cms.header.login")}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center text-sm font-medium bg-primary text-primary-foreground rounded-md py-2"
                >
                  {t("cms.header.register")}
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function MenuLink({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </Link>
  );
}
