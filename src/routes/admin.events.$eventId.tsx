import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Upload, Users, MessageSquare, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";
import { MEMBERS_BUCKET } from "@/lib/members";
import {
  EVENT_ACCENTS,
  accentColor,
  eventPartsQuery,
  eventsQuery,
  slugify,
  type EventContact,
  type EventMember,
  type EventSection,
  type SiteEvent,
} from "@/lib/events";

export const Route = createFileRoute("/admin/events/$eventId")({
  head: () => ({
    meta: [
      { title: "Edit event — AquaQBank Admin" },
      { name: "description", content: "Edit an event page: sections, team members and group links." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditEventPage,
});

const db = (t: string) => (supabase.from as any)(t);
const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary";
const card = "rounded-2xl border border-border bg-card p-5";

function EditEventPage() {
  const { eventId } = Route.useParams();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: events } = useQuery({ ...eventsQuery, enabled: isAdmin });
  const { data: parts } = useQuery({ ...eventPartsQuery(eventId), enabled: isAdmin });
  const event = (events ?? []).find((e) => e.id === eventId);
  const [draft, setDraft] = useState<SiteEvent | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) guardRedirect(navigate);
  }, [loading, isAdmin, navigate]);
  useEffect(() => {
    if (event && !draft) setDraft(event);
  }, [event, draft]);

  if (loading || !isAdmin) return <div className="min-h-screen bg-muted/40" />;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["event-parts", eventId] });
    qc.invalidateQueries({ queryKey: ["event"] });
  };

  async function saveEvent() {
    if (!draft) return;
    const { id, ...values } = draft;
    values.slug = slugify(values.slug || values.title_en || values.title_ar);
    const { error } = await db("events").update(values).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    refresh();
  }

  async function addRow(table: string, values: Record<string, unknown>) {
    const { error } = await db(table).insert({ event_id: eventId, ...values });
    if (error) return toast.error(error.message);
    refresh();
  }
  async function patchRow(table: string, id: string, values: Record<string, unknown>) {
    const { error } = await db(table).update(values).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function deleteRow(table: string, id: string) {
    const { error } = await db(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function uploadImage(file: File, prefix: string): Promise<string | null> {
    const path = `events/${eventId}/${prefix}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from(MEMBERS_BUCKET).upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return path;
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-5 pt-28 pb-20">
        <Link to="/admin/events" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> All events
        </Link>

        {draft && (
          <section className={card}>
            <h2 className="mb-4 text-xl font-black">Event details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title (English)">
                <input className={input} value={draft.title_en} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })} />
              </Field>
              <Field label="Title (Arabic)">
                <input dir="rtl" className={input} value={draft.title_ar} onChange={(e) => setDraft({ ...draft, title_ar: e.target.value })} />
              </Field>
              <Field label="Subtitle (English)">
                <input className={input} value={draft.subtitle_en} onChange={(e) => setDraft({ ...draft, subtitle_en: e.target.value })} />
              </Field>
              <Field label="Subtitle (Arabic)">
                <input dir="rtl" className={input} value={draft.subtitle_ar} onChange={(e) => setDraft({ ...draft, subtitle_ar: e.target.value })} />
              </Field>
              <Field label="Page address">
                <input className={input} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
              </Field>
              <Field label="Who can see it">
                <select className={input} value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as SiteEvent["visibility"] })}>
                  <option value="public">Everyone, signed in or not</option>
                  <option value="auth">Signed-in students only</option>
                </select>
              </Field>
              <Field label="Where the button shows">
                <select className={input} value={draft.button_placement} onChange={(e) => setDraft({ ...draft, button_placement: e.target.value as SiteEvent["button_placement"] })}>
                  <option value="home">Home page</option>
                  <option value="header">Header</option>
                  <option value="both">Home page and header</option>
                  <option value="hidden">Nowhere (link only)</option>
                </select>
              </Field>
              <Field label="Button look">
                <select className={input} value={draft.button_style} onChange={(e) => setDraft({ ...draft, button_style: e.target.value as SiteEvent["button_style"] })}>
                  <option value="hero">Large banner</option>
                  <option value="solid">Solid</option>
                  <option value="gradient">Gradient</option>
                  <option value="outline">Outline</option>
                </select>
              </Field>
              <Field label="Colour">
                <div className="flex flex-wrap gap-2">
                  {EVENT_ACCENTS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setDraft({ ...draft, accent: a })}
                      className={`h-8 w-8 rounded-full ${draft.accent === a ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                      style={{ background: accentColor[a] }}
                      aria-label={a}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Page switch">
                <button
                  onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                  className={`rounded-lg px-4 py-2 text-sm font-black ${draft.enabled ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
                >
                  {draft.enabled ? "On" : "Off"}
                </button>
              </Field>
            </div>
            <button onClick={saveEvent} className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground">
              Save
            </button>
          </section>
        )}

        <section className={card}>
          <h2 className="mb-4 inline-flex items-center gap-2 text-xl font-black">
            <LayoutList size={18} /> Information sections
          </h2>
          <div className="space-y-4">
            {(parts?.sections ?? []).map((s: EventSection) => (
              <div key={s.id} className="rounded-xl border border-border p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={input} defaultValue={s.title_en} placeholder="Title (English)" onBlur={(e) => patchRow("event_sections", s.id, { title_en: e.target.value })} />
                  <input dir="rtl" className={input} defaultValue={s.title_ar} placeholder="العنوان" onBlur={(e) => patchRow("event_sections", s.id, { title_ar: e.target.value })} />
                  <textarea rows={4} className={input} defaultValue={s.body_en} placeholder="Text (English)" onBlur={(e) => patchRow("event_sections", s.id, { body_en: e.target.value })} />
                  <textarea rows={4} dir="rtl" className={input} defaultValue={s.body_ar} placeholder="النص" onBlur={(e) => patchRow("event_sections", s.id, { body_ar: e.target.value })} />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" defaultChecked={s.visible} onChange={(e) => patchRow("event_sections", s.id, { visible: e.target.checked })} /> Visible
                  </label>
                  <input type="number" defaultValue={s.sort_order} className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm" onBlur={(e) => patchRow("event_sections", s.id, { sort_order: Number(e.target.value) })} />
                  <button onClick={() => deleteRow("event_sections", s.id)} className="ms-auto text-muted-foreground hover:text-destructive" aria-label="Delete section">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => addRow("event_sections", { sort_order: (parts?.sections.length ?? 0) + 1 })} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold">
            <Plus size={15} /> Add section
          </button>
        </section>

        <section className={card}>
          <h2 className="mb-4 inline-flex items-center gap-2 text-xl font-black">
            <Users size={18} /> Event team
          </h2>
          <div className="space-y-4">
            {(parts?.members ?? []).map((m: EventMember) => (
              <div key={m.id} className="rounded-xl border border-border p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={input} defaultValue={m.name_en} placeholder="Name (English)" onBlur={(e) => patchRow("event_members", m.id, { name_en: e.target.value })} />
                  <input dir="rtl" className={input} defaultValue={m.name_ar} placeholder="الاسم" onBlur={(e) => patchRow("event_members", m.id, { name_ar: e.target.value })} />
                  <input className={input} defaultValue={m.role_label} placeholder="Role (e.g. Coordinator)" onBlur={(e) => patchRow("event_members", m.id, { role_label: e.target.value })} />
                  <select className={input} defaultValue={m.photo_fit} onChange={(e) => patchRow("event_members", m.id, { photo_fit: e.target.value })}>
                    <option value="cover">Photo — fill</option>
                    <option value="contain">Photo — fit</option>
                    <option value="none">No photo</option>
                  </select>
                  <input className={input} defaultValue={m.description_en} placeholder="Short note (English)" onBlur={(e) => patchRow("event_members", m.id, { description_en: e.target.value })} />
                  <input dir="rtl" className={input} defaultValue={m.description_ar} placeholder="نبذة" onBlur={(e) => patchRow("event_members", m.id, { description_ar: e.target.value })} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" defaultChecked={m.is_head} onChange={(e) => patchRow("event_members", m.id, { is_head: e.target.checked })} /> Head of the event
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold">
                    <Upload size={13} /> Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const path = await uploadImage(f, "member");
                        if (path) patchRow("event_members", m.id, { photo_url: path });
                      }}
                    />
                  </label>
                  {m.photo_url && (
                    <button onClick={() => patchRow("event_members", m.id, { photo_url: "" })} className="text-xs text-muted-foreground hover:text-destructive">
                      Remove photo
                    </button>
                  )}
                  <button onClick={() => deleteRow("event_members", m.id)} className="ms-auto text-muted-foreground hover:text-destructive" aria-label="Delete member">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => addRow("event_members", { sort_order: (parts?.members.length ?? 0) + 1 })} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold">
            <Plus size={15} /> Add person
          </button>
        </section>

        <section className={card}>
          <h2 className="mb-4 inline-flex items-center gap-2 text-xl font-black">
            <MessageSquare size={18} /> Join the group / contact us
          </h2>
          <div className="space-y-4">
            {(parts?.contacts ?? []).map((c: EventContact) => (
              <div key={c.id} className="rounded-xl border border-border p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className={input} defaultValue={c.kind} onChange={(e) => patchRow("event_contacts", c.id, { kind: e.target.value })}>
                    <option value="join">Join the group (with QR)</option>
                    <option value="contact">Contact us (button only)</option>
                  </select>
                  <input className={input} defaultValue={c.button_label} placeholder="Button label" onBlur={(e) => patchRow("event_contacts", c.id, { button_label: e.target.value })} />
                  <input className={input} defaultValue={c.title_en} placeholder="Title (English)" onBlur={(e) => patchRow("event_contacts", c.id, { title_en: e.target.value })} />
                  <input dir="rtl" className={input} defaultValue={c.title_ar} placeholder="العنوان" onBlur={(e) => patchRow("event_contacts", c.id, { title_ar: e.target.value })} />
                  <input className={input} defaultValue={c.note_en} placeholder="Note (English)" onBlur={(e) => patchRow("event_contacts", c.id, { note_en: e.target.value })} />
                  <input dir="rtl" className={input} defaultValue={c.note_ar} placeholder="ملاحظة" onBlur={(e) => patchRow("event_contacts", c.id, { note_ar: e.target.value })} />
                  <input className={`${input} sm:col-span-2`} defaultValue={c.link} placeholder="Link (Telegram, WhatsApp, form…)" onBlur={(e) => patchRow("event_contacts", c.id, { link: e.target.value })} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold">
                    <Upload size={13} /> QR image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const path = await uploadImage(f, "qr");
                        if (path) patchRow("event_contacts", c.id, { qr_url: path });
                      }}
                    />
                  </label>
                  {c.qr_url && (
                    <button onClick={() => patchRow("event_contacts", c.id, { qr_url: "" })} className="text-xs text-muted-foreground hover:text-destructive">
                      Remove QR
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    No QR uploaded? One is generated from the link automatically.
                  </span>
                  <button onClick={() => deleteRow("event_contacts", c.id)} className="ms-auto text-muted-foreground hover:text-destructive" aria-label="Delete contact">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => addRow("event_contacts", { sort_order: (parts?.contacts.length ?? 0) + 1 })} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold">
            <Plus size={15} /> Add group / contact
          </button>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
