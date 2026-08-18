import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MEMBERS_BUCKET, resolveMemberPhoto } from "@/lib/members";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { CommitteeDialog, Field, inputCls, primaryBtn, primaryBtnStyle } from "@/components/committee/Dialog";

/** Fallback QR generated from the link itself, until an image is uploaded. */
const fallbackQr = (link: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(link)}`;

export function TelegramQrCard({ canManage }: { canManage?: boolean }) {
  const settings = useSiteSettings() as any;
  const link: string = settings.committee_qr_link || "https://t.me/aquaqbank";
  const path: string | null = settings.committee_qr_path || null;
  const [img, setImg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!path) {
      setImg(null);
      return;
    }
    resolveMemberPhoto(path).then((u) => alive && setImg(u));
    return () => {
      alive = false;
    };
  }, [path]);

  const src = img ?? fallbackQr(link);

  return (
    <section className="mt-10 flex justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
          Telegram channel
        </p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-4 block w-40 rounded-xl border border-border bg-background p-2 transition-transform hover:-translate-y-0.5"
        >
          <img
            src={src}
            alt="Scan to open our Telegram channel"
            loading="lazy"
            className="h-36 w-full rounded-lg object-contain"
          />
        </a>
        <p className="mt-3 text-sm text-muted-foreground">
          Scan the code, or tap the button to join the channel.
        </p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground hover:opacity-90"
        >
          <Send size={15} /> Open Telegram
        </a>

        {canManage && (
          <div className="mt-4 flex justify-center gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil size={13} /> Edit QR &amp; link
            </button>
          </div>
        )}
      </div>

      {editing && <QrDialog link={link} path={path} onClose={() => setEditing(false)} />}
    </section>
  );
}

function QrDialog({
  link,
  path,
  onClose,
}: {
  link: string;
  path: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(link);
  const [stored, setStored] = useState<string | null>(path);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const p = `qr/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(MEMBERS_BUCKET)
      .upload(p, file, { upsert: true, contentType: file.type || undefined });
    setUploading(false);
    if (error) return toast.error(error.message || "Upload failed");
    setStored(p);
    toast.success("QR uploaded — press Save to apply");
  }

  async function save() {
    setSaving(true);
    const link = url.trim();
    const { error } = await (supabase.rpc as any)("set_committee_qr", {
      _link: link,
      _path: stored,
    });
    setSaving(false);
    if (error) {
      return toast.error(
        /not allowed/i.test(error.message)
          ? "You don't have permission to change the QR card."
          : error.message,
      );
    }
    // Update the cached settings straight away so the card shows the new
    // link/image without waiting for a refetch.
    qc.setQueryData(["site-settings"], (old: any) => ({
      ...(old ?? {}),
      committee_qr_link: link || null,
      committee_qr_path: stored,
    }));
    qc.invalidateQueries({ queryKey: ["site-settings"] });
    toast.success("Saved");
    onClose();
  }

  return (
    <CommitteeDialog title="Telegram QR" onClose={onClose}>
      <Field label="Telegram link">
        <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://t.me/…" />
      </Field>

      <Field label="QR image">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:bg-muted"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {stored ? "Replace image" : "Upload image"}
          </button>
          {stored && (
            <button
              type="button"
              onClick={() => setStored(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} /> Remove
            </button>
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
        <p className="mt-2 text-xs text-muted-foreground">
          With no image uploaded, a QR code is generated automatically from the link above.
        </p>
      </Field>

      <button type="button" onClick={save} disabled={saving} className={primaryBtn} style={primaryBtnStyle}>
        {saving && <Loader2 size={15} className="animate-spin" />} Save
      </button>
    </CommitteeDialog>
  );
}