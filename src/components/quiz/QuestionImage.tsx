import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "question-images";
const cache = new Map<string, string>();

/** Renders a question that was imported as a picture (equations / diagrams).
 *  The image IS the question stem and its printed answer choices. */
export function QuestionImage({ path, className = "" }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(cache.get(path) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
  }, [path]);

  if (failed) {
    return <div className="text-sm text-rose-600">This question image could not be loaded.</div>;
  }
  if (!url) {
    return <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />;
  }
  return (
    <img
      src={url}
      alt="Exam question"
      loading="lazy"
      className={`w-full rounded-xl border border-border bg-card ${className}`}
    />
  );
}
