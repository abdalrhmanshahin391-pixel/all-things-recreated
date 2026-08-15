import { useEffect, useState } from "react";
import { Pencil, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import {
  countryName,
  flagOf,
  initialsOf,
  memberTone,
  resolveMemberPhoto,
  type Member,
} from "@/lib/members";

export function MemberPhoto({ member, rounded }: { member: Member; rounded?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    resolveMemberPhoto(member.photo_url).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [member.photo_url]);

  const tone = memberTone(member.accent);
  const contain = member.photo_fit === "contain";
  return (
    <div
      className={`relative aspect-square w-full overflow-hidden ${rounded ?? "rounded-2xl"}`}
      style={{ background: `color-mix(in oklab, ${tone} 12%, var(--muted))` }}
    >
      {url ? (
        <img
          src={url}
          alt={member.name_en || member.name_ar}
          loading="lazy"
          className={`h-full w-full ${contain ? "object-contain p-3" : "object-cover"}`}
        />
      ) : (
        <span
          className="absolute inset-0 grid place-items-center font-display text-4xl font-black"
          style={{ color: tone }}
        >
          {initialsOf(member.name_en || member.name_ar)}
        </span>
      )}
    </div>
  );
}

export function MemberCard({
  member,
  ar,
  centered,
  canManage,
  onEdit,
  onDelete,
  onMove,
}: {
  member: Member;
  ar: boolean;
  centered?: boolean;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onMove?: (dir: -1 | 1) => void;
}) {
  const tone = memberTone(member.accent);
  const name = (ar ? member.name_ar : member.name_en) || member.name_en || member.name_ar;
  const desc = (ar ? member.description_ar : member.description_en) || "";

  return (
    <article className={`group relative ${centered ? "text-center" : "text-start"}`}>
      <div
        className="rounded-[1.4rem] p-2 transition-transform duration-200 group-hover:-translate-y-1"
        style={{
          background: `linear-gradient(150deg, color-mix(in oklab, ${tone} 16%, var(--card)) 0%, var(--card) 70%)`,
          border: `1px solid color-mix(in oklab, ${tone} 34%, var(--border))`,
        }}
      >
        <MemberPhoto member={member} rounded="rounded-[1rem]" />
      </div>

      <div className={`mt-4 px-1 ${centered ? "flex flex-col items-center" : ""}`}>
        <p
          className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: tone }}
        >
          <img
            src={`https://flagcdn.com/w40/${(member.country_code || "jo").toLowerCase()}.png`}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-3.5 w-5 rounded-[2px] object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).replaceWith(
                Object.assign(document.createElement("span"), {
                  textContent: flagOf(member.country_code),
                }),
              );
            }}
          />
          {countryName(member.country_code, member.country_label, ar)}
        </p>
        <h3 className="mt-1.5 font-display text-xl md:text-2xl font-black leading-tight">{name}</h3>
        <div
          className={`mt-1 flex flex-wrap items-center gap-2 ${centered ? "justify-center" : ""}`}
        >
          {member.year_label && (
            <span className="text-sm font-semibold text-muted-foreground">{member.year_label}</span>
          )}
          {member.role_label && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
              style={{
                background: `color-mix(in oklab, ${tone} 18%, var(--card))`,
                color: tone,
              }}
            >
              {member.role_label}
            </span>
          )}
        </div>
        {desc && (
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{desc}</p>
        )}
      </div>

      {canManage && (
        <div className="absolute top-3 end-3 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {onMove && (
            <>
              <button
                type="button"
                aria-label="Move earlier"
                onClick={() => onMove(-1)}
                className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="Move later"
                onClick={() => onMove(1)}
                className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                <ArrowRight size={14} />
              </button>
            </>
          )}
          {onEdit && (
            <button
              type="button"
              aria-label="Edit member"
              onClick={onEdit}
              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
            >
              <Pencil size={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Delete member"
              onClick={onDelete}
              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}