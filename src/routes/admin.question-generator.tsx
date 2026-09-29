import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  KeyRound, Upload, Loader2, Sparkles, Save, Trash2, Copy, CheckCircle2, FileText, BookOpen, Images,
  ClipboardPaste, Check,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getPdfPageCount, getPdfPageTexts, loadPdfForRender } from "@/lib/pdf-page-render";
import { renderPageToCanvas, canvasToJpegBase64 } from "@/lib/pdf-page-image";
import {
  saveApiKey, getApiKeyStatus, testApiKey, runQuestionJob,
} from "@/lib/question-generator.functions";
import { formatQuestionStem } from "@/lib/question-format";
import { parseNotebookLmQuestions, NOTEBOOKLM_MASTER_PROMPT } from "@/lib/notebooklm-parser";

export const Route = createFileRoute("/admin/question-generator")({
  head: () => ({
    meta: [
      { title: "Questions Generator — AquaQBank" },
      { name: "description", content: "Turn PDFs or NotebookLM results into reviewed exam questions." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Questions Generator — AquaQBank" },
      { property: "og:description", content: "Solve with NotebookLM or AI, review, then save to a course." },
    ],
  }),
  component: QuestionGeneratorPage,
});

type Course = { id: string; title: string; year: number; university_id: string | null };
type Group = { id: string; name: string };
type Subject = { id: string; name: string };
type University = { id: string; name: string };

type Option = { letter: string; body: string; is_correct: boolean; wrong_reason: string };
type ItemStatus = { kind: "duplicate" | "failed"; text: string } | null;
type Item = {
  key: string;
  stem: string;
  options: Option[];
  correct_explanation: string;
  reference_note: string;
  selected: boolean;
  status?: ItemStatus;
  is_combined?: boolean;
};

/** Same normalization the database uses for its duplicate rule. */
function stemKey(stem: string): string {
  return stem.replace(/\s+/g, " ").trim().toLowerCase();
}

const MODES = [
  { id: "extract", label: "Extract & sort", hint: "PDF already has questions" },
  { id: "generate", label: "Generate new", hint: "PDF is study material" },
  { id: "solve_ref", label: "Solve with reference", hint: "Answer using a book PDF" },
  { id: "solve", label: "Solve (no reference)", hint: "Answer from medical knowledge" },
] as const;
type Mode = (typeof MODES)[number]["id"];
/** Internal run modes — "detect" finds questions without answering them. */
type RunMode = Mode | "detect";

type Provider = "openai" | "gemini";
type KeyStatus = { saved: boolean; masked: string; model: string; updatedAt?: string | null };
const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-flash-lite-latest",
};
const PROVIDER_LABEL: Record<Provider, string> = { openai: "OpenAI", gemini: "Google Gemini" };



const CHUNK_CHARS = 14_000;

type TextPiece = { text: string; from: number; to: number };

function chunkText(text: string, baseOffset = 0): TextPiece[] {
  const out: TextPiece[] = [];
  const src = text;
  let pos = 0;
  while (src.length - pos > CHUNK_CHARS) {
    let cut = src.lastIndexOf("\n", pos + CHUNK_CHARS);
    if (cut < pos + CHUNK_CHARS * 0.5) cut = pos + CHUNK_CHARS;
    out.push({ text: src.slice(pos, cut), from: baseOffset + pos, to: baseOffset + cut });
    pos = cut;
  }
  if (src.slice(pos).trim().length > 20) {
    out.push({ text: src.slice(pos), from: baseOffset + pos, to: baseOffset + src.length });
  }
  return out;
}

/** Split one text piece into two halves at the nearest line break. */
function splitPiece(p: TextPiece): TextPiece[] {
  const mid = Math.floor(p.text.length / 2);
  let cut = p.text.lastIndexOf("\n", mid);
  if (cut < p.text.length * 0.2) cut = mid;
  const a = { text: p.text.slice(0, cut), from: p.from, to: p.from + cut };
  const b = { text: p.text.slice(cut), from: p.from + cut, to: p.to };
  return [a, b].filter((x) => x.text.trim().length > 20);
}

/** Page numbers covered by a character range, using page start offsets. */
function pagesForRange(pageStarts: number[], from: number, to: number, pageNums?: number[]): string {
  if (!pageStarts.length) return "";
  const pageAt = (off: number) => {
    let idx = 0;
    for (let i = 0; i < pageStarts.length; i++) if (off >= pageStarts[i]) idx = i;
    return pageNums?.[idx] ?? idx + 1;
  };
  const a = pageAt(from);
  const b = pageAt(Math.max(from, to - 1));
  return a === b ? ` (page ${a})` : ` (pages ${a}-${b})`;
}

/** Join page texts into one string and record where each page starts. */
function joinPages(parts: string[]): { text: string; pageStarts: number[] } {
  const sep = "\n\n";
  const pageStarts: number[] = [];
  let offset = 0;
  for (const p of parts) {
    pageStarts.push(offset);
    offset += p.length + sep.length;
  }
  return { text: parts.join(sep), pageStarts };
}

async function readAllPageTexts(
  file: File,
  onPage?: (done: number, total: number) => void,
): Promise<string[]> {
  const total = await getPdfPageCount(file);
  const parts: string[] = [];
  const step = 5;
  for (let from = 1; from <= total; from += step) {
    const to = Math.min(from + step - 1, total);
    const pages = await getPdfPageTexts(file, from, to);
    parts.push(...pages);
    onPage?.(to, total);
  }
  return parts;
}

async function pdfToText(
  file: File,
  onPage?: (done: number, total: number) => void,
): Promise<{ text: string; pageStarts: number[] }> {
  return joinPages(await readAllPageTexts(file, onPage));
}

/** A page counts as "text" only when it carries a real, readable text layer. */
const TEXT_PAGE_MIN_CHARS = 120;
function isTextPage(raw: string): boolean {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  return t.length >= TEXT_PAGE_MIN_CHARS;
}
type Batch = {
  label: string;
  piece?: TextPiece;
  images?: { mime: string; base64: string }[];
  pages?: number[];
  depth: number;
  /** Questions already salvaged from the parent chunk — the retry must not repeat them. */
  avoidStems?: string[];
};



function QuestionGeneratorPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const saveKey = useServerFn(saveApiKey);
  const keyStatus = useServerFn(getApiKeyStatus);
  const testKey = useServerFn(testApiKey);
  const runJob = useServerFn(runQuestionJob);

  // ── key panels (one per provider)
  const [provider, setProvider] = useState<Provider>("openai");
  const [keyInput, setKeyInput] = useState<Record<Provider, string>>({ openai: "", gemini: "" });
  const [model, setModel] = useState<Record<Provider, string>>({
    openai: DEFAULT_MODELS.openai,
    gemini: DEFAULT_MODELS.gemini,
  });
  const [statusMap, setStatusMap] = useState<Record<Provider, KeyStatus | null>>({
    openai: null,
    gemini: null,
  });
  const [keyBusy, setKeyBusy] = useState<Provider | null>(null);
  const status = statusMap[provider];

  // ── source
  const [mode, setMode] = useState<Mode>("extract");
  const [sourceKind, setSourceKind] = useState<"auto" | "text" | "image">("auto");
  const [pageImages, setPageImages] = useState<{ page: number; base64: string }[]>([]);
  const [imagePdfName, setImagePdfName] = useState("");
  const [pagesPerCall, setPagesPerCall] = useState(2);
  const [sourceText, setSourceText] = useState("");
  const [pageStarts, setPageStarts] = useState<number[]>([]);
  const [textPageNums, setTextPageNums] = useState<number[]>([]);
  const [sourceNotice, setSourceNotice] = useState("");

  const [sourceName, setSourceName] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [reading, setReading] = useState("");

  // ── run
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [runLog, setRunLog] = useState<{ text: string; kind: "info" | "ok" | "error" }[]>([]);
  const [runResult, setRunResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [failedBatches, setFailedBatches] = useState<Batch[]>([]);
  const [askSolve, setAskSolve] = useState(false);
  // True after a transcribe-only run until answers are written (answers are placeholders).
  const [detectPending, setDetectPending] = useState(false);
  const [solving, setSolving] = useState(false);
  

  const [items, setItems] = useState<Item[]>([]);

  const batchId = useRef<string | null>(null);

  // ── notebooklm workflow
  const [activeWorkflow, setActiveWorkflow] = useState<"notebooklm" | "ai_run">("notebooklm");
  const [notebooklmInputText, setNotebooklmInputText] = useState("");
  const [notebookPromptCopied, setNotebookPromptCopied] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  async function handleCopyNotebookPrompt() {
    try {
      await navigator.clipboard.writeText(NOTEBOOKLM_MASTER_PROMPT);
      setNotebookPromptCopied(true);
      toast.success("Master NotebookLM Prompt copied!", {
        description: "Paste it into NotebookLM with your questions to solve them.",
      });
      setTimeout(() => setNotebookPromptCopied(false), 2500);
    } catch {
      toast.error("Could not copy prompt to clipboard.");
    }
  }

  function handleParseNotebookLm() {
    if (!notebooklmInputText.trim()) {
      toast.error("Please paste the NotebookLM output first.");
      return;
    }

    const parsed = parseNotebookLmQuestions(notebooklmInputText);
    if (!parsed.length) {
      toast.error("No valid questions found in pasted text. Ensure each question has options (A, B, C, D) and an answer.");
      return;
    }

    const combinedCount = parsed.filter((p) => p.is_combined).length;
    setItems(parsed);
    void persistDraft(parsed);

    toast.success(`Loaded ${parsed.length} question(s) successfully!`, {
      description: combinedCount > 0
        ? `Found ${combinedCount} combined question(s) with statement-by-statement tables.`
        : `Ready for review below.`,
    });

    setTimeout(() => {
      const el = document.getElementById("review-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 150);
  }

  // ── course pickers
  const [universities, setUniversities] = useState<University[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [universityId, setUniversityId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    for (const p of ["openai", "gemini"] as Provider[]) {
      keyStatus({ data: { provider: p } } as any)
        .then((s: any) => {
          setStatusMap((prev) => ({ ...prev, [p]: s }));
          if (s?.model) setModel((prev) => ({ ...prev, [p]: s.model }));
        })
        .catch(() => {});
    }
    (async () => {
      const [uniRes, courseRes] = await Promise.all([
        supabase.from("universities").select("id,name").eq("is_active", true).order("sort_order"),
        supabase.from("courses").select("id,title,year,university_id").eq("kind", "questions").order("year"),
      ]);
      const uni = (uniRes.data ?? []) as University[];
      const cs = (courseRes.data ?? []) as Course[];
      setUniversities(uni);
      setCourses(cs);
      if (uni[0]) setUniversityId(uni[0].id);
    })();
    (async () => {
      const { data } = await (supabase.from as any)("question_gen_batches")
        .select("id,items,mode,notes,subject_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.items?.length) {
        batchId.current = data.id;
        setItems((data.items as Item[]).map((i, n) => ({ ...i, key: i.key ?? `d${n}` })));
        if (data.mode) setMode(data.mode as Mode);
        if (data.notes) setNotes(data.notes);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filteredCourses = useMemo(
    () => (universityId ? courses.filter((c) => c.university_id === universityId) : courses),
    [courses, universityId],
  );

  useEffect(() => {
    const first = filteredCourses[0];
    if (first && !filteredCourses.some((c) => c.id === courseId)) setCourseId(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCourses]);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      const { data } = await (supabase.from as any)("subject_groups")
        .select("id,name").eq("course_id", courseId).order("sort_order");
      const list = (data ?? []) as Group[];
      setGroups(list);
      setGroupId(list[0]?.id ?? "");
      setSubjects([]); setSubjectId("");
    })();
  }, [courseId]);

  useEffect(() => {
    if (!groupId) { setSubjects([]); setSubjectId(""); return; }
    (async () => {
      const { data } = await (supabase.from as any)("subjects")
        .select("id,name").eq("group_id", groupId).order("sort_order");
      const list = (data ?? []) as Subject[];
      setSubjects(list);
      setSubjectId(list[0]?.id ?? "");
    })();
  }, [groupId]);

  async function persistDraft(next: Item[]) {
    try {
      const payload = {
        items: next,
        mode,
        notes: notes || null,
        subject_id: subjectId || null,
        title: sourceName || "Untitled batch",
        updated_at: new Date().toISOString(),
      };
      if (batchId.current) {
        await (supabase.from as any)("question_gen_batches").update(payload).eq("id", batchId.current);
      } else {
        const { data } = await (supabase.from as any)("question_gen_batches")
          .insert(payload).select("id").single();
        batchId.current = data?.id ?? null;
      }
    } catch { /* draft saving is best-effort */ }
  }

  async function handleSaveKey(p: Provider) {
    const raw = keyInput[p].trim();
    if (raw.length < 20) { toast.error(`Paste a full ${PROVIDER_LABEL[p]} key.`); return; }
    setKeyBusy(p);
    try {
      await saveKey({ data: { provider: p, apiKey: raw, model: model[p] } });
      setKeyInput((prev) => ({ ...prev, [p]: "" }));
      const s: any = await keyStatus({ data: { provider: p } } as any);
      setStatusMap((prev) => ({ ...prev, [p]: s }));
      toast.success(`${PROVIDER_LABEL[p]} key saved.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the key.");
    } finally { setKeyBusy(null); }
  }

  async function handleTestKey(p: Provider) {
    setKeyBusy(p);
    try {
      const r: any = await testKey({ data: { provider: p } } as any);
      toast.success(`${PROVIDER_LABEL[p]} works — model ${r.model}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Key test failed.");
    } finally { setKeyBusy(null); }
  }

  async function readPdf(file: File, target: "source" | "reference") {
    setReading(`Reading ${file.name}…`);
    try {
      const { text, pageStarts } = await pdfToText(file, (d, t) =>
        setReading(`Reading ${file.name} — page ${d}/${t}`),
      );
      if (text.trim().length < 40) {
        if (target === "source") {
          toast.message("That PDF has no text layer — reading it as pictures instead.");
          setReading("");
          await readPdfAuto(file);
          return;
        }
        toast.error("No text found in that reference PDF (it looks scanned).");
        return;
      }
      if (target === "source") {
        setSourceText(text);
        setSourceName(file.name);
        setPageStarts(pageStarts);
        setTextPageNums(pageStarts.map((_, i) => i + 1));
        setPageImages([]);
        setImagePdfName("");
        setSourceNotice(`${file.name}: ${pageStarts.length} text page(s) loaded.`);
      } else { setReferenceText(text); setReferenceName(file.name); }
      toast.success(`${file.name}: ${text.length.toLocaleString()} characters read from ${pageStarts.length} page(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that PDF.");
    } finally { setReading(""); }
  }

  /**
   * Mixed PDFs: read every page's text layer, keep the real text pages as text
   * and render the scanned / picture pages as images. Both go into the same run.
   */
  async function readPdfAuto(file: File) {
    setReading(`Reading ${file.name}…`);
    try {
      const rawPages = await readAllPageTexts(file, (d, t) =>
        setReading(`Reading ${file.name} — page ${d}/${t}`),
      );
      const textPages: { page: number; text: string }[] = [];
      const scanned: number[] = [];
      rawPages.forEach((t, i) => {
        if (isTextPage(t)) textPages.push({ page: i + 1, text: t });
        else scanned.push(i + 1);
      });

      const joined = joinPages(textPages.map((p) => p.text));
      setSourceText(joined.text);
      setPageStarts(joined.pageStarts);
      setTextPageNums(textPages.map((p) => p.page));
      setSourceName(file.name);

      const shots: { page: number; base64: string }[] = [];
      if (scanned.length) {
        const doc = await loadPdfForRender(file);
        for (let i = 0; i < scanned.length; i++) {
          const p = scanned[i];
          setReading(`Rendering scanned page ${p} (${i + 1}/${scanned.length})…`);
          const canvas = await renderPageToCanvas(doc, p, 1400);
          shots.push({ page: p, base64: canvasToJpegBase64(canvas, 0.72) });
        }
      }
      setPageImages(shots);
      setImagePdfName(scanned.length ? file.name : "");

      const summary = `${file.name} — ${rawPages.length} page(s): ${textPages.length} text, ${scanned.length} scanned.${
        scanned.length ? " Both kinds will be processed in one run (Gemini reads scans best)." : ""
      }`;
      setSourceNotice(summary);
      if (!textPages.length && !scanned.length) toast.error("That PDF looks empty.");
      else toast.success(summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that PDF.");
    } finally { setReading(""); }
  }

  async function readPdfAsImages(file: File) {
    setReading(`Rendering ${file.name}…`);
    try {
      const doc = await loadPdfForRender(file);
      const total = doc.numPages as number;
      const shots: { page: number; base64: string }[] = [];
      for (let p = 1; p <= total; p++) {
        setReading(`Rendering ${file.name} — page ${p}/${total}`);
        const canvas = await renderPageToCanvas(doc, p, 1400);
        shots.push({ page: p, base64: canvasToJpegBase64(canvas, 0.72) });
      }
      setPageImages(shots);
      setImagePdfName(file.name);
      setSourceNotice(`${file.name}: ${shots.length} page image(s) ready.`);
      toast.success(`${file.name}: ${shots.length} page image(s) ready.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not render that PDF.");
    } finally { setReading(""); }
  }

  function logLine(text: string, kind: "info" | "ok" | "error" = "info") {
    const stamp = new Date().toLocaleTimeString();
    setRunLog((prev) => [...prev.slice(-80), { text: `${stamp} — ${text}`, kind }]);
  }

  function errText(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
      const anyE = e as any;
      return anyE?.message ?? anyE?.body?.message ?? JSON.stringify(anyE).slice(0, 300);
    } catch {
      return "Unknown error";
    }
  }

  function imageBatches(): Batch[] {
    const out: Batch[] = [];
    // OpenAI reads one page per call so nothing is missed on long PDFs.
    const per = provider === "openai" ? 1 : Math.max(1, Math.min(6, pagesPerCall));
    for (let i = 0; i < pageImages.length; i += per) {
      const slice = pageImages.slice(i, i + per);
      out.push({
        label:
          (slice.length === 1
            ? `Page ${slice[0].page}`
            : `Pages ${slice[0].page}-${slice[slice.length - 1].page}`) + " · scanned",
        pages: slice.map((s) => s.page),
        images: slice.map((s) => ({ mime: "image/jpeg", base64: s.base64 })),
        depth: 0,
      });
    }
    return out;
  }

  function textBatches(): Batch[] {
    // OpenAI runs page by page so every page is detected on its own.
    if (provider === "openai" && pageStarts.length > 1) return pageTextBatches();
    return chunkText(sourceText).map((p, i) => ({
      label: `Chunk ${i + 1}${pagesForRange(pageStarts, p.from, p.to, textPageNums)} · text`,
      piece: p,
      depth: 0,
    }));
  }

  /** One call per PDF page (text layer), using the recorded page start offsets. */
  function pageTextBatches(): Batch[] {
    const out: Batch[] = [];
    for (let i = 0; i < pageStarts.length; i++) {
      const from = pageStarts[i];
      const to = i + 1 < pageStarts.length ? pageStarts[i + 1] : sourceText.length;
      const text = sourceText.slice(from, to);
      if (text.trim().length < 20) continue;
      out.push({
        label: `Page ${textPageNums[i] ?? i + 1} · text`,
        piece: { text, from, to },
        depth: 0,
      });
    }
    return out;
  }

  function buildBatches(): Batch[] {
    if (sourceKind === "image") return imageBatches();
    if (sourceKind === "text") return textBatches();
    const out: Batch[] = [];
    if (sourceText.trim().length >= 40) out.push(...textBatches());
    if (pageImages.length) out.push(...imageBatches());
    return out;
  }

  /** Split a batch into two smaller ones, or [] when it can't shrink further. */
  function splitBatch(b: Batch, alreadyKept: string[] = []): Batch[] {
    if (b.depth >= 3) return [];
    const avoid = [...(b.avoidStems ?? []), ...alreadyKept].slice(-60);
    if (b.images?.length) {
      if (b.images.length < 2) return [];
      const mid = Math.ceil(b.images.length / 2);
      const parts: Batch[] = [];
      for (const [n, range] of [
        [0, mid],
        [mid, b.images.length],
      ].entries()) {
        const [s, e] = range as [number, number];
        const pages = (b.pages ?? []).slice(s, e);
        parts.push({
          label: `${b.label.replace(/ \(retry.*$/, "")} (retry ${b.depth + 1}.${n + 1}${pages.length ? ` · page${pages.length > 1 ? "s" : ""} ${pages[0]}${pages.length > 1 ? `-${pages[pages.length - 1]}` : ""}` : ""})`,
          pages,
          images: b.images.slice(s, e),
          depth: b.depth + 1,
          avoidStems: avoid,
        });
      }
      return parts;
    }
    if (!b.piece) return [];
    const halves = splitPiece(b.piece);
    if (halves.length < 2) return [];
    return halves.map((h, n) => ({
      label: `Chunk part ${b.depth + 1}.${n + 1}${pagesForRange(pageStarts, h.from, h.to, textPageNums)} · text`,
      piece: h,
      depth: b.depth + 1,
      avoidStems: avoid,
    }));
  }


  async function runBatches(initial: Batch[], keepExisting: boolean, runMode: RunMode = mode) {
    if (!status?.saved) { toast.error(`Save your ${PROVIDER_LABEL[provider]} key first.`); return; }
    setRunning(true);
    setRunResult(null);
    setRunLog([]);
    setFailedBatches([]);
    setAskSolve(false);
    
    const textCount = initial.filter((b) => !b.images?.length).length;
    const imgCount = initial.length - textCount;
    logLine(
      `Starting — ${initial.length} piece(s) (${textCount} text, ${imgCount} scanned), ${PROVIDER_LABEL[provider]} · ${status.model}, mode ${runMode}.`,
    );

    const queue: Batch[] = [...initial];
    const collected: Item[] = keepExisting ? [...items] : [];
    const stillFailed: Batch[] = [];
    let added = 0;
    let done = 0;
    setProgress({ done: 0, total: queue.length });

    while (queue.length) {
      const b = queue.shift()!;
      const size = b.images?.length
        ? `${b.images.length} page image(s)`
        : `${(b.piece?.text.length ?? 0).toLocaleString()} characters`;
      logLine(`${b.label} sent (${size})…`);
      const avoidNote = b.avoidStems?.length
        ? `\n\nDo NOT repeat any of these questions — they were already extracted:\n${b.avoidStems
            .map((s) => `- ${s.slice(0, 160)}`)
            .join("\n")}`
        : "";
      try {
        const res: any = await runJob({
          data: {
            provider,
            mode: runMode,
            text: b.piece?.text ?? "",
            images: b.images?.length ? b.images : undefined,
            referenceText: runMode === "solve_ref" ? referenceText.slice(0, 120_000) : undefined,
            notes: `${notes}${avoidNote}`.trim() || undefined,
            count: runMode === "generate" ? count : undefined,
            difficulty,
            language,
          },
        });
        if (res?.note) logLine(`${b.label}: ${res.note}`, "info");
        if (res?.model && res.model !== status.model) {
          logLine(`${b.label}: answered by ${res.model}.`, "info");
        }
        const mapped: Item[] = (res.questions ?? []).map((q: any, n: number) => ({
          key: `${Date.now()}-${done}-${n}`,
          stem: q.stem,
          options: q.options,
          correct_explanation: q.correct_explanation,
          reference_note: q.reference_note,
          selected: true,
        }));
        collected.push(...mapped);
        added += mapped.length;
        setItems([...collected]);
        if (mapped.length) logLine(`${b.label}: ${mapped.length} question(s) added.`, "ok");

        const needsSplit = res?.truncated || mapped.length === 0;
        if (needsSplit) {
          const parts = splitBatch(b, mapped.map((m) => m.stem));
          if (parts.length) {
            queue.unshift(...parts);
            setProgress((p) => ({ ...p, total: p.total + parts.length }));
            logLine(
              `${b.label}: ${res?.truncated ? "cut off" : "no usable questions"} — splitting into ${parts.length} smaller part(s) and retrying.`,
              "info",
            );
          } else {
            stillFailed.push(b);
            logLine(
              `${b.label}: could not be completed even after splitting.${res?.rawPreview ? ` Reply started with: ${String(res.rawPreview).slice(0, 160)}` : ""}`,
              "error",
            );
          }
        }
      } catch (e) {
        const msg = errText(e);
        // Key / model / quota problems will fail exactly the same way for every
        // smaller piece — stop the whole run instead of splitting forever.
        const fatal =
          /no usable gemini model|no (gemini|openai) key|forbidden|api key not valid|invalid[_ ]api[_ ]key|permission denied|quota|429|rate limit/i.test(
            msg,
          );
        if (fatal) {
          stillFailed.push(b, ...queue.splice(0, queue.length));
          logLine(`Run stopped: ${msg}`, "error");
          done += 1;
          setProgress((p) => ({ ...p, done }));
          break;
        }
        const parts = splitBatch(b);
        if (parts.length) {
          queue.unshift(...parts);
          setProgress((p) => ({ ...p, total: p.total + parts.length }));
          logLine(`${b.label} failed (${msg}) — splitting into ${parts.length} smaller part(s).`, "info");
        } else {
          stillFailed.push(b);
          logLine(`${b.label} failed: ${msg}`, "error");
        }
      }

      done += 1;
      setProgress((p) => ({ ...p, done }));
    }

    // Flag repeats inside the batch (split retries often re-emit kept questions).
    const seenKeys = new Set<string>();
    let dupCount = 0;
    const marked = collected.map((it) => {
      const k = stemKey(it.stem);
      if (!k) return it;
      if (seenKeys.has(k)) {
        dupCount++;
        return { ...it, selected: false, status: { kind: "duplicate" as const, text: "Same question appears earlier in this batch" } };
      }
      seenKeys.add(k);
      return it;
    });
    setItems(marked);

    setRunning(false);
    setFailedBatches(stillFailed);
    void persistDraft(marked);
    if (dupCount) logLine(`${dupCount} repeated question(s) were flagged as duplicates and unselected.`, "info");

    const stoppedAt = stillFailed.map((b) => b.label).join(", ");

    if (added === 0) {
      setRunResult({
        kind: "error",
        text: stoppedAt
          ? `Nothing could be read. Stopped at: ${stoppedAt}. See the run log for the exact error.`
          : "No questions came back. See the run log below.",
      });
      toast.error("No questions were produced.");
    } else {
      setRunResult({
        kind: stillFailed.length ? "error" : "ok",
        text: stillFailed.length
          ? `${added} question(s) saved. Stopped at: ${stoppedAt} — those parts could not be read even after splitting.`
          : runMode === "detect"
            ? `${added} question${added === 1 ? "" : "s"} detected. Answers and explanations are not written yet.`
            : `${added} question${added === 1 ? "" : "s"} added. Total ready for review: ${collected.length}.`,
      });
      toast.success(`Done — ${added} new question(s).`);
      if (runMode === "detect") { setAskSolve(true); setDetectPending(true); }
    }
  }

  async function handleRun() {
    if (sourceKind === "image" && pageImages.length === 0) { toast.error("Upload a scanned PDF first."); return; }
    if (sourceKind === "text" && sourceText.trim().length < 40) { toast.error("Upload a PDF or paste some text first."); return; }
    const batches = buildBatches();
    if (!batches.length) { toast.error("Upload a PDF or paste some text first."); return; }
    // OpenAI + "Extract & sort": first just detect the questions page by page,
    // then ask whether they should be answered.
    const runMode: RunMode = provider === "openai" && mode === "extract" ? "detect" : mode;
    await runBatches(batches, true, runMode);
  }

  /** Answer the detected questions in small groups, keeping their wording. */
  async function handleSolveDetected() {
    if (!status?.saved) { toast.error(`Save your ${PROVIDER_LABEL[provider]} key first.`); return; }
    const targets = items.filter((i) => i.selected);
    if (!targets.length) { toast.error("Select at least one question first."); return; }
    setAskSolve(false);
    setSolving(true);
    setRunResult(null);
    const solveMode: RunMode = referenceText.trim().length > 200 ? "solve_ref" : "solve";
    const GROUP = 5;
    let solved = 0;
    try {
      for (let i = 0; i < targets.length; i += GROUP) {
        const group = targets.slice(i, i + GROUP);
        const asText = group
          .map((it, n) =>
            [`Q${n + 1}. ${it.stem}`, ...it.options.map((o) => `${o.letter}. ${o.body}`)].join("\n"),
          )
          .join("\n\n");
        logLine(`Solving questions ${i + 1}-${i + group.length}…`);
        const res: any = await runJob({
          data: {
            provider,
            mode: solveMode,
            text: asText,
            referenceText: solveMode === "solve_ref" ? referenceText.slice(0, 120_000) : undefined,
            notes: notes.trim() || undefined,
            difficulty,
            language,
          },
        });
        const back: any[] = res?.questions ?? [];
        setItems((prev) =>
          prev.map((it) => {
            const idx = group.findIndex((g) => g.key === it.key);
            const q = idx >= 0 ? back[idx] : null;
            if (!q) return it;
            return {
              ...it,
              options: it.options.map((o, n) => ({
                ...o,
                is_correct: !!q.options?.[n]?.is_correct,
                wrong_reason: String(q.options?.[n]?.wrong_reason ?? o.wrong_reason),
              })),
              correct_explanation: String(q.correct_explanation ?? it.correct_explanation),
              reference_note: String(q.reference_note ?? it.reference_note),
            };
          }),
        );
        solved += Math.min(back.length, group.length);
        logLine(`Answered ${Math.min(back.length, group.length)} question(s).`, "ok");
      }
      setDetectPending(false);
      setRunResult({ kind: "ok", text: `${solved} question(s) answered with explanations.` });
      toast.success(`Answered ${solved} question(s).`);
    } catch (e) {
      const msg = errText(e);
      logLine(`Solving stopped: ${msg}`, "error");
      setRunResult({ kind: "error", text: `Solving stopped: ${msg}` });
      toast.error(msg);
    } finally {
      setSolving(false);
    }
  }



  function patchItem(key: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function patchOption(key: string, idx: number, patch: Partial<Option>) {
    setItems((prev) =>
      prev.map((i) =>
        i.key === key
          ? { ...i, options: i.options.map((o, n) => (n === idx ? { ...o, ...patch } : o)) }
          : i,
      ),
    );
  }
  function setCorrect(key: string, idx: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.key === key
          ? { ...i, options: i.options.map((o, n) => ({ ...o, is_correct: n === idx, wrong_reason: n === idx ? "" : o.wrong_reason })) }
          : i,
      ),
    );
  }

  function buildExplanation(item: Item): string {
    const lines: string[] = [];
    if (item.correct_explanation) lines.push(item.correct_explanation.trim());
    const wrongs = item.options.filter((o) => !o.is_correct && o.wrong_reason.trim());
    if (wrongs.length) {
      lines.push("");
      lines.push("Why the other options are wrong:");
      for (const w of wrongs) lines.push(`${w.letter}. ${w.wrong_reason.trim()}`);
    }
    const ref = item.reference_note?.trim();
    if (ref && !item.correct_explanation?.toLowerCase().includes("reference:")) {
      lines.push("");
      lines.push(`Reference: ${ref}`);
    }
    return lines.join("\n");
  }

  async function handleSaveToCourse() {
    const chosen = items.filter((i) => i.selected);
    if (!subjectId) { toast.error("Pick a course, section and subject first."); return; }
    if (!chosen.length) { toast.error("Select at least one question."); return; }
    if (detectPending && chosen.some((i) => !String(i.correct_explanation ?? "").trim())) {
      toast.error("These questions were only detected — their answers are placeholders. Solve them (or write an explanation for each) before saving.");
      return;
    }
    setSaving(true);
    let saved = 0;
    let duplicates = 0;
    const failures: string[] = [];
    const savedKeys = new Set<string>();
    const statusByKey = new Map<string, ItemStatus>();
    try {
      // Everything already in this subject — the database refuses repeats.
      const { data: existingRows, count: existing } = await (supabase.from as any)("questions")
        .select("stem", { count: "exact" })
        .eq("subject_id", subjectId);
      const seen = new Set<string>(
        ((existingRows ?? []) as { stem: string }[]).map((r) => stemKey(r.stem ?? "")),
      );
      let order = (existing ?? 0) + 1;

      for (const item of chosen) {
        const key = stemKey(item.stem);
        if (!item.stem.trim()) {
          statusByKey.set(item.key, { kind: "failed", text: "Empty question text" });
          failures.push("empty question");
          continue;
        }
        if (seen.has(key)) {
          duplicates++;
          statusByKey.set(item.key, { kind: "duplicate", text: "Already in this subject" });
          continue;
        }
        try {
          const { data: q, error: qErr } = await (supabase.from as any)("questions")
            .insert({
              subject_id: subjectId,
              stem: formatQuestionStem(item.stem.trim()),
              explanation: buildExplanation(item) || null,
              sort_order: order++,
            })
            .select("id").single();
          if (qErr) throw qErr;
          const rows = item.options.map((o, i) => ({
            question_id: q.id,
            label: o.letter,
            text: o.body.trim(),
            is_correct: o.is_correct,
            sort_order: i + 1,
          }));
          const { error: oErr } = await (supabase.from as any)("question_options").insert(rows);
          if (oErr) throw oErr;
          seen.add(key);
          savedKeys.add(item.key);
          saved++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/duplicate key|stemhash/i.test(msg)) {
            duplicates++;
            statusByKey.set(item.key, { kind: "duplicate", text: "Already in this subject" });
          } else {
            failures.push(`${item.stem.slice(0, 60)}… — ${msg}`);
            statusByKey.set(item.key, { kind: "failed", text: msg });
          }
        }
      }

      // Keep everything that did not make it, flagged, so nothing is silently lost.
      const remaining = items
        .filter((i) => !savedKeys.has(i.key))
        .map((i) => (statusByKey.has(i.key) ? { ...i, selected: false, status: statusByKey.get(i.key)! } : i));
      setItems(remaining);
      void persistDraft(remaining);

      const parts = [`${saved} saved`];
      if (duplicates) parts.push(`${duplicates} skipped as duplicates`);
      if (failures.length) parts.push(`${failures.length} failed`);
      const summary = parts.join(" · ");
      if (saved && !failures.length) toast.success(summary);
      else if (saved) toast.warning(summary);
      else toast.error(summary);
      if (failures.length) {
        setRunResult({ kind: "error", text: `${summary}. Failures: ${failures.slice(0, 5).join(" | ")}` });
      } else if (duplicates) {
        setRunResult({ kind: "ok", text: `${summary}. Duplicates stayed in the list below, flagged in orange.` });
      }
    } catch (e) {
      toast.error(`Saved ${saved}. Stopped: ${e instanceof Error ? e.message : "error"}`);
    } finally { setSaving(false); }
  }


  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-background" />;

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-28 pb-20">
        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-primary">Admin</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-foreground">Questions Generator</h1>
          <p className="mt-2 text-muted-foreground">
            Solve questions with Google NotebookLM or run in-app AI, review answers & explanations, then save directly into any course.
          </p>
        </header>

        {/* ── Workflow Mode Tabs ──────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4 mb-6">
          <button
            type="button"
            onClick={() => setActiveWorkflow("notebooklm")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
              activeWorkflow === "notebooklm"
                ? "bg-indigo-600 text-white shadow-indigo-100"
                : "bg-card border-2 border-border text-foreground hover:bg-muted"
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>Paste from NotebookLM</span>
            <span className="text-[10px] uppercase font-black tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full ml-1">
              Recommended
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkflow("ai_run")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
              activeWorkflow === "ai_run"
                ? "bg-primary text-primary-foreground"
                : "bg-card border-2 border-border text-foreground hover:bg-muted"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>In-App AI (PDF & API Keys)</span>
          </button>
        </div>

        {activeWorkflow === "notebooklm" ? (
          <div className="space-y-6">
            {/* 1. Destination Section */}
            <section className="rounded-2xl border-2 border-border bg-card p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <h2 className="font-bold text-base">1. Destination (Course, Section & Subject)</h2>
                </div>
                {subjectId && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    ✓ Target Selected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Choose the exact course, section, and subject where parsed questions will be added.
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Select label="University" value={universityId} onChange={setUniversityId}
                  options={universities.map((u) => ({ value: u.id, label: u.name }))} />
                <Select label="Course" value={courseId} onChange={setCourseId}
                  options={filteredCourses.map((c) => ({ value: c.id, label: `Y${c.year} · ${c.title}` }))} />
                <Select label="Section" value={groupId} onChange={setGroupId}
                  options={groups.map((g) => ({ value: g.id, label: g.name }))} />
                <Select label="Subject" value={subjectId} onChange={setSubjectId}
                  options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
              </div>
            </section>

            {/* 2. Prompt for NotebookLM */}
            <section className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 mb-1">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    Step 2: Prompt for Google NotebookLM
                  </span>
                  <h3 className="font-bold text-sm text-foreground">
                    Copy the Medical Validator Prompt
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Instructs NotebookLM to ground answers in your book, cite page references, and create statement tables for combined questions.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPromptPreview((v) => !v)}
                    className="px-3 py-1.5 rounded-xl border border-indigo-300 text-xs font-bold text-indigo-700 hover:bg-indigo-100 bg-white"
                  >
                    {showPromptPreview ? "Hide Prompt" : "View Prompt"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyNotebookPrompt}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold shadow-sm"
                  >
                    {notebookPromptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {notebookPromptCopied ? "Copied!" : "Copy Prompt"}
                  </button>
                </div>
              </div>
              {showPromptPreview && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-indigo-900 mb-1">
                    Copy this prompt into NotebookLM together with the questions you copied from your course section:
                  </p>
                  <pre className="p-3.5 rounded-xl bg-background border border-indigo-200 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed text-foreground select-all">
                    {NOTEBOOKLM_MASTER_PROMPT}
                  </pre>
                </div>
              )}
            </section>

            {/* 3. Paste and Parse */}
            <section className="rounded-2xl border-2 border-border bg-card p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-bold text-base">3. Paste NotebookLM Results</h2>
                  <p className="text-xs text-muted-foreground">
                    Paste the solved answers, explanations, and statement breakdown tables directly from NotebookLM below.
                  </p>
                </div>
                {notebooklmInputText.trim() && (
                  <button
                    type="button"
                    onClick={() => setNotebooklmInputText("")}
                    className="text-xs font-bold text-muted-foreground hover:text-destructive underline"
                  >
                    Clear Text
                  </button>
                )}
              </div>

              <textarea
                value={notebooklmInputText}
                onChange={(e) => setNotebooklmInputText(e.target.value)}
                rows={10}
                placeholder={`Paste the solved questions from NotebookLM here...

Format example:
### Question 1
Regarding acute pancreatitis:
1. Serum amylase rises earlier than lipase.
2. Gallstones are the most common etiology.
A. 1 only
B. 2 only
C. Both 1 and 2
D. Neither

- Correct Answer: C
- Book Reference: Schwartz Surgery, 11th ed., Chapter 33, p. 1412
- Explanation:
Serum amylase rises early. Gallstones account for ~50% of cases.

| Statement | Verdict | Explanation from Book |
| :--- | :--- | :--- |
| **1** | **Correct (True)** | Serum amylase rises within 6-12 hours... |
| **2** | **Correct (True)** | Gallstones are the leading cause worldwide... |

- Why other options are incorrect:
• A. Incomplete
• B. Incomplete`}
                className="w-full rounded-xl border-2 border-border bg-background p-3 text-xs font-mono leading-relaxed"
              />

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Supports both structured Markdown text and JSON. Combined questions with statement tables are automatically detected.
                </p>
                <button
                  type="button"
                  onClick={handleParseNotebookLm}
                  disabled={!notebooklmInputText.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-bold disabled:opacity-50 shadow-sm shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  Parse & Load Questions
                </button>
              </div>
            </section>
          </div>
        ) : (
          <>
            {/* ── API keys ───────────────────────────── */}
            <section className="grid gap-4 md:grid-cols-2">
              {(["openai", "gemini"] as Provider[]).map((p) => {
                const st = statusMap[p];
                return (
                  <div key={p} className="rounded-2xl border-2 border-border bg-card p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound size={18} className="text-primary" />
                      <h2 className="font-bold">{PROVIDER_LABEL[p]} key</h2>
                      {st?.saved && (
                        <span className="ml-auto text-xs font-bold text-emerald-600">Saved · {st.masked}</span>
                      )}
                    </div>
                    <div className="grid gap-3">
                  <input
                    type="password"
                    value={keyInput[p]}
                    onChange={(e) => setKeyInput((prev) => ({ ...prev, [p]: e.target.value }))}
                    placeholder={st?.saved ? "Paste a new key to replace" : p === "openai" ? "sk-..." : "AIza..."}
                    className="rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={model[p]}
                    onChange={(e) => setModel((prev) => ({ ...prev, [p]: e.target.value }))}
                    placeholder={DEFAULT_MODELS[p]}
                    className="rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => void handleSaveKey(p)} disabled={keyBusy !== null}
                      className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {keyBusy === p ? <Loader2 className="mx-auto animate-spin" size={16} /> : "Save"}
                    </button>
                    <button
                      type="button" onClick={() => void handleTestKey(p)} disabled={keyBusy !== null || !st?.saved}
                      className="flex-1 rounded-xl border-2 border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50"
                    >
                      Test key
                    </button>
                  </div>
                </div>
                {st?.updatedAt && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Updated {new Date(st.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </section>
        <p className="mt-2 text-xs text-muted-foreground">
          Keys are stored server-side and never sent to students' browsers.
        </p>


        {/* ── Source ───────────────────────────── */}
        <section className="mt-6 rounded-2xl border-2 border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={18} className="text-primary" />
            <h2 className="font-bold">What should the AI do?</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {MODES.map((m) => (
              <button
                key={m.id} type="button" onClick={() => setMode(m.id)}
                className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                  mode === m.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <span className="block text-sm font-bold">{m.label}</span>
                <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>

          {/* Provider + source kind */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold">AI provider</span>
            {(["openai", "gemini"] as Provider[]).map((p) => (
              <button
                key={p} type="button" onClick={() => setProvider(p)}
                className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${
                  provider === p ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                {PROVIDER_LABEL[p]}
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {statusMap[p]?.model ?? DEFAULT_MODELS[p]}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold">Source type</span>
            {([
              ["auto", "Auto (text + scanned)"],
              ["text", "Text PDF / pasted text"],
              ["image", "Image PDF (scanned / pictures)"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button" onClick={() => setSourceKind(id)}
                className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${
                  sourceKind === id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
            {sourceKind !== "text" && (
              <label className="text-sm font-bold flex items-center gap-2">
                Pages per call
                <input
                  type="number" min={1} max={6} value={pagesPerCall}
                  onChange={(e) => setPagesPerCall(Math.max(1, Math.min(6, Number(e.target.value) || 2)))}
                  className="w-16 rounded-lg border-2 border-border bg-background px-2 py-1"
                />
              </label>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {sourceKind === "image" ? (
              <label className="rounded-xl border-2 border-dashed border-border p-4 text-center cursor-pointer hover:bg-muted">
                <input
                  type="file" accept="application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void readPdfAsImages(f); e.target.value = ""; }}
                />
                <Images size={18} className="mx-auto text-primary" />
                <span className="mt-2 block text-sm font-bold">{imagePdfName || "Upload scanned / picture PDF"}</span>
                <span className="block text-[11px] text-muted-foreground">
                  Each page becomes a picture the AI reads · needs a vision model
                </span>
              </label>
            ) : (
              <label className="rounded-xl border-2 border-dashed border-border p-4 text-center cursor-pointer hover:bg-muted">
                <input
                  type="file" accept="application/pdf" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void (sourceKind === "auto" ? readPdfAuto(f) : readPdf(f, "source"));
                    e.target.value = "";
                  }}
                />
                <Upload size={18} className="mx-auto text-primary" />
                <span className="mt-2 block text-sm font-bold">{sourceName || "Upload question / material PDF"}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {sourceKind === "auto"
                    ? "Text pages are read as text, scanned pages as pictures — mixed PDFs work"
                    : "Text is extracted in your browser · images ignored"}
                </span>
              </label>
            )}

            {mode === "solve_ref" ? (
              <label className="rounded-xl border-2 border-dashed border-border p-4 text-center cursor-pointer hover:bg-muted">
                <input
                  type="file" accept="application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void readPdf(f, "reference"); e.target.value = ""; }}
                />
                <BookOpen size={18} className="mx-auto text-primary" />
                <span className="mt-2 block text-sm font-bold">{referenceName || "Upload reference book PDF"}</span>
                <span className="block text-[11px] text-muted-foreground">Used as the evidence for the answers</span>
              </label>
            ) : (
              <div className="rounded-xl border-2 border-border p-4 text-sm text-muted-foreground">
                <FileText size={16} className="mb-2 text-primary" />
                {sourceKind === "image"
                  ? pageImages.length
                    ? `${pageImages.length} page image(s) ready — about ${Math.ceil(pageImages.length / Math.max(1, pagesPerCall))} call(s).`
                    : "No scanned pages loaded yet."
                  : sourceText || pageImages.length
                    ? [
                        sourceText
                          ? `${sourceText.length.toLocaleString()} characters of text — about ${chunkText(sourceText).length} chunk(s).`
                          : "",
                        pageImages.length
                          ? `${pageImages.length} scanned page(s) — about ${Math.ceil(pageImages.length / Math.max(1, pagesPerCall))} picture call(s).`
                          : "",
                      ].filter(Boolean).join(" ")
                    : "No source loaded yet."}
              </div>
            )}
          </div>

          {sourceNotice && (
            <p className="mt-3 rounded-xl border-2 border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-foreground">
              {sourceNotice}
            </p>
          )}


          <textarea
            value={sourceText}
            onChange={(e) => { setSourceText(e.target.value); setPageStarts([]); setTextPageNums([]); }}
            rows={6}
            placeholder="…or paste the questions / material text here"
            className="mt-4 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="My notes for the AI (e.g. follow Guyton, keep 5 options, exam style…)"
            className="mt-3 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {mode === "generate" && (
              <label className="text-sm font-bold flex items-center gap-2">
                Questions
                <input
                  type="number" min={1} max={40} value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 10)))}
                  className="w-20 rounded-lg border-2 border-border bg-background px-2 py-1"
                />
              </label>
            )}
            <label className="text-sm font-bold flex items-center gap-2">
              Difficulty
              <select
                value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}
                className="rounded-lg border-2 border-border bg-background px-2 py-1"
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="text-sm font-bold flex items-center gap-2">
              Language
              <select
                value={language} onChange={(e) => setLanguage(e.target.value as any)}
                className="rounded-lg border-2 border-border bg-background px-2 py-1"
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <button
              type="button" onClick={handleRun} disabled={running || !!reading}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {running ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {running ? `Working ${progress.done}/${progress.total}` : "Run AI"}
            </button>
          </div>
          {reading && <p className="mt-2 text-xs text-muted-foreground">{reading}</p>}
          {provider === "openai" && mode === "extract" && (
            <p className="mt-2 text-xs text-muted-foreground">
              OpenAI reads one page per call and only finds the questions first — you will be asked
              afterwards whether to answer them.
            </p>
          )}

          {askSolve && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold">
              <span>
                {items.filter((i) => i.selected).length} question(s) found. Do you want the AI to
                answer them and write the explanations now?
              </span>
              <button
                type="button"
                onClick={() => void handleSolveDetected()}
                disabled={solving || running}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {solving ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                Yes, solve them
              </button>
              <button
                type="button"
                onClick={() => setAskSolve(false)}
                className="rounded-lg border-2 border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
              >
                No, keep as is
              </button>
            </div>
          )}


          {runResult && (
            <div
              className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${
                runResult.kind === "ok"
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-destructive/50 bg-destructive/10 text-destructive"
              }`}
            >
              <span>{runResult.text}</span>
              {runResult.kind === "error" && (
                <>
                  {failedBatches.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        void runBatches(
                          failedBatches.map((b) => ({ ...b, depth: 0 })),
                          true,
                        )
                      }
                      disabled={running || !!reading}
                      className="rounded-lg border-2 border-destructive/50 px-3 py-1 text-xs font-bold disabled:opacity-50"
                    >
                      Retry failed pieces only ({failedBatches.length})
                    </button>
                  )}
                  <button
                    type="button" onClick={handleRun} disabled={running || !!reading}
                    className="rounded-lg border-2 border-destructive/50 px-3 py-1 text-xs font-bold disabled:opacity-50"
                  >
                    Retry everything
                  </button>
                </>
              )}

            </div>
          )}

          {runLog.length > 0 && (
            <details className="mt-3 rounded-xl border-2 border-border bg-background/60 p-3" open>
              <summary className="cursor-pointer text-xs font-bold text-muted-foreground">
                Run log ({runLog.length})
              </summary>
              <div className="mt-2 max-h-56 overflow-auto space-y-1 font-mono text-[11px] leading-relaxed">
                {runLog.map((l, i) => (
                  <p
                    key={i}
                    className={
                      l.kind === "error" ? "text-destructive" : l.kind === "ok" ? "text-primary" : "text-muted-foreground"
                    }
                  >
                    {l.text}
                  </p>
                ))}
              </div>
            </details>
          )}

        </section>
        </>
        )}

        {/* ── Review ───────────────────────────── */}
        <section id="review-section" className="mt-6 rounded-2xl border-2 border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="font-bold">Review ({items.length})</h2>
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setItems((p) => p.map((i) => ({ ...i, selected: true })))}
                  className="text-xs font-bold underline"
                >Select all</button>
                <button
                  type="button"
                  onClick={() => setItems((p) => p.map((i) => ({ ...i, selected: false })))}
                  className="text-xs font-bold underline"
                >Clear</button>
                <button
                  type="button"
                  onClick={() => { setItems([]); void persistDraft([]); }}
                  className="text-xs font-bold text-destructive underline"
                >Discard batch</button>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-4 mb-5">
            <Select label="University" value={universityId} onChange={setUniversityId}
              options={universities.map((u) => ({ value: u.id, label: u.name }))} />
            <Select label="Course" value={courseId} onChange={setCourseId}
              options={filteredCourses.map((c) => ({ value: c.id, label: `Y${c.year} · ${c.title}` }))} />
            <Select label="Section" value={groupId} onChange={setGroupId}
              options={groups.map((g) => ({ value: g.id, label: g.name }))} />
            <Select label="Subject" value={subjectId} onChange={setSubjectId}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to review yet — paste NotebookLM questions above or run the in-app AI.</p>
          ) : (
            <div className="space-y-4">
              {items.map((item, qi) => (
                <article key={item.key} className="rounded-xl border-2 border-border p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox" checked={item.selected}
                      onChange={(e) => patchItem(item.key, { selected: e.target.checked })}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-xs font-black text-muted-foreground mt-1">#{qi + 1}</span>
                    {item.is_combined && (
                      <span className="mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Combined
                      </span>
                    )}
                    {item.status && (
                      <span
                        className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.status.kind === "duplicate"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-destructive/10 text-destructive"
                        }`}
                        title={item.status.text}
                      >
                        {item.status.kind === "duplicate" ? "Duplicate" : "Failed"}
                      </span>
                    )}
                    <textarea
                      value={item.stem}
                      onChange={(e) => patchItem(item.key, { stem: e.target.value })}
                      rows={Math.min(6, Math.max(2, (item.stem || "").split("\n").length))}
                      className="flex-1 rounded-lg border-2 border-border bg-background px-3 py-2 text-sm font-medium"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button" title="Duplicate"
                        onClick={() => setItems((p) => [...p.slice(0, qi + 1), { ...item, key: `${item.key}-c${Date.now()}` }, ...p.slice(qi + 1)])}
                        className="rounded-lg border-2 border-border p-1.5 hover:bg-muted"
                      ><Copy size={14} /></button>
                      <button
                        type="button" title="Delete"
                        onClick={() => setItems((p) => p.filter((x) => x.key !== item.key))}
                        className="rounded-lg border-2 border-border p-1.5 text-destructive hover:bg-muted"
                      ><Trash2 size={14} /></button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 pl-8">
                    {item.options.map((o, oi) => (
                      <div key={oi} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr] items-center">
                        <button
                          type="button" onClick={() => setCorrect(item.key, oi)}
                          className={`inline-flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-xs font-black ${
                            o.is_correct ? "border-emerald-500 text-emerald-600" : "border-border text-muted-foreground"
                          }`}
                        >
                          {o.is_correct && <CheckCircle2 size={12} />} {o.letter}
                        </button>
                        <input
                          value={o.body}
                          onChange={(e) => patchOption(item.key, oi, { body: e.target.value })}
                          className="rounded-lg border-2 border-border bg-background px-2 py-1 text-sm"
                        />
                        <input
                          value={o.is_correct ? "" : o.wrong_reason}
                          disabled={o.is_correct}
                          placeholder={o.is_correct ? "correct answer" : "why this option is wrong"}
                          onChange={(e) => patchOption(item.key, oi, { wrong_reason: e.target.value })}
                          className="rounded-lg border-2 border-border bg-background px-2 py-1 text-xs disabled:opacity-40"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pl-8 grid gap-2">
                    <textarea
                      value={item.correct_explanation}
                      onChange={(e) => patchItem(item.key, { correct_explanation: e.target.value })}
                      rows={Math.min(8, Math.max(3, (item.correct_explanation || "").split("\n").length))}
                      placeholder="Why the correct answer is correct (and statement breakdown table for combined questions)"
                      className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-xs font-mono"
                    />
                    <input
                      value={item.reference_note}
                      onChange={(e) => patchItem(item.key, { reference_note: e.target.value })}
                      placeholder="Reference (chapter / source)"
                      className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                </article>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button" onClick={handleSaveToCourse} disabled={saving || !subjectId || selectedCount === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Save {selectedCount} to course
              </button>
              <button
                type="button" onClick={() => void persistDraft(items)}
                className="rounded-xl border-2 border-border px-4 py-2 text-sm font-bold hover:bg-muted"
              >
                Keep draft
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
