import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Languages, Loader2, Upload, X, CheckCircle2, AlertCircle, FileText, ImageIcon, Type } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { importGermanPairs } from "@/lib/german-import.functions";
import { loadPdfForRender, renderPageToJpegBase64, clearPdfRenderCache } from "@/lib/pdf-page-render";

type Mode = "pdf" | "imagepdf" | "photos" | "text";
type Provider = "lovable" | "gemini";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return bytesToBase64(buf);
}

export function GermanImportButton({
  subjectId,
  onCreated,
}: {
  subjectId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!subjectId}
        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:shadow-rose-500/40 disabled:opacity-40"
        title={subjectId ? "Import German → English pairs" : "Pick a subject first"}
      >
        <Languages className="w-4 h-4" /> Deutsch
      </button>
      {open && (
        <GermanModal
          subjectId={subjectId}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

function GermanModal({
  subjectId,
  onClose,
  onCreated,
}: {
  subjectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const importFn = useServerFn(importGermanPairs);

  const [mode, setMode] = useState<Mode>("pdf");
  const [provider, setProvider] = useState<Provider>("lovable");
  const [pdf, setPdf] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total: number;
    added: number;
    failed: number;
    items: { german: string; english: string; status: "added" | "failed"; error?: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  async function pdfToImages(file: File): Promise<{ base64: string; mimeType: string }[]> {
    // Validate page count via pdf-lib
    const buf = await file.arrayBuffer();
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const numPages = doc.getPageCount();
    if (numPages === 0) throw new Error("PDF has no pages.");
    if (numPages > 20) throw new Error(`Image PDF can have at most 20 pages (got ${numPages}). Split it.`);
    clearPdfRenderCache();
    const renderDoc = await loadPdfForRender(file);
    const out: { base64: string; mimeType: string }[] = [];
    for (let p = 1; p <= numPages; p++) {
      const b64 = await renderPageToJpegBase64(renderDoc, p, { targetWidth: 1200, quality: 0.72 });
      out.push({ base64: b64, mimeType: "image/jpeg" });
    }
    return out;
  }

  async function run() {
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      // For image-based sources we send in batches of 3 images to keep payloads
      // small and avoid provider timeouts on scanned PDFs.
      const BATCH = 3;
      const runOnce = async (source: any) => {
        return await importFn({
          data: { subjectId, source, provider, hint: hint.trim() || undefined },
        });
      };

      if (mode === "pdf") {
        if (!pdf) throw new Error("Pick a PDF.");
        const source = { kind: "pdf", pdfBase64: await fileToBase64(pdf) };
        const res = await runOnce(source);
        setResult(res as any);
        if ((res as any).added > 0) onCreated();
      } else if (mode === "text") {
        if (text.trim().length < 2) throw new Error("Paste some text.");
        const res = await runOnce({ kind: "text", text });
        setResult(res as any);
        if ((res as any).added > 0) onCreated();
      } else {
        // imagepdf or photos — always image batching
        let imgs: { base64: string; mimeType: string }[];
        if (mode === "imagepdf") {
          if (!pdf) throw new Error("Pick an image PDF.");
          imgs = await pdfToImages(pdf);
        } else {
          if (!images.length) throw new Error("Pick at least one image.");
          imgs = await Promise.all(
            images.map(async (f) => ({
              base64: await fileToBase64(f),
              mimeType: f.type || "image/jpeg",
            })),
          );
        }
        const merged = { total: 0, added: 0, failed: 0, items: [] as any[] };
        const errors: string[] = [];
        for (let i = 0; i < imgs.length; i += BATCH) {
          const chunk = imgs.slice(i, i + BATCH);
          try {
            const res: any = await runOnce({ kind: "photos", images: chunk });
            merged.total += res.total ?? 0;
            merged.added += res.added ?? 0;
            merged.failed += res.failed ?? 0;
            merged.items.push(...(res.items ?? []));
            if (res.added > 0) onCreated();
          } catch (e: any) {
            errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${e?.message ?? String(e)}`);
          }
        }
        setResult(merged);
        if (errors.length && !merged.added) throw new Error(errors.join(" | "));
        if (errors.length) setErr(errors.join(" | "));
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-rose-500/30 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 grid place-items-center rounded-full bg-gradient-to-br from-amber-400 to-rose-600 shadow-lg shadow-rose-500/30">
              <Languages className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.32em] text-rose-300 uppercase">Jarvis · Deutsch</p>
              <h2 className="text-xl font-bold text-white">Import German → English</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Source</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { id: "pdf", label: "PDF (text)", icon: FileText },
                { id: "imagepdf", label: "Image PDF (Vision)", icon: ImageIcon },
                { id: "photos", label: "Photos (OCR)", icon: ImageIcon },
                { id: "text", label: "Paste text", icon: Type },
              ] as { id: Mode; label: string; icon: any }[]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setMode(opt.id)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${
                    mode === opt.id
                      ? "border-rose-400 bg-rose-500/10 text-rose-200"
                      : "border-white/15 text-white/70 hover:bg-white/5"
                  }`}
                >
                  <opt.icon className="w-4 h-4" /> {opt.label}
                </button>
              ))}
            </div>
          </div>


          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">AI provider</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "lovable", label: "Lovable AI (Gemini 3 Flash)" },
                { id: "gemini", label: "Gemini Flash (your key)" },
              ] as { id: Provider; label: string }[]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setProvider(opt.id)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                    provider === opt.id
                      ? "border-emerald-400 text-emerald-200 bg-emerald-500/10"
                      : "border-white/15 text-white/60 hover:bg-white/5"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {(mode === "pdf" || mode === "imagepdf") && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">
                {mode === "imagepdf" ? "Image PDF (scanned / picture pages, max 10)" : "PDF"}
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-white/15 px-4 py-8 text-sm text-white/70 hover:border-rose-400 hover:bg-rose-500/5"
              >
                {pdf ? (
                  <span className="font-semibold">{pdf.name} · {(pdf.size / 1024).toFixed(1)} KB</span>
                ) : (
                  <span className="flex flex-col items-center gap-2"><Upload className="w-5 h-5" /> Choose a PDF</span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          {mode === "photos" && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Photos (max 10)</p>
              <button
                onClick={() => imgRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-white/15 px-4 py-8 text-sm text-white/70 hover:border-rose-400 hover:bg-rose-500/5"
              >
                {images.length ? (
                  <span className="font-semibold">{images.length} image{images.length > 1 ? "s" : ""} selected</span>
                ) : (
                  <span className="flex flex-col items-center gap-2"><Upload className="w-5 h-5" /> Choose images</span>
                )}
              </button>
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => setImages(Array.from(e.target.files ?? []).slice(0, 10))}
              />
            </div>
          )}

          {mode === "text" && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Paste German + English pairs</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={"die Bank, die Banken — bank\nbitte — please\ndas Büro, die Büros — office"}
                className="w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-rose-400"
              />
            </div>
          )}

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Hint (optional)</p>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. A1 vocab list, focus on travel topics"
              className="w-full rounded-full border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-rose-400"
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {result && (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Pairs" value={result.total} tone="emerald" />
                <Stat label="Added" value={result.added} tone="emerald" />
                <Stat label="Failed" value={result.failed} tone="rose" />
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-white/5 rounded-xl border border-white/5">
                {result.items.map((it, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                    {it.status === "added" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{it.german}</p>
                      <p className="text-white/60 truncate">→ {it.english}</p>
                      {it.error && <p className="text-rose-300 mt-0.5">{it.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Close
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-rose-500/40 disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            {busy ? "Importing…" : "Import pairs"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" }) {
  const color = tone === "emerald" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 py-3">
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] font-bold tracking-widest text-white/50 uppercase">{label}</p>
    </div>
  );
}
