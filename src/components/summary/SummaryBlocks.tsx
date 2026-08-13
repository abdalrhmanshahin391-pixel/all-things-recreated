import type { SummaryBlock } from "@/lib/summaries.functions";
import { Sparkles, AlertTriangle, Lightbulb, StickyNote, Brain } from "lucide-react";

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-white">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

const TABLE_TONES: Record<string, { head: string }> = {
  indigo: { head: "from-indigo-600 to-violet-500" },
  pink: { head: "from-pink-600 to-rose-500" },
  emerald: { head: "from-emerald-600 to-teal-500" },
  amber: { head: "from-amber-500 to-orange-500" },
};

const CALLOUT_TONES: Record<
  string,
  { bg: string; border: string; label: string; labelClass: string; Icon: any; iconWrap: string }
> = {
  highYield: {
    bg: "bg-rose-500/10",
    border: "border-rose-400/30",
    label: "HIGH-YIELD",
    labelClass: "text-rose-300",
    Icon: Sparkles,
    iconWrap: "bg-rose-500/20 text-rose-200",
  },
  trap: {
    bg: "bg-amber-500/10",
    border: "border-amber-400/30",
    label: "COMMON TRAP",
    labelClass: "text-amber-300",
    Icon: AlertTriangle,
    iconWrap: "bg-amber-500/20 text-amber-200",
  },
  pearl: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/30",
    label: "CLINICAL PEARL",
    labelClass: "text-emerald-300",
    Icon: Lightbulb,
    iconWrap: "bg-emerald-500/20 text-emerald-200",
  },
  note: {
    bg: "bg-indigo-500/10",
    border: "border-indigo-400/30",
    label: "NOTE",
    labelClass: "text-indigo-300",
    Icon: StickyNote,
    iconWrap: "bg-indigo-500/20 text-indigo-200",
  },
};

export function BlockRenderer({ block }: { block: SummaryBlock }) {
  if (block.type === "paragraph") {
    return (
      <p className="text-[15px] leading-relaxed text-slate-300">{renderInline(block.text)}</p>
    );
  }

  if (block.type === "bullets") {
    return (
      <ul className="space-y-2">
        {block.items.map((it, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-300">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-indigo-400 to-pink-400" />
            <span>{renderInline(it)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "usage") {
    return (
      <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-sky-300 mb-3">
          {block.title || "Usage"}
        </p>
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i} className="text-[15px] text-slate-200 leading-relaxed">
              {renderInline(it)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (block.type === "callout") {
    const c = CALLOUT_TONES[block.tone] || CALLOUT_TONES.note;
    const Icon = c.Icon;
    return (
      <div className={`rounded-2xl border ${c.border} ${c.bg} p-5 flex gap-4`}>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${c.iconWrap}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-extrabold tracking-[0.3em] ${c.labelClass}`}>{c.label}</p>
          {block.title && <p className="mt-1 font-bold text-white">{block.title}</p>}
          <p className="mt-1 text-[15px] leading-relaxed text-slate-200">
            {renderInline(block.text)}
          </p>
        </div>
      </div>
    );
  }

  if (block.type === "mnemonic") {
    return (
      <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-5 flex gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/20 text-violet-200">
          <Brain size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold tracking-[0.3em] text-violet-300">MNEMONIC</p>
          <p className="mt-1 font-extrabold text-xl text-white tracking-wide">{block.title}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-200">
            {renderInline(block.text)}
          </p>
        </div>
      </div>
    );
  }

  if (block.type === "table") {
    const tone = TABLE_TONES[block.tone || "indigo"] || TABLE_TONES.indigo;
    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className={`bg-gradient-to-r ${tone.head} text-white`}>
              {block.headers.map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-bold tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className={r % 2 ? "bg-white/[0.04]" : "bg-white/[0.02]"}>
                {row.map((cell, c) => (
                  <td key={c} className="px-4 py-3 text-slate-100 border-t border-white/10">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
