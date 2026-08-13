import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Download, Scissors, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/pdf-slicer")({
  head: () => ({ meta: [{ title: "PDF Slicer · Admin" }] }),
  component: PdfSlicerPage,
});

type Slice = { id: string; name: string; from: string; to: string };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function PdfSlicerPage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [slices, setSlices] = useState<Slice[]>([
    { id: uid(), name: "", from: "", to: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-background" />;

  async function onFileChange(f: File | null) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please choose a PDF file");
      return;
    }
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const doc = await PDFDocument.load(buf);
      setFile(f);
      setPdfBytes(buf);
      setPageCount(doc.getPageCount());
      toast.success(`Loaded ${f.name} · ${doc.getPageCount()} pages`);
    } catch (e: any) {
      toast.error("Could not read PDF: " + (e?.message ?? "unknown"));
    }
  }

  function addSlice() {
    setSlices((s) => [...s, { id: uid(), name: "", from: "", to: "" }]);
  }
  function removeSlice(id: string) {
    setSlices((s) => (s.length === 1 ? s : s.filter((x) => x.id !== id)));
  }
  function updateSlice(id: string, patch: Partial<Slice>) {
    setSlices((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function validateSlices(): { ok: boolean; parsed: Array<{ name: string; from: number; to: number }> } {
    const parsed: Array<{ name: string; from: number; to: number }> = [];
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const from = parseInt(s.from, 10);
      const to = parseInt(s.to, 10);
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        toast.error(`Slice ${i + 1}: enter both From and To`);
        return { ok: false, parsed: [] };
      }
      if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
        toast.error(`Slice ${i + 1}: pages must be between 1 and ${pageCount}`);
        return { ok: false, parsed: [] };
      }
      if (from > to) {
        toast.error(`Slice ${i + 1}: From must be ≤ To`);
        return { ok: false, parsed: [] };
      }
      parsed.push({ name: s.name.trim(), from, to });
    }
    return { ok: true, parsed };
  }

  async function buildSlice(from: number, to: number): Promise<Uint8Array> {
    const src = await PDFDocument.load(pdfBytes!);
    const out = await PDFDocument.create();
    const indices = [];
    for (let p = from - 1; p <= to - 1; p++) indices.push(p);
    const copied = await out.copyPages(src, indices);
    copied.forEach((pg) => out.addPage(pg));
    return out.save();
  }

  function triggerDownload(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function baseName() {
    const n = file?.name ?? "document.pdf";
    return n.replace(/\.pdf$/i, "");
  }

  async function handleDownload() {
    if (!pdfBytes) {
      toast.error("Upload a PDF first");
      return;
    }
    const { ok, parsed } = validateSlices();
    if (!ok) return;

    setBusy(true);
    try {
      if (parsed.length === 1) {
        const s = parsed[0];
        const bytes = await buildSlice(s.from, s.to);
        const name = (s.name || `${baseName()}_p${s.from}-${s.to}`) + ".pdf";
        triggerDownload(bytes, name);
        toast.success("Downloaded slice");
      } else {
        const zip = new JSZip();
        for (let i = 0; i < parsed.length; i++) {
          const s = parsed[i];
          const bytes = await buildSlice(s.from, s.to);
          const name = (s.name || `${baseName()}_p${s.from}-${s.to}`) + ".pdf";
          zip.file(name, bytes);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName()}_slices.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success(`Downloaded ${parsed.length} slices as ZIP`);
      }
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? "unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 md:px-8 py-8 md:py-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
            <Scissors size={20} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">PDF Slicer</h1>
            <p className="text-sm text-muted-foreground">
              Upload a PDF, define page ranges, and download each slice as a separate PDF.
            </p>
          </div>
        </div>

        {/* Upload */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <label className="block text-sm font-bold mb-3">1. Choose a PDF</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => inputRef.current?.click()} variant="outline">
              <Upload size={16} className="mr-2" /> {file ? "Choose another PDF" : "Choose PDF"}
            </Button>
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText size={16} />
                <span className="font-medium text-foreground">{file.name}</span>
                <span>· {pageCount} pages</span>
              </div>
            )}
          </div>
        </section>

        {/* Slices */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <label className="block text-sm font-bold">
              2. Define slices {pageCount > 0 && <span className="text-muted-foreground font-normal">(pages 1–{pageCount})</span>}
            </label>
            <Button onClick={addSlice} size="sm" variant="ghost">
              <Plus size={16} className="mr-1" /> Add slice
            </Button>
          </div>

          <div className="space-y-3">
            {slices.map((s, i) => (
              <div
                key={s.id}
                className="grid grid-cols-12 gap-2 items-center rounded-xl border border-border bg-background p-3"
              >
                <div className="col-span-12 sm:col-span-1 text-xs font-bold text-muted-foreground sm:text-center">
                  #{i + 1}
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    placeholder={`Name (optional) — e.g. Chapter ${i + 1}`}
                    value={s.name}
                    onChange={(e) => updateSlice(s.id, { name: e.target.value })}
                  />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <Input
                    type="number"
                    min={1}
                    max={pageCount || undefined}
                    placeholder="From"
                    value={s.from}
                    onChange={(e) => updateSlice(s.id, { from: e.target.value })}
                  />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <Input
                    type="number"
                    min={1}
                    max={pageCount || undefined}
                    placeholder="To"
                    value={s.to}
                    onChange={(e) => updateSlice(s.id, { to: e.target.value })}
                  />
                </div>
                <div className="col-span-2 sm:col-span-2 flex justify-end">
                  <Button
                    onClick={() => removeSlice(s.id)}
                    size="icon"
                    variant="ghost"
                    disabled={slices.length === 1}
                    aria-label="Remove slice"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Action */}
        <section className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {slices.length === 1
              ? "Single slice will download as one PDF."
              : `${slices.length} slices will download together as a ZIP file.`}
          </p>
          <Button onClick={handleDownload} disabled={busy || !pdfBytes} size="lg">
            {busy ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Building…
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" /> Download
              </>
            )}
          </Button>
        </section>
      </main>
    </div>
  );
}
