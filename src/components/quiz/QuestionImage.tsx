import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "question-images";
const cache = new Map<string, string>();

/** Renders a question image.
 *
 * Supports two modes:
 * 1. External URL (http/https) — AI-generated diagrams from Pollinations / DALL-E.
 *    These are rendered directly without any Supabase signing.
 * 2. Supabase storage path — uploaded question images stored in the `question-images` bucket.
 *    A signed URL is generated on demand.
 */
export function QuestionImage({ path, className = "" }: { path: string; className?: string }) {
  const isExternal = path.startsWith("http://") || path.startsWith("https://");

  // For external URLs we resolve immediately; for storage paths we sign on mount.
  const [url, setUrl] = useState<string | null>(isExternal ? path : (cache.get(path) ?? null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // External URLs need no signing — already resolved above.
    if (isExternal) return;

    let cancelled = false;
    const cached = cache.get(path);
    if (cached) { setUrl(cached); return; }

    (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      if (cancelled) return;
      if (error || !data?.signedUrl) { setFailed(true); return; }
      cache.set(path, data.signedUrl);
      setUrl(data.signedUrl);
    })();

    return () => { cancelled = true; };
  }, [path, isExternal]);

  if (failed) {
    return <div className="text-sm text-rose-600">This question image could not be loaded.</div>;
  }
  if (!url) {
    return <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />;
  }
  return (
    <img
      src={url}
      alt="Medical diagram — refer to this image to answer the question"
      loading="lazy"
      decoding="async"
      className={`w-full rounded-xl border border-border bg-card ${className}`}
    />
  );
}
