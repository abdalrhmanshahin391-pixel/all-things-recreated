import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";
import { resolveCourseImageUrl } from "@/lib/course-image";

/**
 * CourseImage — signs the (private) course-image bucket URL on mount and
 * falls back to a medical-themed placeholder if missing/expired.
 */
export function CourseImage({
  value,
  alt,
  className = "",
}: {
  value: string | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    resolveCourseImageUrl(value).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!url || failed) {
    return (
      <div
        className={`on-dark-panel grid place-items-center ${className}`}
        style={{ background: "linear-gradient(150deg, var(--navy-deep), var(--navy))" }}
      >
        <Stethoscope className="text-[color:var(--gold)]" size={44} strokeWidth={1.6} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
