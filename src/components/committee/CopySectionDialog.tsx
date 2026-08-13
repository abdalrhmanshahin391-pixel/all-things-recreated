import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";

/**
 * Copy a whole section (category) — with every folder, PDF and link inside it —
 * into one or more other subjects. Stored files are reused, nothing is uploaded again.
 */
export function CopySectionDialog({
  category,
  onClose,
  onSaved,
}: {
  category: { id: string; name: string; section?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["committee-target-subjects"],
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: subs }, { data: years }, { data: sems }, { data: mods }] = await Promise.all([
        supabase.from("committee_subjects").select("id,name,year_id,semester_id,module_id,sort_order"),
        supabase.from("committee_years").select("id,display_name,year_number,sort_order"),
        supabase.from("committee_semesters").select("id,name,number,year_id,sort_order"),
        supabase.from("committee_modules").select("id,name,semester_id,sort_order"),
      ]);
      const yearMap = new Map((years ?? []).map((y: any) => [y.id, y]));
      const semMap = new Map((sems ?? []).map((s: any) => [s.id, s]));
      const modMap = new Map((mods ?? []).map((m: any) => [m.id, m]));
      return ((subs ?? []) as any[])
        .map((s) => {
          const y: any = yearMap.get(s.year_id);
          const sem: any = s.semester_id ? semMap.get(s.semester_id) : null;
          const mod: any = s.module_id ? modMap.get(s.module_id) : null;
          const yearLabel = y ? y.display_name || `Year ${y.year_number}` : "";
          const semLabel = sem ? sem.name || `Semester ${sem.number}` : "";
          const modLabel = mod ? mod.name : "";
          const group = [yearLabel, semLabel, modLabel].filter(Boolean).join(" › ");
          return {
            id: s.id as string,
            name: s.name as string,
            group,
            label: [group, s.name].filter(Boolean).join(" › "),
            yOrder: y?.sort_order ?? y?.year_number ?? 0,
            sOrder: sem?.number ?? sem?.sort_order ?? 0,
            mOrder: mod?.sort_order ?? 0,
            subOrder: s.sort_order ?? 0,
          };
        })
        .sort(
          (a, b) =>
            a.yOrder - b.yOrder ||
            a.sOrder - b.sOrder ||
            a.mOrder - b.mOrder ||
            a.subOrder - b.subOrder ||
            a.name.localeCompare(b.name),
        );
    },
  });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = subjects ?? [];
    return needle ? all.filter((s) => s.label.toLowerCase().includes(needle)) : all;
  }, [subjects, q]);

  /** Rows grouped under sticky "Year › Semester" headings. */
  const groups = useMemo(() => {
    const out: Array<{ group: string; items: typeof list }> = [];
    for (const item of list) {
      const last = out[out.length - 1];
      if (last && last.group === item.group) last.items.push(item);
      else out.push({ group: item.group, items: [item] });
    }
    return out;
  }, [list]);

  const pickedList = useMemo(
    () => (subjects ?? []).filter((s) => picked.has(s.id)),
    [subjects, picked],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    if (picked.size === 0) return toast.error("Pick at least one subject");
    setSaving(true);
    try {
      const targets = Array.from(picked);

      // Everything inside the source section.
      const { data: src, error: srcErr } = await supabase
        .from("committee_resources")
        .select("*")
        .eq("category_id", category.id)
        .order("sort_order");
      if (srcErr) throw srcErr;
      const rows = (src ?? []) as any[];
      const ids = new Set(rows.map((r) => r.id));

      // Children grouped by their parent (root = null), each in saved order.
      const byParent = new Map<string | null, any[]>();
      for (const r of rows) {
        // A parent outside this section is treated as a root row.
        const key = r.parent_resource_id && ids.has(r.parent_resource_id) ? r.parent_resource_id : null;
        const arr = byParent.get(key) ?? [];
        arr.push(r);
        byParent.set(key, arr);
      }
      for (const arr of byParent.values()) {
        arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.title).localeCompare(String(b.title)));
      }

      // Where each new section should sit in the target sidebar.
      const { data: existingCats } = await supabase
        .from("committee_categories")
        .select("subject_id,sort_order")
        .in("subject_id", targets);
      const maxBy = new Map<string, number>();
      for (const c of (existingCats ?? []) as any[]) {
        maxBy.set(c.subject_id, Math.max(maxBy.get(c.subject_id) ?? 0, c.sort_order ?? 0));
      }

      for (const subjectId of targets) {
        const { data: newCat, error: catErr } = await (supabase.from("committee_categories") as any)
          .insert({
            subject_id: subjectId,
            name: category.name,
            section: category.section ?? "resources",
            sort_order: (maxBy.get(subjectId) ?? 0) + 1,
          })
          .select("id")
          .single();
        if (catErr) throw catErr;
        const newCategoryId = (newCat as any).id as string;

        // Walk the tree depth by depth so nesting of any depth survives, and
        // map every original row to its new id explicitly (never by position).
        const payload = (r: any, parentId: string | null, index: number) => ({
          category_id: newCategoryId,
          parent_resource_id: parentId,
          title: r.title,
          kind: r.kind,
          file_path: r.file_path,
          storage_provider: r.storage_provider ?? "lovable",
          drive_file_id: r.drive_file_id ?? null,
          drive_web_link: r.drive_web_link ?? null,
          drive_download_link: r.drive_download_link ?? null,
          url: r.url,
          description: r.description,
          is_protected: r.is_protected ?? false,
          sort_order: index,
        });

        const copyLevel = async (sourceParentId: string | null, newParentId: string | null) => {
          const kids = byParent.get(sourceParentId) ?? [];
          if (kids.length === 0) return;

          const hasKids = (r: any) => (byParent.get(r.id) ?? []).length > 0;
          const leaves = kids.filter((r) => !hasKids(r));
          const folders = kids.filter(hasKids);

          // Leaves need no id back — one batched insert keeps this fast.
          if (leaves.length) {
            const { error } = await (supabase.from("committee_resources") as any).insert(
              leaves.map((r) => payload(r, newParentId, kids.indexOf(r))),
            );
            if (error) throw error;
          }

          // Rows with children are inserted one by one so their real new id
          // is known before their contents are copied.
          for (const r of folders) {
            const { data: created, error } = await (supabase.from("committee_resources") as any)
              .insert(payload(r, newParentId, kids.indexOf(r)))
              .select("id")
              .single();
            if (error) throw error;
            await copyLevel(r.id, (created as any).id as string);
          }
        };

        await copyLevel(null, null);
      }

      toast.success(
        `"${category.name}" copied to ${targets.length} subject${targets.length === 1 ? "" : "s"} — no re-upload needed`,
      );
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Copy failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CommitteeDialog title={`Copy section "${category.name}" to…`} onClose={onClose}>
      <p className="text-xs text-muted-foreground -mt-1">
        The whole section — folders, PDFs and links — is added to the subjects you pick. Files are reused, so no extra
        storage is used.
      </p>
      <Field label="Destination subjects">
        {pickedList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pickedList.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="flex items-center gap-1.5 rounded-full bg-primary/15 text-foreground px-2.5 py-1 text-xs font-semibold"
              >
                <span className="truncate max-w-[220px]">{p.label}</span>
                <X size={12} className="opacity-70" />
              </button>
            ))}
          </div>
        )}
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search year, semester or subject…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No subjects match.</div>
          ) : (
            groups.map((g) => (
              <div key={g.group || "ungrouped"}>
                <div className="sticky top-0 z-10 bg-muted/95 backdrop-blur px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {g.group || "Other"}
                </div>
                <div className="divide-y divide-border">
                  {g.items.map((t) => {
                    const on = picked.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(t.id)}
                        className={`w-full flex items-center gap-2.5 p-2.5 text-left text-sm ${on ? "bg-primary/10" : "hover:bg-muted"}`}
                      >
                        <span
                          className={`grid place-items-center h-6 w-6 rounded-md shrink-0 ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {on ? <Check size={13} /> : null}
                        </span>
                        <span className="truncate">
                          {g.group ? <span className="text-muted-foreground">{g.group} › </span> : null}
                          <span className="font-bold">{t.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </Field>
      <button onClick={save} disabled={saving || picked.size === 0} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Copying…" : `Copy section to ${picked.size || ""} subject${picked.size === 1 ? "" : "s"}`.replace("  ", " ")}
      </button>
    </CommitteeDialog>
  );
}
