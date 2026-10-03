import { capitalizeFirst } from "@/lib/text";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ListChecks, Lock, Sparkles } from "lucide-react";
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
  const pill = unlocked
    ? { background: "linear-gradient(135deg, #06b6d4, #0891b2)", boxShadow: "0 2px 0 #0e7490" }
    : isPaid
      ? { background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 2px 0 #b45309" }
      : { background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 2px 0 #15803d" };
  const cta = owned
    ? { background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 3px 0 #15803d" }
    : { background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 3px 0 #b45309" };

  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: course.id }}
      className="group relative flex flex-col bg-white rounded-2xl overflow-hidden border hover:-translate-y-1 hover:shadow-xl transition-all duration-200"
      style={{
        borderColor: isPaid && !unlocked ? "#fcd34d" : "#e5e5e5",
        boxShadow: isPaid && !unlocked ? "0 6px 0 #fcd34d" : "0 6px 0 #d4d4d4",
      }}
    >
      <div className="aspect-[4/3] w-full relative bg-neutral-100 overflow-hidden">
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
            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white"
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

      <div className="flex-1 flex flex-col items-center text-center px-4 md:px-5 py-4 md:py-5">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span
            className={`inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isAllYears
                ? "bg-amber-50 text-amber-800 border-amber-300 shadow-sm"
                : isZero
                  ? "bg-purple-50 text-purple-800 border-purple-300 shadow-sm"
                  : "bg-neutral-100 text-neutral-700 border-neutral-200"
            }`}
          >
            {isAllYears ? "ALL YEARS" : isZero ? "ZERO COURSE" : `YEAR ${year || "—"}`}
          </span>
          {!isAllYears && !isZero && (course.semester === 1 || course.semester === 2) && (
            <span
              className={`inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                course.semester === 1
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-blue-50 text-blue-800 border-blue-300"
              }`}
            >
              {course.semester === 1 ? "SEM 1" : "SEM 2"}
            </span>
          )}
          <span
            className="inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white"
            style={{ background: "linear-gradient(135deg, #06b6d4, #0891b2)" }}
          >
            {category}
          </span>
        </div>

        <h3 className="font-display font-black text-lg md:text-xl text-foreground leading-tight line-clamp-2 min-h-[2.4em]">
          {capitalizeFirst(course.title)}
        </h3>

        {showPrice && !unlocked && wasText && (
          <div className="mt-2 text-[11px] font-black uppercase tracking-wider text-amber-600">
            <s className="text-neutral-400 me-1.5">{wasText}</s>
            {priceText === "FREE" ? "free right now" : `now ${priceText}`}
            {course.discount_ends_at && (
              <span className="ms-1 normal-case font-bold text-neutral-500">
                · ends {new Date(course.discount_ends_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-3 text-[12px] font-bold text-neutral-600">
          <span className="inline-flex items-center gap-1">
            <BookOpen size={12} strokeWidth={2.8} />
            {counts?.subjects ?? 0} {counts?.subjects === 1 ? "subject" : "subjects"}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks size={12} strokeWidth={2.8} />
            {counts?.questions ?? 0} {counts?.questions === 1 ? "question" : "questions"}
          </span>
        </div>

        <span
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider text-white px-5 py-2.5 rounded-full"
          style={cta}
        >
          {label} <ArrowRight size={12} strokeWidth={3} />
        </span>
      </div>
    </Link>
  );
}
