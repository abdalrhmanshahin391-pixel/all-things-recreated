import { Sparkles } from "lucide-react";

export function ReviewHero({ title = "Regular review is very helpful for learning!" }: { title?: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-indigo-50 via-sky-50 to-purple-50 px-6 md:px-10 py-7 md:py-9">
      <div className="absolute -top-4 left-6 text-blue-300/60"><Sparkles className="w-5 h-5" /></div>
      <div className="absolute top-8 right-8 text-purple-300/60"><Sparkles className="w-4 h-4" /></div>
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl md:text-3xl font-extrabold italic text-[#1e3a8a] leading-snug">
            {title}
          </h2>
        </div>
        <div className="w-28 h-28 md:w-32 md:h-32 shrink-0 rounded-2xl bg-white/40 grid place-items-center text-6xl select-none" aria-hidden>
          🐧
        </div>
      </div>
    </div>
  );
}
