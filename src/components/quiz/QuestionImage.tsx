import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "question-images";
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Signs a storage path once. Questions on a picture test share pictures, and many cards ask for the same one
 * at the same moment, so concurrent requests for a path share a single call.
 */
function signPath(path: string): Promise<string | null> {
  const cached = cache.get(path);
  if (cached) return Promise.resolve(cached);
  let pending = inflight.get(path);
  if (!pending) {
    pending = supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) return null;
        cache.set(path, data.signedUrl);
        return data.signedUrl;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, pending);
  }
  return pending;
}

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

    void signPath(path).then((signed) => {
      if (cancelled) return;
      if (!signed) { setFailed(true); return; }
      setUrl(signed);
    });

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
