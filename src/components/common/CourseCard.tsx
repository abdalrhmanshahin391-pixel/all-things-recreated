import { capitalizeFirst } from "@/lib/text";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Clock, ListChecks, Lock, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchCoursePage } from "@/lib/course-page";
import { useAuth } from "@/hooks/useAuth";
import { CourseImage } from "@/components/common/CourseImage";
import { CourseBadge, badgeIsLive } from "@/components/common/CourseBadge";
import { useCourseOptions, isAllYearsCourse, isZeroCourse } from "@/lib/course-options";

type CourseLike = {
  id: string;
  title: string;
  year: number | null;
  semester?: number | null;
  category?: string | null;
  image_url: string | null;
  price?: number | null;
  currency?: string | null;
  badge?: string | null;
  badge_color?: string | null;
  badge_expires_at?: string | null;
  compare_at_price?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
  /** Shown to students as "Coming soon" and not openable; admins can still open it. */
  coming_soon?: boolean | null;
};

const SYMBOL: Record<string, string> = { USD: "USD ", EUR: "€", GBP: "£", JOD: "JD ", SAR: "SAR " };

function fmtPrice(price: number | null | undefined, currency: string | null | undefined) {
  if (!price || price <= 0) return "FREE";
  const cur = currency ?? "USD";
  const sym = SYMBOL[cur] ?? `${cur} `;
  return `${sym}${Number(price).toFixed(0)}`;
}

export function CourseCard({
  course,
  counts,
  actionLabel,
  unlocked = false,
  showPrice = true,
}: {
  course: CourseLike;
  counts?: { subjects: number; questions: number };
  actionLabel?: string;
  unlocked?: boolean;
  showPrice?: boolean;
}) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const soon = !!course.coming_soon;
  const closedForMe = soon && !isAdmin;
  const isPaid = !!course.price && course.price > 0;
  const category = (course.category ?? "MAJOR").toString().toUpperCase();
  const options = useCourseOptions();
  const year = course.year ?? 0;
  const isAllYears = isAllYearsCourse(course.year, options);
  const isZero = isZeroCourse(course.year, options);
  const owned = unlocked || !isPaid;
  const priceText = fmtPrice(course.price, course.currency);
  const label = actionLabel ?? (owned ? "Study now" : `Unlock — ${priceText}`);

  // "Was 20 USD" so a discount (or a free window) never reads as the normal price.
  const offerLive =
    !!course.discount_active &&
    !!course.compare_at_price &&
    Number(course.compare_at_price) > Number(course.price ?? 0) &&
    (!course.discount_ends_at || new Date(course.discount_ends_at).getTime() > Date.now());
  const wasText = offerLive ? fmtPrice(Number(course.compare_at_price), course.currency) : null;

  // Free / owned reads green; paid reads gold so money courses stand apart.
  // Navy for free / owned, gold for paid. Flat, no 3D ledge.
  const pill = isPaid && !unlocked
    ? { background: "var(--gold)", color: "var(--gold-foreground)" }
    : { background: "var(--primary)", color: "var(--primary-foreground)" };
  const cta = owned
    ? { background: "var(--primary)", color: "var(--primary-foreground)" }
    : { background: "var(--gold)", color: "var(--gold-foreground)" };

  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: course.id }}
      onClick={(e) => {
        if (closedForMe) e.preventDefault();
      }}
      // start loading the course page's data as soon as the card is hovered or touched
      onPointerEnter={() => !closedForMe && prefetchCoursePage(queryClient, course.id)}
      onTouchStart={() => !closedForMe && prefetchCoursePage(queryClient, course.id)}
      aria-disabled={closedForMe || undefined}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,27,61,0.05)] transition-all duration-300 ${
        closedForMe ? "cursor-not-allowed" : "hover:-translate-y-1 hover:shadow-[0_26px_50px_-28px_rgba(15,27,61,0.5)]"
      }`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {soon && (
          <div
            className={`absolute inset-0 z-10 grid place-items-center ${closedForMe ? "bg-[color:var(--navy-deep)]/60" : "pointer-events-none"}`}
          >
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest shadow-lg ${
                closedForMe ? "bg-[color:var(--gold)] text-[color:var(--gold-foreground)]" : "absolute bottom-2 left-2 bg-[color:var(--gold)] text-[color:var(--gold-foreground)] text-[10px] px-3 py-1"
              }`}
            >
              <Clock size={closedForMe ? 14 : 11} strokeWidth={3} /> {closedForMe ? "Coming soon" : "Coming soon · hidden from students"}
            </span>
          </div>
        )}
        <CourseImage
          value={course.image_url}
          alt={course.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {(() => {
          // Manual badge wins; otherwise a live discount auto-gets a HOT/LIMITED OFFER tag.
          const manualBadge = !!course.badge && badgeIsLive(course.badge_expires_at);
          if (manualBadge) {
            return (
              <CourseBadge
                label={course.badge}
                color={course.badge_color}
                expiresAt={course.badge_expires_at}
              />
            );
          }
          if (offerLive) {
            const isLimited = !!course.discount_ends_at;
            return (
              <CourseBadge
                label={isLimited ? "LIMITED OFFER" : "HOT OFFER"}
                color={isLimited ? "#8b5cf6" : "#f43f5e"}
              />
            );
          }
          return null;
        })()}
        {showPrice && (
          <span
            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm"
            style={pill}
          >
            {unlocked ? (
              <>
                <Sparkles size={10} strokeWidth={3} /> UNLOCKED
              </>
            ) : (
              <>
                {isPaid && <Lock size={10} strokeWidth={3} />}
                {wasText && <s className="opacity-70 font-bold">{wasText}</s>}
                {priceText}
              </>
            )}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {isAllYears ? "All years" : isZero ? "Zero course" : `Year ${year || "—"}`}
          {!isAllYears && !isZero && (course.semester === 1 || course.semester === 2) ? ` · Sem ${course.semester}` : ""}
          {category ? ` · ${category}` : ""}
        </p>

        <h3
          className="mt-1.5 line-clamp-3 min-h-[2.5em] text-base font-semibold leading-tight text-foreground [overflow-wrap:anywhere] sm:line-clamp-2 sm:text-xl"
          style={{ fontFamily: "var(--font-heading)", hyphens: "auto" }}
          title={course.title}
        >
          {capitalizeFirst(course.title)}
        </h3>

        {showPrice && !unlocked && wasText && (
          <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--gold-ink)]">
            <s className="me-1.5 text-muted-foreground">{wasText}</s>
            {priceText === "FREE" ? "free right now" : `now ${priceText}`}
            {course.discount_ends_at && (
              <span className="ms-1 font-medium normal-case text-muted-foreground">
                · ends {new Date(course.discount_ends_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-2xl font-semibold leading-none tabular-nums text-foreground" style={{ fontFamily: "var(--font-heading)" }}>
              {(counts?.questions ?? 0).toLocaleString()}
            </span>
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              {counts?.questions === 1 ? "question" : "questions"}
            </span>
          </p>
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5"
            style={closedForMe ? { background: "var(--muted)", color: "var(--muted-foreground)" } : cta}
            title={closedForMe ? "Coming soon" : label}
          >
            <span className="sr-only">{closedForMe ? "Coming soon" : label}</span>
            {closedForMe ? <Clock size={16} strokeWidth={2.2} /> : <ArrowRight size={17} strokeWidth={2.4} />}
          </span>
        </div>
      </div>    </Link>
  );
}
