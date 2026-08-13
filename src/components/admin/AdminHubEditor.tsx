import { useState } from "react";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, RotateCcw, Save, Trash2, X,
} from "lucide-react";
import {
  DEFAULT_LAYOUT, ICONS, ICON_NAMES,
  type HubGroup, type HubLayout, type HubTile,
} from "@/lib/admin-hub-defaults";

type Drag = { groupIdx: number; tileIdx: number } | null;

export function AdminHubEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: HubLayout;
  saving: boolean;
  onSave: (layout: HubLayout) => void;
  onCancel: () => void;
}) {
  const [layout, setLayout] = useState<HubLayout>(() => structuredClone(initial));
  const [drag, setDrag] = useState<Drag>(null);

  function update(fn: (draft: HubLayout) => void) {
    setLayout((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function moveGroup(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= layout.groups.length) return;
    update((d) => {
      const [g] = d.groups.splice(i, 1);
      d.groups.splice(j, 0, g!);
    });
  }

  function dropOn(groupIdx: number, tileIdx: number) {
    if (!drag) return;
    const from = drag;
    setDrag(null);
    if (from.groupIdx === groupIdx && from.tileIdx === tileIdx) return;
    update((d) => {
      const [tile] = d.groups[from.groupIdx]!.tiles.splice(from.tileIdx, 1);
      if (!tile) return;
      const target = d.groups[groupIdx]!;
      const idx = Math.min(tileIdx, target.tiles.length);
      target.tiles.splice(idx, 0, tile);
    });
  }

  function addGroup() {
    update((d) => {
      d.groups.push({ id: `g-${Date.now()}`, label: "New group", tiles: [] });
    });
  }

  function addTile(groupIdx: number) {
    update((d) => {
      d.groups[groupIdx]!.tiles.push({
        id: `t-${Date.now()}`,
        to: "/admin",
        label: "New tile",
        icon: "Star",
        custom: true,
      });
    });
  }

  return (
    <div className="mt-8">
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-border bg-card p-3">
        <span className="text-sm font-black">Editing layout</span>
        <span className="text-xs text-muted-foreground">
          drag tiles between groups, rename anything, hide what you don't use
        </span>
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLayout(structuredClone(DEFAULT_LAYOUT))}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
          >
            <RotateCcw size={14} /> Reset to default
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
          >
            <X size={14} /> Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(layout)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>

      {layout.groups.map((group, gi) => (
        <GroupEditor
          key={group.id}
          group={group}
          index={gi}
          total={layout.groups.length}
          onMove={moveGroup}
          onChange={(patch) => update((d) => Object.assign(d.groups[gi]!, patch))}
          onDelete={() =>
            update((d) => {
              const removed = d.groups.splice(gi, 1)[0];
              if (removed && removed.tiles.length && d.groups[0]) {
                d.groups[0].tiles.push(...removed.tiles);
              }
            })
          }
          onAddTile={() => addTile(gi)}
          onTileChange={(ti, patch) =>
            update((d) => Object.assign(d.groups[gi]!.tiles[ti]!, patch))
          }
          onTileDelete={(ti) => update((d) => { d.groups[gi]!.tiles.splice(ti, 1); })}
          onDragStart={(ti) => setDrag({ groupIdx: gi, tileIdx: ti })}
          onDropTile={(ti) => dropOn(gi, ti)}
        />
      ))}

      <button
        type="button"
        onClick={addGroup}
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-2 text-sm font-bold hover:bg-muted"
      >
        <Plus size={16} /> Add group
      </button>
    </div>
  );
}

function GroupEditor({
  group, index, total, onMove, onChange, onDelete, onAddTile,
  onTileChange, onTileDelete, onDragStart, onDropTile,
}: {
  group: HubGroup;
  index: number;
  total: number;
  onMove: (i: number, dir: -1 | 1) => void;
  onChange: (patch: Partial<HubGroup>) => void;
  onDelete: () => void;
  onAddTile: () => void;
  onTileChange: (ti: number, patch: Partial<HubTile>) => void;
  onTileDelete: (ti: number) => void;
  onDragStart: (ti: number) => void;
  onDropTile: (ti: number) => void;
}) {
  return (
    <section className="mt-6 rounded-2xl border-2 border-border bg-card/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={group.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="rounded-xl border-2 border-border bg-card px-3 py-1.5 text-sm font-black"
          placeholder="Group name"
        />
        <input
          value={group.labelAr ?? ""}
          onChange={(e) => onChange({ labelAr: e.target.value })}
          dir="rtl"
          className="rounded-xl border-2 border-border bg-card px-3 py-1.5 text-sm font-bold"
          placeholder="الاسم بالعربية"
        />
        <div className="ms-auto flex items-center gap-1">
          <IconBtn disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={14} /></IconBtn>
          <IconBtn disabled={index === total - 1} onClick={() => onMove(index, 1)}><ArrowDown size={14} /></IconBtn>
          <IconBtn onClick={onAddTile}><Plus size={14} /></IconBtn>
          <IconBtn onClick={onDelete}><Trash2 size={14} /></IconBtn>
        </div>
      </div>

      <div
        className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDropTile(group.tiles.length)}
      >
        {group.tiles.map((tile, ti) => {
          const Icon = ICONS[tile.icon] ?? ICONS.Star!;
          return (
            <div
              key={tile.id}
              draggable
              onDragStart={() => onDragStart(ti)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.stopPropagation(); onDropTile(ti); }}
              className={`rounded-xl border-2 border-border bg-card p-2.5 ${tile.hidden ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="cursor-grab text-muted-foreground shrink-0" />
                <span
                  className="grid place-items-center h-7 w-7 rounded-lg text-primary-foreground shrink-0"
                  style={{ background: "var(--primary)" }}
                >
                  <Icon size={14} />
                </span>
                <input
                  value={tile.label}
                  onChange={(e) => onTileChange(ti, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-2 py-1 text-xs font-bold"
                />
                <IconBtn onClick={() => onTileChange(ti, { hidden: !tile.hidden })}>
                  {tile.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </IconBtn>
                {tile.custom && (
                  <IconBtn onClick={() => onTileDelete(ti)}><Trash2 size={13} /></IconBtn>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={tile.icon}
                  onChange={(e) => onTileChange(ti, { icon: e.target.value })}
                  className="rounded-lg border-2 border-border bg-background px-2 py-1 text-[11px] font-bold"
                >
                  {ICON_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {tile.custom ? (
                  <input
                    value={tile.to}
                    onChange={(e) =>
                      onTileChange(ti, {
                        to: e.target.value,
                        external: /^https?:\/\//i.test(e.target.value),
                      })
                    }
                    placeholder="/admin/... or https://"
                    className="min-w-0 flex-1 rounded-lg border-2 border-border bg-background px-2 py-1 text-[11px]"
                  />
                ) : (
                  <span className="truncate text-[11px] text-muted-foreground">{tile.to}</span>
                )}
              </div>
            </div>
          );
        })}
        {group.tiles.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            drop tiles here
          </div>
        )}
      </div>
    </section>
  );
}

function IconBtn({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid place-items-center h-7 w-7 rounded-lg border-2 border-border hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}