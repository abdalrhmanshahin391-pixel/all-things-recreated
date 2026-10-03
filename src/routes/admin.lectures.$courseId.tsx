import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
  PlayCircle,
  Upload,
  Loader2,
  CheckCircle2,
  X,
  Video,
  Pencil,
  Eye,
  EyeOff,
  FileText,
  Paperclip,
  HelpCircle,
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
  GraduationCap,
  ListChecks,
  Crown,
  Users,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { compressImage } from "@/lib/image-compress";
import { resolveCourseImageUrl } from "@/lib/course-image";
import { resolveLectureVideoUrl, resolveLecturePdfUrl } from "@/lib/lecture-video";
import { IntroVideoModal } from "@/components/lectures/IntroVideoModal";
import { LectureOwnersModal } from "@/components/lectures/LectureOwnersModal";

export const Route = createFileRoute("/admin/lectures/$courseId")({
  head: () => ({ meta: [{ title: "Course Topics & Lessons — Admin" }] }),
  component: AdminCourseLessonsPage,
});

type Course = {
  id: string;
  title: string;
  year: number;
  semester?: number | null;
  published: boolean;
  university_id: string;
  price: number;
  image_url: string | null;
  intro_image_url: string | null;
  intro_video_url: string | null;
  intro_video_storage_path: string | null;
  intro_free: boolean;
};

type Subject = {
  id: string;
  course_id: string;
  title: string;
  position: number;
  hidden?: boolean;
};

type ItemMeta = {
  poster_url?: string;
  description?: string;
  materials?: { id: string; title: string; url: string }[];
  quiz_type?: "test" | "homework" | "quiz";
  source_type?: "course" | "manual";
  linked_course_id?: string;
  linked_course_title?: string;
};

type Item = {
  id: string;
  subject_id: string;
  kind: "lecture" | "quiz";
  title: string;
  position: number;
  video_url: string | null;
  video_storage_path: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  link_url: string | null;
  is_free: boolean;
};

type Quiz = { id: string; item_id: string };

type Question = {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  explanation: string | null;
  published: boolean;
};

type QOption = {
  id: string;
  question_id: string;
  position: number;
  body: string;
  is_correct: boolean;
};

function parseItemMeta(raw: string | null): ItemMeta {
  if (!raw) return {};
  try {
    if (raw.startsWith("{")) return JSON.parse(raw);
    return { poster_url: raw };
  } catch {
    return { poster_url: raw };
  }
}

function serializeItemMeta(meta: ItemMeta): string {
  return JSON.stringify(meta);
}

function AdminCourseLessonsPage() {
  const { courseId } = Route.useParams();
  const { user, isAdmin, isRealAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<QOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [isHeadStaff, setIsHeadStaff] = useState(false);
  const [ownersCount, setOwnersCount] = useState<number>(0);
  const [showOwnersModal, setShowOwnersModal] = useState(false);
  const [questionCourses, setQuestionCourses] = useState<{ id: string; title: string; year: number }[]>([]);

  // Overview editor states
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [introImageUrl, setIntroImageUrl] = useState("");
  const [introFree, setIntroFree] = useState(true);
  const [published, setPublished] = useState(false);
  const [resolvedPosterUrl, setResolvedPosterUrl] = useState<string | null>(null);
  const [savingOverview, setSavingOverview] = useState(false);
  const [uploadingIntroImg, setUploadingIntroImg] = useState(false);

  // Subject management state
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectTitle, setEditingSubjectTitle] = useState("");

  // Video / Lesson modal or active editing item
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [editingMeta, setEditingMeta] = useState<ItemMeta>({});
  const [savingItem, setSavingItem] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // Question editing state for the active item
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{
    id?: string;
    prompt: string;
    explanation: string;
    options: { id?: string; body: string; is_correct: boolean }[];
  } | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Video preview modal
  const [previewVideo, setPreviewVideo] = useState<{ src: string; title: string } | null>(null);

  // Check permissions (Admin or Lecture Staff for this course)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (isAdmin || isRealAdmin) {
      setIsStaff(true);
      return;
    }
    (supabase.from as any)("lecture_staff")
      .select("course_id")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!data) guardRedirect(navigate);
        else setIsStaff(true);
      });
  }, [loading, user, isAdmin, isRealAdmin, courseId, navigate]);

  // Load Course and Syllabus data
  async function loadData() {
    setLoadingData(true);
    const { data: cData, error: cErr } = await supabase
      .from("courses")
      .select(
        "id,title,year,semester,published,university_id,price,image_url,intro_image_url,intro_video_url,intro_video_storage_path,intro_free",
      )
      .eq("id", courseId)
      .maybeSingle();

    if (cErr || !cData) {
      toast.error("Could not find this lecture course");
      setLoadingData(false);
      return;
    }

    const loadedCourse = cData as unknown as Course;
    setCourse(loadedCourse);
    setIntroVideoUrl(loadedCourse.intro_video_url ?? "");
    setIntroImageUrl(loadedCourse.intro_image_url ?? "");
    setIntroFree(loadedCourse.intro_free ?? true);
    setPublished(loadedCourse.published ?? false);

    resolveCourseImageUrl(loadedCourse.intro_image_url || loadedCourse.image_url).then((url) => {
      setResolvedPosterUrl(url);
    });

    // Load subjects
    const { data: subs } = await (supabase.from as any)("lecture_subjects")
      .select("id,course_id,title,position,hidden")
      .eq("course_id", courseId)
      .order("position");
    const subList = (subs ?? []) as Subject[];
    setSubjects(subList);

    if (subList.length > 0) {
      const { data: its } = await (supabase.from as any)("lecture_items")
        .select(
          "id,subject_id,kind,title,position,video_url,video_storage_path,pdf_url,pdf_storage_path,link_url,is_free",
        )
        .in(
          "subject_id",
          subList.map((s) => s.id),
        )
        .order("position");
      const itList = (its ?? []) as Item[];
      setItems(itList);

      const allItemIds = itList.map((i) => i.id);
      if (allItemIds.length > 0) {
        const { data: qz } = await (supabase.from as any)("lecture_quizzes")
          .select("id,item_id")
          .in("item_id", allItemIds);
        const qzList = (qz ?? []) as Quiz[];
        setQuizzes(qzList);

        if (qzList.length > 0) {
          const { data: qs } = await (supabase.from as any)("lecture_quiz_questions")
            .select("id,quiz_id,position,prompt,explanation,published")
            .in(
              "quiz_id",
              qzList.map((q) => q.id),
            )
            .order("position");
          const qsList = (qs ?? []) as Question[];
          setQuestions(qsList);

          if (qsList.length > 0) {
            const { data: ops } = await (supabase.from as any)("lecture_quiz_options")
              .select("id,question_id,position,body,is_correct")
              .in(
                "question_id",
                qsList.map((q) => q.id),
              )
              .order("position");
            setOptions((ops ?? []) as QOption[]);
          }
        }
      }
    }

    // Load available question bank courses for linking
    const { data: qCourses } = await supabase
      .from("courses")
      .select("id,title,year")
      .eq("kind", "questions")
      .order("year", { ascending: true })
      .order("title", { ascending: true });
    if (qCourses) setQuestionCourses(qCourses);

    // Count enrolled course owners
    const { count: owCount } = await (supabase.from as any)("user_lecture_courses")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId);
    setOwnersCount(owCount ?? 0);

    // Check if caller is designated Head of Staff
    const { data: headRow } = await (supabase.from as any)("site_content")
      .select("value_en")
      .eq("key", `lecture_head_staff_${courseId}`)
      .maybeSingle();
    const headIds = headRow?.value_en ? headRow.value_en.split(",").map((s: string) => s.trim()) : [];
    if (user) {
      setIsHeadStaff(isAdmin || isRealAdmin || headIds.includes(user.id));
    }

    setLoadingData(false);
  }

  useEffect(() => {
    if (isStaff) loadData();
  }, [isStaff, courseId]);

  // Derived mappings
  const itemsBySubject = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((it) => {
      if (!m.has(it.subject_id)) m.set(it.subject_id, []);
      m.get(it.subject_id)!.push(it);
    });
    return m;
  }, [items]);

  const quizByItemId = useMemo(() => {
    const m = new Map<string, Quiz>();
    quizzes.forEach((q) => m.set(q.item_id, q));
    return m;
  }, [quizzes]);

  const questionsByQuizId = useMemo(() => {
    const m = new Map<string, Question[]>();
    questions.forEach((q) => {
      if (!m.has(q.quiz_id)) m.set(q.quiz_id, []);
      m.get(q.quiz_id)!.push(q);
    });
    return m;
  }, [questions]);

  const optionsByQuestionId = useMemo(() => {
    const m = new Map<string, QOption[]>();
    options.forEach((o) => {
      if (!m.has(o.question_id)) m.set(o.question_id, []);
      m.get(o.question_id)!.push(o);
    });
    return m;
  }, [options]);

  // Save Course Overview (Video & Poster)
  async function handleSaveOverview() {
    if (!course) return;
    setSavingOverview(true);
    const { error } = await supabase
      .from("courses")
      .update({
        intro_video_url: introVideoUrl.trim() || null,
        intro_image_url: introImageUrl.trim() || null,
        intro_free: introFree,
        published,
      })
      .eq("id", course.id);
    setSavingOverview(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Course overview video & poster saved!");
      loadData();
    }
  }

  // Upload overview poster image
  async function handleUploadIntroImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !course) return;
    setUploadingIntroImg(true);
    try {
      const img = await compressImage(file, { maxEdge: 1600 });
      const path = `intro/${course.id}/${Date.now()}.${img.ext}`;
      const { error: upErr } = await supabase.storage
        .from("course-images")
        .upload(path, img.file, { upsert: true, contentType: img.contentType });
      if (upErr) throw upErr;
      const { data: pubUrl } = supabase.storage.from("course-images").getPublicUrl(path);
      const finalUrl = pubUrl?.publicUrl || path;
      setIntroImageUrl(finalUrl);
      toast.success("Poster image uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    } finally {
      setUploadingIntroImg(false);
    }
  }

  // Add Subject
  async function handleAddSubject() {
    if (!newSubjectTitle.trim() || !course) return;
    const { error } = await (supabase.from as any)("lecture_subjects").insert({
      course_id: course.id,
      university_id: course.university_id,
      title: newSubjectTitle.trim(),
      position: subjects.length,
    });
    if (error) toast.error(error.message);
    else {
      setNewSubjectTitle("");
      toast.success("Topic added");
      loadData();
    }
  }

  // Reorder Subjects
  async function moveSubject(idx: number, dir: -1 | 1) {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= subjects.length) return;
    const a = subjects[idx];
    const b = subjects[targetIdx];
    await (supabase.from as any)("lecture_subjects").update({ position: b.position }).eq("id", a.id);
    await (supabase.from as any)("lecture_subjects").update({ position: a.position }).eq("id", b.id);
    loadData();
  }

  // Rename Subject
  async function handleSaveSubjectTitle(id: string) {
    if (!editingSubjectTitle.trim()) return;
    const { error } = await (supabase.from as any)("lecture_subjects")
      .update({ title: editingSubjectTitle.trim() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      setEditingSubjectId(null);
      loadData();
    }
  }

  // Delete Subject
  async function handleDeleteSubject(id: string, title: string) {
    if (!confirm(`Delete topic "${title}" and all its lessons?`)) return;
    const { error } = await (supabase.from as any)("lecture_subjects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Topic deleted");
      loadData();
    }
  }

  // Reorder a lesson / test / homework inside its topic. The whole topic is renumbered 0..n-1, so
  // the order is correct even when older rows share the same position number.
  async function moveItem(subjectId: string, idx: number, dir: -1 | 1) {
    const list = itemsBySubject.get(subjectId) ?? [];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    const results = await Promise.all(
      next.map((it, i) =>
        it.position === i ? null : (supabase.from as any)("lecture_items").update({ position: i }).eq("id", it.id),
      ),
    );
    const failed = results.find((r: any) => r?.error);
    if (failed) toast.error(failed.error.message);
    loadData();
  }

  // Delete one lesson / test / homework (its quiz questions go with it; uploaded files are removed too).
  async function handleDeleteItem(item: Item) {
    const what = item.kind === "quiz" ? "test/homework and all of its questions" : "lesson";
    if (!confirm(`Delete "${item.title}"?\n\nThis removes the ${what}. This cannot be undone.`)) return;
    const { error } = await (supabase.from as any)("lecture_items").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Best-effort cleanup of the files uploaded for this lesson (their paths always contain the lesson id).
    const owned = (p: string | null) => (p && p.startsWith(`lesson/${item.id}/`) ? p : null);
    const videoPath = owned(item.video_storage_path);
    const pdfPath = owned(item.pdf_storage_path);
    try {
      if (videoPath) await supabase.storage.from("lecture-videos").remove([videoPath]);
      if (pdfPath) await supabase.storage.from("lecture-pdfs").remove([pdfPath]);
    } catch {
      /* the lesson is already gone; leftover files are harmless */
    }
    if (activeItem?.id === item.id) setActiveItem(null);
    toast.success("Deleted");
    loadData();
  }

  // Add Lesson / Test / Homework to Subject
  async function handleAddItem(subjectId: string, kind: "lecture" | "quiz", quizType?: "test" | "homework" | "quiz") {
    const existing = itemsBySubject.get(subjectId) ?? [];
    let title = `Lesson ${existing.length + 1}`;
    let initialMeta: ItemMeta = {};

    if (kind === "quiz") {
      const qType = quizType || "test";
      const typeLabel = qType === "homework" ? "Homework" : qType === "test" ? "Test" : "Quiz";
      title = `${typeLabel} ${existing.filter((i) => i.kind === "quiz").length + 1}`;
      initialMeta = { quiz_type: qType, source_type: "manual" };
    }

    const { data, error } = await (supabase.from as any)("lecture_items")
      .insert({
        subject_id: subjectId,
        kind,
        title,
        position: existing.length,
        is_free: false,
        link_url: Object.keys(initialMeta).length ? serializeItemMeta(initialMeta) : null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      if (data && kind === "quiz") {
        await (supabase.from as any)("lecture_quizzes").insert({ item_id: data.id });
      }
      toast.success(`${kind === "lecture" ? "Lesson" : (quizType === "homework" ? "Homework" : "Test")} added`);
      await loadData();
      if (data) openItemEditor(data as Item);
    }
  }

  // Open Lesson/Video Editor
  function openItemEditor(item: Item) {
    setActiveItem(item);
    setEditingMeta(parseItemMeta(item.link_url));
  }

  // Save Lesson / Video Details
  async function handleSaveItem() {
    if (!activeItem) return;
    setSavingItem(true);
    const serializedMeta = serializeItemMeta(editingMeta);
    const { error } = await (supabase.from as any)("lecture_items")
      .update({
        title: activeItem.title,
        video_url: activeItem.video_url?.trim() || null,
        video_storage_path: activeItem.video_storage_path,
        pdf_url: activeItem.pdf_url?.trim() || null,
        pdf_storage_path: activeItem.pdf_storage_path,
        link_url: serializedMeta,
        is_free: activeItem.is_free,
      })
      .eq("id", activeItem.id);
    setSavingItem(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Lesson details saved successfully!");
      loadData();
    }
  }

  // Upload PDF for lesson
  async function handleUploadPdf(file: File) {
    if (!activeItem) return;
    setUploadingPdf(true);
    try {
      const key = `lesson/${activeItem.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("lecture-pdfs")
        .upload(key, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      setActiveItem({ ...activeItem, pdf_storage_path: key });
      toast.success("PDF uploaded to private storage");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload PDF");
    } finally {
      setUploadingPdf(false);
    }
  }

  // Upload Video file for lesson
  async function handleUploadVideo(file: File) {
    if (!activeItem) return;
    setUploadingVideo(true);
    try {
      const key = `lesson/${activeItem.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("lecture-videos")
        .upload(key, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      setActiveItem({ ...activeItem, video_storage_path: key });
      toast.success("Video uploaded to protected lecture storage");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload video");
    } finally {
      setUploadingVideo(false);
    }
  }

  // Ensure Quiz exists for the active item
  async function ensureQuizForItem(itemId: string): Promise<string | null> {
    const existing = quizByItemId.get(itemId);
    if (existing) return existing.id;
    const { data, error } = await (supabase.from as any)("lecture_quizzes")
      .insert({ item_id: itemId })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    await loadData();
    return data.id;
  }

  // Open Question Modal
  async function handleOpenQuestionModal(q?: Question) {
    if (!activeItem) return;
    const quizId = await ensureQuizForItem(activeItem.id);
    if (!quizId) return;

    if (q) {
      const qOpts = optionsByQuestionId.get(q.id) ?? [];
      const formattedOpts = qOpts.map((o) => ({
        id: o.id,
        body: o.body,
        is_correct: o.is_correct,
      }));
      while (formattedOpts.length < 4) {
        formattedOpts.push({ id: crypto.randomUUID(), body: "", is_correct: false });
      }
      setEditingQuestion({
        id: q.id,
        prompt: q.prompt,
        explanation: q.explanation ?? "",
        options: formattedOpts,
      });
    } else {
      setEditingQuestion({
        prompt: "",
        explanation: "",
        options: [
          { body: "", is_correct: true },
          { body: "", is_correct: false },
          { body: "", is_correct: false },
          { body: "", is_correct: false },
        ],
      });
    }
    setShowQuestionModal(true);
  }

  // Save Question
  async function handleSaveQuestion() {
    if (!activeItem || !editingQuestion) return;
    const quizId = await ensureQuizForItem(activeItem.id);
    if (!quizId) return;

    if (!editingQuestion.prompt.trim()) {
      toast.error("Please enter a question stem.");
      return;
    }
    const validOpts = editingQuestion.options.filter((o) => o.body.trim());
    if (validOpts.length < 2) {
      toast.error("Please provide at least 2 options.");
      return;
    }
    if (!validOpts.some((o) => o.is_correct)) {
      toast.error("Please mark which option is correct.");
      return;
    }

    setSavingQuestion(true);
    try {
      let questionId = editingQuestion.id;
      if (questionId) {
        // Update question
        await (supabase.from as any)("lecture_quiz_questions")
          .update({
            prompt: editingQuestion.prompt.trim(),
            explanation: editingQuestion.explanation.trim() || null,
          })
          .eq("id", questionId);
        // Delete old options and re-insert
        await (supabase.from as any)("lecture_quiz_options").delete().eq("question_id", questionId);
      } else {
        // Insert new question
        const currentQs = questionsByQuizId.get(quizId) ?? [];
        const { data: newQ, error: qErr } = await (supabase.from as any)("lecture_quiz_questions")
          .insert({
            quiz_id: quizId,
            position: currentQs.length,
            prompt: editingQuestion.prompt.trim(),
            explanation: editingQuestion.explanation.trim() || null,
            published: true,
          })
          .select("id")
          .single();
        if (qErr) throw qErr;
        questionId = newQ.id;
      }

      // Insert options
      await (supabase.from as any)("lecture_quiz_options").insert(
        validOpts.map((o, idx) => ({
          question_id: questionId,
          position: idx,
          body: o.body.trim(),
          is_correct: o.is_correct,
        })),
      );

      toast.success("Question saved successfully!");
      setShowQuestionModal(false);
      setEditingQuestion(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save question");
    } finally {
      setSavingQuestion(false);
    }
  }

  // Delete Question
  async function handleDeleteQuestion(qId: string) {
    if (!confirm("Are you sure you want to delete this question?")) return;
    await (supabase.from as any)("lecture_quiz_options").delete().eq("question_id", qId);
    await (supabase.from as any)("lecture_quiz_questions").delete().eq("id", qId);
    toast.success("Question deleted");
    loadData();
  }

  if (loadingData || !course) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="pt-32 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading course syllabus manager…</p>
        </div>
      </div>
    );
  }

  const activeQuiz = activeItem ? quizByItemId.get(activeItem.id) : null;
  const activeQuestions = activeQuiz ? (questionsByQuizId.get(activeQuiz.id) ?? []) : [];
  const overviewPosterUrl = introImageUrl || resolvedPosterUrl || "";

  return (
    <div className="min-h-screen bg-muted/30 text-foreground pb-24">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-24">
        {/* Top Breadcrumb & Actions Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/lectures/$courseId"
              params={{ courseId }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
            >
              <ArrowLeft size={14} /> Back to Course
            </Link>
            <Link
              to="/admin/lectures"
              search={{ courseId: "" }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
            >
              Lectures Hub
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {(isAdmin || isRealAdmin || isHeadStaff || isStaff) && (
              <button
                type="button"
                onClick={() => setShowOwnersModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/20 transition-colors shadow-2xs"
              >
                <Crown size={13} className="text-amber-600" />
                <Users size={13} />
                Course Owners ({ownersCount})
              </button>
            )}

            <Link
              to="/lectures/$courseId"
              params={{ courseId }}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold hover:border-primary transition-colors"
            >
              <ExternalLink size={13} /> View Student View
            </Link>
          </div>
        </div>

        {/* Course Header Banner */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                  <GraduationCap size={12} /> Year {course.year}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    course.published
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                  }`}
                >
                  {course.published ? <Eye size={12} /> : <EyeOff size={12} />}
                  {course.published ? "Published" : "Draft"}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                {course.title}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Manage topics, lesson videos, materials, and practice questions (Standard &amp; Exam mode).
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Overview Video & Poster Image (Pictures 1 & 2 requirement) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <Video size={16} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Course Overview Video &amp; Poster</h2>
                <p className="text-xs text-muted-foreground">
                  The image shown to students in the overview box before clicking to play the video.
                </p>
              </div>
            </div>
            <button
              onClick={handleSaveOverview}
              disabled={savingOverview}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-sm"
            >
              {savingOverview ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Overview
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Live Student Preview Card */}
            <div className="lg:col-span-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Student Box Preview
              </div>
              <div
                onClick={() => {
                  if (introVideoUrl) {
                    setPreviewVideo({
                      src: introVideoUrl,
                      title: `${course.title} — Overview Video`,
                    });
                  } else {
                    toast.info("Please set an overview video link below first.");
                  }
                }}
                className="group relative aspect-video rounded-xl overflow-hidden border border-border bg-muted cursor-pointer shadow-sm hover:border-primary/50 transition-all"
              >
                {introImageUrl || overviewPosterUrl ? (
                  <img
                    src={introImageUrl || overviewPosterUrl || ""}
                    alt="Course poster"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center bg-muted text-muted-foreground text-xs">
                    No poster image set
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/25 flex flex-col items-center justify-center transition-colors">
                  <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg group-hover:scale-110 transition-transform">
                    <PlayCircle size={24} />
                  </div>
                  <span className="mt-2 text-xs font-semibold text-white drop-shadow">
                    Click to test video popup
                  </span>
                </div>
              </div>
            </div>

            {/* Inputs & Settings */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1">
                  Overview Video Link (Google Drive / YouTube / Vimeo / MP4)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={introVideoUrl}
                    onChange={(e) => setIntroVideoUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or YouTube / Vimeo URL"
                    className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Shield size={12} className="text-emerald-500" />
                  Google Drive links are automatically secured with pop-out blocker and dynamic forensic watermark.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1">
                  Overview Poster Picture URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={introImageUrl}
                    onChange={(e) => setIntroImageUrl(e.target.value)}
                    placeholder="https://... or upload below"
                    className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                  />
                  <label className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold hover:border-primary transition-colors">
                    {uploadingIntroImg ? (
                      <Loader2 size={13} className="animate-spin text-primary" />
                    ) : (
                      <Upload size={13} />
                    )}
                    Upload Pic
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadIntroImage}
                      disabled={uploadingIntroImg}
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={introFree}
                    onChange={(e) => setIntroFree(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  Free preview for all students before purchase
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={published}
                    onChange={(e) => setPublished(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  Course is published
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Topics & Lessons Syllabus Manager (Picture 3 requirement) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <Layers size={16} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Topics &amp; Lessons Syllabus</h2>
                <p className="text-xs text-muted-foreground">
                  Add topics, lessons, video sources, description notes, PDFs, materials, and practice questions.
                </p>
              </div>
            </div>

            {/* Add Topic Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                value={newSubjectTitle}
                onChange={(e) => setNewSubjectTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
                placeholder="New Topic Name (e.g. Pathology Basics)…"
                className="rounded-xl border border-border bg-background px-3.5 py-1.5 text-xs outline-none focus:border-primary w-64"
              />
              <button
                onClick={handleAddSubject}
                disabled={!newSubjectTitle.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 shadow-sm"
              >
                <Plus size={14} /> Add Topic
              </button>
            </div>
          </div>

          {/* Subjects List */}
          {subjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Layers className="mx-auto w-8 h-8 text-muted-foreground/60 mb-2" />
              <div className="text-sm font-bold text-foreground">No Topics Created Yet</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Type a topic name above and click &quot;Add Topic&quot; to begin building your course syllabus.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {subjects.map((sub, sIdx) => {
                const subItems = itemsBySubject.get(sub.id) ?? [];
                return (
                  <div
                    key={sub.id}
                    className="rounded-xl border border-border bg-background overflow-hidden shadow-sm"
                  >
                    {/* Topic Header Bar */}
                    <div className="px-4 py-3 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="grid place-items-center h-6 w-6 rounded-md bg-primary/10 text-primary text-xs font-bold shrink-0">
                          {sIdx + 1}
                        </span>
                        {editingSubjectId === sub.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              autoFocus
                              value={editingSubjectTitle}
                              onChange={(e) => setEditingSubjectTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveSubjectTitle(sub.id);
                                if (e.key === "Escape") setEditingSubjectId(null);
                              }}
                              className="rounded-lg border border-primary bg-card px-2.5 py-1 text-sm outline-none font-bold"
                            />
                            <button
                              onClick={() => handleSaveSubjectTitle(sub.id)}
                              className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-bold"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSubjectId(null)}
                              className="px-2 py-1 rounded border border-border text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="font-bold text-sm text-foreground truncate">{sub.title}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          ({subItems.length} {subItems.length === 1 ? "item" : "items"})
                        </span>
                      </div>

                      {/* Topic Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveSubject(sIdx, -1)}
                          disabled={sIdx === 0}
                          className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                          title="Move Up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveSubject(sIdx, 1)}
                          disabled={sIdx === subjects.length - 1}
                          className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                          title="Move Down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingSubjectId(sub.id);
                            setEditingSubjectTitle(sub.title);
                          }}
                          className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground"
                          title="Rename Topic"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteSubject(sub.id, sub.title)}
                          className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-red-500"
                          title="Delete Topic"
                        >
                          <Trash2 size={13} />
                        </button>
                        <div className="h-4 w-px bg-border mx-1" />
                        <button
                          onClick={() => handleAddItem(sub.id, "lecture")}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-colors"
                        >
                          <Plus size={13} /> Add Video
                        </button>
                        <button
                          onClick={() => handleAddItem(sub.id, "quiz", "test")}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                          title="Add a test for this topic (solve in standard mode)"
                        >
                          <ListChecks size={13} /> + Test
                        </button>
                        <button
                          onClick={() => handleAddItem(sub.id, "quiz", "homework")}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                          title="Add homework for this topic (solve in standard mode)"
                        >
                          <BookOpen size={13} /> + Homework
                        </button>
                      </div>
                    </div>

                    {/* Lessons / Items in Topic */}
                    {subItems.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No videos or questions in this topic yet. Click &quot;+ Add Video&quot;, &quot;+ Test&quot; or &quot;+ Homework&quot; above.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {subItems.map((item, itemIdx) => {
                          const meta = parseItemMeta(item.link_url);
                          const isQuiz = item.kind === "quiz";
                          const hasVideo = !!(item.video_url || item.video_storage_path);
                          const hasPdf = !!(item.pdf_url || item.pdf_storage_path);
                          const quiz = quizByItemId.get(item.id);
                          const qCount = quiz ? (questionsByQuizId.get(quiz.id) ?? []).length : 0;
                          const hasLinkedCourse = isQuiz && !!meta.linked_course_id;

                          return (
                            <div
                              key={item.id}
                              className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-xs text-muted-foreground font-mono w-5">
                                  {itemIdx + 1}.
                                </span>
                                <div className={`grid place-items-center h-8 w-8 rounded-lg border shrink-0 ${
                                  isQuiz
                                    ? meta.quiz_type === "homework"
                                      ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                      : "bg-indigo-50 text-indigo-600 border-indigo-200"
                                    : "bg-card border-border text-primary"
                                }`}>
                                  {isQuiz ? (
                                    meta.quiz_type === "homework" ? <BookOpen size={15} /> : <ListChecks size={15} />
                                  ) : (
                                    <Video size={15} />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground truncate">
                                      {item.title}
                                    </span>
                                    {isQuiz && (
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                        meta.quiz_type === "homework"
                                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                          : "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
                                      }`}>
                                        {meta.quiz_type || "Test"}
                                      </span>
                                    )}
                                    {item.is_free && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                                        Free Preview
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                    {isQuiz ? (
                                      hasLinkedCourse ? (
                                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                          <BookOpen size={11} /> Linked Question Bank: &quot;{meta.linked_course_title || "Course"}&quot; (Standard Mode)
                                        </span>
                                      ) : (
                                        <span className="text-indigo-600 font-medium flex items-center gap-1">
                                          <HelpCircle size={11} /> {qCount} Manual Question{qCount === 1 ? "" : "s"} (Standard Mode)
                                        </span>
                                      )
                                    ) : (
                                      <>
                                        <span
                                          className={
                                            hasVideo ? "text-emerald-600 font-medium" : "text-muted-foreground"
                                          }
                                        >
                                          {hasVideo ? "✓ Video Linked" : "No video"}
                                        </span>
                                        <span>·</span>
                                        <span
                                          className={
                                            hasPdf ? "text-emerald-600 font-medium" : "text-muted-foreground"
                                          }
                                        >
                                          {hasPdf ? "✓ PDF Attached" : "No PDF"}
                                        </span>
                                        {qCount > 0 && (
                                          <>
                                            <span>·</span>
                                            <span className="text-emerald-600 font-medium">
                                              {qCount} practice question{qCount === 1 ? "" : "s"}
                                            </span>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isQuiz && hasLinkedCourse && (
                                  <Link
                                    to="/courses/$courseId/run"
                                    params={{ courseId: meta.linked_course_id! }}
                                    search={{ mode: "study" } as any}
                                    target="_blank"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                                    title="Solve linked course in standard mode"
                                  >
                                    <ExternalLink size={12} className="text-emerald-600" /> Solve (Standard Mode)
                                  </Link>
                                )}

                                {isQuiz && !hasLinkedCourse && quiz && qCount > 0 && (
                                  <Link
                                    to="/lectures/$courseId/quiz/$quizId"
                                    params={{ courseId: course.id, quizId: quiz.id }}
                                    target="_blank"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                                    title="Solve manual questions in standard mode"
                                  >
                                    <ExternalLink size={12} className="text-indigo-600" /> Solve (Standard Mode)
                                  </Link>
                                )}

                                {hasVideo && (
                                  <button
                                    onClick={async () => {
                                      const url = await resolveLectureVideoUrl(
                                        item.video_url,
                                        item.video_storage_path,
                                      );
                                      if (url) {
                                        setPreviewVideo({ src: url, title: item.title });
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold hover:border-primary transition-colors"
                                    title="Watch protected video preview"
                                  >
                                    <PlayCircle size={13} className="text-primary" /> Test Video
                                  </button>
                                )}

                                <button
                                  onClick={() => openItemEditor(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
                                >
                                  <Pencil size={13} /> {isQuiz ? "Edit Questions & Settings" : "Edit Video & Content"}
                                </button>

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => moveItem(sub.id, itemIdx, -1)}
                                    disabled={itemIdx === 0}
                                    className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                                    title="Move up"
                                  >
                                    <ChevronUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => moveItem(sub.id, itemIdx, 1)}
                                    disabled={itemIdx === subItems.length - 1}
                                    className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                                    title="Move down"
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item)}
                                    className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-red-500"
                                    title={isQuiz ? "Delete this test / homework" : "Delete this lesson"}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Dedicated Per-Video Editor Drawer / Modal */}
        {activeItem && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Lesson Content Manager
                  </span>
                  <h3 className="text-lg font-bold text-foreground">{activeItem.title}</h3>
                </div>
                <button
                  onClick={() => setActiveItem(null)}
                  className="h-8 w-8 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                {activeItem.kind === "quiz" ? (
                  /* Dedicated Test & Homework Manager */
                  <div className="space-y-6">
                    {/* Basic Assessment Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Assessment Title
                        </label>
                        <input
                          value={activeItem.title}
                          onChange={(e) => setActiveItem({ ...activeItem, title: e.target.value })}
                          className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary font-bold"
                          placeholder="e.g. Topic 1 Exam or Weekly Homework"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Assessment Classification
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMeta({ ...editingMeta, quiz_type: "test" })}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                              (editingMeta.quiz_type || "test") === "test"
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                : "bg-card border-border text-muted-foreground hover:border-foreground"
                            }`}
                          >
                            <ListChecks size={13} className="inline mr-1 -mt-0.5" /> Test
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMeta({ ...editingMeta, quiz_type: "homework" })}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                              editingMeta.quiz_type === "homework"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                : "bg-card border-border text-muted-foreground hover:border-foreground"
                            }`}
                          >
                            <BookOpen size={13} className="inline mr-1 -mt-0.5" /> Homework
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMeta({ ...editingMeta, quiz_type: "quiz" })}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                              editingMeta.quiz_type === "quiz"
                                ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                                : "bg-card border-border text-muted-foreground hover:border-foreground"
                            }`}
                          >
                            <HelpCircle size={13} className="inline mr-1 -mt-0.5" /> Practice
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                        <input
                          type="checkbox"
                          checked={activeItem.is_free}
                          onChange={(e) => setActiveItem({ ...activeItem, is_free: e.target.checked })}
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                        />
                        Free Preview (Allow unregistered or unenrolled students to solve)
                      </label>
                    </div>

                    {/* Question Source Selection */}
                    <div className="rounded-2xl border border-border bg-muted/20 p-5 space-y-4">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">Question Source</span>
                        <h4 className="text-sm font-bold text-foreground">How should questions be provided for this assessment?</h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingMeta({ ...editingMeta, source_type: "course" })}
                          className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            editingMeta.source_type === "course"
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-border bg-card hover:border-muted-foreground/40"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2 font-bold text-sm text-foreground mb-1">
                              <BookOpen size={16} className="text-primary" />
                              Link Question Bank Course
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Select an existing course from your Question Bank. Students solve in Standard Mode with instant feedback.
                            </p>
                          </div>
                          <span className={`inline-block mt-3 text-[11px] font-bold ${
                            editingMeta.source_type === "course" ? "text-primary" : "text-muted-foreground"
                          }`}>
                            {editingMeta.source_type === "course" ? "● Selected Source" : "○ Select"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingMeta({ ...editingMeta, source_type: "manual" })}
                          className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            (editingMeta.source_type || "manual") === "manual"
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-border bg-card hover:border-muted-foreground/40"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2 font-bold text-sm text-foreground mb-1">
                              <HelpCircle size={16} className="text-primary" />
                              Add Questions Manually
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Write and customize specific questions right here with custom distractors, correct answers, and explanations.
                            </p>
                          </div>
                          <span className={`inline-block mt-3 text-[11px] font-bold ${
                            (editingMeta.source_type || "manual") === "manual" ? "text-primary" : "text-muted-foreground"
                          }`}>
                            {(editingMeta.source_type || "manual") === "manual" ? "● Selected Source" : "○ Select"}
                          </span>
                        </button>
                      </div>

                      {/* Source Option A: Linked Course */}
                      {editingMeta.source_type === "course" && (
                        <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                          <label className="block text-xs font-bold text-foreground">
                            Choose Question Bank Course to Link:
                          </label>
                          <select
                            value={editingMeta.linked_course_id || ""}
                            onChange={(e) => {
                              const selId = e.target.value;
                              const match = questionCourses.find((c) => c.id === selId);
                              setEditingMeta({
                                ...editingMeta,
                                linked_course_id: selId || undefined,
                                linked_course_title: match?.title || undefined,
                              });
                            }}
                            className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary font-medium"
                          >
                            <option value="">-- Choose a Question Bank Course --</option>
                            {questionCourses.map((c) => (
                              <option key={c.id} value={c.id}>
                                Year {c.year} — {c.title}
                              </option>
                            ))}
                          </select>

                          {editingMeta.linked_course_id ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                              <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 size={14} />
                                Students will solve &quot;{editingMeta.linked_course_title || "Linked Course"}&quot; in Standard Mode.
                              </div>
                              <Link
                                to="/courses/$courseId/run"
                                params={{ courseId: editingMeta.linked_course_id }}
                                search={{ mode: "study" } as any}
                                target="_blank"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-card text-xs font-bold text-primary hover:bg-primary/10 transition-colors shadow-2xs"
                              >
                                <ExternalLink size={12} /> Test Solving (Standard Mode)
                              </Link>
                            </div>
                          ) : (
                            <p className="text-xs text-amber-600 font-medium">
                              Please select a question bank course from the dropdown above.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Source Option B: Manual Questions */}
                      {(editingMeta.source_type || "manual") === "manual" && (
                        <div className="mt-4 rounded-xl border border-border bg-card p-4 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                            <div>
                              <div className="font-bold text-sm text-foreground">
                                Manual Assessment Questions
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Students will solve these questions in Standard Study Mode with immediate answers.
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {activeQuiz && activeQuestions.length > 0 && (
                                <Link
                                  to="/lectures/$courseId/quiz/$quizId"
                                  params={{ courseId: course.id, quizId: activeQuiz.id }}
                                  target="_blank"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-primary transition-colors"
                                >
                                  <ExternalLink size={12} /> Test Practice Mode
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenQuestionModal()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/20 transition-colors"
                              >
                                <Plus size={13} /> Add Question
                              </button>
                            </div>
                          </div>

                          {activeQuestions.length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                              No questions added yet. Click &quot;Add Question&quot; above to add questions manually.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {activeQuestions.map((q, qIdx) => {
                                const qOpts = optionsByQuestionId.get(q.id) ?? [];
                                return (
                                  <div
                                    key={q.id}
                                    className="rounded-lg border border-border p-3 bg-muted/20 flex items-start justify-between gap-3 text-xs"
                                  >
                                    <div className="space-y-1 min-w-0 flex-1">
                                      <div className="font-bold text-foreground">
                                        Q{qIdx + 1}. {q.prompt}
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                                        {qOpts.map((o, oIdx) => (
                                          <div
                                            key={o.id}
                                            className={`px-2 py-0.5 rounded text-[11px] ${
                                              o.is_correct
                                                ? "bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/30"
                                                : "text-muted-foreground"
                                            }`}
                                          >
                                            {String.fromCharCode(65 + oIdx)}. {o.body}
                                          </div>
                                        ))}
                                      </div>
                                      {q.explanation && (
                                        <div className="text-[11px] text-muted-foreground pt-1 italic">
                                          Explanation: {q.explanation}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenQuestionModal(q)}
                                        className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteQuestion(q.id)}
                                        className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-red-500"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Assessment Instructions & Guidelines */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Instructions / Guidelines for Students
                      </label>
                      <textarea
                        rows={3}
                        value={editingMeta.description ?? ""}
                        onChange={(e) => setEditingMeta({ ...editingMeta, description: e.target.value })}
                        placeholder="Explain to students the goals of this test or homework, time expectations, or key concepts tested..."
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ) : (
                  /* Standard Lecture Video & Materials Manager */
                  <div className="space-y-6">
                    {/* 1. Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Lesson Title
                        </label>
                        <input
                          value={activeItem.title}
                          onChange={(e) => setActiveItem({ ...activeItem, title: e.target.value })}
                          className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center gap-4 pt-6">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                          <input
                            type="checkbox"
                            checked={activeItem.is_free}
                            onChange={(e) => setActiveItem({ ...activeItem, is_free: e.target.checked })}
                            className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                          />
                          Free Preview (Watch without purchasing)
                        </label>
                      </div>
                    </div>

                    {/* 2. Video Source (Protected Google Drive / YouTube / Storage) */}
                    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                        <Video size={16} className="text-primary" />
                        Video Source
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                          Video URL (Google Drive / YouTube / Vimeo / MP4 link)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            value={activeItem.video_url ?? ""}
                            onChange={(e) => setActiveItem({ ...activeItem, video_url: e.target.value })}
                            placeholder="https://drive.google.com/file/d/... or direct stream link"
                            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <label className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold hover:border-primary transition-colors">
                            {uploadingVideo ? (
                              <Loader2 size={13} className="animate-spin text-primary" />
                            ) : (
                              <Upload size={13} />
                            )}
                            Upload File
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadVideo(f);
                              }}
                              disabled={uploadingVideo}
                            />
                          </label>
                        </div>
                      </div>
                      {activeItem.video_storage_path && (
                        <div className="text-xs text-emerald-600 font-mono">
                          ✓ Uploaded to protected storage: {activeItem.video_storage_path}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Shield size={12} className="text-emerald-500" />
                        Protected by pop-out shielding and dynamic forensic watermark.
                      </p>
                    </div>

                    {/* 3. Description for that video only */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Description &amp; Learning Objectives for this Video
                      </label>
                      <textarea
                        rows={3}
                        value={editingMeta.description ?? ""}
                        onChange={(e) => setEditingMeta({ ...editingMeta, description: e.target.value })}
                        placeholder="Provide a comprehensive summary, key clinical pearls, and high-yield notes for this video..."
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>

                    {/* 4. Attached PDFs & Materials */}
                    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                      <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                        <FileText size={16} className="text-primary" />
                        Lecture PDFs &amp; Slides
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">PDF URL</label>
                          <input
                            value={activeItem.pdf_url ?? ""}
                            onChange={(e) => setActiveItem({ ...activeItem, pdf_url: e.target.value })}
                            placeholder="https://.../lecture-slides.pdf"
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Or Upload PDF Document</label>
                          <label className="w-full cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold hover:border-primary transition-colors">
                            {uploadingPdf ? (
                              <Loader2 size={13} className="animate-spin text-primary" />
                            ) : (
                              <Upload size={13} />
                            )}
                            Select &amp; Upload PDF
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadPdf(f);
                              }}
                              disabled={uploadingPdf}
                            />
                          </label>
                        </div>
                      </div>
                      {activeItem.pdf_storage_path && (
                        <div className="text-xs text-emerald-600 font-mono">
                          ✓ Uploaded to private vault: {activeItem.pdf_storage_path}
                        </div>
                      )}
                    </div>

                    {/* 5. Additional Materials for that video */}
                    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                          <Paperclip size={16} className="text-primary" />
                          Additional Materials &amp; External Links
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = editingMeta.materials ?? [];
                            setEditingMeta({
                              ...editingMeta,
                              materials: [
                                ...cur,
                                { id: crypto.randomUUID(), title: "", url: "" },
                              ],
                            });
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                        >
                          <Plus size={13} /> Add Material Link
                        </button>
                      </div>
                      {(editingMeta.materials ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No additional materials added. Click &quot;Add Material Link&quot; to attach reference links.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {editingMeta.materials!.map((mat, mIdx) => (
                            <div key={mat.id} className="flex items-center gap-2">
                              <input
                                value={mat.title}
                                onChange={(e) => {
                                  const updated = [...editingMeta.materials!];
                                  updated[mIdx].title = e.target.value;
                                  setEditingMeta({ ...editingMeta, materials: updated });
                                }}
                                placeholder="Material Title (e.g. Reference Paper)"
                                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                              />
                              <input
                                value={mat.url}
                                onChange={(e) => {
                                  const updated = [...editingMeta.materials!];
                                  updated[mIdx].url = e.target.value;
                                  setEditingMeta({ ...editingMeta, materials: updated });
                                }}
                                placeholder="https://..."
                                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMeta({
                                    ...editingMeta,
                                    materials: editingMeta.materials!.filter((_, i) => i !== mIdx),
                                  });
                                }}
                                className="h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 6. Practice Questions Attached to this Video */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                        <div className="flex items-center gap-2">
                          <HelpCircle size={16} className="text-primary" />
                          <div>
                            <div className="font-bold text-sm text-foreground">
                              Practice Questions for this Video
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Questions for Standard practice mode &amp; Exam mode.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeQuiz && activeQuestions.length > 0 && (
                            <Link
                              to="/lectures/$courseId/quiz/$quizId"
                              params={{ courseId: course.id, quizId: activeQuiz.id }}
                              target="_blank"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-primary transition-colors"
                            >
                              <ExternalLink size={12} /> Test Practice Mode
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenQuestionModal()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/20 transition-colors"
                          >
                            <Plus size={13} /> Add Question
                          </button>
                        </div>
                      </div>

                      {activeQuestions.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No questions attached to this video yet. Click &quot;Add Question&quot; above to add self-assessment questions.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeQuestions.map((q, qIdx) => {
                            const qOpts = optionsByQuestionId.get(q.id) ?? [];
                            return (
                              <div
                                key={q.id}
                                className="rounded-lg border border-border p-3 bg-muted/20 flex items-start justify-between gap-3 text-xs"
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="font-bold text-foreground">
                                    Q{qIdx + 1}. {q.prompt}
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                                    {qOpts.map((o, oIdx) => (
                                      <div
                                        key={o.id}
                                        className={`px-2 py-0.5 rounded text-[11px] ${
                                          o.is_correct
                                            ? "bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/30"
                                            : "text-muted-foreground"
                                        }`}
                                      >
                                        {String.fromCharCode(65 + oIdx)}. {o.body}
                                      </div>
                                    ))}
                                  </div>
                                  {q.explanation && (
                                    <div className="text-[11px] text-muted-foreground pt-1 italic">
                                      Explanation: {q.explanation}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuestionModal(q)}
                                    className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-foreground"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuestion(q.id)}
                                    className="h-7 w-7 grid place-items-center rounded border border-border text-muted-foreground hover:text-red-500"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-border bg-muted/40 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveItem}
                  disabled={savingItem}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-sm"
                >
                  {savingItem ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save All Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 4: Add / Edit Question Modal */}
        {showQuestionModal && editingQuestion && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h4 className="font-bold text-base text-foreground">
                  {editingQuestion.id ? "Edit Question" : "Add Practice Question"}
                </h4>
                <button
                  onClick={() => setShowQuestionModal(false)}
                  className="h-7 w-7 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Question Stem / Problem
                </label>
                <textarea
                  rows={3}
                  value={editingQuestion.prompt}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, prompt: e.target.value })}
                  placeholder="Enter medical clinical vignette or conceptual question..."
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Answer Options (Click circle to set correct answer)
                </label>
                <div className="space-y-2">
                  {editingQuestion.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = editingQuestion.options.map((o, i) => ({
                            ...o,
                            is_correct: i === oIdx,
                          }));
                          setEditingQuestion({ ...editingQuestion, options: updated });
                        }}
                        className={`h-7 w-7 rounded-full border grid place-items-center text-xs font-bold shrink-0 transition-colors ${
                          opt.is_correct
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}
                      </button>
                      <input
                        value={opt.body}
                        onChange={(e) => {
                          const updated = [...editingQuestion.options];
                          updated[oIdx].body = e.target.value;
                          setEditingQuestion({ ...editingQuestion, options: updated });
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + oIdx)}...`}
                        className={`flex-1 rounded-xl border px-3 py-1.5 text-xs outline-none ${
                          opt.is_correct
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-border bg-background focus:border-primary"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Detailed Explanation (Optional)
                </label>
                <textarea
                  rows={2}
                  value={editingQuestion.explanation}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  placeholder="Explain why the correct answer is right and why the distractors are wrong..."
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuestion}
                  disabled={savingQuestion}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingQuestion ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  Save Question
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Video Popup Preview Modal */}
      {previewVideo && (
        <IntroVideoModal
          src={previewVideo.src}
          title={previewVideo.title}
          onClose={() => setPreviewVideo(null)}
        />
      )}

      {/* Course Owners Dashboard Modal (For Admin & Head of Staff) */}
      {showOwnersModal && (
        <LectureOwnersModal
          courseId={course.id}
          courseTitle={course.title}
          onClose={() => setShowOwnersModal(false)}
        />
      )}
    </div>
  );
}
