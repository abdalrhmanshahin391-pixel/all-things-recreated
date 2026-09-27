import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FolderInput,
  Sparkles,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  amfGetJob,
  amfImportJob,
} from "@/lib/aqua-mcq-forge.functions";

export const Route = createFileRoute("/admin/aqua-mcq-forge/$jobId/import")({
  head: () => ({
    meta: [
      { title: "Import Questions to Course — Aqua MCQ Forge" },
      { name: "description", content: "Import approved questions into course subjects." },
    ],
  }),
  component: AquaMcqForgeImport,
});

function AquaMcqForgeImport() {
  const { jobId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) guardRedirect(navigate);
  }, [loading, user, navigate]);

  const getJob = useServerFn(amfGetJob);
  const importJob = useServerFn(amfImportJob);

  const [job, setJob] = useState<any>(null);
  const [stats, setStats] = useState<any>({ total: 0, approved: 0, imported: 0 });
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  // University -> Course -> Section -> Subject
  const [universities, setUniversities] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [uniId, setUniId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      const res: any = await getJob({ data: { jobId } });
      setJob(res.job);
      setStats(res.stats ?? {});
    } catch (e: any) {
      toast.error(e?.message || "Failed to load job details.");
    } finally {
      setBusy(false);
    }
  }, [getJob, jobId]);

  useEffect(() => {
    void refresh();
    (async () => {
      const [uRes, cRes] = await Promise.all([
        supabase.from("universities").select("id,name").order("sort_order"),
        supabase.from("courses").select("id,title,year,university_id").order("year"),
      ]);
      setUniversities(uRes.data ?? []);
      setCourses(cRes.data ?? []);
      if (uRes.data?.[0]) setUniId(uRes.data[0].id);
    })();
  }, [refresh]);

  const filteredCourses = useMemo(
    () => (uniId ? courses.filter((c) => c.university_id === uniId) : courses),
    [courses, uniId],
  );

  useEffect(() => {
    if (filteredCourses[0] && !filteredCourses.some((c) => c.id === courseId)) {
      setCourseId(filteredCourses[0].id);
    }
  }, [filteredCourses, courseId]);

  useEffect(() => {
    if (!courseId) {
      setGroups([]);
      setGroupId("");
      return;
    }
    (async () => {
      const { data } = await supabase.from("subject_groups").select("id,name").eq("course_id", courseId).order("sort_order");
      setGroups(data ?? []);
      if (data?.[0]) setGroupId(data[0].id);
    })();
  }, [courseId]);

  useEffect(() => {
    if (!groupId) {
      setSubjects([]);
      setSubjectId("");
      return;
    }
    (async () => {
      const { data } = await supabase.from("subjects").select("id,name").eq("group_id", groupId).order("sort_order");
      setSubjects(data ?? []);
      if (data?.[0]) setSubjectId(data[0].id);
    })();
  }, [groupId]);

  async function handleImport() {
    if (!subjectId) {
      toast.error("Please select a target course subject.");
      return;
    }
    if ((stats.approved ?? 0) === 0) {
      toast.error("There are no approved questions to import. Please review and approve questions first.");
      return;
    }

    try {
      setImporting(true);
      const res: any = await importJob({ data: { jobId, subjectId } });
      setImportResult(res);
      toast.success(`Successfully imported ${res.inserted} question(s)!`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
          <Link to="/admin/aqua-mcq-forge/$jobId/review" params={{ jobId }} className="hover:text-indigo-600 transition flex items-center gap-1">
            <ArrowLeft size={13} /> Back to Review
          </Link>
          <span>/</span>
          <span>Import to Course</span>
        </div>

        <div className="mt-4 border-b border-slate-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <FolderInput className="text-indigo-600" size={28} />
            Import Questions to Course
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Push approved questions directly into your live AquaQBank course database with complete explanations.
          </p>
        </div>

        {/* Status card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <Card className="bg-white border-slate-200 shadow-none">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-emerald-600">{stats.approved ?? 0}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ready to Import</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-none">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-amber-600">{stats.pending ?? 0}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Approval</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-none">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-black text-indigo-600">{stats.imported ?? 0}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Already Imported</div>
            </CardContent>
          </Card>
        </div>

        {/* Destination picker */}
        <Card className="mt-6 bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Select Course Destination</CardTitle>
            <CardDescription>
              Choose the University, Course, Section, and Subject where these questions will live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">University</Label>
                <Select value={uniId} onValueChange={setUniId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select University" />
                  </SelectTrigger>
                  <SelectContent>
                    {universities.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Course</Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Course" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        Y{c.year} • {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Section (Subject Group)</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Section" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Subject / Topic</Label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <Link to="/admin/aqua-mcq-forge/$jobId/review" params={{ jobId }}>
                <Button variant="outline">Review Questions First</Button>
              </Link>

              <Button
                onClick={handleImport}
                disabled={importing || (stats.approved ?? 0) === 0 || !subjectId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2"
              >
                {importing && <Loader2 size={16} className="animate-spin" />}
                <FolderInput size={16} /> Import {stats.approved ?? 0} Approved Question(s)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Card */}
        {importResult && (
          <Card className="mt-6 border-emerald-200 bg-emerald-50/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" size={20} />
                Import Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-emerald-950">
              <div>
                <strong>{importResult.inserted}</strong> question(s) successfully inserted into the course.
              </div>
              {importResult.skipped > 0 && <div>{importResult.skipped} duplicate question(s) skipped.</div>}
              {importResult.failed > 0 && <div className="text-rose-600">{importResult.failed} failed.</div>}

              {courseId && (
                <div className="pt-2">
                  <a href={`/courses/${courseId}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-800 bg-white gap-1.5 text-xs">
                      <ExternalLink size={14} /> Open Course Questions Page
                    </Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
