import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";
import { COUNTRIES, MEMBERS_BUCKET, flagOf, type Member } from "@/lib/members";

const YEARS = [
  "Preparation Year",
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
  "6th Year",
  "Intern",
  "Graduate",
];

export function MemberForm({
  member,
  founder,
  nextSort,
  onClose,
  onSaved,
}: {
  member: Member | null;
  founder: boolean;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name_en: member?.name_en ?? "",
    name_ar: member?.name_ar ?? "",
    country_code: member?.country_code ?? "JO",
    year_label: member?.year_label ?? (founder ? "" : "1st Year"),
    role_label: member?.role_label ?? "",
    description_en: member?.description_en ?? "",
    description_ar: member?.description_ar ?? "",
    photo_url: member?.photo_url ?? "",
    photo_fit: member?.photo_fit ?? "cover",
    accent: member?.accent ?? ((nextSort % 5) + 1),
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function upload(file: File) {
    setUploading(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${founder ? "founders" : "team"}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(MEMBERS_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    setUploading(false);
    if (error) return toast.error(error.message);
    set({ photo_url: path });
    toast.success("Photo uploaded");
  }

  async function save() {
    if (!form.name_en.trim() && !form.name_ar.trim()) return toast.error("Name required");
    setSaving(true);
    const country = COUNTRIES.find((c) => c.code === form.country_code);
    const payload = {
      ...form,
      country_label: country?.en ?? form.country_code,
      is_founder: founder,
    };
    const op = member
      ? (supabase.from as any)("committee_members").update(payload).eq("id", member.id)
      : (supabase.from as any)("committee_members").insert({ ...payload, sort_order: nextSort });
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(member ? "Saved" : "Member added");
    onSaved();
  }

  return (
    <CommitteeDialog title={member ? "Edit member" : founder ? "Add founder" : "Add member"} onClose={onClose}>
      <Field label="Photo">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:bg-muted"
            disabled={uploading}
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {form.photo_url ? "Replace photo" : "Upload photo"}
          </button>
          {form.photo_url && (
            <>
              <span className="truncate text-xs text-muted-foreground">{form.photo_url.split("/").pop()}</span>
              <button
                type="button"
                onClick={() => set({ photo_url: "" })}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:text-destructive"
              >
                Remove photo
              </button>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
      </Field>

      <Field label="Photo framing">
        <div className="flex gap-2">
          {[
            { v: "cover", label: "Fill (crop to square)" },
            { v: "contain", label: "Fit (show whole image)" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => set({ photo_fit: o.v })}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                form.photo_fit === o.v
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Name (English)">
        <input className={inputCls} value={form.name_en} onChange={(e) => set({ name_en: e.target.value })} />
      </Field>
      <Field label="الاسم بالعربية">
        <input dir="rtl" className={inputCls} value={form.name_ar} onChange={(e) => set({ name_ar: e.target.value })} />
      </Field>

      <Field label="Country">
        <select
          className={inputCls}
          value={form.country_code}
          onChange={(e) => set({ country_code: e.target.value })}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {flagOf(c.code)} {c.en}
            </option>
          ))}
        </select>
      </Field>

      {!founder && (
        <Field label="Year">
          <select className={inputCls} value={form.year_label} onChange={(e) => set({ year_label: e.target.value })}>
            <option value="">—</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Badge (optional)">
        <input
          className={inputCls}
          placeholder="Lead, Founder, Coordinator…"
          value={form.role_label}
          onChange={(e) => set({ role_label: e.target.value })}
        />
      </Field>

      <Field label="Description (English)">
        <textarea
          className={`${inputCls} min-h-[80px]`}
          value={form.description_en}
          onChange={(e) => set({ description_en: e.target.value })}
        />
      </Field>
      <Field label="الوصف بالعربية">
        <textarea
          dir="rtl"
          className={`${inputCls} min-h-[80px]`}
          value={form.description_ar}
          onChange={(e) => set({ description_ar: e.target.value })}
        />
      </Field>

      <Field label="Card colour">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ accent: n })}
              aria-label={`Colour ${n}`}
              className={`h-8 w-8 rounded-full border-2 ${form.accent === n ? "ring-2 ring-offset-2 ring-offset-card" : ""}`}
              style={{ background: `var(--chart-${n})`, borderColor: "var(--border)" }}
            />
          ))}
        </div>
      </Field>

      <button type="button" onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving && <Loader2 size={15} className="animate-spin" />} Save
      </button>
    </CommitteeDialog>
  );
}