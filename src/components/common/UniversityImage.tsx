import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { resolveUniversityImageUrl } from "@/lib/university-image";

/**
 * UniversityImage — fills the parent container completely.
 * Cover image (if any) fills via object-cover. Otherwise we render a
 * medical-gradient panel with the logo (or a fallback icon) centered.
 */
export function UniversityImage({
  cover,
  logo,
  alt,
  className = "",
}: {
  cover: string | null;
  logo: string | null;
  alt: string;
  className?: string;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      const [c, l] = await Promise.all([
        resolveUniversityImageUrl(cover),
        resolveUniversityImageUrl(logo),
      ]);
      if (cancelled) return;
      setCoverUrl(c);
      setLogoUrl(l);
    })();
    return () => {
      cancelled = true;
    };
  }, [cover, logo]);

  const fillUrl = coverUrl ?? logoUrl;

  if (fillUrl && !failed) {
    return (
      <img
        src={fillUrl}
        alt={alt}
        className={`block h-full w-full object-cover ${className}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center h-full w-full ${className}`}
      style={{ background: "linear-gradient(135deg, #dcfce7, #e0f2fe)" }}
    >
      <GraduationCap className="text-[color:var(--primary)]" size={72} strokeWidth={2.2} />
    </div>
  );
}
