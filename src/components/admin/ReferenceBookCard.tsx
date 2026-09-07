import { useEffect, useState } from "react";
import { BookOpen, Check, FileText, Link as LinkIcon, Loader2, Trash2, Upload } from "lucide-react";

type Props = {
  /** the book currently saved on the job (null when off) */
  saved: string | null;
  onSave: (book: string | null) => Promise<void> | void;
  resource?: { kind?: string | null; text?: string | null; url?: string | null; name?: string | null };
  onSaveResource?: (value: { kind: "text" | "link" | "pdf"; text?: string; url?: string; file?: File } | null) => Promise<void> | void;
  disabled?: boolean;
};

/**
 * Optional "answer according to a textbook" control. When off, nothing is sent
 * to Gemini and the tool behaves exactly as before.
 */
export function ReferenceBookCard({ saved, onSave, resource, onSaveResource, disabled }: Props) {
  const [on, setOn] = useState(Boolean(saved));
  const [text, setText] = useState(saved ?? "");
  const [busy, setBusy] = useState(false);
  const [resourceMode, setResourceMode] = useState<"text" | "link" | "pdf">((resource?.kind as any) || "text");
  const [resourceValue, setResourceValue] = useState(resource?.text || resource?.url || "");
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceBusy, setResourceBusy] = useState(false);

  useEffect(() => {
    setOn(Boolean(saved));
    setText(saved ?? "");
  }, [saved]);

  useEffect(() => {
    setResourceMode((resource?.kind as any) || "text");
    setResourceValue(resource?.text || resource?.url || "");
    setResourceFile(null);
  }, [resource?.kind, resource?.text, resource?.url, resource?.name]);

  async function save() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try { await onSave(value); } finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true);
    try { await onSave(null); setText(""); setOn(false); } finally { setBusy(false); }
  }

  async function saveResource() {
    if (!onSaveResource) return;
    setResourceBusy(true);
    try {
      await onSaveResource(resourceMode === "pdf"
        ? { kind: "pdf", file: resourceFile ?? undefined }
        : resourceMode === "link" ? { kind: "link", url: resourceValue.trim() } : { kind: "text", text: resourceValue.trim() });
    } finally { setResourceBusy(false); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <BookOpen size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black">Use a reference textbook</p>
          <p className="text-xs text-muted-foreground">
            Optional — answers and explanations will follow the book you name.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Use a reference textbook"
          disabled={disabled || busy}
          onClick={() => {
            const next = !on;
            setOn(next);
            if (!next && saved) void clear();
          }}
          className={`ml-auto h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`block size-6 rounded-full bg-background shadow transition-transform ${on ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>

      {on && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Robbins & Cotran Pathologic Basis of Disease"
              disabled={disabled || busy}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={disabled || busy || !text.trim() || text.trim() === saved}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Save book
            </button>
          </div>

          {saved ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Check size={14} /> Answers will follow: {saved}
              <button
                type="button"
                onClick={() => void clear()}
                disabled={disabled || busy}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 font-bold text-destructive-foreground disabled:opacity-40"
              >
                <Trash2 size={13} /> Remove book
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Type the book, then press <strong>Save book</strong> to switch it on.</p>
          )}
        </div>
      )}
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><FileText size={16} /></span>
          <div><p className="text-sm font-black">Answer from a resource</p><p className="text-xs text-muted-foreground">Optional PDF, pasted text, or public link.</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["text", "link", "pdf"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setResourceMode(mode)} disabled={disabled || resourceBusy}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${resourceMode === mode ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
              {mode === "pdf" ? <Upload size={13} /> : mode === "link" ? <LinkIcon size={13} /> : <FileText size={13} />}
              {mode === "text" ? "Paste text" : mode === "link" ? "Public link" : "Upload PDF"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {resourceMode === "text" ? (
            <textarea value={resourceValue} onChange={(e) => setResourceValue(e.target.value)} maxLength={60000} rows={4}
              placeholder="Paste the relevant chapter, notes, or answer key…" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          ) : resourceMode === "link" ? (
            <input value={resourceValue} onChange={(e) => setResourceValue(e.target.value)} placeholder="https://…"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          ) : (
            <label className="min-w-0 flex-1 cursor-pointer rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-sm font-bold">
              {resourceFile?.name || resource?.name || "Choose a resource PDF (max 20 MB)"}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setResourceFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <button type="button" onClick={() => void saveResource()} disabled={disabled || resourceBusy || (resourceMode === "pdf" ? !resourceFile : !resourceValue.trim())}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">
            {resourceBusy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Save resource
          </button>
        </div>
        {resource?.kind && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <Check size={14} /> Resource active: {resource.kind === "pdf" ? resource.name : resource.kind === "link" ? resource.url : "pasted text"}
            <button type="button" onClick={async () => { if (!onSaveResource) return; setResourceBusy(true); try { await onSaveResource(null); } finally { setResourceBusy(false); } }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 font-bold text-destructive-foreground"><Trash2 size={13} /> Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}
