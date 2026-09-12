import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, Trash2, Save, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  type CourseOption,
  type CourseOptionKind,
  FALLBACK_COURSE_OPTIONS,
} from "@/lib/course-options";

type Row = { id: string; value: string; label: string; isNew?: boolean };

const KINDS: Array<{ kind: CourseOptionKind; title: string; hint: string; numeric?: boolean }> = [
  { kind: "category", title: "Category", hint: "First box — e.g. Major, Minor, Elective." },
  {
    kind: "year",
    title: "Year",
    hint: "Second box — year number groups courses (use 0 for 'For all years'), wording is what students see.",
    numeric: true,
  },
  { kind: "exam_type", title: "Exam type", hint: "Third box — e.g. MINI-OSCE, FINAL, MID." },
];

export function CourseOptionsManager({ setError }: { setError: (m: string | null) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<CourseOptionKind, Row[]>>({
    category: [],
    year: [],
    exam_type: [],
  });
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const { data, error } = await (supabase.from as any)("course_options")
      .select("id, kind, value, label, sort_order")
      .order("kind")
      .order("sort_order");
    if (error) {
      setError(error.message);
      return;
    }
    const list = ((data ?? []) as CourseOption[]).length
      ? ((data ?? []) as CourseOption[])
      : [
          ...FALLBACK_COURSE_OPTIONS.category,
          ...FALLBACK_COURSE_OPTIONS.year,
          ...FALLBACK_COURSE_OPTIONS.exam_type,
        ];
    const next: Record<CourseOptionKind, Row[]> = { category: [], year: [], exam_type: [] };
    for (const r of list) {
      next[r.kind]?.push({ id: r.id, value: r.value, label: r.label });
    }
    setRows(next);
    setRemoved([]);
  }

  useEffect(() => {
    if (open && rows.category.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function update(kind: CourseOptionKind, idx: number, patch: Partial<Row>) {
    setRows((prev) => {
      const list = [...prev[kind]];
      list[idx] = { ...list[idx]!, ...patch };
      return { ...prev, [kind]: list };
    });
    setSaved(false);
  }

  function move(kind: CourseOptionKind, idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const list = [...prev[kind]];
      const to = idx + dir;
      if (to < 0 || to >= list.length) return prev;
      const [row] = list.splice(idx, 1);
      list.splice(to, 0, row!);
      return { ...prev, [kind]: list };
    });
    setSaved(false);
  }

  function add(kind: CourseOptionKind, preset?: { label: string; value: string }) {
    setRows((prev) => {
      let defaultVal = "";
      if (preset) {
        defaultVal = preset.value;
      } else if (kind === "year") {
        // Find highest existing numeric year + 1
        const nums = prev.year.map((r) => Number(r.value)).filter((n) => !isNaN(n) && n > 0);
        const max = nums.length ? Math.max(...nums) : prev.year.length;
        defaultVal = String(max + 1);
      }
      return {
        ...prev,
        [kind]: [
          ...prev[kind],
          {
            id: `new-${kind}-${Date.now()}`,
            value: defaultVal,
            label: preset ? preset.label : "",
            isNew: true,
          },
        ],
      };
    });
    setSaved(false);
  }

  function remove(kind: CourseOptionKind, idx: number) {
    setRows((prev) => {
      const list = [...prev[kind]];
      const [row] = list.splice(idx, 1);
      if (row && !row.isNew && !row.id.startsWith("f-")) setRemoved((r) => [...r, row.id]);
      return { ...prev, [kind]: list };
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload: any[] = [];
    for (const { kind, numeric } of KINDS) {
      rows[kind].forEach((r, i) => {
        const label = r.label.trim();
        let valStr = r.value.trim();
        // If year and user left empty or typed "all" with "all year" in label, treat as 0
        if (
          kind === "year" &&
          (valStr.toLowerCase() === "all" || (!valStr && label.toLowerCase().includes("all")))
        ) {
          valStr = "0";
        }
        const value = (kind === "year" ? String(Number(valStr) || 0) : valStr) || label;
        if (!label) return;
        if (numeric && (isNaN(Number(value)) || Number(value) < 0)) return;
        payload.push({ kind, value, label, sort_order: i });
      });
    }
    if (removed.length) {
      const { error } = await (supabase.from as any)("course_options").delete().in("id", removed);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }
    const { error } = await (supabase.from as any)("course_options").upsert(payload, {
      onConflict: "kind,value",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    await qc.invalidateQueries({ queryKey: ["course-options"] });
    load();
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Settings2 size={17} className="text-amber-400" />
          Manage dropdown options
        </span>
        <span className="text-xs text-white/50">
          {open ? "Hide" : "Category · Year · Exam type"}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-6">
          {KINDS.map(({ kind, title, hint, numeric }) => (
            <div key={kind}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/80">{title}</h3>
                <div className="flex items-center gap-2">
                  {kind === "year" &&
                    !rows.year.some(
                      (r) =>
                        r.label.toLowerCase().includes("zero") ||
                        r.label.toLowerCase().includes("تحضير"),
                    ) && (
                      <button
                        type="button"
                        onClick={() => add("year", { label: "Zero Course", value: "7" })}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-400 hover:text-purple-300 bg-purple-400/10 hover:bg-purple-400/20 px-2.5 py-0.5 rounded-full border border-purple-400/30 transition-colors"
                      >
                        <Plus size={11} /> Add "Zero Course"
                      </button>
                    )}
                  {kind === "year" &&
                    !rows.year.some(
                      (r) =>
                        r.label.toLowerCase().includes("all year") ||
                        r.label.toLowerCase().includes("جميع السنوات") ||
                        r.label.toLowerCase().includes("لكل السنين"),
                    ) && (
                      <button
                        type="button"
                        onClick={() => add("year", { label: "For all years", value: "0" })}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 px-2.5 py-0.5 rounded-full border border-amber-400/30 transition-colors"
                      >
                        <Plus size={11} /> Add "For all years"
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => add(kind)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    <Plus size={13} /> Add option
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-white/40 mb-2">{hint}</p>
              <div className="space-y-2">
                {rows[kind].map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      value={r.label}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        const patch: Partial<Row> = { label: newLabel };
                        if (
                          kind === "year" &&
                          (newLabel.toLowerCase().includes("all year") ||
                            newLabel.toLowerCase().includes("جميع السنوات")) &&
                          (!r.value || r.value === "8")
                        ) {
                          patch.value = "0";
                        }
                        update(kind, i, patch);
                      }}
                      placeholder="Shown in the dropdown (e.g. Zero Course, Year 1, For all years)"
                      className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
                    />
                    <div className="relative">
                      <input
                        value={r.value}
                        onChange={(e) => update(kind, i, { value: e.target.value })}
                        placeholder={numeric ? "0 or number" : "Saved value"}
                        inputMode={numeric ? "numeric" : "text"}
                        min={numeric ? "0" : undefined}
                        className="w-36 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70 outline-none focus:border-white/40 font-mono"
                      />
                      {kind === "year" &&
                        (r.label.toLowerCase().includes("zero") ||
                        r.label.toLowerCase().includes("تحضير") ? (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-wider text-purple-400 pointer-events-none bg-purple-400/10 px-1.5 py-0.5 rounded border border-purple-400/20">
                            Zero course
                          </span>
                        ) : r.label.toLowerCase().includes("all year") ||
                          r.label.toLowerCase().includes("جميع") ||
                          r.label.toLowerCase().includes("لكل") ||
                          r.value === "0" ? (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-wider text-amber-400 pointer-events-none bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                            All years
                          </span>
                        ) : null)}
                    </div>
                    <button
                      type="button"
                      onClick={() => move(kind, i, -1)}
                      className="text-white/40 hover:text-white p-1"
                      aria-label="Move up"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(kind, i, 1)}
                      className="text-white/40 hover:text-white p-1"
                      aria-label="Move down"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(kind, i)}
                      className="text-red-400/70 hover:text-red-300 p-1"
                      aria-label="Delete option"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {rows[kind].length === 0 && (
                  <p className="text-xs text-white/30">No options yet — add one.</p>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm px-5 py-2.5"
            >
              <Save size={15} /> {saving ? "Saving…" : "Save options"}
            </button>
            {saved && <span className="text-xs text-emerald-400">Saved</span>}
            <span className="text-[11px] text-white/40">
              Courses already using a deleted option keep their current wording.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
