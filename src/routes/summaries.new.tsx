import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, FileText, Image as ImageIcon, ArrowLeft, ArrowRight, Loader2, Upload, X, Sparkles, FileType2, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { generateSummary } from "@/lib/summaries.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "sonner";
import { z } from "zod";

const SearchSchema = z.object({
  source: z.enum(["subject", "text", "photos", "pdf", "flags"]).optional(),
  courseId: z.string().optional(),
  subjectId: z.string().optional(),
});

export const Route = createFileRoute("/summaries/new")({
  head: () => ({ meta: [{ title: "New Summary — AI Cheat Sheet" }] }),
  validateSearch: (s) => SearchSchema.parse(s),
  component: NewSummary,
});

type Source = "subject" | "text" | "photos" | "pdf" | "flags";

function NewSummary() {
  const { user, profile, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<Source>(search.source ?? "subject");

  // step 1 data
  const [universityId, setUniversityId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>(search.courseId ?? "");
  const [groupId, setGroupId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>(search.subjectId ?? "");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<{ name: string; mimeType: string; base64: string; preview: string }[]>([]);
  const [pdfFile, setPdfFile] = useState<{ name: string; base64: string; sizeKb: number } | null>(null);

  // step 2 data
  const [length, setLength] = useState<"short" | "standard" | "comprehensive">("standard");
  const [tone, setTone] = useState<"exam" | "concept" | "revision">("exam");
  const [provider, setProvider] = useState<"lovable" | "gemini">("gemini");
  const [titleOverride, setTitleOverride] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (profile?.full_name && !authorName) setAuthorName(profile.full_name);
  }, [profile, authorName]);

  const genFn = useServerFn(generateSummary);

  const { data: universities = [] } = useQuery({
    queryKey: ["sum-universities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("universities")
        .select("id,name,short_name")
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []) as { id: string; name: string; short_name: string | null }[];
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["sum-courses", universityId],
    queryFn: async () => {
      let q = (supabase.from as any)("courses").select("id,title,year,university_id").order("year");
      if (universityId) q = q.eq("university_id", universityId);
      const { data } = await q;
      return (data ?? []) as { id: string; title: string; year: number; university_id: string | null }[];
    },
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["sum-groups", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("subject_groups")
        .select("id,name")
        .eq("course_id", courseId)
        .order("sort_order");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["sum-subjects", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("subjects")
        .select("id,name")
        .eq("group_id", groupId)
        .order("sort_order");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // If a subjectId is preselected via deep link, look up its group so the dropdowns resolve.
  useEffect(() => {
    if (!search.subjectId || groupId) return;
    (async () => {
      const { data } = await (supabase.from as any)("subjects")
        .select("id,group_id,subject_groups!inner(course_id)")
        .eq("id", search.subjectId)
        .maybeSingle();
      if (data) {
        if (!courseId) setCourseId(data.subject_groups?.course_id ?? "");
        setGroupId(data.group_id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.subjectId]);

  async function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        const i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });
  }

  async function handlePhotos(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 10 - photos.length);
    const newOnes: typeof photos = [];
    for (const f of arr) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image.`);
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`${f.name} is over 8 MB.`);
        continue;
      }
      try {
        const b64 = await fileToBase64(f);
        newOnes.push({
          name: f.name,
          mimeType: f.type,
          base64: b64,
          preview: URL.createObjectURL(f),
        });
      } catch (err: any) {
        toast.error(`Failed to read ${f.name}: ${err?.message || "unknown error"}`);
      }
    }
    setPhotos((p) => [...p, ...newOnes].slice(0, 10));
  }

  async function handlePdf(file: File | null | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF is over 20 MB.");
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      setPdfFile({ name: file.name, base64: b64, sizeKb: Math.round(file.size / 1024) });
    } catch (err: any) {
      toast.error(`Failed to read PDF: ${err?.message || "unknown error"}`);
    }
  }

  function canNext() {
    if (source === "subject") return !!subjectId;
    if (source === "flags") return !!subjectId;
    if (source === "text") return text.trim().length >= 20;
    if (source === "pdf") return !!pdfFile;
    return photos.length > 0;
  }

  async function generate() {
    if (!canNext()) return;
    setGenerating(true);
    try {
      const base = { length, tone, authorName: authorName.trim() || undefined, titleOverride: titleOverride.trim() || undefined, provider };
      let res;
      if (source === "subject") res = await genFn({ data: { kind: "subject", subjectId, ...base } });
      else if (source === "flags") res = await genFn({ data: { kind: "flags", subjectId, ...base } });
      else if (source === "text") res = await genFn({ data: { kind: "text", text, ...base } });
      else if (source === "pdf") res = await genFn({ data: { kind: "pdf", pdfBase64: pdfFile!.base64, filename: pdfFile!.name, ...base } });
      else
        res = await genFn({
          data: {
            kind: "photos",
            images: photos.map((p) => ({ mimeType: p.mimeType, base64: p.base64 })),
            ...base,
          },
        });
      if ((res as any).providerUsed && (res as any).providerRequested && (res as any).providerUsed !== (res as any).providerRequested) {
        toast.info("Used Lovable AI — no Gemini key saved.");
      } else {
        toast.success("Summary created!");
      }
      navigate({ to: "/summaries/$summaryId", params: { summaryId: res.id } });
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate.");
    } finally {
      setGenerating(false);
    }
  }

  if (!loading && !user) {
    navigate({ to: "/login" });
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-slate-900">
      <SiteHeader />

      <div className="max-w-3xl mx-auto px-6 pt-28 pb-24">
        <Link to="/summaries" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={14} /> Back to summaries
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${step === 1 ? "bg-indigo-600 text-white" : "bg-emerald-500 text-white"}`}>1</span>
          <span className="text-sm font-bold text-slate-700">Source</span>
          <span className="flex-1 h-px bg-slate-200" />
          <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${step === 2 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>2</span>
          <span className="text-sm font-bold text-slate-700">Style</span>
        </div>

        {step === 1 && (
          <div className="mt-8 space-y-6">
            <h1 className="text-3xl font-black tracking-tight">Where should we get the material?</h1>

            {/* source picker */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SourceCard active={source === "subject"} onClick={() => setSource("subject")} icon={<BookOpen size={18} />} label="From a subject" />
              <SourceCard active={source === "flags"} onClick={() => setSource("flags")} icon={<Flag size={18} />} label="From my red flags" />
              <SourceCard active={source === "text"} onClick={() => setSource("text")} icon={<FileText size={18} />} label="From text" />
              <SourceCard active={source === "photos"} onClick={() => setSource("photos")} icon={<ImageIcon size={18} />} label="From photos" />
              <SourceCard active={source === "pdf"} onClick={() => setSource("pdf")} icon={<FileType2 size={18} />} label="From PDF" />
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              {(source === "subject" || source === "flags") && (
                <div className="space-y-4">
                  {source === "flags" && (
                    <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-700">
                      <Flag className="inline w-3 h-3 mr-1" />
                      Builds a focused cheat sheet from the questions you red-flagged in this subject.
                    </div>
                  )}
                  <Select label="University" value={universityId} onChange={(v) => { setUniversityId(v); setCourseId(""); setGroupId(""); setSubjectId(""); }}>
                    <option value="">All universities</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                  <Select label="Course" value={courseId} onChange={(v) => { setCourseId(v); setGroupId(""); setSubjectId(""); }}>
                    <option value="">{universityId ? "Choose course…" : "Choose course…"}</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>Y{c.year} · {c.title}</option>
                    ))}
                  </Select>
                  <Select label="Subject area (e.g. Cardiac)" value={groupId} onChange={(v) => { setGroupId(v); setSubjectId(""); }} disabled={!courseId}>
                    <option value="">{courseId ? "Choose subject area…" : "Pick a course first"}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                  <Select label="Topic (e.g. Myocardial Infarction)" value={subjectId} onChange={setSubjectId} disabled={!groupId}>
                    <option value="">{groupId ? "Choose topic…" : "Pick a subject area first"}</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
              )}

              {source === "text" && (
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2 block">Paste your notes</label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    placeholder="Paste book pages, lecture notes, or any educational text (min 20 chars)…"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-2 text-xs text-slate-500">{text.length} characters</p>
                </div>
              )}

              {source === "photos" && (
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2 block">
                    Upload pages or screenshots (up to 10)
                  </label>
                  <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                    <Upload className="mx-auto text-slate-400" />
                    <p className="mt-2 text-sm font-bold text-slate-700">Click or drop images</p>
                    <p className="text-xs text-slate-500">JPG / PNG, up to 8 MB each</p>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handlePhotos(e.target.files)} />
                  </label>
                  {photos.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {photos.map((p, i) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden border border-slate-200">
                          <img src={p.preview} alt={p.name} className="w-full h-24 object-cover" />
                          <button
                            onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {source === "pdf" && (
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2 block">
                    Upload a PDF (lecture, chapter, slides)
                  </label>
                  {!pdfFile ? (
                    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors">
                      <FileType2 className="mx-auto text-slate-400" />
                      <p className="mt-2 text-sm font-bold text-slate-700">Click or drop a PDF</p>
                      <p className="text-xs text-slate-500">Up to 20 MB · we'll read every page</p>
                      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => handlePdf(e.target.files?.[0])} />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600 shrink-0">
                          <FileType2 size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">{pdfFile.name}</p>
                          <p className="text-xs text-slate-500">{pdfFile.sizeKb} KB · ready</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPdfFile(null)}
                        className="grid h-8 w-8 place-items-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-rose-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Best for textbook chapters, slide decks, or lecture handouts. Scanned PDFs work too.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                disabled={!canNext()}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-8 space-y-6">
            <h1 className="text-3xl font-black tracking-tight">Style your summary</h1>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
              <Group label="Length">
                <Pill active={length === "short"} onClick={() => setLength("short")}>Short · 2-3 pages</Pill>
                <Pill active={length === "standard"} onClick={() => setLength("standard")}>Standard · 4-6 pages</Pill>
                <Pill active={length === "comprehensive"} onClick={() => setLength("comprehensive")}>Comprehensive · 8-12 pages</Pill>
              </Group>

              <Group label="Tone">
                <Pill active={tone === "exam"} onClick={() => setTone("exam")}>Exam-focused</Pill>
                <Pill active={tone === "concept"} onClick={() => setTone("concept")}>Conceptual</Pill>
                <Pill active={tone === "revision"} onClick={() => setTone("revision")}>Quick revision</Pill>
              </Group>

              <Group label="AI provider">
                <Pill active={provider === "gemini"} onClick={() => setProvider("gemini")}>
                  Gemini (free · uses saved key)
                </Pill>
                <Pill active={provider === "lovable"} onClick={() => setProvider("lovable")}>
                  Lovable AI (paid · always available)
                </Pill>
              </Group>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-1.5 block">Title (optional)</label>
                  <input
                    value={titleOverride}
                    onChange={(e) => setTitleOverride(e.target.value)}
                    placeholder="Auto from content"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-1.5 block">Your name</label>
                  <input
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Shown on cover"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                disabled={generating}
                onClick={generate}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-pink-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl disabled:opacity-60"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generating ? "Crafting your summary…" : "Generate summary"}
              </button>
            </div>
            {generating && (
              <p className="text-center text-sm text-slate-500">
                This usually takes 10-25 seconds. Hang tight ✨
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${
        active
          ? "border-transparent bg-gradient-to-br from-indigo-600 to-pink-500 text-white shadow-lg"
          : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
      }`}
    >
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-white/20" : "bg-indigo-50 text-indigo-600"}`}>
        {icon}
      </span>
      <span className="font-bold text-sm">{label}</span>
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-1.5 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

function Group({ label, children }: any) {
  return (
    <div>
      <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
        active
          ? "bg-slate-900 text-white shadow"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
