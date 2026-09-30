import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Layers, Loader2, X, CheckCircle2, AlertCircle, SkipForward,
  FileText, Image as ImageIcon, Trash2, Plus, MoonStar, Upload,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import {
  extractQuestionsFromPdfChunk,
  extractQuestionsFromSinglePage,
  extractQuestionsFromPageImages,
  extractScannedPdfPageFast,
  extractQuestionsFromPageText,
  extractBookends,
  solveQuestion,
  listPdfProviders,
} from "@/lib/jarvis-pdf.functions";
import { sliceByBookends } from "@/lib/bookend-slicer";

import { insertExtractedQuestion, getGeminiPoolStatus } from "@/lib/jarvis.functions";
import {
  loadPdfForRender,
  renderPageToJpegBase64,
  clearPdfRenderCache,
  getPageText,
  estimateQuestionsInText,
} from "@/lib/pdf-page-render";
import { supabase } from "@/integrations/supabase/client";

type Mode = "text" | "vision";
type Provider = "gemini" | "lovable";
type JobStatus =
  | "pending"
  | "parsing"
  | "running"
  | "done"
  | "failed"
  | "skipped";

type Course = { id: string; title: string; year: number; kind: string };
type Group = { id: string; course_id: string; name: string };
type Subject = { id: string; group_id: string; name: string };

type FailedChunk = { s: number; e: number; error: string; attempts: number };

type Job = {
  id: string;
  file: File;
  courseId: string;
  groupId: string;
  subjectId: string;
  autoSort: boolean;
  mode: Mode;
  status: JobStatus;
  totalPages: number;
  totalChunks: number;
  doneChunks: number;
  added: number;
  duplicates: number;
  failed: number;
  warnings: number;
  expectedTotal: number;
  unknownSubject: number;
  perSubject: Record<string, number>;
  error?: string;
  currentLabel?: string;
  warningLog?: string[];
  // Resume / retry state
  completedPages: number[];      // pages whose chunk finished successfully
  failedChunks: FailedChunk[];   // chunks that failed (page range + last error + attempts so far)
};

const MAX_FILES = 20;
const MAX_PAGES_PER_FILE = 200;
const MAX_BYTES = 50 * 1024 * 1024;
const CONCURRENCY = 2;

function pickChunkSize(totalPages: number, mode: Mode, provider: Provider = "lovable"): number {
  if (mode === "vision") return 1;
  // Bookend pipeline (Gemini text) batches 4 pages per extraction call — 5 was
  // too dense (Gemini truncated the bookend array and duplicate opening phrases
  // caused slicer collisions).
  if (provider === "gemini") return totalPages <= 4 ? totalPages : 4;
  if (totalPages <= 4) return totalPages;
  if (totalPages <= 60) return 3;
  return 2;
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

async function slicePdf(srcDoc: PDFDocument, s: number, e: number): Promise<string> {
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = s; i <= e; i++) indices.push(i - 1);
  const copied = await out.copyPages(srcDoc, indices);
  copied.forEach((p) => out.addPage(p));
  return bytesToBase64(await out.save());
}

function normStem(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function jaccard(a: string, b: string) {
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((w) => { if (sb.has(w)) inter++; });
  return inter / (sa.size + sb.size - inter);
}
function isDup(stem: string, accepted: string[]) {
  const n = normStem(stem);
  if (!n) return false;
  for (const p of accepted) {
    const pn = normStem(p);
    if (n === pn) return true;
    const ld = Math.abs(n.length - pn.length) / Math.max(n.length, pn.length);
    if (ld < 0.15 && jaccard(n, pn) >= 0.85) return true;
  }
  return false;
}

const SUBJECT_ALIASES: Record<string, string[]> = {
  // These are HEADING aliases only. Do not add disease/answer terms here
  // (e.g. pyelonephritis, sodium, pain) because the detector scans nearby PDF
  // text and those words inside a question can falsely move a question to the
  // wrong chapter. Gemini still sees the full question for medical reasoning.
  "GLOMERULONEPHRITIS ( NEPHROTIC AND NEPHRITUC SYNDROM)": ["glomerulonephriti", "glomerulonephritis", "nephrotic nephritic", "nephrotic and nephritic"],
  "ACUTE KIDNEY INJURY": ["acute kidney injury", "acute kidney", "aki"],
  "CHRONIC KIDNEY INJURY AND DIALYSIS": ["chronic kidney injury", "chronic kidney disease", "dialysis", "ckd"],
  "PLYCYSTIC KIDNEY DISEASE": ["polycystic kidney disease", "plycystic kidney disease", "polycystic", "plycystic", "pkd"],
  "ACUTE INTERSTITIAL NEPHRITIS": ["acute interstitial nephritis", "interstitial nephritis"],
  "Urinary tract Infection": ["urinary tract infection", "urinary tract", "uti", "mini osce"],
  "ELECTROLYTE DISTURBANCE": ["electrolyte disturbance", "electrolyties", "electrolyte"],
};

function normSubjectToken(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
}

// Normalize for fuzzy subject matching (strips diacritics + punctuation).
function normSubject(s: string): string {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function resolveSubjectId(hint: string | null | undefined, normMap: Map<string, string>, normCands: string[]): string | null {
  if (!hint) return null;
  const n = normSubject(hint);
  if (!n) return null;
  const exact = normMap.get(n);
  if (exact) return exact;
  let best: { name: string; dist: number } | null = null;
  for (const c of normCands) {
    const d = levenshtein(n, c);
    if (!best || d < best.dist) best = { name: c, dist: d };
  }
  if (best) {
    const tol = Math.max(2, Math.floor(Math.max(n.length, best.name.length) / 6));
    if (best.dist <= tol) return normMap.get(best.name) ?? null;
  }
  return null;
}


function headingAliases(subjectName: string) {
  const base = normSubjectToken(subjectName);
  const compact = base.replace(/\s+/g, " ");
  const words = base.split(" ").filter((w) => w.length >= 4);
  return Array.from(new Set([
    compact,
    words.slice(0, 3).join(" "),
    ...(SUBJECT_ALIASES[subjectName] ?? []),
  ].map(normSubjectToken).filter((x) => x.length >= 3)));
}

function inferSubjectFromLocalHeadings(
  chunkText: string,
  sliceStart: number,
  subjects: Subject[],
): string | undefined {
  const before = normSubjectToken(chunkText.slice(Math.max(0, sliceStart - 7000), sliceStart));
  if (!before) return undefined;
  let best: { subject: string; idx: number; aliasLen: number } | null = null;
  for (const s of subjects) {
    for (const alias of headingAliases(s.name)) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?:^| )${escapedAlias}(?: |$)`, "g");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(before))) {
        const idx = match.index + (match[0].startsWith(" ") ? 1 : 0);
        if (!best || idx > best.idx || (idx === best.idx && alias.length > best.aliasLen)) {
          best = { subject: s.name, idx, aliasLen: alias.length };
        }
      }
    }
  }
  return best?.subject;
}

export function BatchPdfImportButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/50 hover:scale-[1.02] transition"
        title="Queue multiple PDFs and run them overnight"
      >
        <MoonStar className="w-4 h-4" /> Batch import
      </button>
      {open && <BatchModal onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function BatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const extractChunk = useServerFn(extractQuestionsFromPdfChunk);
  const extractSingle = useServerFn(extractQuestionsFromSinglePage);
  const extractFast = useServerFn(extractScannedPdfPageFast);
  const extractVision = useServerFn(extractQuestionsFromPageImages);
  const extractText = useServerFn(extractQuestionsFromPageText);
  const callExtractBookends = useServerFn(extractBookends);
  const callSolveQuestion = useServerFn(solveQuestion);
  const insertQ = useServerFn(insertExtractedQuestion);
  const getStatus = useServerFn(getGeminiPoolStatus);
  const probeProviders = useServerFn(listPdfProviders);


  const [providerStatus, setProviderStatus] = useState<{ gemini: boolean; lovable: boolean }>({
    gemini: true, lovable: true,
  });
  const [provider, setProvider] = useState<Provider>("gemini");
  const [modelOverride, setModelOverride] = useState<string>("gemini-2.5-flash-lite");
  const [hint, setHint] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoRetry, setAutoRetry] = useState(true);
  const MAX_ATTEMPTS = 3;

  const [courses, setCourses] = useState<Course[]>([]);
  const [groupsByCourse, setGroupsByCourse] = useState<Record<string, Group[]>>({});
  const [subjectsByGroup, setSubjectsByGroup] = useState<Record<string, Subject[]>>({});

  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    probeProviders().then(setProviderStatus).catch(() => {});
  }, [probeProviders]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("id,title,year,kind")
        .eq("kind", "questions")
        .order("year");
      setCourses((data as Course[]) ?? []);
    })();
  }, []);

  async function ensureGroups(courseId: string) {
    if (!courseId || groupsByCourse[courseId]) return;
    const { data } = await (supabase.from as any)("subject_groups")
      .select("id,course_id,name")
      .eq("course_id", courseId)
      .order("sort_order");
    setGroupsByCourse((m) => ({ ...m, [courseId]: (data ?? []) as Group[] }));
  }
  async function ensureSubjects(groupId: string) {
    if (!groupId || subjectsByGroup[groupId]) return;
    const { data } = await (supabase.from as any)("subjects")
      .select("id,group_id,name")
      .eq("group_id", groupId)
      .order("sort_order");
    setSubjectsByGroup((m) => ({ ...m, [groupId]: (data ?? []) as Subject[] }));
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const arr = Array.from(files);
    setJobs((prev) => {
      const next = [...prev];
      for (const f of arr) {
        if (next.length >= MAX_FILES) break;
        if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) continue;
        if (f.size > MAX_BYTES) continue;
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          courseId: "",
          groupId: "",
          subjectId: "",
          autoSort: false,
          mode: "text",
          status: "pending",
          totalPages: 0,
          totalChunks: 0,
          doneChunks: 0,
          added: 0,
          duplicates: 0,
          failed: 0,
          warnings: 0,
          expectedTotal: 0,
          unknownSubject: 0,
          perSubject: {},
          warningLog: [],
          completedPages: [],
          failedChunks: [],
        });
      }
      return next;
    });
  }

  function patchJob(id: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  async function processJob(job: Job) {
    if (cancelRef.current) return;
    const ready = !!job.subjectId || (job.autoSort && !!job.groupId);
    if (!ready) {
      patchJob(job.id, { status: "skipped", error: "No subject chosen" });
      return;
    }

    // Build the subject list for auto-sort (and as the dedup scope).
    const groupSubjects = job.autoSort ? (subjectsByGroup[job.groupId] ?? []) : [];
    const subjectCandidates: string[] | undefined = job.autoSort && groupSubjects.length
      ? groupSubjects.map((s) => s.name)
      : undefined;
    // Send the section's subject list to ALL extraction paths when auto-sorting.
    // Cost is tiny (~25 tokens per question for the tag); accuracy gain is large
    // because the legacy fallback path used to drop the list and produce
    // "unknown → fallback" classifications.
    const extractionCandidates: string[] | undefined = subjectCandidates;
    // Strict + fuzzy subject lookup (tolerates Gemini spelling drift).
    const nameToId = new Map<string, string>();
    const normNameToId = new Map<string, string>();
    const normCandidates: string[] = [];
    for (const s of groupSubjects) {
      nameToId.set(s.name.toLowerCase(), s.id);
      const n = normSubject(s.name);
      if (n) { normNameToId.set(n, s.id); normCandidates.push(n); }
    }
    const fallbackSubjectId = job.subjectId || groupSubjects[0]?.id || "";
    if (job.autoSort && !fallbackSubjectId) {
      patchJob(job.id, { status: "failed", error: "Auto-sort needs at least one subject in this section." });
      return;
    }


    patchJob(job.id, { status: "parsing", currentLabel: "Reading PDF…" });

    // load + parse
    let pdfLib: PDFDocument;
    let numPages: number;
    let pdfjsDoc: any = null;
    try {
      const buf = await withTimeout(job.file.arrayBuffer(), 15_000, "Reading the PDF took too long — try a smaller file or retry.");
      pdfLib = await withTimeout(PDFDocument.load(buf, { ignoreEncryption: true }), 20_000, "Parsing the PDF took too long — try slicing it first.");
      numPages = pdfLib.getPageCount();
      if (!numPages) throw new Error("PDF has no pages");
      if (numPages > MAX_PAGES_PER_FILE) throw new Error(`Too many pages (${numPages}) — split the file`);
    } catch (e: any) {
      patchJob(job.id, { status: "failed", error: e?.message || "Failed to parse PDF" });
      return;
    }

    const chunkSize = pickChunkSize(numPages, job.mode, provider);
    const chunks: { s: number; e: number }[] = [];
    for (let s = 1; s <= numPages; s += chunkSize) {
      chunks.push({ s, e: Math.min(s + chunkSize - 1, numPages) });
    }

    // RESUME: skip chunks where every page is already in completedPages.
    const completedSet = new Set<number>(job.completedPages);
    const isChunkDone = (c: { s: number; e: number }) => {
      for (let p = c.s; p <= c.e; p++) if (!completedSet.has(p)) return false;
      return true;
    };
    const doneChunksFromResume = chunks.filter(isChunkDone).length;

    patchJob(job.id, {
      status: "running",
      totalPages: numPages,
      totalChunks: chunks.length,
      doneChunks: doneChunksFromResume,
      // Clear failed chunks at the start of this run — we'll re-populate
      // based on what fails in this attempt.
      failedChunks: [],
    });

    // preload existing stems for dedup
    const acceptedStems: string[] = [];
    if (skipDuplicates) {
      const scopeIds = job.autoSort ? groupSubjects.map((s) => s.id) : [job.subjectId];
      if (scopeIds.length) {
        const { data } = await (supabase.from as any)("questions")
          .select("stem")
          .in("subject_id", scopeIds);
        ((data as { stem: string }[]) ?? []).forEach((r) => acceptedStems.push(r.stem));
      }
    }

    const pageCache = new Map<number, string>();
    async function getJpeg(p: number) {
      const c = pageCache.get(p);
      if (c) return c;
      if (!pdfjsDoc) {
        pdfjsDoc = await withTimeout(loadPdfForRender(job.file), 12_000, "PDF renderer was slow — falling back to direct AI reading.");
      }
      const b = await withTimeout(
        renderPageToJpegBase64(pdfjsDoc, p, { targetWidth: 1400, quality: 0.78 }),
        45_000,
        `Page ${p} image render timed out`,
      );
      pageCache.set(p, b);
      return b;
    }

    // Carry forward existing counters — retry must ADD to prior progress.
    let added = job.added;
    let dups = job.duplicates;
    let fails = job.failed;
    let doneChunks = doneChunksFromResume;
    let warnings = job.warnings;
    let expectedTotal = job.expectedTotal;
    let unknownSubject = job.unknownSubject;
    const perSubject: Record<string, number> = { ...(job.perSubject ?? {}) };
    const warningLog: string[] = [...(job.warningLog ?? [])];
    const failedChunks: FailedChunk[] = [];
    const newlyCompletedPages: number[] = [];
    

    type Q = { prompt: string; options: { letter: string; body: string; is_correct: boolean }[]; explanation: string; subject_hint?: string; subject_reason?: string; concept_tag?: string };
    const pickModel = (override?: string) => (provider === "gemini" ? (override || modelOverride || undefined) : undefined);
    // When the user explicitly chose a model in the Jarvis Night dropdown,
    // LOCK it — do not let the pool silently fall back to Gemma or another
    // model. Only Auto (empty modelOverride) allows fallback.
    const lockModel = provider === "gemini" && !!modelOverride;
    let solveParallel = 3;
    let chunkParallel = 1;
    if (provider === "gemini") {
      try {
        const status: any = await getStatus();
        const flashRows = Array.isArray(status?.rows) ? status.rows.filter((r: any) => r.model === "gemini-2.5-flash-lite") : [];
        const maxConfigured = Math.max(1, ...flashRows.map((r: any) => Number(r.maxConcurrent) || 1));
        // Honor the admin DB cap. No artificial Math.min(6,…) ceiling — if the
        // user sets max_concurrent to 12 in /admin/ai-keys, use 12.
        solveParallel = Math.max(1, Math.min(12, maxConfigured));
        chunkParallel = Math.max(1, Math.min(8, maxConfigured));
      } catch { solveParallel = 3; chunkParallel = 1; }
    }
    async function tryText(s: number, e: number, strict = false, model?: string): Promise<Q[]> {
      if (provider === "gemini" && pdfjsDoc) {
        try {
          let combined = "";
          for (let p = s; p <= e; p++) {
            const t = await withTimeout(getPageText(pdfjsDoc, p), 3_500, `Reading text from page ${p} timed out`);
            if (t) combined += `\n\n=== Page ${p} ===\n${t}`;
          }
          if (combined.trim().length >= 80) {
            const r = await withTimeout(
              extractText({
                data: {
                  pageText: combined.slice(0, 180_000),
                  startPage: s, endPage: e,
                  hint: hint.trim() || undefined,
                  strict,
                  modelOverride: pickModel(model),
                  lockModel: lockModel && !model,
                  subjectCandidates: extractionCandidates,
                } as any,
              }),
              150_000,
              `AI text extraction timed out on pages ${s}${e !== s ? `–${e}` : ""}`,
            );
            return r.questions as Q[];
          }
        } catch { /* fall through */ }
      }
      if (provider === "gemini" && job.mode !== "vision") {
        throw new Error("Local text pipeline failed; low-cost mode will not send the PDF/image to Gemini.");
      }
      const pdfBase64 = await slicePdf(pdfLib, s, e);
      if (s === e) {
        const r = await withTimeout(
          extractSingle({
            data: { pdfBase64, provider, pageNumber: s, hint: hint.trim() || undefined, strict, modelOverride: pickModel(model), lockModel: lockModel && !model, subjectCandidates: extractionCandidates } as any,
          }),
          150_000,
          `AI PDF extraction timed out on page ${s}`,
        );
        return r.questions as Q[];
      }
      const r = await withTimeout(
        extractChunk({
          data: { pdfBase64, provider, startPage: s, endPage: e, hint: hint.trim() || undefined, strict, modelOverride: pickModel(model), lockModel: lockModel && !model, subjectCandidates: extractionCandidates } as any,
        }),
        150_000,
        `AI PDF extraction timed out on pages ${s}${e !== s ? `–${e}` : ""}`,
      );
      return r.questions as Q[];
    }
    async function tryVisionPage(p: number): Promise<Q[]> {
      const pdfPage = await slicePdf(pdfLib, p, p);
      let fastErr: any = null;
      try {
        const r = await withTimeout(
          extractFast({
            data: { pdfBase64: pdfPage, provider, pageNumber: p, hint: hint.trim() || undefined, modelOverride: pickModel(), lockModel, subjectCandidates: extractionCandidates } as any,
          }),
          120_000,
          `Fast vision extraction timed out on page ${p}`,
        );
        const qs = r.questions as Q[];
        if (qs.length > 0) return qs;
      } catch (e) { fastErr = e; }
      try {
        const b = await getJpeg(p);
        const r2 = await withTimeout(
          extractVision({
            data: { images: [{ base64: b, mimeType: "image/jpeg" }], provider, startPage: p, endPage: p, hint: hint.trim() || undefined, modelOverride: pickModel(), lockModel, subjectCandidates: extractionCandidates } as any,
          }),
          120_000,
          `Vision extraction timed out on page ${p}`,
        );
        pageCache.delete(p);
        return r2.questions as Q[];
      } catch (e: any) {
        pageCache.delete(p);
        const msg = e?.message ?? String(e);
        warningLog.push(`Page ${p}: vision failed — ${msg}${fastErr ? ` (fast: ${fastErr?.message ?? fastErr})` : ""}`);
        return [];
      }
    }

    // Run a single chunk end-to-end. THROWS on hard failure so the outer
    // attempts loop can decide whether to retry.
    async function runChunkOnce(chunk: { s: number; e: number }): Promise<{ questions: Q[]; chunkExpected: number; useVisionFirst: boolean }> {
      let chunkExpected = 0;
      let chunkScanned = false;
      let chunkText = "";
      if (!pdfjsDoc) {
        try {
          pdfjsDoc = await withTimeout(loadPdfForRender(job.file), 12_000, "PDF renderer timed out");
        } catch { /* direct PDF extraction will be used */ }
      }
      if (pdfjsDoc) {
        for (let p = chunk.s; p <= chunk.e; p++) {
          const txt = await withTimeout(getPageText(pdfjsDoc, p), 3_500, `Reading text from page ${p} timed out`).catch(() => "");
          if (txt) chunkText += (chunkText ? "\n\n" : "") + txt;
          const est = estimateQuestionsInText(txt);
          chunkExpected += est.expected;
          if (est.scanned) chunkScanned = true;
        }
      }

      let questions: Q[] = [];
      let lastErr: string | null = null;
      const useVisionFirst = job.mode === "vision";

      // ── BOOKEND PIPELINE (default for text PDFs on Gemini) ────────────────
      // 1. Send pure text to gemini-2.5-flash-lite, get [{first_4_words,last_4_words}].
      // 2. Slice each question out LOCALLY (no AI tokens).
      // 3. For each slice, one solver call returns prompt+options+explanation+subject.
      // Halves the range on empty bookend output (truncation guard).
      // Falls through to the legacy text/vision path only after halving fails.
      const canBookend = provider === "gemini" && !useVisionFirst && chunkText.trim().length >= 80;

      async function bookendsForRange(s: number, e: number, depth: number): Promise<{ slices: ReturnType<typeof sliceByBookends>; rangeText: string }> {
        let rangeText = "";
        let rangeExpected = 0;
        if (s === chunk.s && e === chunk.e) {
          rangeText = chunkText;
          rangeExpected = chunkExpected;
        } else if (pdfjsDoc) {
          for (let p = s; p <= e; p++) {
            const t = await withTimeout(getPageText(pdfjsDoc, p), 3_500, `Reading text from page ${p} timed out`).catch(() => "");
            if (t) {
              rangeText += (rangeText ? "\n\n" : "") + t;
              rangeExpected += estimateQuestionsInText(t).expected;
            }
          }
        }
        if (rangeText.trim().length < 80) return { slices: [], rangeText };
        const beRes = await withTimeout(
          callExtractBookends({
            data: {
              chunkText: rangeText.slice(0, 200_000),
              startPage: s,
              endPage: e,
              hint: hint.trim() || undefined,
              modelOverride: modelOverride || "gemini-2.5-flash-lite",
              lockModel: lockModel,
            } as any,
          }),
          180_000,
          `Bookend extraction timed out on pages ${s}–${e}`,
        );
        const bookends = beRes?.bookends ?? [];
        // Under-coverage retry: if the AI returned far fewer questions than the
        // local estimator predicted, halve the range and try each half. This
        // catches truncation AND lazy extraction in one shot.
        const minAcceptable = Math.max(1, Math.floor(rangeExpected * 0.8));
        const underCovered = rangeExpected > 0 && bookends.length < minAcceptable;
        if ((bookends.length === 0 || underCovered) && depth < 2 && e > s) {
          const mid = Math.floor((s + e) / 2);
          const a = await bookendsForRange(s, mid, depth + 1);
          const b = await bookendsForRange(mid + 1, e, depth + 1);
          return { slices: [...a.slices, ...b.slices], rangeText: rangeText };
        }
        const slices = sliceByBookends(rangeText, bookends);
        return { slices, rangeText };
      }

      if (canBookend) {
        try {
          patchJob(job.id, {
            currentLabel: `Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""} — finding question borders…`,
          });
          const { slices } = await bookendsForRange(chunk.s, chunk.e, 0);
          if (slices.length > 0) {
            // Solve each slice in small parallel batches to respect the pool.
            const solved: Q[] = [];
            patchJob(job.id, {
              currentLabel: `Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""} — ${slices.length} questions found`,
            });
            for (let i = 0; i < slices.length; i += solveParallel) {
              if (cancelRef.current) break;
              const batch = slices.slice(i, i + solveParallel).map((s) => ({ slice: s }));
              patchJob(job.id, {
                currentLabel: `Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""} — solving ${Math.min(i + batch.length, slices.length)}/${slices.length}`,
              });
              const results = await Promise.all(batch.map(async ({ slice: s }) => {
                try {
                  const r = await withTimeout(
                    callSolveQuestion({
                      data: {
                        questionText: s.text,
                        // ALWAYS send the full section subject list.
                        subjectCandidates,
                        hint: hint.trim() || undefined,
                        modelOverride: modelOverride || "gemini-2.5-flash-lite",
                        lockModel: lockModel,
                      } as any,
                    }),
                    90_000,
                    "Solver timed out",
                  );
                  return r.question as Q;
                } catch { return null; }
              }));
              for (const q of results) if (q) solved.push(q);
            }
            if (solved.length > 0) {
              return { questions: solved, chunkExpected, useVisionFirst: false };
            }
          }
        } catch (e: any) {
          // Bookend path failed — fall through to legacy pipeline.
          warningLog.push(`Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""}: bookend path failed (${(e?.message || "error").slice(0, 80)}), falling back`);
        }
      }


      try {
        if (useVisionFirst) {
          for (let p = chunk.s; p <= chunk.e; p++) {
            if (cancelRef.current) break;
            questions.push(...(await tryVisionPage(p)));
          }
        } else {
          questions = await tryText(chunk.s, chunk.e, false);
        }
      } catch (e: any) {
        lastErr = e?.message || "chunk failed";
      }

      if (!useVisionFirst && lastErr && questions.length === 0 && chunk.e > chunk.s) {
        let pageErrs = 0;
        for (let p = chunk.s; p <= chunk.e; p++) {
          if (cancelRef.current) break;
          try { questions.push(...(await tryText(p, p, false))); } catch { pageErrs++; }
        }
        if (pageErrs === (chunk.e - chunk.s + 1) && questions.length === 0) {
          throw new Error(lastErr);
        }
      } else if (!useVisionFirst && lastErr && questions.length === 0) {
        throw new Error(lastErr);
      }


      if (!useVisionFirst && chunkExpected > 0 && questions.length < Math.max(1, Math.floor(chunkExpected * 0.6))) {
        try {
          const strictQ = await tryText(chunk.s, chunk.e, true);
          if (strictQ.length > questions.length) questions = strictQ;
        } catch { /* keep best so far */ }
      }

      // No silent escalation: in Text mode we never send PDF/image bytes to
      // Gemini. Vision is only used when the admin explicitly chooses Vision.
      if (!useVisionFirst && chunkScanned && chunkText.trim().length < 80) {
        warnings++;
        warningLog.push(`Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""}: no local text found; choose Vision mode only if you accept image/PDF-token cost`);
      }

      return { questions, chunkExpected, useVisionFirst };
    }

    // Worker pool: process up to `chunkParallel` chunks concurrently. JS is
    // single-threaded so shared counters (added/dups/fails/warnings/…) are
    // safe to mutate between awaits without locks.
    const pendingChunks = chunks.filter((c) => !isChunkDone(c)).slice();

    async function processOneChunk(chunk: { s: number; e: number }) {
      if (cancelRef.current) return;

      patchJob(job.id, {
        currentLabel: `Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""}`,
      });

      const maxAttempts = autoRetry ? MAX_ATTEMPTS : 1;
      let attempt = 0;
      let chunkResult: { questions: Q[]; chunkExpected: number; useVisionFirst: boolean } | null = null;
      let lastChunkErr: string | null = null;

      while (attempt < maxAttempts && !cancelRef.current) {
        attempt++;
        try {
          chunkResult = await runChunkOnce(chunk);
          lastChunkErr = null;
          break;
        } catch (e: any) {
          lastChunkErr = e?.message || "chunk failed";
          if (attempt < maxAttempts && !cancelRef.current) {
            const backoff = Math.min(30_000, 4000 * Math.pow(2, attempt - 1));
            patchJob(job.id, {
              currentLabel: `Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""} — retry ${attempt}/${maxAttempts - 1} in ${Math.round(backoff / 1000)}s…`,
            });
            await new Promise((res) => setTimeout(res, backoff));
          }
        }
      }

      if (!chunkResult) {
        failedChunks.push({ s: chunk.s, e: chunk.e, error: (lastChunkErr || "chunk failed").slice(0, 200), attempts: attempt });
        warnings++;
        warningLog.push(`Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""}: ${(lastChunkErr || "failed").slice(0, 100)} (after ${attempt} attempt${attempt === 1 ? "" : "s"})`);
        patchJob(job.id, {
          failedChunks: [...failedChunks],
          warnings, warningLog: [...warningLog],
          error: warningLog[warningLog.length - 1],
        });
        return;
      }

      const { questions, chunkExpected } = chunkResult;
      expectedTotal += chunkExpected;

      if (chunkExpected > 0 && questions.length < chunkExpected) {
        warnings++;
        warningLog.push(`Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""}: expected ~${chunkExpected}, got ${questions.length}`);
      }

      for (const q of questions) {
        if (cancelRef.current) break;
        if (skipDuplicates && isDup(q.prompt, acceptedStems)) { dups++; continue; }
        let targetSubjectId = job.subjectId || fallbackSubjectId;
        let targetSubjectName = "";
        if (job.autoSort) {
          const hintName = (q.subject_hint || "").trim();
          const id = resolveSubjectId(hintName, normNameToId, normCandidates);
          if (id) {
            targetSubjectId = id;
            targetSubjectName = groupSubjects.find((s) => s.id === id)?.name || hintName;
          } else {
            targetSubjectId = fallbackSubjectId;
            targetSubjectName = groupSubjects.find((s) => s.id === fallbackSubjectId)?.name || "?";
            unknownSubject++;
          }
        }

        try {
          patchJob(job.id, {
            currentLabel: `Pages ${chunk.s}${chunk.e !== chunk.s ? `–${chunk.e}` : ""} — saving ${added + dups + fails + 1}`,
          });
          const insRes: any = await withTimeout(
            insertQ({
              data: {
                subjectId: targetSubjectId,
                prompt: q.prompt,
                options: q.options as any,
                explanation: q.explanation || "",
              },
            }),
            20_000,
            "Saving one question timed out",
          );
          acceptedStems.push(q.prompt);
          // Server returns { inserted: false } when the (subject_id, stem_hash)
          // unique index rejected the row — treat that as a duplicate, NOT a
          // new question. This is what stops the "100 → 250" inflation when a
          // chunk is retried after a partial success.
          if (insRes && insRes.inserted === false) {
            dups++;
          } else {
            added++;
            if (job.autoSort && targetSubjectName) {
              perSubject[targetSubjectName] = (perSubject[targetSubjectName] ?? 0) + 1;
            }
          }
        } catch { fails++; }
      }

      for (let p = chunk.s; p <= chunk.e; p++) {
        completedSet.add(p);
        newlyCompletedPages.push(p);
      }
      doneChunks++;
      patchJob(job.id, {
        doneChunks, added, duplicates: dups, failed: fails,
        warnings, expectedTotal,
        unknownSubject,
        perSubject: { ...perSubject },
        warningLog: [...warningLog],
        completedPages: Array.from(completedSet).sort((a, b) => a - b),
        failedChunks: [...failedChunks],
        error: failedChunks.length ? warningLog[warningLog.length - 1] : undefined,
      });
    }

    // Drain pending chunks with a bounded worker pool.
    {
      const queue = pendingChunks.slice();
      async function chunkWorker() {
        while (!cancelRef.current) {
          const c = queue.shift();
          if (!c) return;
          try { await processOneChunk(c); }
          catch (e: any) {
            failedChunks.push({ s: c.s, e: c.e, error: (e?.message || "chunk crashed").slice(0, 200), attempts: 1 });
            warnings++;
            warningLog.push(`Pages ${c.s}${c.e !== c.s ? `–${c.e}` : ""}: ${(e?.message || "crashed").slice(0, 100)}`);
            patchJob(job.id, { failedChunks: [...failedChunks], warnings, warningLog: [...warningLog] });
          }
        }
      }
      const workerCount = Math.max(1, Math.min(chunkParallel, pendingChunks.length || 1));
      await Promise.all(Array.from({ length: workerCount }, () => chunkWorker()));
    }

    // Final status.
    let finalStatus: JobStatus;
    let finalError: string | undefined;
    if (cancelRef.current) {
      finalStatus = "skipped";
    } else if (failedChunks.length > 0) {
      finalStatus = "failed";
      const remainingPages = failedChunks.reduce((n, c) => n + (c.e - c.s + 1), 0);
      finalError = `${failedChunks.length} chunk${failedChunks.length === 1 ? "" : "s"} failed (${remainingPages} page${remainingPages === 1 ? "" : "s"} remaining). Click Retry or Download remaining.`;
    } else if (added === 0 && dups === 0 && expectedTotal > 0) {
      finalStatus = "failed";
      finalError = `Expected ~${expectedTotal} questions but added 0. Try Vision mode or check the PDF.`;
    } else if (added === 0 && dups === 0) {
      finalStatus = "failed";
      finalError = "No questions were extracted from this PDF.";
    } else {
      finalStatus = "done";
    }
    patchJob(job.id, {
      status: finalStatus,
      currentLabel: undefined,
      warnings, expectedTotal,
      warningLog: [...warningLog],
      completedPages: Array.from(completedSet).sort((a, b) => a - b),
      failedChunks: [...failedChunks],
      error: finalError ?? (warningLog.length ? warningLog[warningLog.length - 1] : undefined),
    });
  }

  // Build a PDF with only the pages NOT in completedPages, for the user to
  // re-import elsewhere or retry on a fresh file.
  async function downloadRemainingPages(job: Job) {
    try {
      const buf = await job.file.arrayBuffer();
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const total = src.getPageCount();
      const doneSet = new Set<number>(job.completedPages);
      const remainingPages: number[] = [];
      for (let p = 1; p <= total; p++) if (!doneSet.has(p)) remainingPages.push(p);
      if (!remainingPages.length) return;
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, remainingPages.map((p) => p - 1));
      copied.forEach((pg) => out.addPage(pg));
      const bytes = await out.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = job.file.name.replace(/\.pdf$/i, "");
      a.download = `${base}_remaining_${remainingPages.length}p.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { /* swallow */ }
  }

  async function retryJob(jobId: string) {
    if (running) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    try {
      // Take the latest snapshot from state so completedPages/counters are current.
      await processJob(jobs.find((j) => j.id === jobId) || job);
    } finally {
      clearPdfRenderCache();
      setRunning(false);
      setDone(true);
      onCreated();
    }
  }

  async function retryAllFailed() {
    if (running) return;
    const failed = jobs.filter((j) => j.status === "failed" && isJobReady(j));
    if (!failed.length) return;
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    for (const j of failed) {
      if (cancelRef.current) break;
      try { await processJob(jobs.find((x) => x.id === j.id) || j); }
      catch (e: any) { patchJob(j.id, { status: "failed", error: e?.message || "Job crashed" }); }
      clearPdfRenderCache();
    }
    setRunning(false);
    setDone(true);
    onCreated();
  }



  function isJobReady(j: Job) {
    return !!j.subjectId || (j.autoSort && !!j.groupId);
  }

  async function runQueue() {
    if (running) return;
    const ready = jobs.filter(isJobReady);
    if (!ready.length) return;
    cancelRef.current = false;
    setRunning(true);
    setDone(false);

    for (const job of jobs) {
      if (cancelRef.current) break;
      if (!isJobReady(job)) {
        patchJob(job.id, { status: "skipped", error: "No subject chosen" });
        continue;
      }
      try {
        await processJob(job);
      } catch (e: any) {
        patchJob(job.id, { status: "failed", error: e?.message || "Job crashed" });
      }
      clearPdfRenderCache();
    }

    setRunning(false);
    setDone(true);
    onCreated();
  }

  const totals = useMemo(() => {
    let a = 0, d = 0, f = 0, done = 0, failed = 0;
    for (const j of jobs) {
      a += j.added; d += j.duplicates; f += j.failed;
      if (j.status === "done") done++;
      if (j.status === "failed" || j.status === "skipped") failed++;
    }
    return { added: a, dup: d, fail: f, done, failed };
  }, [jobs]);

  const canClose = !running;
  const canStart =
    !running &&
    jobs.length > 0 &&
    jobs.some(isJobReady) &&
    (providerStatus.gemini || providerStatus.lovable);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => canClose && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-6 md:p-8 shadow-2xl shadow-fuchsia-500/10"
      >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/40">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.32em] text-fuchsia-300 uppercase">Jarvis · Batch</p>
              <h2 className="font-bold text-xl text-white">Overnight PDF import</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Queue multiple PDFs, assign each to a subject, hit start and sleep.
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={!canClose} className="text-white/40 hover:text-white disabled:opacity-30">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Default AI provider</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["gemini", "lovable"] as Provider[]).map((p) => {
                const avail = p === "gemini" ? providerStatus.gemini : providerStatus.lovable;
                return (
                  <button
                    key={p}
                    disabled={!avail || running}
                    onClick={() => setProvider(p)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                      provider === p
                        ? "border-fuchsia-400 bg-fuchsia-500/15 text-white"
                        : "border-white/10 bg-white/[0.02] text-white/70"
                    } disabled:opacity-40`}
                  >
                    {p === "gemini" ? "Gemini (free)" : "Lovable AI"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 md:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
              Gemini model for this queue
            </p>
            <select
              value={modelOverride || "gemini-2.5-flash-lite"}
              onChange={(e) => setModelOverride(e.target.value)}
              disabled={true}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-fuchsia-400 disabled:opacity-70"
            >
              <option value="gemini-2.5-flash-lite" className="bg-zinc-900">Gemini 2.5 Flash-Lite (locked)</option>
            </select>
            <p className="text-[10px] text-white/40 mt-1.5">
              The app is locked to Flash-Lite to keep costs predictable. No silent fallback to Flash.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Hint (optional)</p>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              disabled={running}
              placeholder="e.g. Translate explanation to English"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs placeholder:text-white/30 outline-none focus:border-fuchsia-400 disabled:opacity-50"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-center">
            <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                disabled={running}
                className="accent-fuchsia-400"
              />
              Skip duplicates (similar stems)
            </label>
          </div>

          {/* Auto-retry — prominent so you don't miss it */}
          <label
            className={`rounded-xl border-2 p-3 flex items-center gap-3 cursor-pointer transition ${
              autoRetry
                ? "border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_24px_-8px] shadow-emerald-400/60"
                : "border-white/15 bg-white/[0.02]"
            } ${running ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              checked={autoRetry}
              onChange={(e) => setAutoRetry(e.target.checked)}
              disabled={running}
              className="accent-emerald-400 w-4 h-4"
            />
            <div className="flex-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 text-emerald-300" />
                Auto-retry failed pages
              </div>
              <div className="text-[10px] text-white/60 mt-0.5">
                Retries each failing chunk up to {MAX_ATTEMPTS - 1}× with backoff. Other PDFs keep going.
              </div>
            </div>
          </label>
        </div>



        {/* Live Gemini pool status — RPM / RPD with countdown */}
        {provider === "gemini" && <PoolStatusPanel active={running} />}



        {/* Add files */}
        <div className={`mb-5 rounded-2xl border-2 border-dashed border-white/15 bg-black/30 p-5 text-center transition ${running || jobs.length >= MAX_FILES ? "opacity-50" : "hover:border-fuchsia-400/60"}`}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            disabled={running || jobs.length >= MAX_FILES}
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
          />
          <div className="flex flex-col items-center gap-3 text-white/60 py-2">
            <Plus className="w-7 h-7" />
            <div className="text-sm">
              <span className="font-bold text-white">Add PDFs</span>{" "}
              <span className="text-white/40">— up to {MAX_FILES} files, {MAX_BYTES / 1024 / 1024} MB each</span>
            </div>
            <button
              type="button"
              disabled={running || jobs.length >= MAX_FILES}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:bg-fuchsia-400 disabled:opacity-40"
            >
              <Upload className="w-4 h-4" /> Choose PDF files
            </button>
            <div className="text-[10px] text-white/40">{jobs.length}/{MAX_FILES} queued</div>
          </div>
        </div>

        {/* Job rows */}
        {jobs.length > 0 && (
          <div className="mb-5 space-y-2">
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                courses={courses}
                groupsByCourse={groupsByCourse}
                subjectsByGroup={subjectsByGroup}
                ensureGroups={ensureGroups}
                ensureSubjects={ensureSubjects}
                disabled={running}
                onChange={(patch) => patchJob(job.id, patch)}
                onRemove={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                onRetry={() => retryJob(job.id)}
                onDownloadRemaining={() => downloadRemainingPages(job)}
              />
            ))}
          </div>
        )}

        {/* Summary */}
        {(running || done) && (
          <div className="mb-5 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 text-sm text-fuchsia-100">
            <div className="font-bold">
              {running ? `Working through ${jobs.length} file${jobs.length === 1 ? "" : "s"}…` : "Queue finished."}
            </div>
            <div className="text-xs text-fuchsia-200/80 mt-1">
              {totals.added} questions added · {totals.dup} duplicates skipped · {totals.fail} failed inserts ·{" "}
              {totals.done}/{jobs.length} files done {totals.failed > 0 && `· ${totals.failed} skipped/failed`}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            disabled={!canStart}
            onClick={runQueue}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/50 disabled:opacity-40"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoonStar className="w-4 h-4" />}
            {running ? "Running queue…" : `Start queue (${jobs.filter(isJobReady).length} ready)`}
          </button>
          {!running && jobs.some((j) => j.status === "failed") && (
            <button
              onClick={retryAllFailed}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-400/60 bg-emerald-500/15 px-5 py-3.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25"
              title="Re-run every failed PDF starting from its last completed page"
            >
              <Loader2 className="w-4 h-4" /> Retry all failed ({jobs.filter((j) => j.status === "failed").length})
            </button>
          )}
          {running && (
            <button
              onClick={() => { cancelRef.current = true; }}
              className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
            >
              Stop after current
            </button>
          )}
          {!running && (
            <button
              onClick={onClose}
              className="rounded-2xl border border-white/15 px-5 py-3.5 text-sm font-bold text-white/80 hover:bg-white/5"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function JobRow({
  job,
  courses,
  groupsByCourse,
  subjectsByGroup,
  ensureGroups,
  ensureSubjects,
  disabled,
  onChange,
  onRemove,
  onRetry,
  onDownloadRemaining,
}: {
  job: Job;
  courses: Course[];
  groupsByCourse: Record<string, Group[]>;
  subjectsByGroup: Record<string, Subject[]>;
  ensureGroups: (id: string) => void;
  ensureSubjects: (id: string) => void;
  disabled: boolean;
  onChange: (patch: Partial<Job>) => void;
  onRemove: () => void;
  onRetry: () => void;
  onDownloadRemaining: () => void;
}) {
  const groups = groupsByCourse[job.courseId] ?? [];
  const subjects = subjectsByGroup[job.groupId] ?? [];

  useEffect(() => { if (job.courseId) ensureGroups(job.courseId); }, [job.courseId, ensureGroups]);
  useEffect(() => { if (job.groupId) ensureSubjects(job.groupId); }, [job.groupId, ensureSubjects]);

  const pct = job.totalChunks > 0 ? Math.round((job.doneChunks / job.totalChunks) * 100) : 0;
  const StatusIcon =
    job.status === "done" ? CheckCircle2 :
    job.status === "failed" || job.status === "skipped" ? AlertCircle :
    job.status === "running" || job.status === "parsing" ? Loader2 :
    SkipForward;
  const statusColor =
    job.status === "done" ? "text-emerald-400" :
    job.status === "failed" || job.status === "skipped" ? "text-rose-400" :
    job.status === "running" || job.status === "parsing" ? "text-fuchsia-300" :
    "text-white/40";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-start gap-3">
        <StatusIcon className={`w-4 h-4 mt-1 ${statusColor} ${job.status === "running" || job.status === "parsing" ? "animate-spin" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold text-sm text-white truncate">{job.file.name}</span>
            <span className="text-[10px] text-white/40">{(job.file.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select
              value={job.courseId}
              disabled={disabled}
              onChange={(e) => onChange({ courseId: e.target.value, groupId: "", subjectId: "" })}
              className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-2 text-xs text-white outline-none focus:border-fuchsia-400 disabled:opacity-50"
            >
              <option value="">Course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>Y{c.year} · {c.title}</option>
              ))}
            </select>
            <select
              value={job.groupId}
              disabled={disabled || !job.courseId}
              onChange={(e) => onChange({ groupId: e.target.value, subjectId: "" })}
              className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-2 text-xs text-white outline-none focus:border-fuchsia-400 disabled:opacity-50"
            >
              <option value="">Section…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <select
              value={job.autoSort ? "__auto__" : job.subjectId}
              disabled={disabled || !job.groupId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__auto__") onChange({ autoSort: true, subjectId: "" });
                else onChange({ autoSort: false, subjectId: v });
              }}
              className={`rounded-lg border px-2.5 py-2 text-xs text-white outline-none disabled:opacity-50 ${
                job.autoSort ? "border-fuchsia-400 bg-fuchsia-500/10 focus:border-fuchsia-300" : "border-white/15 bg-black/40 focus:border-fuchsia-400"
              }`}
              title={job.autoSort ? `Gemini will sort each question into one of ${subjects.length} subjects in this section` : undefined}
            >
              <option value="">Subject…</option>
              <option value="__auto__">🪄 Auto-sort by subject ({subjects.length})</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-1">
              <button
                disabled={disabled}
                onClick={() => onChange({ mode: "text" })}
                className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                  job.mode === "text" ? "border-emerald-400 bg-emerald-500/15 text-white" : "border-white/10 bg-white/[0.02] text-white/70"
                } disabled:opacity-40`}
              >
                <FileText className="w-3 h-3 inline mr-1" /> Text
              </button>
              <button
                disabled={disabled}
                onClick={() => onChange({ mode: "vision" })}
                className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                  job.mode === "vision" ? "border-fuchsia-400 bg-fuchsia-500/15 text-white" : "border-white/10 bg-white/[0.02] text-white/70"
                } disabled:opacity-40`}
              >
                <ImageIcon className="w-3 h-3 inline mr-1" /> Vision
              </button>
            </div>
          </div>

          {/* Progress / status */}
          {(job.status === "running" || job.status === "parsing") && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-white/60 mb-1">
                <span>{job.currentLabel ?? "Working…"}</span>
                <span className="font-mono text-fuchsia-300">{job.doneChunks}/{job.totalChunks} · {pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {job.status === "done" && (
            <div className="mt-2 text-[11px] text-white/70 space-y-1">
              <div>
                <span className="text-emerald-300 font-bold">{job.added} added</span>
                {job.duplicates > 0 && <span className="text-amber-300"> · {job.duplicates} dup</span>}
                {job.failed > 0 && <span className="text-rose-300"> · {job.failed} failed</span>}
                {job.expectedTotal > 0 && (
                  <span className={job.added + job.duplicates < job.expectedTotal ? "text-amber-300" : "text-white/50"}>
                    {" · "}~{job.expectedTotal} expected
                  </span>
                )}
                {" · "}{job.totalPages} pages
              </div>
              {job.autoSort && job.perSubject && Object.keys(job.perSubject).length > 0 && (
                <details className="text-fuchsia-200/90" open>
                  <summary className="cursor-pointer">
                    🪄 Auto-sorted into {Object.keys(job.perSubject).length} subject{Object.keys(job.perSubject).length === 1 ? "" : "s"}
                    {job.unknownSubject > 0 && (
                      <span className="text-amber-300"> · {job.unknownSubject} unknown → fallback</span>
                    )}
                  </summary>
                  <ul className="mt-1 ml-4 list-disc text-white/70 text-[10px] space-y-0.5">
                    {Object.entries(job.perSubject)
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, n]) => (
                        <li key={name}><span className="text-white">{name}</span> — {n}</li>
                      ))}
                  </ul>
                </details>
              )}
              {job.warnings > 0 && job.warningLog && job.warningLog.length > 0 && (
                <details className="text-amber-300/90">
                  <summary className="cursor-pointer">⚠ {job.warnings} warning{job.warnings === 1 ? "" : "s"} — review</summary>
                  <ul className="mt-1 ml-4 list-disc text-white/60 text-[10px] space-y-0.5">
                    {job.warningLog.slice(-8).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {(job.status === "failed" || job.status === "skipped") && (
            <div className="mt-2 space-y-2">
              <div className="text-[11px] text-rose-300">{job.error || "skipped"}</div>
              <div className="text-[10px] text-white/60">
                Progress: <span className="text-emerald-300 font-bold">{job.completedPages.length}</span>
                {job.totalPages > 0 && <>/{job.totalPages}</>} page{job.completedPages.length === 1 ? "" : "s"} done
                {job.added > 0 && <> · <span className="text-emerald-300">{job.added}</span> imported</>}
                {job.failedChunks.length > 0 && (
                  <> · <span className="text-rose-300 font-bold">{job.failedChunks.length}</span> failed chunk{job.failedChunks.length === 1 ? "" : "s"}</>
                )}
              </div>
              {job.failedChunks.length > 0 && (
                <details className="text-[10px] text-rose-300/90">
                  <summary className="cursor-pointer">Failed page ranges</summary>
                  <ul className="mt-1 ml-4 list-disc text-white/60 space-y-0.5">
                    {job.failedChunks.slice(0, 12).map((c, i) => (
                      <li key={i}>
                        Pages {c.s}{c.e !== c.s ? `–${c.e}` : ""} — {c.error.slice(0, 80)} (tried {c.attempts}×)
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onRetry}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/60 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  <Loader2 className="w-3 h-3" /> Retry remaining pages
                </button>
                {job.completedPages.length < job.totalPages && job.totalPages > 0 && (
                  <button
                    onClick={onDownloadRemaining}
                    disabled={disabled}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
                    title="Download a PDF containing only the pages that didn't import yet"
                  >
                    <FileText className="w-3 h-3" /> Download remaining ({job.totalPages - job.completedPages.length} pages)
                  </button>
                )}
              </div>
            </div>
          )}
          {job.status === "pending" && !job.subjectId && !job.autoSort && (
            <div className="mt-2 text-[10px] text-amber-300/80">Pick course, section & subject — or use 🪄 Auto-sort to let Gemini split by subject.</div>
          )}
          {job.status === "pending" && job.autoSort && (
            <div className="mt-2 text-[10px] text-fuchsia-200/80">
              🪄 Auto-sort on — Gemini will tag each question with one of the {subjects.length} subjects in <span className="text-white">{groups.find((g) => g.id === job.groupId)?.name || "this section"}</span>.
            </div>
          )}
        </div>

        <button
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 text-white/30 hover:text-rose-400 disabled:opacity-30"
          title="Remove from queue"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

type PoolRow = {
  keyLabel: string;
  model: string;
  modelLabel?: string;
  minuteUsed: number;
  minuteLimit: number;
  dailyUsed: number;
  dailyLimit: number;
  nextSlotInMs: number;
  cooldownMs?: number;
  exhaustedToday: boolean;
  unavailable?: boolean;
  smoothPacing?: boolean;
};

function PoolStatusPanel({ active }: { active: boolean }) {
  const getStatus = useServerFn(getGeminiPoolStatus);
  const [data, setData] = useState<{ keyCount: number; preferredModel: string; rows: PoolRow[] } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      getStatus().then((d) => { if (alive) setData(d as any); }).catch(() => {});
    };
    refresh();
    const interval = setInterval(() => { if (!document.hidden) refresh(); }, active ? 5000 : 30000);
    return () => { alive = false; clearInterval(interval); };
  }, [getStatus, active]);

  // 1s ticker so countdown updates smoothly between server polls.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  if (data.keyCount === 0) {
    return (
      <div className="mb-5 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-amber-100 text-xs">
        No Gemini keys configured. Add up to 5 keys in <span className="font-mono">/admin/ai-keys</span> to multiply your daily quota.
      </div>
    );
  }

  // Group rows by key, show the preferred model + a compact list of fallbacks.
  const byKey = new Map<string, PoolRow[]>();
  for (const r of data.rows) {
    if (!byKey.has(r.keyLabel)) byKey.set(r.keyLabel, []);
    byKey.get(r.keyLabel)!.push(r);
  }

  // Find soonest available slot across whole pool to render top-level state.
  const minWait = Math.min(...data.rows.map((r) => (r.exhaustedToday ? Infinity : r.nextSlotInMs)));
  const allExhausted = data.rows.every((r) => r.exhaustedToday);

  function fmtCountdown(ms: number) {
    if (ms <= 0) return "now";
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
  }

  // suppress unused warning
  void tick;

  return (
    <div className="mb-5 rounded-2xl border border-indigo-400/30 bg-indigo-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.28em] text-indigo-300 uppercase">Jarvis Night · Live quota</p>
          <p className="text-xs text-white/60 mt-0.5">
            {data.keyCount} key{data.keyCount === 1 ? "" : "s"} · preferred <span className="font-mono text-white/80">{data.preferredModel}</span>
          </p>
        </div>
        <div className="text-right">
          {allExhausted ? (
            <p className="text-xs font-bold text-rose-300">All keys exhausted today — waiting for reset</p>
          ) : minWait === 0 ? (
            <p className="text-xs font-bold text-emerald-300">Ready to send</p>
          ) : (
            <p className="text-xs font-bold text-amber-300">Next slot in {fmtCountdown(minWait)}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {[...byKey.entries()].map(([keyLabel, rows]) => {
          const preferred = rows.find((r) => r.model === data.preferredModel) ?? rows[0];
          const pctMin = Math.min(100, (preferred.minuteUsed / preferred.minuteLimit) * 100);
          const pctDay = Math.min(100, (preferred.dailyUsed / preferred.dailyLimit) * 100);
          return (
            <div key={keyLabel} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between text-[11px] mb-2">
                <span className="font-bold text-white">{keyLabel}</span>
                <span className="font-mono text-white/50">{preferred.model}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[10px] text-white/60 mb-1">
                    <span>This minute</span>
                    <span className="font-mono">{preferred.minuteUsed}/{preferred.minuteLimit}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full transition-all ${pctMin >= 100 ? "bg-rose-400" : pctMin >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pctMin}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-white/60 mb-1">
                    <span>Today</span>
                    <span className="font-mono">{preferred.dailyUsed}/{preferred.dailyLimit}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full transition-all ${pctDay >= 100 ? "bg-rose-400" : pctDay >= 80 ? "bg-amber-400" : "bg-indigo-400"}`} style={{ width: `${pctDay}%` }} />
                  </div>
                </div>
              </div>
              {preferred.unavailable && (
                <p className="mt-2 text-[10px] text-rose-300">Model unavailable for this key today — falling back to other models.</p>
              )}
              {!preferred.unavailable && preferred.exhaustedToday && (
                <p className="mt-2 text-[10px] text-rose-300">Daily cap hit — auto-falling back to other models.</p>
              )}
              {!preferred.exhaustedToday && !preferred.unavailable && (preferred.cooldownMs ?? 0) > 0 && (
                <p className="mt-2 text-[10px] text-amber-300">Safety cooldown {fmtCountdown(preferred.cooldownMs ?? 0)} — Google asked us to slow down.</p>
              )}
              {!preferred.exhaustedToday && !preferred.unavailable && (preferred.cooldownMs ?? 0) === 0 && preferred.nextSlotInMs > 0 && (
                <p className="mt-2 text-[10px] text-amber-300">
                  {preferred.smoothPacing ? `Pacing — next send in ${fmtCountdown(preferred.nextSlotInMs)} (smooth mode).` : `Waiting ${fmtCountdown(preferred.nextSlotInMs)} for next minute slot.`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-white/40 leading-relaxed">
        Jarvis spaces requests evenly so Google never returns a 429. Counters show REAL sends. Edit per-model limits in <span className="font-mono">/admin/ai-keys</span> when Google changes them.
      </p>
      {data.preferredModel === "gemini-2.5-flash-lite" && (
        <p className="mt-2 text-[10px] text-amber-200/80 leading-relaxed">
          Safe one-key recommendation: RPM 15–30 unless your Google quota truly says higher, RPD as your real daily quota, parallel 3–4, smooth mode on for reliability, cooldown 5–10s. Very high RPM values can cause repeated 429s and make the queue look stuck.
        </p>
      )}
    </div>
  );
}

