import { Link } from "@tanstack/react-router";
import { Download, PlayCircle } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
import { targetHref, isExternal, type SiteBlock } from "@/lib/site-structure";
import { MediaImage, useSignedMedia } from "./MediaImage";

function pick(c: Record<string, any>, base: string, lang: string): string {
  return (lang === "ar" ? c[`${base}_ar`] : c[`${base}_en`]) || c[`${base}_en`] || c[`${base}_ar`] || "";
}

export function TargetLink({
  kind,
  value,
  className,
  children,
}: {
  kind: string;
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const href = targetHref(kind, value);
  if (isExternal(kind, value)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href as any} className={className}>
      {children}
    </Link>
  );
}

function FileBlock({ block, lang }: { block: SiteBlock; lang: string }) {
  const url = useSignedMedia(block.content.path);
  const title = pick(block.content, "title", lang) || "Download";
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3 hover:-translate-y-0.5 transition-transform"
      style={{ boxShadow: "0 3px 0 var(--border)" }}
    >
      <Download size={18} className="text-primary shrink-0" />
      <span className="text-sm font-bold text-foreground">{title}</span>
    </a>
  );
}

function VideoBlock({ block, lang }: { block: SiteBlock; lang: string }) {
  const uploaded = useSignedMedia(block.content.path);
  const url: string = block.content.url ?? "";
  const title = pick(block.content, "title", lang);
  const yt = url.match(/(?:youtu\.be\/|v=)([\w-]{6,})/)?.[1];
  const vimeo = url.match(/vimeo\.com\/(\d+)/)?.[1];
  const embed = yt
    ? `https://www.youtube.com/embed/${yt}`
    : vimeo
      ? `https://player.vimeo.com/video/${vimeo}`
      : null;
  return (
    <figure className="space-y-2">
      {embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl border-2 border-border">
          <iframe src={embed} title={title || "Video"} allowFullScreen className="w-full h-full" />
        </div>
      ) : uploaded ? (
        <video src={uploaded} controls className="w-full rounded-xl border-2 border-border" />
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PlayCircle size={16} /> Video
        </div>
      )}
      {title && <figcaption className="text-sm text-muted-foreground">{title}</figcaption>}
    </figure>
  );
}

export function BlockRenderer({ block }: { block: SiteBlock }) {
  const { lang } = useLang();
  const c = block.content ?? {};
  if (block.visible === false) return null;

  switch (block.kind) {
    case "heading":
      return (
        <h3 className="font-display font-black text-2xl md:text-3xl text-foreground">
          {pick(c, "text", lang)}
        </h3>
      );
    case "text":
      return (
        <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">
          {pick(c, "text", lang)}
        </p>
      );
    case "image":
      return (
        <MediaImage
          path={c.path}
          alt={pick(c, "alt", lang) || "Image"}
          className="w-full rounded-xl border-2 border-border"
        />
      );
    case "button":
      return (
        <div>
          <TargetLink
            kind={c.target_kind ?? "route"}
            value={c.target_value ?? "/"}
            className={`btn-chunky ${c.style === "secondary" ? "btn-chunky--secondary" : ""}`}
          >
            {pick(c, "label", lang) || "Button"}
          </TargetLink>
        </div>
      );
    case "file":
      return <FileBlock block={block} lang={lang} />;
    case "video":
      return <VideoBlock block={block} lang={lang} />;
    case "divider":
      return <hr className="border-border" />;
    case "cards":
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(c.items ?? []).map((item: any, i: number) => (
            <TargetLink
              key={i}
              kind={item.target_kind ?? "route"}
              value={item.target_value ?? "/"}
              className="block rounded-2xl border-2 border-border bg-card overflow-hidden hover:-translate-y-1 transition-transform"
            >
              {item.path && (
                <MediaImage path={item.path} alt={item.title_en ?? ""} className="w-full h-36 object-cover" />
              )}
              <div className="p-4">
                <div className="font-black text-foreground">{pick(item, "title", lang)}</div>
                {pick(item, "subtitle", lang) && (
                  <div className="mt-1 text-sm text-muted-foreground">{pick(item, "subtitle", lang)}</div>
                )}
              </div>
            </TargetLink>
          ))}
        </div>
      );
    default:
      return null;
  }
}