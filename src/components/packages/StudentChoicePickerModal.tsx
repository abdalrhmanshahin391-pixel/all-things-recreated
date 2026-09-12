import { useState, useMemo } from "react";
import { X, Check, Search, Sparkles, BookOpen, Video, ArrowRight, AlertCircle } from "lucide-react";
import type { PackageWithCourses } from "@/lib/packages.functions";

interface StudentChoicePickerModalProps {
  pkg: PackageWithCourses;
  onConfirm: (selectedCourseIds: string[]) => void;
  onClose: () => void;
  loading?: boolean;
}

export function StudentChoicePickerModal({
  pkg,
  onConfirm,
  onClose,
  loading = false,
}: StudentChoicePickerModalProps) {
  const needed = pkg.choice_count || 3;
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const eligibleCourses = pkg.courses;

  const filtered = useMemo(() => {
    if (!query.trim()) return eligibleCourses;
    const q = query.toLowerCase();
    return eligibleCourses.filter(
      (c) => c.title.toLowerCase().includes(q) || String(c.year).includes(q),
    );
  }, [eligibleCourses, query]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      setSelected((cur) => cur.filter((x) => x !== id));
    } else {
      if (selected.length >= needed) return;
      setSelected((cur) => [...cur, id]);
    }
  }

  const isComplete = selected.length === needed;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-border bg-muted/30 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3" /> Custom Package Selection
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {pkg.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Select any <strong className="text-foreground font-semibold">{needed}</strong> courses or lectures from the eligible list below to include in your subscription.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Counter Bar */}
        <div className="px-5 py-3 border-b border-border bg-muted/10 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search eligible courses..."
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold text-xs border border-border bg-background">
            <span>Selected:</span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono ${
                isComplete
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary/15 text-primary"
              }`}
            >
              {selected.length} / {needed}
            </span>
          </div>
        </div>

        {/* Courses list */}
        <div className="p-5 overflow-y-auto flex-1 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No matching courses found. Try a different search.
            </div>
          ) : (
            filtered.map((c) => {
              const isChecked = selected.includes(c.id);
              const isLectures = c.kind === "lectures";
              const totalQ = c.questions_count_mid + c.questions_count_final;
              const disabled = !isChecked && selected.length >= needed;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  disabled={disabled}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 ${
                    isChecked
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                      : disabled
                      ? "border-border/50 bg-muted/20 opacity-50 cursor-not-allowed"
                      : "border-border hover:border-border/80 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      isChecked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30 bg-background"
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {c.title}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        Year {c.year}
                      </span>
                      {isLectures ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          <Video className="w-2.5 h-2.5" /> Lectures
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                          <BookOpen className="w-2.5 h-2.5" /> Q-Bank ({totalQ} Qs)
                        </span>
                      )}
                    </div>
                    {c.note && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {c.note}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-border bg-muted/30 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground hidden sm:block">
            {isComplete ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Ready! Proceed to secure checkout.
              </span>
            ) : (
              <span>
                Please pick {needed - selected.length} more {needed - selected.length === 1 ? "course" : "courses"}.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isComplete || loading}
              onClick={() => onConfirm(selected)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 py-2.5 text-xs shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                "Opening Checkout..."
              ) : (
                <>
                  Proceed to Checkout — ${Number(pkg.price).toFixed(0)} <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
