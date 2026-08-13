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
    hint: "Second box — the number groups courses by year, the wording is what students see.",
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

  function add(kind: CourseOptionKind) {
    setRows((prev) => ({
      ...prev,
      [kind]: [
        ...prev[kind],
        {
          id: `new-${kind}-${Date.now()}`,
          value: kind === "year" ? String(prev[kind].length + 1) : "",
          label: "",
          isNew: true,
        },
      ],
    }));
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
        const value = (kind === "year" ? String(Number(r.value) || 0) : r.value.trim()) || label;
        if (!label || !value) return;
        if (numeric && !Number(value)) return;
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
                <button
                  type="button"
                  onClick={() => add(kind)}
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  <Plus size={13} /> Add option
                </button>
              </div>
              <p className="text-[11px] text-white/40 mb-2">{hint}</p>
              <div className="space-y-2">
                {rows[kind].map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      value={r.label}
                      onChange={(e) => update(kind, i, { label: e.target.value })}
                      placeholder="Shown in the dropdown"
                      className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/50"
                    />
                    <input
                      value={r.value}
                      onChange={(e) => update(kind, i, { value: e.target.value })}
                      placeholder={numeric ? "Year number" : "Saved value"}
                      inputMode={numeric ? "numeric" : "text"}
                      className="w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70 outline-none focus:border-white/40"
                    />
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
