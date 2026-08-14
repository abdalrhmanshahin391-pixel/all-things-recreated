import { parseTags, tagLabel, tagStyle } from "@/lib/university-tags";

/** Row of small decorative tag chips for a university. */
export function UniversityTags({
  tags,
  lang = "en",
  className = "",
  size = "sm",
}: {
  tags: unknown;
  lang?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const list = parseTags(tags);
  if (list.length === 0) return null;
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {list.map((tag, i) => (
        <span
          key={`${tag.label_en}-${i}`}
          className={`inline-flex items-center rounded-full border font-black uppercase tracking-wider ${pad}`}
          style={tagStyle(tag.color)}
        >
          {tagLabel(tag, lang)}
        </span>
      ))}
    </div>
  );
}
