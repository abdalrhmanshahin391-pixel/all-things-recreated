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
        className={`grid place-items-center ${className}`}
        style={{ background: "linear-gradient(135deg, #dcfce7, #e0f2fe)" }}
      >
        <Stethoscope className="text-[color:var(--primary)]" size={48} strokeWidth={2.2} />
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
