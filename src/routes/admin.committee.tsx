import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowLeft, Upload, Save, Link2, Video } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ExistingFilePicker } from "@/components/committee/ExistingFilePicker";
import { uploadFileToDrive } from "@/lib/committee-drive";
import { DriveMigrationPanel } from "@/components/admin/DriveMigrationPanel";
import { DriveLinkPanel } from "@/components/admin/DriveLinkPanel";
import { touchCommitteeSnapshot } from "@/lib/committee-snapshot-touch";
import {
  COLOR_KEYS,
  ICON_KEYS,
  SHAPE_KEYS,
  iconOf,
  colorOf,
} from "@/lib/committee-meta";

export const Route = createFileRoute("/admin/committee")({
  component: AdminCommittee,
});

type Year = {
  id: string;
  year_number: number;
  display_name: string;
  icon_key: string;
  color_key: string;
  shape_key: string;
};
type Subject = {
  id: string;
  year_id: string;
  name: string;
  icon_key: string;
  color_key: string;
  sort_order: number;
};
type Category = { id: string; subject_id: string; name: string; sort_order: number };
type Resource = {
  id: string;
  category_id: string;
  parent_resource_id: string | null;
  title: string;
  kind: "pdf" | "link" | "folder" | "video";
  file_path: string | null;
  url: string | null;
  description: string | null;
};

function AdminCommittee() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
  }, [isAdmin, loading, navigate]);

  const [yearId, setYearId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF9]">
        <SiteHeader variant="light" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader variant="light" />
      <main className="pt-28 pb-24 px-6 md:px-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
            <ArrowLeft size={16} /> Home
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-3xl font-black">Committee Admin</h1>
        </div>

        <div className="grid lg:grid-cols-4 gap-4">
          <YearsPanel yearId={yearId} onSelect={(id) => { setYearId(id); setSubjectId(null); setCategoryId(null); }} />
          <SubjectsPanel yearId={yearId} subjectId={subjectId} onSelect={(id) => { setSubjectId(id); setCategoryId(null); }} />
          <CategoriesPanel subjectId={subjectId} categoryId={categoryId} onSelect={setCategoryId} />
          <ResourcesPanel categoryId={categoryId} />
        </div>

        <div className="mt-8">
          <DriveLinkPanel />
        </div>

        <div className="mt-8">
          <DriveMigrationPanel />
        </div>

        <div className="mt-8">
          <MembersPanel />
        </div>
      </main>
    </div>
  );
}


function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col gap-3 min-h-[500px]">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-sm uppercase tracking-widest text-slate-700">{title}</h2>
        {action}
      </div>
      <div className="space-y-2 overflow-y-auto flex-1">{children}</div>
    </div>
  );
}

// ============== YEARS ==============
function YearsPanel({ yearId, onSelect }: { yearId: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: years } = useQuery({
    queryKey: ["admin-committee-years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("committee_years").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Year[];
    },
  });
  const [editing, setEditing] = useState<Year | null>(null);

  return (
    <Section title="Years">
      {years?.map((y) => {
        const Icon = iconOf(y.icon_key);
        const c = colorOf(y.color_key);
        return (
          <button
            key={y.id}
            onClick={() => onSelect(y.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
              yearId === y.id ? "bg-indigo-50 ring-2 ring-indigo-300" : "hover:bg-slate-50"
            }`}
          >
            <span className={`grid place-items-center h-9 w-9 rounded-lg bg-gradient-to-br ${c.from} ${c.to} text-white`}>
              <Icon size={16} />
            </span>
            <span className="flex-1">
              <span className="block font-bold text-sm">{y.display_name}</span>
              <span className="block text-xs text-slate-500">Year {y.year_number}</span>
            </span>
            <span
              className="text-xs text-slate-400 hover:text-indigo-600 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setEditing(y); }}
            >
              edit
            </span>
          </button>
        );
      })}
      {editing && (
        <Modal onClose={() => setEditing(null)} title={`Edit ${editing.display_name}`}>
          <YearEditor
            year={editing}
            onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["admin-committee-years"] }); qc.invalidateQueries({ queryKey: ["committee-years"] }); }}
          />
        </Modal>
      )}
    </Section>
  );
}

function YearEditor({ year, onSaved }: { year: Year; onSaved: () => void }) {
  const [name, setName] = useState(year.display_name);
  const [icon, setIcon] = useState(year.icon_key);
  const [color, setColor] = useState(year.color_key);
  const [shape, setShape] = useState(year.shape_key);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("committee_years").update({ display_name: name, icon_key: icon, color_key: color, shape_key: shape }).eq("id", year.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Year saved");
    onSaved();
  }

  return (
    <div className="space-y-3">
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Icon"><PickGrid options={ICON_KEYS} value={icon} onChange={setIcon} renderIcon /></Field>
      <Field label="Color"><PickGrid options={COLOR_KEYS} value={color} onChange={setColor} renderSwatch /></Field>
      <Field label="Shape"><PickGrid options={SHAPE_KEYS} value={shape} onChange={setShape} /></Field>
      <button onClick={save} disabled={saving} className="btn-primary"><Save size={14} /> Save</button>
    </div>
  );
}

// ============== SUBJECTS ==============
function SubjectsPanel({ yearId, subjectId, onSelect }: { yearId: string | null; subjectId: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  const { data: subjects } = useQuery({
    queryKey: ["admin-committee-subjects", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase.from("committee_subjects").select("*").eq("year_id", yearId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });

  async function del(id: string) {
    if (!confirm("Delete subject and all its content?")) return;
    const { error } = await supabase.from("committee_subjects").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Subject deleted");
    qc.invalidateQueries({ queryKey: ["admin-committee-subjects", yearId] });
  }

  return (
    <Section
      title="Subjects"
      action={yearId ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
          <Plus size={14} /> Add
        </button>
      ) : null}
    >
      {!yearId && <p className="text-xs text-slate-400">Pick a year first.</p>}
      {subjects?.map((s) => {
        const Icon = iconOf(s.icon_key);
        const c = colorOf(s.color_key);
        return (
          <div
            key={s.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl ${subjectId === s.id ? "bg-indigo-50 ring-2 ring-indigo-300" : "hover:bg-slate-50"}`}
          >
            <button onClick={() => onSelect(s.id)} className="flex items-center gap-2 flex-1 text-left">
              <span className={`grid place-items-center h-8 w-8 rounded-lg bg-gradient-to-br ${c.from} ${c.to} text-white`}>
                <Icon size={14} />
              </span>
              <span className="font-semibold text-sm flex-1">{s.name}</span>
            </button>
            <button onClick={() => setEditing(s)} className="text-xs text-slate-400 hover:text-indigo-600">edit</button>
            <button onClick={() => del(s.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        );
      })}
      {adding && yearId && (
        <Modal onClose={() => setAdding(false)} title="Add subject">
          <SubjectEditor
            yearId={yearId}
            onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["admin-committee-subjects", yearId] }); }}
          />
        </Modal>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)} title={`Edit ${editing.name}`}>
          <SubjectEditor
            subject={editing}
            yearId={editing.year_id}
            onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["admin-committee-subjects", yearId] }); }}
          />
        </Modal>
      )}
    </Section>
  );
}

function SubjectEditor({ yearId, subject, onSaved }: { yearId: string; subject?: Subject; onSaved: () => void }) {
  const [name, setName] = useState(subject?.name ?? "");
  const [icon, setIcon] = useState(subject?.icon_key ?? "book-open");
  const [color, setColor] = useState(subject?.color_key ?? "indigo");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const op = subject
      ? supabase.from("committee_subjects").update({ name, icon_key: icon, color_key: color }).eq("id", subject.id)
      : supabase.from("committee_subjects").insert({ year_id: yearId, name, icon_key: icon, color_key: color });
    const { error } = await op;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(subject ? "Subject updated" : "Subject added");
    onSaved();
  }

  return (
    <div className="space-y-3">
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biochemistry" /></Field>
      <Field label="Icon"><PickGrid options={ICON_KEYS} value={icon} onChange={setIcon} renderIcon /></Field>
      <Field label="Color"><PickGrid options={COLOR_KEYS} value={color} onChange={setColor} renderSwatch /></Field>
      <button onClick={save} disabled={saving} className="btn-primary"><Save size={14} /> Save</button>
    </div>
  );
}

// ============== CATEGORIES ==============
function CategoriesPanel({ subjectId, categoryId, onSelect }: { subjectId: string | null; categoryId: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const { data: cats } = useQuery({
    queryKey: ["admin-committee-categories", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("committee_categories").select("*").eq("subject_id", subjectId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  async function add() {
    if (!name.trim() || !subjectId) { toast.error("Name is required"); return; }
    const { error } = await supabase.from("committee_categories").insert({ subject_id: subjectId, name, sort_order: (cats?.length ?? 0) + 1 });
    if (error) { toast.error(error.message); return; }
    toast.success("Category added");
    setName(""); setAdding(false);
    qc.invalidateQueries({ queryKey: ["admin-committee-categories", subjectId] });
  }

  async function del(id: string) {
    if (!confirm("Delete category and its resources?")) return;
    const { error } = await supabase.from("committee_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Category deleted");
    qc.invalidateQueries({ queryKey: ["admin-committee-categories", subjectId] });
  }

  return (
    <Section
      title="Categories"
      action={subjectId ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
          <Plus size={14} /> Add
        </button>
      ) : null}
    >
      {!subjectId && <p className="text-xs text-slate-400">Pick a subject first.</p>}
      {cats?.map((c) => (
        <div
          key={c.id}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl ${categoryId === c.id ? "bg-indigo-50 ring-2 ring-indigo-300" : "hover:bg-slate-50"}`}
        >
          <button onClick={() => onSelect(c.id)} className="font-semibold text-sm flex-1 text-left">{c.name}</button>
          <button onClick={() => del(c.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
        </div>
      ))}
      {adding && (
        <Modal onClose={() => setAdding(false)} title="Add category">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Archive, Books, CVS" /></Field>
          <button onClick={add} className="btn-primary mt-3"><Save size={14} /> Save</button>
        </Modal>
      )}
    </Section>
  );
}

// ============== RESOURCES ==============
function ResourcesPanel({ categoryId }: { categoryId: string | null }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);

  const { data: res } = useQuery({
    queryKey: ["admin-committee-resources", categoryId],
    enabled: !!categoryId,
    queryFn: async () => {
      const { data, error } = await supabase.from("committee_resources").select("*").eq("category_id", categoryId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Resource[];
    },
  });

  async function del(id: string) {
    if (!confirm("Delete resource?")) return;
    const { error } = await supabase.from("committee_resources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Resource deleted");
    qc.invalidateQueries({ queryKey: ["admin-committee-resources", categoryId] });
  }

  const top = res?.filter((r) => !r.parent_resource_id) ?? [];

  return (
    <Section
      title="Resources"
      action={categoryId ? (
        <div className="flex items-center gap-3">
        <button onClick={() => setLinking(true)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
          <Link2 size={14} /> Existing
        </button>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
          <Plus size={14} /> Add
        </button>
        </div>
      ) : null}
    >
      {!categoryId && <p className="text-xs text-slate-400">Pick a category first.</p>}
      {top.map((r) => (
        <div key={r.id} className="px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 w-14 flex items-center gap-1">
            {r.kind === "video" ? <Video size={12} /> : null}
            {r.kind}
          </span>
          <span className="font-semibold text-sm flex-1 truncate">{r.title}</span>
          <button onClick={() => del(r.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
        </div>
      ))}
      {adding && categoryId && (
        <Modal onClose={() => setAdding(false)} title="Add resource">
          <ResourceEditor
            categoryId={categoryId}
            folders={top.filter((r) => r.kind === "folder")}
            onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["admin-committee-resources", categoryId] }); }}
          />
        </Modal>
      )}
      {linking && categoryId && (
        <ExistingFilePicker
          categoryId={categoryId}
          nextSort={(res?.length ?? 0) + 1}
          onClose={() => setLinking(false)}
          onSaved={() => { setLinking(false); qc.invalidateQueries({ queryKey: ["admin-committee-resources", categoryId] }); }}
        />
      )}
    </Section>
  );
}

function ResourceEditor({ categoryId, folders, onSaved }: { categoryId: string; folders: Resource[]; onSaved: () => void }) {
  const [kind, setKind] = useState<"pdf" | "link" | "folder" | "video">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (kind === "link" && !url.trim()) { toast.error("URL is required"); return; }
    if (kind === "video" && !url.trim() && !file) { toast.error("Provide a video URL or upload a file"); return; }
    if ((kind === "pdf" || kind === "video") && !file && !url.trim()) { toast.error("Pick a file or provide a URL"); return; }
    if (file && file.size > 1024 * 1024 * 1024) { toast.error("File is over 1 GB"); return; }
    setSaving(true);
    let drive: Awaited<ReturnType<typeof uploadFileToDrive>> | null = null;
    if ((kind === "pdf" || kind === "video") && file) {
      try {
        drive = await uploadFileToDrive(file, { categoryId, fileName: file.name });
      } catch (e: any) {
        toast.error(e?.message ?? "Upload to Google Drive failed");
        setSaving(false);
        return;
      }
    }
    const { error } = await (supabase.from("committee_resources") as any).insert({
      category_id: categoryId,
      parent_resource_id: parentId || null,
      title,
      kind,
      file_path: null,
      storage_provider: drive ? "drive" : "lovable",
      drive_file_id: drive?.fileId ?? null,
      drive_web_link: drive?.webViewLink ?? null,
      drive_download_link: drive?.downloadLink ?? null,
      file_size: drive?.size ?? null,
      url: (kind === "link" || kind === "video") ? (url.trim() || null) : null,
      description: description || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Resource added");
    onSaved();
  }

  return (
    <div className="space-y-3">
      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {(["link", "pdf", "video", "folder"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold ${kind === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {k === "video" ? "Video" : k.toUpperCase()}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description (optional)"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {(kind === "link" || kind === "video") && <Field label={kind === "video" ? "Video URL (optional if uploading)" : "URL"}><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "video" ? "YouTube, Drive, or any video link" : "https://..."} /></Field>}
      {(kind === "pdf" || kind === "video") && (
        <Field label={kind === "video" ? "Video file" : "PDF file"}>
          <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50">
            <Upload size={16} />
            <span className="text-sm">{file ? file.name : "Click to upload"}</span>
            <input type="file" accept={kind === "video" ? "video/*" : "application/pdf,*"} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
      )}
      {kind !== "folder" && folders.length > 0 && (
        <Field label="Inside folder (optional)">
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Top level —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </Field>
      )}
      <button onClick={save} disabled={saving} className="btn-primary"><Save size={14} /> Save</button>
    </div>
  );
}

// ============== shared ==============
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function PickGrid({
  options,
  value,
  onChange,
  renderIcon,
  renderSwatch,
}: {
  options: readonly string[] | string[];
  value: string;
  onChange: (v: string) => void;
  renderIcon?: boolean;
  renderSwatch?: boolean;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto p-1 border border-slate-200 rounded-xl">
      {options.map((o) => {
        const Icon = renderIcon ? iconOf(o) : null;
        const c = renderSwatch ? colorOf(o) : null;
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            title={o}
            className={`h-10 grid place-items-center rounded-lg text-[10px] font-semibold ${active ? "ring-2 ring-indigo-500" : ""} ${c ? `bg-gradient-to-br ${c.from} ${c.to} text-white` : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {Icon ? <Icon size={16} /> : c ? "" : o.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

function MembersPanel() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: members } = useQuery({
    queryKey: ["admin-committee-members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_committee_members");
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; username: string; full_name: string; email: string }>;
    },
  });

  async function grant() {
    if (!username.trim()) return toast.error("Username required");
    setBusy(true);
    const { error } = await supabase.rpc("admin_grant_committee_role", { _username: username.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Granted committee role to ${username}`);
    setUsername("");
    qc.invalidateQueries({ queryKey: ["admin-committee-members"] });
  }

  async function revoke(uname: string) {
    if (!confirm(`Remove ${uname} from لجنة?`)) return;
    const { error } = await supabase.rpc("admin_revoke_committee_role", { _username: uname });
    if (error) return toast.error(error.message);
    toast.success("Revoked");
    qc.invalidateQueries({ queryKey: ["admin-committee-members"] });
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-black text-lg">عضو في اللجنة — Committee members</h2>
          <p className="text-xs text-slate-500 mt-0.5">These users can add and remove subjects, folders, files and books.</p>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          className="input flex-1"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") grant(); }}
        />
        <button onClick={grant} disabled={busy} className="btn-primary"><Plus size={14} /> Add member</button>
      </div>
      <div className="space-y-2">
        {(members ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No committee members yet.</p>
        ) : members?.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
            <span className="grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 via-pink-500 to-orange-500 text-white text-xs font-black">
              {(m.full_name || m.username).charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{m.full_name || m.username}</div>
              <div className="text-xs text-slate-500 truncate">@{m.username} · {m.email}</div>
            </div>
            <button onClick={() => revoke(m.username)} className="text-slate-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        .input { padding:.5rem .75rem; border:1px solid rgb(226 232 240); border-radius:.625rem; font-size:.875rem; }
        .input:focus { outline:none; border-color:rgb(99 102 241); box-shadow:0 0 0 3px rgb(99 102 241 / .15); }
        .btn-primary { display:inline-flex; align-items:center; gap:.375rem; padding:.5rem 1rem; background:rgb(79 70 229); color:white; border-radius:.625rem; font-weight:700; font-size:.875rem; }
        .btn-primary:hover { background:rgb(67 56 202); }
        .btn-primary:disabled { opacity:.5; }
      `}</style>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (

    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-4">{title}</h3>
        {children}
      </div>
      <style>{`
        .input { width:100%; padding:.5rem .75rem; border:1px solid rgb(226 232 240); border-radius:.625rem; font-size:.875rem; }
        .input:focus { outline:none; border-color:rgb(99 102 241); box-shadow:0 0 0 3px rgb(99 102 241 / .15); }
        .btn-primary { display:inline-flex; align-items:center; gap:.375rem; padding:.5rem 1rem; background:rgb(79 70 229); color:white; border-radius:.625rem; font-weight:700; font-size:.875rem; }
        .btn-primary:hover { background:rgb(67 56 202); }
        .btn-primary:disabled { opacity:.5; }
      `}</style>
    </div>
  );
}
