import { useMemo } from "react";
import { Stethoscope, Heart, Activity } from "lucide-react";
import type { SummaryContent } from "@/lib/summaries.functions";
import { BlockRenderer } from "./SummaryBlocks";
import { watermarkBackground, CenterWatermark } from "./WatermarkPattern";

type Props = {
  content: SummaryContent;
  siteName: string;
  tagline?: string;
  authorName?: string;
  createdAt?: string;
};

/**
 * Multi-page A4-style summary, dark-themed to match the homepage step cards
 * (#0A0A1F navy + indigo→pink gradient accents + slate-300 body).
 */
export function SummaryView({ content, siteName, tagline, authorName, createdAt }: Props) {
  const pages = useMemo(() => paginate(content), [content]);

  return (
    <div className="summary-doc mx-auto w-full max-w-[920px] flex flex-col gap-8 px-4 py-10">
      <CoverPage content={content} siteName={siteName} tagline={tagline} authorName={authorName} />
      <TOCPage content={content} siteName={siteName} pages={pages} />
      {pages.map((p, i) => (
        <ContentPage
          key={i}
          pageNum={i + 3}
          sections={p}
          siteName={siteName}
          title={content.title}
        />
      ))}
      <RecapPage
        content={content}
        siteName={siteName}
        authorName={authorName}
        createdAt={createdAt}
        pageNum={pages.length + 3}
      />
    </div>
  );
}

/** Page wrapper — deep navy, aurora glow, subtle tile watermark + center stamp. */
function Page({
  children,
  siteName,
  withAurora = true,
}: {
  children: React.ReactNode;
  siteName: string;
  withAurora?: boolean;
}) {
  return (
    <article
      className="summary-page relative overflow-hidden rounded-[28px] bg-[#0A0A1F] ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(99,91,255,0.45)]"
      style={{ aspectRatio: "1 / 1.414" }}
    >
      {withAurora && (
        <>
          <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full bg-pink-500/20 blur-3xl" />
        </>
      )}
      {/* tiled diagonal watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: watermarkBackground(siteName, 0.07), backgroundRepeat: "repeat" }}
      />
      {/* big center stamp — harder to crop */}
      <CenterWatermark siteName={siteName} />
      <div className="relative h-full w-full p-8 md:p-12 flex flex-col">{children}</div>
    </article>
  );
}

function BrandChip({ siteName }: { siteName: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/15 px-3 py-1.5 backdrop-blur">
      <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-pink-500 text-white">
        <Stethoscope size={11} />
      </span>
      <span className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-slate-200">
        {siteName}
      </span>
    </div>
  );
}

/* ---------- COVER ---------- */
function CoverPage({
  content,
  siteName,
  tagline,
  authorName,
}: {
  content: SummaryContent;
  siteName: string;
  tagline?: string;
  authorName?: string;
}) {
  return (
    <article
      className="summary-page relative overflow-hidden rounded-[28px] bg-[#0A0A1F] ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(99,91,255,0.55)]"
      style={{ aspectRatio: "1 / 1.414" }}
    >
      {/* aurora glow */}
      <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-indigo-600/35 blur-3xl" />
      <div className="absolute -bottom-32 -right-24 h-[460px] w-[460px] rounded-full bg-pink-500/30 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 h-[300px] w-[300px] rounded-full bg-orange-500/15 blur-3xl" />

      {/* ECG line */}
      <svg
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full h-32 opacity-30"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0 80 L 220 80 L 250 80 L 270 40 L 290 120 L 310 60 L 330 80 L 540 80 L 570 80 L 595 30 L 620 130 L 645 70 L 670 80 L 900 80 L 930 80 L 955 35 L 980 125 L 1005 65 L 1030 80 L 1200 80"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      <FloatingGlyph icon={<Stethoscope size={20} />} className="top-[12%] left-[8%]" />
      <FloatingGlyph icon={<Heart size={20} />} className="top-[18%] right-[10%]" />
      <FloatingGlyph icon={<Activity size={20} />} className="bottom-[26%] left-[10%]" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: watermarkBackground(siteName, 0.06), backgroundRepeat: "repeat" }}
      />
      <CenterWatermark siteName={siteName} />

      <div className="relative h-full p-10 md:p-14 flex flex-col">
        <div className="flex items-center justify-between">
          <BrandChip siteName={siteName} />
          <span className="text-[10px] font-extrabold tracking-[0.3em] uppercase text-slate-300">
            Cheat Sheet
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[11px] font-extrabold tracking-[0.4em] uppercase bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-4">
            Summary
          </p>
          <h1 className="text-[44px] md:text-[68px] font-black leading-[0.95] tracking-tight text-white">
            {content.title}
          </h1>
          {content.subtitle && (
            <p className="mt-5 max-w-md text-base md:text-lg text-slate-300 leading-relaxed">
              {content.subtitle}
            </p>
          )}
          <div className="mt-8 h-[3px] w-32 rounded-full bg-gradient-to-r from-indigo-500 via-pink-500 to-orange-400" />
        </div>

        <div className="absolute bottom-4 right-4 w-[180px] md:w-[220px] opacity-95">
          <DoctorSVG />
        </div>

        <footer className="mt-auto flex items-end justify-between text-[11px] text-slate-300">
          <div>
            <p className="font-extrabold tracking-[0.25em] uppercase text-white">{siteName}</p>
            {tagline && <p className="opacity-70 mt-0.5">{tagline}</p>}
          </div>
          {authorName && <p className="font-bold text-slate-200">By {authorName}</p>}
        </footer>
      </div>
    </article>
  );
}

function FloatingGlyph({
  icon,
  className,
}: {
  icon: React.ReactNode;
  className: string;
}) {
  return (
    <div className={`absolute ${className}`}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] backdrop-blur border border-white/15 text-white">
        {icon}
      </div>
    </div>
  );
}

/* ---------- TOC ---------- */
function TOCPage({
  content: _content,
  siteName,
  pages,
}: {
  content: SummaryContent;
  siteName: string;
  pages: { heading: string }[][];
}) {
  const entries: { heading: string; page: number }[] = [];
  pages.forEach((p, idx) => {
    p.forEach((s) => entries.push({ heading: s.heading, page: idx + 3 }));
  });

  return (
    <Page siteName={siteName}>
      <header className="flex items-center justify-between pb-5 border-b border-white/10">
        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">
          Table of Contents
        </h2>
        <BrandChip siteName={siteName} />
      </header>

      <ol className="mt-8 space-y-3 flex-1">
        {entries.map((e, i) => (
          <li key={i} className="flex items-baseline gap-3 text-slate-200">
            <span className="text-sm font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent w-6">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-semibold text-white">{e.heading}</span>
            <span className="flex-1 border-b border-dotted border-white/20 translate-y-[-4px]" />
            <span className="text-sm font-bold text-slate-400">{e.page}</span>
          </li>
        ))}
      </ol>

      <div className="absolute bottom-6 right-8 w-[160px] opacity-90">
        <DoctorSVG variant="reading" />
      </div>
      <PageFooter pageNum={2} siteName={siteName} />
    </Page>
  );
}

/* ---------- CONTENT PAGE ---------- */
function ContentPage({
  pageNum,
  sections,
  siteName,
  title,
}: {
  pageNum: number;
  sections: { heading: string; kicker?: string; blocks: any[] }[];
  siteName: string;
  title: string;
}) {
  return (
    <Page siteName={siteName}>
      <header className="relative flex items-center justify-between pb-4 border-b border-white/10">
        <p className="text-[10px] font-extrabold tracking-[0.3em] uppercase text-slate-400 truncate">
          {title}
        </p>
        <BrandChip siteName={siteName} />
      </header>

      <div className="relative flex-1 mt-6 space-y-8 overflow-hidden">
        {sections.map((s, i) => (
          <section key={i}>
            {s.kicker && (
              <p className="text-[10px] font-extrabold tracking-[0.3em] uppercase bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-1.5">
                {s.kicker}
              </p>
            )}
            <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mb-4">
              {s.heading}
            </h3>
            <div className="space-y-4">
              {s.blocks.map((b, j) => (
                <BlockRenderer key={j} block={b} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <PageFooter pageNum={pageNum} siteName={siteName} />
    </Page>
  );
}

/* ---------- RECAP ---------- */
function RecapPage({
  content,
  siteName,
  authorName,
  createdAt,
  pageNum,
}: {
  content: SummaryContent;
  siteName: string;
  authorName?: string;
  createdAt?: string;
  pageNum: number;
}) {
  return (
    <Page siteName={siteName}>
      <header className="relative flex items-center justify-between pb-4 border-b border-white/10">
        <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">Quick Recap</h2>
        <BrandChip siteName={siteName} />
      </header>

      <div className="relative mt-8 flex-1">
        <ul className="space-y-4">
          {content.recap.length ? (
            content.recap.map((r, i) => (
              <li
                key={i}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-4"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white font-extrabold">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed text-slate-200">{r}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-400 text-sm">No quick-recap items.</li>
          )}
        </ul>
      </div>

      <footer className="relative mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
        <p>
          Compiled{createdAt ? ` on ${new Date(createdAt).toLocaleDateString()}` : ""} by{" "}
          <span className="font-extrabold tracking-[0.2em] uppercase text-white">{siteName}</span>
          {authorName ? ` · for ${authorName}` : ""}
        </p>
        <span className="font-bold">Page {pageNum}</span>
      </footer>
    </Page>
  );
}

function PageFooter({ pageNum, siteName }: { pageNum: number; siteName: string }) {
  return (
    <footer className="relative mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] tracking-[0.2em] uppercase text-slate-400">
      <span className="font-bold">{siteName}</span>
      <span className="font-bold">Page {pageNum}</span>
    </footer>
  );
}

/* ---------- PAGINATION ---------- */
function paginate(content: SummaryContent): SummaryContent["sections"][] {
  const PAGE_BUDGET = 14;
  const pages: SummaryContent["sections"][] = [];
  let current: SummaryContent["sections"] = [];
  let used = 0;

  for (const s of content.sections) {
    let w = 2;
    for (const b of s.blocks) {
      if (b.type === "paragraph") w += 2;
      else if (b.type === "bullets") w += Math.max(2, b.items.length * 0.7);
      else if (b.type === "callout") w += 3;
      else if (b.type === "mnemonic") w += 3;
      else if (b.type === "usage") w += Math.max(2, b.items.length * 0.7);
      else if (b.type === "table") w += 4 + b.rows.length * 0.9;
    }
    if (used + w > PAGE_BUDGET && current.length) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(s);
    used += w;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [content.sections];
}

/* ---------- DOCTOR ---------- */
function DoctorSVG({ variant = "wave" }: { variant?: "wave" | "reading" }) {
  return (
    <svg viewBox="0 0 240 280" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 270 C 40 200, 85 175, 120 175 C 155 175, 200 200, 200 270 Z" fill="#ffffff" />
      <path d="M120 175 L 100 240 L 120 210 L 140 240 Z" fill="#EEF2FF" />
      <path d="M95 190 C 88 215, 102 235, 120 235 C 138 235, 152 215, 145 190" stroke="#0F172A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="120" cy="242" r="7" fill="#FF5C8A" stroke="#0F172A" strokeWidth="2" />
      <rect x="114" y="180" width="12" height="26" rx="2" fill="#635BFF" />
      <rect x="108" y="120" width="24" height="26" rx="6" fill="#F5C9A8" />
      <circle cx="120" cy="95" r="36" fill="#F5C9A8" />
      <path d="M85 90 C 85 66, 104 54, 120 54 C 142 54, 158 68, 158 92 C 150 82, 134 76, 120 78 C 106 80, 94 84, 85 90 Z" fill="#1E293B" />
      <circle cx="108" cy="98" r="2.8" fill="#0F172A" />
      <circle cx="132" cy="98" r="2.8" fill="#0F172A" />
      <path d="M110 112 Q 120 120 130 112" stroke="#0F172A" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="98" cy="108" r="3.5" fill="#FF8FA3" opacity="0.55" />
      <circle cx="142" cy="108" r="3.5" fill="#FF8FA3" opacity="0.55" />
      <circle cx="120" cy="64" r="7" fill="#FFD166" stroke="#0F172A" strokeWidth="2" />
      <path d="M52 215 C 44 240, 50 260, 68 262 L 82 240 Z" fill="#ffffff" />
      {variant === "wave" ? (
        <g>
          <path d="M175 200 C 210 160, 222 135, 210 115 L 188 128 C 188 152, 175 178, 162 195 Z" fill="#ffffff" />
          <circle cx="210" cy="110" r="13" fill="#F5C9A8" />
          <path d="M202 100 L 202 92 M209 98 L 209 89 M216 99 L 217 90 M222 102 L 224 95" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d="M158 215 C 172 230, 188 232, 198 220 L 188 200 L 168 200 Z" fill="#ffffff" />
          <rect x="155" y="210" width="50" height="28" rx="3" fill="#fff" stroke="#0F172A" strokeWidth="2" />
          <line x1="162" y1="220" x2="200" y2="220" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="162" y1="226" x2="195" y2="226" stroke="#94a3b8" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
