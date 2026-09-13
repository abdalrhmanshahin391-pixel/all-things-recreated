import { useState, useRef } from "react";
import { KeyRound, Trash2, Loader2, ListOrdered, Sparkles, Upload, FileText, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

function blobToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const b64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type Props = {
  totalQuestions: number;
  answeredQuestions: number;
  detectedCount?: number;
  onApplyKey: (text: string) => Promise<{ totalParsed: number; appliedCount: number }>;
  onUploadPdfKey?: (pdfBase64: string) => Promise<{ totalParsed: number; appliedCount: number }>;
  onApplyDetectedAnswers?: () => Promise<{ appliedCount: number }>;
  onClearAnswers: () => Promise<void>;
  disabled?: boolean;
};

export function AnswerKeyCard({
  totalQuestions,
  answeredQuestions,
  detectedCount = 0,
  onApplyKey,
  onUploadPdfKey,
  onApplyDetectedAnswers,
  onClearAnswers,
  disabled,
}: Props) {
  const [open, setOpen] = useState(answeredQuestions > 0 || detectedCount > 0);
  const [mode, setMode] = useState<"text" | "pdf">("text");
  const [text, setText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissDetected, setDismissDetected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleApplyText() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Please paste or type the answer key first.");
      return;
    }
    setBusy(true);
    try {
      const res = await onApplyKey(trimmed);
      toast.success(`Applied ${res.appliedCount} answer(s) from ${res.totalParsed} parsed item(s)`);
      setText("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply answer key");
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyPdf() {
    if (!pdfFile || !onUploadPdfKey) {
      toast.error("Please select a PDF file first.");
      return;
    }
    if (pdfFile.size > 20_000_000) {
      toast.error("PDF size must be 20 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const b64 = await blobToBase64(pdfFile);
      const res = await onUploadPdfKey(b64);
      toast.success(`Gemini Vision applied ${res.appliedCount} answer(s) from ${res.totalParsed} parsed item(s)`);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast.error(e?.message || "Failed to extract answers from PDF");
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyDetected() {
    if (!onApplyDetectedAnswers) return;
    setBusy(true);
    try {
      const res = await onApplyDetectedAnswers();
      toast.success(`Applied ${res.appliedCount} answer(s) detected from the question PDF`);
      setDismissDetected(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply detected answers");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!window.confirm("Are you sure you want to clear all provided answers for this job?")) return;
    setBusy(true);
    try {
      await onClearAnswers();
      toast.success("Cleared all provided answers");
    } catch (e: any) {
      toast.error(e?.message || "Failed to clear answers");
    } finally {
      setBusy(false);
    }
  }

  const showDetectedBanner = detectedCount > 0 && !dismissDetected && onApplyDetectedAnswers;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <KeyRound size={17} />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-black">Answer Key / مفتاح الإجابات</p>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {answeredQuestions} / {totalQuestions} answered
              </span>
              {detectedCount > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  {detectedCount} detected in PDF
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Optional: Provide known answers via text, PDF upload, or detected paper choices. Gemini will strictly use them.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={open}
          aria-label="Toggle answer key input"
          disabled={disabled || busy}
          onClick={() => setOpen(!open)}
          className={`h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            open ? "bg-emerald-600" : "bg-muted"
          }`}
        >
          <span
            className={`block size-6 rounded-full bg-background shadow transition-transform ${
              open ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {open && (
        <div className="pt-2 border-t border-border/60 space-y-3">
          {/* Detected PDF answers notification banner */}
          {showDetectedBanner && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="text-xs">
                <p className="font-bold text-amber-800 dark:text-amber-300">
                  PDF Answers Detected / تم اكتشاف إجابات في الـ PDF
                </p>
                <p className="text-amber-700/90 dark:text-amber-400/90 text-[11px] mt-0.5">
                  Found {detectedCount} printed or highlighted answer(s) directly on the past-paper PDF pages.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleApplyDetected}
                  disabled={disabled || busy}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-40"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Use Detected Answers ({detectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDismissDetected(true)}
                  disabled={busy}
                  className="p-1 rounded-md text-amber-700 hover:bg-amber-500/20 text-xs font-medium dark:text-amber-300"
                  title="Ignore detected answers"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setMode("text")}
                className={`px-3 py-1 rounded-md font-semibold text-xs transition ${
                  mode === "text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Paste Text / لصق نص
              </button>
              <button
                type="button"
                onClick={() => setMode("pdf")}
                className={`px-3 py-1 rounded-md font-semibold text-xs transition ${
                  mode === "pdf" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload PDF Key / ملف PDF
              </button>
            </div>

            {answeredQuestions > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled || busy}
                className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
              >
                <Trash2 size={12} /> Clear all answers
              </button>
            )}
          </div>

          {mode === "text" ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ListOrdered size={13} />
                  Paste numbered list (<code className="text-[11px] font-mono">1. A</code>), pairs (<code className="text-[11px] font-mono">1:A 2:C</code>), or stream (<code className="text-[11px] font-mono">A B C D</code>)
                </span>
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={disabled || busy}
                rows={4}
                placeholder={`1. A\n2. C\n3. B\n4. D\n...or paste: 1:A, 2:B, 3:C, 4:D\n...or just letters: A B C D A B C`}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  You can also click letters (A–E) directly on any question card below.
                </p>
                <button
                  type="button"
                  onClick={handleApplyText}
                  disabled={disabled || busy || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Apply Answer Key
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                id="answer-key-pdf-upload"
                disabled={disabled || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPdfFile(f);
                }}
              />

              <label
                htmlFor="answer-key-pdf-upload"
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                  pdfFile
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-border hover:border-emerald-500/40 hover:bg-muted/30"
                }`}
              >
                {pdfFile ? (
                  <>
                    <div className="size-10 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">{pdfFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(pdfFile.size / 1024).toFixed(1)} KB · Click to change file
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="size-10 rounded-full bg-muted text-muted-foreground grid place-items-center">
                      <Upload size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Choose Answer Key PDF / اختر ملف الإجابات</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Supports photos/scanned images of answer sheets, tables, or text PDFs (up to 20 MB)
                      </p>
                    </div>
                  </>
                )}
              </label>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  Gemini Vision will transcribe question numbers & answers and map them to this job.
                </p>
                <button
                  type="button"
                  onClick={handleApplyPdf}
                  disabled={disabled || busy || !pdfFile}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Extract & Apply Answers
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
