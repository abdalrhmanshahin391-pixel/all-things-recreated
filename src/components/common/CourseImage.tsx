import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";
import { publicCourseImageUrl, resolveCourseImageUrl } from "@/lib/course-image";

/**
 * CourseImage — uses the fixed public URL of the picture (kept by the browser for a year) and
 * falls back to a signed URL, then to a medical-themed placeholder, if it cannot be loaded.
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
  const [url, setUrl] = useState<string | null>(() => publicCourseImageUrl(value));
  const [triedSigned, setTriedSigned] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(publicCourseImageUrl(value));
    setTriedSigned(false);
    setFailed(false);
  }, [value]);

  function onError() {
    if (triedSigned) {
      setFailed(true);
      return;
    }
    setTriedSigned(true);
    resolveCourseImageUrl(value).then((u) => (u ? setUrl(u) : setFailed(true)));
  }

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

  return <img src={url} alt={alt} className={className} loading="lazy" onError={onError} />;
}
