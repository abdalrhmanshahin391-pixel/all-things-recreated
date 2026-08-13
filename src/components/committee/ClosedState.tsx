import { Lock } from "lucide-react";
import { COLORS, type ColorKey } from "@/lib/committee-meta";
import { Field, inputCls } from "@/components/committee/Dialog";

export const CLOSED_COLOR_KEYS: ColorKey[] = ["amber", "rose", "teal", "indigo", "mint", "violet", "sky", "orange"];
export const CLOSED_STYLES = [
  { key: "ribbon", label: "Ribbon" },
  { key: "dimmed", label: "Dimmed" },
  { key: "bold", label: "Bold overlay" },
] as const;

export type ClosedInfo = {
  is_closed?: boolean | null;
  closed_note?: string | null;
  closed_color?: string | null;
  closed_style?: string | null;
};

export const CLOSED_SELECT = "is_closed, closed_note, closed_color, closed_style";

function chip(color?: string | null) {
  return (COLORS[(color as ColorKey)] ?? COLORS.amber).chip;
}

/** Wraps a card: greys it out, blocks pointer events and shows the reason. */
export function ClosedWrap({
  info,
  canManage,
  children,
}: {
  info: ClosedInfo;
  canManage: boolean;
  children: React.ReactNode;
}) {
  if (!info.is_closed) return <>{children}</>;
  const note = (info.closed_note ?? "").trim() || "Coming soon";
  const style = info.closed_style ?? "ribbon";
  const locked = !canManage;

  return (
    <div className="relative">
      <div
        className={
          style === "dimmed" || style === "bold"
            ? "opacity-45 saturate-50"
            : "opacity-80"
        }
        aria-disabled={locked}
      >
        {children}
      </div>

      {locked && (
        <div className="absolute inset-0 z-20 cursor-not-allowed rounded-xl" title={note} />
      )}

      {style === "bold" ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl bg-background/45 backdrop-blur-[1px]">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide shadow-sm ${chip(info.closed_color)}`}>
            <Lock size={12} /> {note}
          </span>
        </div>
      ) : (
        <span
          className={`pointer-events-none absolute left-2 top-2 z-30 inline-flex max-w-[80%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm ${chip(info.closed_color)}`}
          title={note}
        >
          <Lock size={10} /> {note}
        </span>
      )}

      {canManage && (
        <span className="pointer-events-none absolute bottom-2 left-2 z-30 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Hidden for students
        </span>
      )}
    </div>
  );
}

/** Banner shown to managers when they open a closed area. */
export function ClosedBanner({ info }: { info: ClosedInfo }) {
  if (!info.is_closed) return null;
  const note = (info.closed_note ?? "").trim() || "Coming soon";
  return (
    <div className={`mb-6 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${chip(info.closed_color)}`}>
      <Lock size={14} /> This section is closed for students — {note}
    </div>
  );
}

/** Reusable admin form fields for the closed state. */
export function ClosedFields({
  value,
  onChange,
}: {
  value: Required<ClosedInfo>;
  onChange: (v: Required<ClosedInfo>) => void;
}) {
  const on = !!value.is_closed;
  return (
    <div className="rounded-lg border border-border p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ ...value, is_closed: e.target.checked })}
        />
        Close this section (students can&apos;t open it)
      </label>

      {on && (
        <div className="mt-3 space-y-3">
          <Field label="Message shown to students">
            <input
              className={inputCls}
              maxLength={60}
              placeholder="e.g. Coming soon"
              value={value.closed_note ?? ""}
              onChange={(e) => onChange({ ...value, closed_note: e.target.value })}
            />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-1.5">
              {CLOSED_COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ ...value, closed_color: c })}
                  className={`h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide ${chip(c)} ${value.closed_color === c ? "ring-2 ring-offset-1 ring-slate-400" : "opacity-70"}`}
                >
                  {(value.closed_note ?? "").trim() || "Closed"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Style">
            <select
              className={inputCls}
              value={value.closed_style ?? "ribbon"}
              onChange={(e) => onChange({ ...value, closed_style: e.target.value })}
            >
              {CLOSED_STYLES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

export function closedDefaults(x?: ClosedInfo | null): Required<ClosedInfo> {
  return {
    is_closed: !!x?.is_closed,
    closed_note: x?.closed_note ?? "Coming soon",
    closed_color: x?.closed_color ?? "amber",
    closed_style: x?.closed_style ?? "ribbon",
  };
}

export function closedPayload(v: Required<ClosedInfo>) {
  return {
    is_closed: !!v.is_closed,
    closed_note: (v.closed_note ?? "").trim() || null,
    closed_color: v.closed_color ?? "amber",
    closed_style: v.closed_style ?? "ribbon",
  };
}