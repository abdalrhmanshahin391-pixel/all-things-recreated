import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { publicUniversityImageUrl, resolveUniversityImageUrl } from "@/lib/university-image";

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
  // the fixed public URL first (kept by the browser for a year); signed URL only if it fails
  const [coverUrl, setCoverUrl] = useState<string | null>(() => publicUniversityImageUrl(cover));
  const [logoUrl, setLogoUrl] = useState<string | null>(() => publicUniversityImageUrl(logo));
  const [signed, setSigned] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCoverUrl(publicUniversityImageUrl(cover));
    setLogoUrl(publicUniversityImageUrl(logo));
    setSigned(false);
    setFailed(false);
  }, [cover, logo]);

  async function onError() {
    if (signed) {
      setFailed(true);
      return;
    }
    setSigned(true);
    const [c, l] = await Promise.all([resolveUniversityImageUrl(cover), resolveUniversityImageUrl(logo)]);
    setCoverUrl(c);
    setLogoUrl(l);
    if (!c && !l) setFailed(true);
  }

  const fillUrl = coverUrl ?? logoUrl;

  if (fillUrl && !failed) {
    return (
      <img
        src={fillUrl}
        alt={alt}
        className={`block h-full w-full object-cover ${className}`}
        loading="lazy"
        onError={onError}
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
