import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Upload, X, CheckCircle2, AlertCircle, SkipForward, Image as ImageIcon, Zap } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import {
  extractQuestionsFromPdfChunk,
  extractQuestionsFromSinglePage,
  extractQuestionsFromPageImages,
  extractScannedPdfPageFast,
  listPdfProviders,
} from "@/lib/jarvis-pdf.functions";
import { insertExtractedQuestion } from "@/lib/jarvis.functions";
import { loadPdfForRender, renderPageToJpegBase64, clearPdfRenderCache } from "@/lib/pdf-page-render";
import { supabase } from "@/integrations/supabase/client";

type ChunkStatus = "pending" | "extracting" | "done" | "failed";
type Mode = "text" | "vision";

type ChunkRecord = {
  id: number;
  startPage: number;
  endPage: number;
  status: ChunkStatus;
  added: number;
  duplicates: number;
  failed: number;
  error?: string;
  durationMs?: number;
  questions: { stem: string; status: "added" | "duplicate" | "failed"; error?: string }[];
};

type Provider = "gemini" | "lovable";

function normalizeStem(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function jaccard(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((w) => { if (sb.has(w)) inter++; });
  return inter / (sa.size + sb.size - inter);
}
function isDuplicate(stem: string, accepted: string[]): boolean {
  const n = normalizeStem(stem);
  if (!n) return false;
  for (const prev of accepted) {
    const p = normalizeStem(prev);
    if (n === p) return true;
    const lenDiff = Math.abs(n.length - p.length) / Math.max(n.length, p.length);
    if (lenDiff < 0.15 && jaccard(n, p) >= 0.85) return true;
  }
  return false;
}
function fmtEta(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function slicePdf(srcDoc: PDFDocument, start: number, end: number): Promise<string> {
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = start; i <= end; i++) indices.push(i - 1);
  const copied = await out.copyPages(srcDoc, indices);
  copied.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return bytesToBase64(bytes);
}

export function PdfImportButton({
  subjectId,
  onCreated,
}: {
  subjectId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const disabled = !subjectId;
  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={disabled ? "Pick course, section & subject first" : "Import questions from a PDF"}
        className="relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        <FileText className="w-4 h-4" /> Import PDF
      </button>
      {open && (
        <PdfImportModal
          subjectId={subjectId}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

const TEXT_CONCURRENCY = 2;
const VISION_CONCURRENCY = 1; // scanned PDFs: one page at a time so the browser stays responsive
const MAX_PAGES = 150;
const MAX_BYTES = 50 * 1024 * 1024;

function pickChunkSize(totalPages: number, provider: Provider = "lovable"): number {
  // Gemini free is slow on multi-page chunks → always go page-by-page.
  if (provider === "gemini") return 1;
  if (totalPages <= 4) return totalPages;
  if (totalPages <= 20) return 3;
  if (totalPages <= 60) return 3;
  return 2;
}

function PdfImportModal({
  subjectId,
  onClose,
  onCreated,
}: {
  subjectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const extractChunk = useServerFn(extractQuestionsFromPdfChunk);
  const extractSingle = useServerFn(extractQuestionsFromSinglePage);
  const extractFast = useServerFn(extractScannedPdfPageFast);
  const extractVision = useServerFn(extractQuestionsFromPageImages);
  const insertQ = useServerFn(insertExtractedQuestion);
  const probeProviders = useServerFn(listPdfProviders);

  const [mode, setMode] = useState<Mode>("text");
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [providerStatus, setProviderStatus] = useState<{ gemini: boolean; lovable: boolean }>({
    gemini: true,
    lovable: true,
  });
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [stopOnError, setStopOnError] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const pdfDocRef = useRef<PDFDocument | null>(null);
  const fileRef = useRef<File | null>(null);
  const pdfjsDocRef = useRef<any>(null);
  const pageImageCacheRef = useRef<Map<number, string>>(new Map());
  const cancelRef = useRef(false);
  const startRef = useRef<number | null>(null);
  const acceptedStemsRef = useRef<string[]>([]);
  const rawReportRef = useRef<Record<number, string>>({});

  useEffect(() => {
    probeProviders().then(setProviderStatus).catch(() => {});
  }, [probeProviders]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function preloadExistingStems() {
    const { data } = await (supabase.from as any)("questions")
      .select("stem")
      .eq("subject_id", subjectId);
    acceptedStemsRef.current = ((data as { stem: string }[]) ?? []).map((r) => r.stem);
  }

  async function onPick(f: File | null) {
    setError(null);
    setChunks([]);
    setTotalPages(0);
    setDone(false);
    pdfDocRef.current = null;
    fileRef.current = null;
    pdfjsDocRef.current = null;
    pageImageCacheRef.current.clear();
    clearPdfRenderCache();
    if (!f) { setFile(null); return; }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Please pick a PDF file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB — max ${MAX_BYTES / 1024 / 1024} MB. Split the file.`);
      return;
    }
    setFile(f);
    fileRef.current = f;
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const numPages = doc.getPageCount();
      if (numPages === 0) {
        setError("PDF has no readable pages.");
        setFile(null);
        return;
      }
      if (numPages > MAX_PAGES) {
        setError(`PDF has ${numPages} pages — max ${MAX_PAGES}. Split the file.`);
        setFile(null);
        return;
      }
      pdfDocRef.current = doc;
      setTotalPages(numPages);
      buildChunks(numPages, mode);
    } catch (e: any) {
      setError(e?.message || "Could not read PDF.");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function buildChunks(numPages: number, m: Mode) {
    const chunkSize = m === "vision" ? 1 : pickChunkSize(numPages, provider);
    const recs: ChunkRecord[] = [];
    let id = 0;
    for (let s = 1; s <= numPages; s += chunkSize) {
      const e = Math.min(s + chunkSize - 1, numPages);
      recs.push({
        id: id++,
        startPage: s,
        endPage: e,
        status: "pending",
        added: 0,
        duplicates: 0,
        failed: 0,
        questions: [],
      });
    }
    setChunks(recs);
  }

  // Re-chunk on mode or provider change (when not running)
  useEffect(() => {
    if (running || done) return;
    if (totalPages > 0) buildChunks(totalPages, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, provider]);


  function patchChunk(id: number, patch: Partial<ChunkRecord>) {
    setChunks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function getPageJpeg(pageNumber: number): Promise<string> {
    const cached = pageImageCacheRef.current.get(pageNumber);
    if (cached) return cached;
    if (!pdfjsDocRef.current) {
      if (!fileRef.current) throw new Error("No PDF loaded");
      pdfjsDocRef.current = await loadPdfForRender(fileRef.current);
    }
    const b64 = await renderPageToJpegBase64(pdfjsDocRef.current, pageNumber, {
      targetWidth: 1400,
      quality: 0.78,
    });
    pageImageCacheRef.current.set(pageNumber, b64);
    return b64;
  }

  async function processChunk(rec: ChunkRecord) {
    if (!pdfDocRef.current) return;
    const t0 = performance.now();
    patchChunk(rec.id, { status: "extracting" });

    let questions: { prompt: string; options: { letter: "A"|"B"|"C"|"D"|"E"|"F"; body: string; is_correct: boolean }[]; explanation: string }[] = [];
    let chunkError: string | null = null;

    if (mode === "vision") {
      // -------- VISION MODE (scanned PDFs) ---------------------------------
      // Primary path: send the sliced single-page PDF directly to Gemini.
      // Gemini natively OCRs scanned PDFs and is MUCH faster than rendering
      // a JPEG in the browser, sending it back, and parsing a huge response.
      try {
        const pdfBase64 = await slicePdf(pdfDocRef.current, rec.startPage, rec.startPage);
        if (cancelRef.current) { patchChunk(rec.id, { status: "failed", error: "Cancelled" }); return; }
        const r = await withTimeout(
          extractFast({
            data: { pdfBase64, provider, pageNumber: rec.startPage, hint: hint.trim() || undefined },
          }),
          100_000,
          `p.${rec.startPage}`,
        );
        questions = r.questions as typeof questions;
      } catch (e: any) {
        chunkError = e?.message || "OCR failed";
      }

      // Fallback: render the page to a JPEG and try image vision (slower).
      if (!cancelRef.current && questions.length === 0) {
        patchChunk(rec.id, { status: "extracting", error: chunkError ? `Retry as image…` : undefined });
        try {
          const b64 = await getPageJpeg(rec.startPage);
          if (cancelRef.current) { patchChunk(rec.id, { status: "failed", error: "Cancelled" }); return; }
          const r2 = await withTimeout(
            extractVision({
              data: {
                images: [{ base64: b64, mimeType: "image/jpeg" }],
                provider,
                startPage: rec.startPage,
                endPage: rec.startPage,
                hint: hint.trim() || undefined,
              },
            }),
            90_000,
            `Vision p.${rec.startPage}`,
          );
          if ((r2.questions as typeof questions).length > 0) {
            questions = r2.questions as typeof questions;
            chunkError = null;
          }
        } catch (e: any) {
          chunkError = e?.message || chunkError;
        } finally {
          // free the cached JPEG so we don't hold huge buffers across pages
          pageImageCacheRef.current.delete(rec.startPage);
        }
      }
    } else {
      // -------- TEXT MODE (original pipeline) ------------------------------
      try {
        const pdfBase64 = await slicePdf(pdfDocRef.current, rec.startPage, rec.endPage);
        const r = await extractChunk({
          data: {
            pdfBase64,
            provider,
            startPage: rec.startPage,
            endPage: rec.endPage,
            hint: hint.trim() || undefined,
          },
        });
        questions = r.questions as typeof questions;
      } catch (e: any) {
        chunkError = e?.message || "Chunk failed";
      }

      if ((chunkError || questions.length === 0) && rec.endPage > rec.startPage) {
        patchChunk(rec.id, { status: "extracting", error: chunkError ? "Retrying page-by-page…" : undefined });
        const pageResults: typeof questions = [];
        for (let p = rec.startPage; p <= rec.endPage; p++) {
          if (cancelRef.current) break;
          try {
            const single = await slicePdf(pdfDocRef.current, p, p);
            const r2 = await extractSingle({
              data: { pdfBase64: single, provider, pageNumber: p, hint: hint.trim() || undefined },
            });
            pageResults.push(...(r2.questions as typeof questions));
          } catch {
            // continue
          }
        }
        if (pageResults.length > 0) {
          questions = pageResults;
          chunkError = null;
        }
      }

      if (chunkError && questions.length === 0 && rec.startPage === rec.endPage) {
        try {
          const single = await slicePdf(pdfDocRef.current, rec.startPage, rec.startPage);
          const r2 = await extractSingle({
            data: { pdfBase64: single, provider, pageNumber: rec.startPage, hint: hint.trim() || undefined },
          });
          questions = r2.questions as typeof questions;
          if (questions.length > 0) chunkError = null;
        } catch (e: any) {
          chunkError = e?.message || chunkError;
        }
      }
    }


    if (chunkError && questions.length === 0) {
      patchChunk(rec.id, {
        status: "failed",
        error: chunkError,
        durationMs: performance.now() - t0,
      });
      if (stopOnError) cancelRef.current = true;
      return;
    }

    const qLog: ChunkRecord["questions"] = [];
    let added = 0, dup = 0, fail = 0;
    for (const q of questions) {
      if (cancelRef.current) break;
      if (skipDuplicates && isDuplicate(q.prompt, acceptedStemsRef.current)) {
        dup++;
        qLog.push({ stem: q.prompt.slice(0, 90), status: "duplicate" });
        patchChunk(rec.id, { added, duplicates: dup, failed: fail, questions: [...qLog] });
        continue;
      }
      try {
        await insertQ({
          data: {
            subjectId,
            prompt: q.prompt,
            options: q.options,
            explanation: q.explanation || "",
          },
        });
        acceptedStemsRef.current.push(q.prompt);
        added++;
        qLog.push({ stem: q.prompt.slice(0, 90), status: "added" });
      } catch (e: any) {
        fail++;
        qLog.push({ stem: q.prompt.slice(0, 90), status: "failed", error: e?.message || "Insert failed" });
      }
      patchChunk(rec.id, { added, duplicates: dup, failed: fail, questions: [...qLog] });
    }

    rawReportRef.current[rec.id] = JSON.stringify({ count: questions.length, recoveredFromError: !!chunkError }, null, 2);
    patchChunk(rec.id, {
      status: "done",
      added,
      duplicates: dup,
      failed: fail,
      durationMs: performance.now() - t0,
      questions: qLog,
      error: undefined,
    });
  }

  async function runAll() {
    if (!chunks.length || !pdfDocRef.current) return;
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setError(null);
    startRef.current = performance.now();
    await preloadExistingStems();

    const queue = chunks
      .filter((c) => c.status === "pending" || c.status === "failed")
      .map((c) => c.id);
    setChunks((prev) =>
      prev.map((c) =>
        queue.includes(c.id)
          ? { ...c, status: "pending", error: undefined, added: 0, duplicates: 0, failed: 0, questions: [] }
          : c,
      ),
    );

    let idx = 0;
    const snapshot = [...chunks];
    async function worker() {
      while (!cancelRef.current && idx < queue.length) {
        const myIdx = idx++;
        const id = queue[myIdx];
        const rec = snapshot.find((c) => c.id === id)!;
        await processChunk(rec);
      }
    }
    await Promise.all(Array.from({ length: (mode === "vision" ? VISION_CONCURRENCY : TEXT_CONCURRENCY) }, worker));

    setRunning(false);
    setDone(true);
    onCreated();
  }

  // Test mode: scan pages one by one until ONE question gets inserted, then stop.
  // Proves the pipeline works on hard scanned PDFs without committing to the whole file.
  async function findFirstQuestion() {
    if (!pdfDocRef.current || !chunks.length) return;
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setError(null);
    startRef.current = performance.now();
    await preloadExistingStems();

    // Mark all pending again
    setChunks((prev) => prev.map((c) => ({ ...c, status: "pending", error: undefined, added: 0, duplicates: 0, failed: 0, questions: [] })));

    let inserted = 0;
    for (const rec of chunks) {
      if (cancelRef.current || inserted > 0) break;
      patchChunk(rec.id, { status: "extracting" });
      const t0 = performance.now();
      let questions: { prompt: string; options: { letter: "A"|"B"|"C"|"D"|"E"|"F"; body: string; is_correct: boolean }[]; explanation: string }[] = [];
      let chunkError: string | null = null;
      try {
        if (mode === "vision") {
          const pdfBase64 = await slicePdf(pdfDocRef.current, rec.startPage, rec.startPage);
          const r = await withTimeout(
            extractFast({ data: { pdfBase64, provider, pageNumber: rec.startPage, hint: hint.trim() || undefined } }),
            65_000,
            `p.${rec.startPage}`,
          );
          questions = r.questions as typeof questions;
        } else {
          const single = await slicePdf(pdfDocRef.current, rec.startPage, rec.startPage);
          const r = await withTimeout(
            extractSingle({ data: { pdfBase64: single, provider, pageNumber: rec.startPage, hint: hint.trim() || undefined } }),
            90_000,
            `Page ${rec.startPage}`,
          );
          questions = r.questions as typeof questions;
        }
      } catch (e: any) {
        chunkError = e?.message || "Failed";
      }

      if (chunkError && questions.length === 0) {
        patchChunk(rec.id, { status: "failed", error: chunkError, durationMs: performance.now() - t0 });
        continue;
      }

      const qLog: ChunkRecord["questions"] = [];
      let added = 0, dup = 0, fail = 0;
      for (const q of questions) {
        if (skipDuplicates && isDuplicate(q.prompt, acceptedStemsRef.current)) {
          dup++;
          qLog.push({ stem: q.prompt.slice(0, 90), status: "duplicate" });
          continue;
        }
        try {
          await insertQ({ data: { subjectId, prompt: q.prompt, options: q.options, explanation: q.explanation || "" } });
          acceptedStemsRef.current.push(q.prompt);
          added++; inserted++;
          qLog.push({ stem: q.prompt.slice(0, 90), status: "added" });
          break; // one is enough
        } catch (e: any) {
          fail++;
          qLog.push({ stem: q.prompt.slice(0, 90), status: "failed", error: e?.message || "Insert failed" });
        }
      }
      patchChunk(rec.id, {
        status: "done",
        added, duplicates: dup, failed: fail,
        durationMs: performance.now() - t0,
        questions: qLog,
      });
    }

    setRunning(false);
    setDone(true);
    if (inserted > 0) onCreated();
  }

  function downloadReport() {
    const report = {
      file: file?.name,
      subjectId,
      provider,
      totalPages,
      chunks,
      raw: rawReportRef.current,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pdf-import-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(() => {
    let added = 0, dup = 0, fail = 0, chunksDone = 0, chunksFailed = 0;
    for (const c of chunks) {
      added += c.added; dup += c.duplicates; fail += c.failed;
      if (c.status === "done") chunksDone++;
      if (c.status === "failed") chunksFailed++;
    }
    return { added, dup, fail, chunksDone, chunksFailed };
  }, [chunks]);

  const totalChunks = chunks.length;
  const completedChunks = totals.chunksDone + totals.chunksFailed;
  const elapsedSec = startRef.current ? (performance.now() - startRef.current) / 1000 : 0;
  const avgSecPerChunk = completedChunks > 0 ? elapsedSec / completedChunks : 12;
  const remainingChunks = totalChunks - completedChunks;
  const etaSec = running ? (remainingChunks * avgSecPerChunk) / (mode === "vision" ? VISION_CONCURRENCY : TEXT_CONCURRENCY) : 0;
  void tick;

  const preEstimateSec = totalChunks > 0 ? (totalChunks * 12) / (mode === "vision" ? VISION_CONCURRENCY : TEXT_CONCURRENCY) : 0;
  const canClose = true; // Cancel is allowed at any time; in-flight calls are abandoned.
  const startDisabled =
    running || parsing || !chunks.length || !chunks.some((c) => c.status === "pending" || c.status === "failed");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => canClose && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-6 md:p-8 shadow-2xl shadow-emerald-500/10"
      >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-lg shadow-emerald-500/40">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.32em] text-emerald-300 uppercase">Jarvis · PDF</p>
              <h2 className="font-bold text-xl text-white">Import questions from PDF</h2>
            </div>
          </div>
          <button onClick={onClose} disabled={!canClose} className="text-white/40 hover:text-white disabled:opacity-30">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Mode picker */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Extraction mode</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={running}
              onClick={() => setMode("text")}
              className={`rounded-xl border px-3 py-2.5 text-xs font-bold text-left transition ${
                mode === "text"
                  ? "border-emerald-400 bg-emerald-500/15 text-white"
                  : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/30"
              } disabled:opacity-40`}
            >
              <div className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Text PDF</div>
              <div className="text-[10px] text-white/50 font-normal mt-0.5">Digital PDFs with real text</div>
            </button>
            <button
              type="button"
              disabled={running || (!providerStatus.lovable && !providerStatus.gemini)}
              onClick={() => setMode("vision")}
              className={`rounded-xl border px-3 py-2.5 text-xs font-bold text-left transition ${
                mode === "vision"
                  ? "border-fuchsia-400 bg-fuchsia-500/15 text-white"
                  : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/30"
              } disabled:opacity-40`}
            >
              <div className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Scanned / Image PDF (Vision)</div>
              <div className="text-[10px] text-white/50 font-normal mt-0.5">Photos or scans — OCR with Gemini Vision (free) or Lovable AI</div>
            </button>
          </div>
        </div>

        {/* Provider picker */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">AI Provider</p>
          <div className="grid grid-cols-2 gap-2">
            {(["gemini", "lovable"] as Provider[]).map((p) => {
              const available =
                p === "gemini" ? providerStatus.gemini : providerStatus.lovable;
              const label =
                p === "gemini" ? "Gemini Flash (free)" : "Lovable AI (Gemini 3 Flash)";
              const active = provider === p;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!available || running}
                  onClick={() => setProvider(p)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold text-left transition ${
                    active
                      ? "border-emerald-400 bg-emerald-500/15 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/30"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div>{label}</div>
                  {!available && (
                    <div className="text-[10px] text-rose-300 font-normal mt-0.5">
                      {p === "gemini" ? "Add Gemini key in /admin/ai-keys" : "Key unavailable"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* File picker */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">PDF file</p>
          <label className={`block rounded-2xl border-2 border-dashed border-white/15 bg-black/30 p-5 text-center transition ${parsing || running ? "opacity-60" : "cursor-pointer hover:border-emerald-400/60"}`}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={parsing || running}
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            {!file ? (
              <div className="flex flex-col items-center gap-2 text-white/50 py-3">
                <FileText className="w-8 h-8" />
                <div className="text-sm"><span className="font-bold text-white">Click to upload</span> a PDF — up to {MAX_PAGES} pages, {MAX_BYTES / 1024 / 1024} MB</div>
              </div>
            ) : (
              <div className="text-sm text-white/80">
                <div className="font-bold text-white truncate">{file.name}</div>
                <div className="text-xs text-white/50 mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {parsing ? " · Reading…" : totalPages ? ` · ${totalPages} pages · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}` : ""}
                </div>
              </div>
            )}
          </label>
        </div>

        {/* Options */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/80 cursor-pointer">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} disabled={running} className="accent-emerald-400" />
            Skip duplicates (similar stems)
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/80 cursor-pointer">
            <input type="checkbox" checked={stopOnError} onChange={(e) => setStopOnError(e.target.checked)} disabled={running} className="accent-emerald-400" />
            Stop on first error
          </label>
        </div>

        {/* Hint */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Hint (optional)</p>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            disabled={running}
            placeholder="e.g. Translate explanation to English"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-emerald-400 disabled:opacity-50"
          />
        </div>

        {/* Time estimate */}
        {totalChunks > 0 && !running && !done && (
          <div className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <div className="font-bold mb-1">Estimated time: ~ {fmtEta(preEstimateSec)}</div>
            <div className="text-xs text-emerald-200/80">
              {totalPages} pages in {totalChunks} chunk{totalChunks === 1 ? "" : "s"} · {(mode === "vision" ? VISION_CONCURRENCY : TEXT_CONCURRENCY)} in parallel · auto-retry on rate limits.
            </div>
          </div>
        )}

        {/* Progress */}
        {(running || done) && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs text-white/70 mb-2">
              <span className="font-bold">
                {running
                  ? `Chunk ${Math.min(completedChunks + 1, totalChunks)} of ${totalChunks}`
                  : `Done`}
              </span>
              {running && <span className="font-mono text-emerald-300">~ {fmtEta(etaSec)} left</span>}
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all"
                style={{ width: `${totalChunks === 0 ? 0 : (completedChunks / totalChunks) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 py-2">
                <div className="text-2xl font-black text-emerald-300 tabular-nums">{totals.added}</div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-200/70 font-bold">Added</div>
              </div>
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 py-2">
                <div className="text-2xl font-black text-amber-300 tabular-nums">{totals.dup}</div>
                <div className="text-[10px] uppercase tracking-widest text-amber-200/70 font-bold">Duplicates</div>
              </div>
              <div className="rounded-xl bg-rose-500/10 border border-rose-400/30 py-2">
                <div className="text-2xl font-black text-rose-300 tabular-nums">{totals.fail}</div>
                <div className="text-[10px] uppercase tracking-widest text-rose-200/70 font-bold">Failed</div>
              </div>
            </div>
          </div>
        )}

        {/* Chunks list */}
        {chunks.length > 0 && (
          <div className="mb-5 max-h-[40vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/30">
            {chunks.map((c) => (
              <ChunkRow key={c.id} chunk={c} />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={runAll}
            disabled={startDisabled}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 disabled:opacity-40"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {running
              ? "Importing…"
              : totals.chunksFailed > 0 && chunks.every((c) => c.status !== "pending")
                ? `Retry ${totals.chunksFailed} failed chunk(s)`
                : `Start import (${totalPages} page${totalPages === 1 ? "" : "s"})`}
          </button>
          {!running && !done && chunks.length > 0 && (
            <button
              onClick={findFirstQuestion}
              disabled={startDisabled}
              title="Try one page at a time until at least one question is added, then stop"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-3.5 text-sm font-bold text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:opacity-40"
            >
              <Zap className="w-4 h-4" /> Test 1 question
            </button>
          )}
          {running && (
            <>
              <button
                onClick={() => { cancelRef.current = true; setRunning(false); }}
                className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-3.5 text-sm font-bold text-amber-100 hover:bg-amber-500/20"
              >
                Stop
              </button>
              <button
                onClick={() => { cancelRef.current = true; setRunning(false); onClose(); }}
                className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
              >
                Close
              </button>
            </>
          )}
          {done && !running && (
            <>
              <button
                onClick={downloadReport}
                className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
              >
                Download report
              </button>
              <button
                onClick={onClose}
                className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChunkRow({ chunk }: { chunk: ChunkRecord }) {
  const [open, setOpen] = useState(false);
  const statusColor = {
    pending: "text-white/40",
    extracting: "text-emerald-300",
    done: "text-emerald-400",
    failed: "text-rose-400",
  }[chunk.status];
  const StatusIcon =
    chunk.status === "done" ? CheckCircle2 :
    chunk.status === "failed" ? AlertCircle :
    chunk.status === "extracting" ? Loader2 :
    SkipForward;
  const spin = chunk.status === "extracting";
  const range = chunk.startPage === chunk.endPage
    ? `p. ${chunk.startPage}`
    : `p. ${chunk.startPage}–${chunk.endPage}`;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]">
        <span className="w-20 text-xs font-mono text-white/50 tabular-nums">{range}</span>
        <StatusIcon className={`w-4 h-4 ${statusColor} ${spin ? "animate-spin" : ""}`} />
        <span className="flex-1 text-xs text-white/80 truncate">
          {chunk.status === "pending" && `waiting`}
          {chunk.status === "extracting" && `Sending to AI…`}
          {chunk.status === "done" && (
            <>
              <span className="text-emerald-300">{chunk.added} added</span>
              {chunk.duplicates > 0 && <span className="text-amber-300"> · {chunk.duplicates} dup</span>}
              {chunk.failed > 0 && <span className="text-rose-300"> · {chunk.failed} failed</span>}
              {chunk.added === 0 && chunk.duplicates === 0 && chunk.failed === 0 && <span className="text-white/50"> · no MCQs found</span>}
              {chunk.durationMs && <span className="text-white/40"> · {(chunk.durationMs / 1000).toFixed(1)}s</span>}
            </>
          )}
          {chunk.status === "failed" && <span className="text-rose-300">{chunk.error}</span>}
        </span>
        {chunk.questions.length > 0 && (
          <span className="text-[10px] text-white/40">{open ? "▾" : "▸"}</span>
        )}
      </button>
      {open && chunk.questions.length > 0 && (
        <ul className="px-4 pb-3 space-y-1">
          {chunk.questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px]">
              <span className={`shrink-0 mt-0.5 ${q.status === "added" ? "text-emerald-400" : q.status === "duplicate" ? "text-amber-400" : "text-rose-400"}`}>
                {q.status === "added" ? "✓" : q.status === "duplicate" ? "⊘" : "✗"}
              </span>
              <span className="text-white/70 truncate" title={q.stem}>{q.stem}</span>
              {q.error && <span className="text-rose-300 truncate">— {q.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
