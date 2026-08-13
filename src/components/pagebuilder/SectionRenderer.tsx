import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
import type { SectionNode } from "@/lib/site-structure";
import { BlockRenderer } from "./BlockRenderer";

function text(node: SectionNode, base: "title" | "description", lang: string) {
  return (lang === "ar" ? (node as any)[`${base}_ar`] : (node as any)[`${base}_en`]) ||
    (node as any)[`${base}_en`] ||
    (node as any)[`${base}_ar`] ||
    "";
}

export function SectionRenderer({ node, depth = 0 }: { node: SectionNode; depth?: number }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(true);
  if (!node.visible) return null;

  const title = text(node, "title", lang);
  const description = text(node, "description", lang);
  const accordion = node.layout === "accordion" && depth > 0;
  const body = (
    <>
      {description && <p className="text-muted-foreground leading-relaxed">{description}</p>}
      {node.blocks.length > 0 && (
        <div className={node.layout === "grid" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
          {node.blocks.map((b) => (
            <BlockRenderer key={b.id} block={b} />
          ))}
        </div>
      )}
      {node.children.length > 0 && (
        <div className={node.layout === "grid" ? "grid gap-4 sm:grid-cols-2" : "space-y-6"}>
          {node.children.map((child) => (
            <SectionRenderer key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );

  if (accordion) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted"
        >
          <span className="font-black text-foreground">{title}</span>
          <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="px-5 pb-5 space-y-4">{body}</div>}
      </div>
    );
  }

  return (
    <section
      className={
        depth === 0
          ? "space-y-5"
          : "space-y-4 rounded-2xl border-2 border-border bg-card p-5"
      }
    >
      {title && (
        <h2
          className={
            depth === 0
              ? "font-display font-black text-foreground text-3xl md:text-4xl lowercase"
              : "font-display font-black text-foreground text-xl"
          }
        >
          {title}
        </h2>
      )}
      {body}
    </section>
  );
}