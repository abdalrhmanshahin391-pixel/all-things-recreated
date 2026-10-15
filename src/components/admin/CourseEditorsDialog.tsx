import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Course = { id: string; title: string; year: number | null };

/**
 * Admin: choose the courses whose questions a QBank member may edit (stem, options, explanation, correct answer,
 * move, add and delete) from the session, study and exam pages. The member keeps no rights outside these courses.
 */
export function CourseEditorsDialog({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [{ data: cs, error: ce }, { data: rows, error: re }] = await Promise.all([
          (supabase.from as any)("courses").select("id,title,year").order("year", { ascending: true }).order("title", { ascending: true }),
          (supabase.from as any)("course_question_editors").select("course_id").eq("user_id", userId),
        ]);
        if (ce) throw ce;
        if (re) throw re;
        setCourses((cs ?? []) as Course[]);
        const have = new Set<string>((rows ?? []).map((r: any) => r.course_id));
        setPicked(have);
        setOriginal(new Set(have));
      } catch (e: any) {
        toast.error(e?.message || "Could not load the courses. Is the database update applied?");
        setCourses([]);
      }
    })();
  }, [userId]);

  const shown = useMemo(() => (courses ?? []).filter((c) => !query.trim() || c.title.toLowerCase().includes(query.trim().toLowerCase())), [courses, query]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function save() {
    setSaving(true);
    try {
      const add = [...picked].filter((id) => !original.has(id));
      const remove = [...original].filter((id) => !picked.has(id));
      if (add.length) {
        const { error } = await (supabase.from as any)("course_question_editors")
          .insert(add.map((course_id) => ({ user_id: userId, course_id, granted_by: user?.id ?? null })));
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await (supabase.from as any)("course_question_editors").delete().eq("user_id", userId).in("course_id", remove);
        if (error) throw error;
      }
      toast.success(picked.size ? `${userName} can edit the questions of ${picked.size} course(s).` : `${userName} can no longer edit questions.`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Course editing: {userName}</DialogTitle>
          <DialogDescription>
            Tick the courses whose questions this QBank member may edit: change the text, options, explanation and correct answer,
            move a question to another section of the same course, add and delete questions. Nothing outside the ticked courses.
          </DialogDescription>
        </DialogHeader>
        {courses === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-md border p-2">
              {shown.length === 0 ? <div className="p-3 text-sm text-muted-foreground">No courses.</div> : shown.map((c) => (
                <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                  <input type="checkbox" className="h-4 w-4" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex-1 text-sm font-medium">{c.title}</span>
                  {c.year != null ? <span className="text-xs text-muted-foreground">Year {c.year}</span> : null}
                </label>
              ))}
            </div>
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || courses === null}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
