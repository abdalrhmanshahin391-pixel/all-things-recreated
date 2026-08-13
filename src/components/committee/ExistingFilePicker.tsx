import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Search, Video, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";

export type LibraryFile = {
  id: string;
  title: string;
  kind: string;
  file_path: string | null;
  storage_provider: string | null;
  drive_file_id: string | null;
  drive_web_link: string | null;
  drive_download_link: string | null;
  description: string | null;
  is_protected: boolean;
  category_id: string;
  path: string; // "Year 3 › Physiology › CVS"
};

type Row = {
  id: string;
  title: string;
  file_path: string | null;
  storage_provider: string | null;
  drive_file_id: string | null;
  drive_web_link: string | null;
  drive_download_link: string | null;
  kind: string;
  description: string | null;
  is_protected: boolean | null;
  category_id: string;
};

/** Loads every PDF that already lives in the committee library, with a readable location path. */
export function useCommitteeLibrary(enabled = true) {
  return useQuery({
    queryKey: ["committee-library-files"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<LibraryFile[]> => {
      const [{ data: res }, { data: cats }, { data: subs }, { data: years }] = await Promise.all([
        supabase
          .from("committee_resources")
          .select(
            "id,title,file_path,storage_provider,drive_file_id,drive_web_link,drive_download_link,kind,description,is_protected,category_id",
          ),
        supabase.from("committee_categories").select("id,name,subject_id"),
        supabase.from("committee_subjects").select("id,name,year_id"),
        supabase.from("committee_years").select("id,display_name,year_number"),
      ]);
      const yearMap = new Map((years ?? []).map((y: any) => [y.id, y.display_name || `Year ${y.year_number}`]));
      const subMap = new Map((subs ?? []).map((s: any) => [s.id, { name: s.name, year: yearMap.get(s.year_id) ?? "" }]));
      const catMap = new Map(
        (cats ?? []).map((c: any) => {
          const s = subMap.get(c.subject_id);
          return [c.id, [s?.year, s?.name, c.name].filter(Boolean).join(" › ")];
        }),
      );
      return ((res ?? []) as Row[])
        .filter((r) => (r.kind === "pdf" || r.kind === "video") && (!!r.file_path || !!r.drive_file_id))
        .map((r) => ({
          id: r.id,
          title: r.title,
          kind: r.kind,
          file_path: r.file_path,
          storage_provider: r.storage_provider,
          drive_file_id: r.drive_file_id,
          drive_web_link: r.drive_web_link,
          drive_download_link: r.drive_download_link,
          description: r.description,
          is_protected: !!r.is_protected,
          category_id: r.category_id,
          path: catMap.get(r.category_id) ?? "—",
        }))
        .sort((a, b) => a.path.localeCompare(b.path) || a.title.localeCompare(b.title));
    },
  });
}

/** Counts how many library rows point at each stored file. */
export function refCounts(files: { file_path: string | null }[]) {
  const m = new Map<string, number>();
  for (const f of files) {
    if (!f.file_path) continue;
    m.set(f.file_path, (m.get(f.file_path) ?? 0) + 1);
  }
  return m;
}

/**
 * Pick one or more files (PDFs or videos) that are already stored and link them into a category.
 * No upload happens — the new rows reuse the same stored file.
 */
export function ExistingFilePicker({
  categoryId,
  parentResourceId = null,
  nextSort,
  onClose,
  onSaved,
}: {
  categoryId: string;
  parentResourceId?: string | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: files, isLoading } = useCommitteeLibrary();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = files ?? [];
    if (!needle) return all;
    return all.filter(
      (f) => f.title.toLowerCase().includes(needle) || f.path.toLowerCase().includes(needle),
    );
  }, [files, q]);

  function toggle(id: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function save() {
    const chosen = (files ?? []).filter((f) => picked.has(f.id));
    if (chosen.length === 0) return toast.error("Pick at least one file");
    setSaving(true);
    const rows = chosen.map((f, i) => ({
      category_id: categoryId,
      parent_resource_id: parentResourceId,
      title: f.title,
      kind: f.kind,
      file_path: f.file_path,
      storage_provider: f.storage_provider,
      drive_file_id: f.drive_file_id,
      drive_web_link: f.drive_web_link,
      drive_download_link: f.drive_download_link,
      url: null,
      description: f.description,
      is_protected: f.is_protected,
      sort_order: nextSort + i,
    }));
    const { error } = await (supabase.from("committee_resources") as any).insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} file${rows.length === 1 ? "" : "s"} added — no re-upload needed`);
    onSaved();
  }

  return (
    <CommitteeDialog title="Add existing file" onClose={onClose}>
      <p className="text-xs text-muted-foreground -mt-1">
        Link a PDF or video that is already in the library. It is stored once and can appear in as many places as you like.
      </p>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or location…"
          autoFocus
          className={`${inputCls} pl-9 pr-8`}
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading library…</div>
        ) : list.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No stored files match.</div>
        ) : (
          list.map((f) => {
            const on = picked.has(f.id);
            const isVideo = f.kind === "video";
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                className={`w-full flex items-center gap-3 p-2.5 text-left ${on ? "bg-primary/10" : "hover:bg-muted"}`}
              >
                <span
                  className={`grid place-items-center h-8 w-8 rounded-lg shrink-0 ${
                    on ? "bg-primary text-primary-foreground" : isVideo ? "bg-violet-100 text-violet-600" : "bg-red-100 text-red-600"
                  }`}
                >
                  {on ? <Check size={15} /> : isVideo ? <Video size={15} /> : <FileText size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-sm truncate">{f.title}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{f.path}</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <button onClick={save} disabled={saving || picked.size === 0} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Adding…" : `Add ${picked.size || ""} selected`.trim()}
      </button>
    </CommitteeDialog>
  );
}

/** Copy one existing resource into another section anywhere in the committee. */
export function CopyToDialog({
  resource,
  onClose,
  onSaved,
}: {
  resource: {
    id: string;
    title: string;
    kind: string;
    file_path: string | null;
    url: string | null;
    description: string | null;
    is_protected?: boolean | null;
    storage_provider?: string | null;
    drive_file_id?: string | null;
    drive_web_link?: string | null;
    drive_download_link?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: targets, isLoading } = useQuery({
    queryKey: ["committee-target-categories"],
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: cats }, { data: subs }, { data: years }] = await Promise.all([
        supabase.from("committee_categories").select("id,name,subject_id"),
        supabase.from("committee_subjects").select("id,name,year_id"),
        supabase.from("committee_years").select("id,display_name,year_number"),
      ]);
      const yearMap = new Map((years ?? []).map((y: any) => [y.id, y.display_name || `Year ${y.year_number}`]));
      const subMap = new Map((subs ?? []).map((s: any) => [s.id, { name: s.name, year: yearMap.get(s.year_id) ?? "" }]));
      return ((cats ?? []) as any[])
        .map((c) => {
          const s = subMap.get(c.subject_id);
          return { id: c.id as string, label: [s?.year, s?.name, c.name].filter(Boolean).join(" › ") };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = targets ?? [];
    return needle ? all.filter((t) => t.label.toLowerCase().includes(needle)) : all;
  }, [targets, q]);

  async function save() {
    if (picked.size === 0) return toast.error("Pick at least one section");
    setSaving(true);
    const ids = Array.from(picked);
    const { data: existing } = await supabase
      .from("committee_resources")
      .select("category_id,sort_order")
      .in("category_id", ids);
    const maxBy = new Map<string, number>();
    for (const r of (existing ?? []) as any[]) {
      maxBy.set(r.category_id, Math.max(maxBy.get(r.category_id) ?? -1, r.sort_order ?? 0));
    }
    const rows = ids.map((cid) => ({
      category_id: cid,
      parent_resource_id: null,
      title: resource.title,
      kind: resource.kind,
      file_path: resource.file_path,
      storage_provider: resource.storage_provider ?? "lovable",
      drive_file_id: resource.drive_file_id ?? null,
      drive_web_link: resource.drive_web_link ?? null,
      drive_download_link: resource.drive_download_link ?? null,
      url: resource.url,
      description: resource.description,
      is_protected: resource.is_protected ?? false,
      sort_order: (maxBy.get(cid) ?? -1) + 1,
    }));
    const { error } = await (supabase.from("committee_resources") as any).insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Copied to ${rows.length} section${rows.length === 1 ? "" : "s"}`);
    onSaved();
  }

  return (
    <CommitteeDialog title={`Copy "${resource.title}" to…`} onClose={onClose}>
      <p className="text-xs text-muted-foreground -mt-1">
        The same stored file is reused — nothing is uploaded again and no extra storage is used.
      </p>
      <Field label="Destination sections">
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections…" className={`${inputCls} pl-9`} />
        </div>
        <div className="max-h-[280px] overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No sections match.</div>
          ) : (
            list.map((t) => {
              const on = picked.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setPicked((prev) => {
                      const n = new Set(prev);
                      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
                      return n;
                    })
                  }
                  className={`w-full flex items-center gap-2.5 p-2.5 text-left text-sm ${on ? "bg-primary/10 font-bold" : "hover:bg-muted"}`}
                >
                  <span className={`grid place-items-center h-6 w-6 rounded-md shrink-0 ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {on ? <Check size={13} /> : null}
                  </span>
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })
          )}
        </div>
      </Field>
      <button onClick={save} disabled={saving || picked.size === 0} className={primaryBtn} style={primaryBtnStyle}>
        {saving ? "Copying…" : `Copy to ${picked.size || ""} section${picked.size === 1 ? "" : "s"}`.replace("  ", " ")}
      </button>
    </CommitteeDialog>
  );
}
