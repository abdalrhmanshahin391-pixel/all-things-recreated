import React, { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  ChevronDown,
  Folder,
  FolderPlus,
  Loader2,
  Plus,
  Search,
  X,
  Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

export type CourseSectionGroup = {
  id: string;
  name: string;
  sort_order: number;
  subjects: Array<{ id: string; name: string; sort_order: number }>;
};

export interface MoveQuestionControlProps {
  questionId: string;
  currentSubjectId?: string;
  courseId: string;
  courseSections: CourseSectionGroup[];
  onMoveQuestion: (
    questionId: string,
    targetSubjectId?: string,
    createNewSubject?: {
      courseId: string;
      name: string;
      groupId?: string;
      newGroupName?: string;
    },
  ) => Promise<void>;
  className?: string;
}

export function MoveQuestionControl({
  questionId,
  currentSubjectId,
  courseId,
  courseSections,
  onMoveQuestion,
  className = "",
}: MoveQuestionControlProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);

  // New section creation state
  const [showCreate, setShowCreate] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [creating, setCreating] = useState(false);

  // Lookup current subject
  const currentSubject = useMemo(() => {
    if (!currentSubjectId) return null;
    for (const g of courseSections) {
      const match = g.subjects.find((s) => s.id === currentSubjectId);
      if (match) return { ...match, groupName: g.name };
    }
    return null;
  }, [courseSections, currentSubjectId]);

  // Filter groups and subjects based on search query
  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return courseSections;

    return courseSections
      .map((g) => {
        const groupMatches = g.name.toLowerCase().includes(q);
        const matchedSubjects = g.subjects.filter(
          (s) => groupMatches || s.name.toLowerCase().includes(q),
        );
        return {
          ...g,
          subjects: matchedSubjects,
        };
      })
      .filter((g) => g.subjects.length > 0);
  }, [courseSections, filter]);

  const totalFilteredCount = useMemo(() => {
    return filteredGroups.reduce((acc, g) => acc + g.subjects.length, 0);
  }, [filteredGroups]);

  async function handleSelectSubject(targetSubjectId: string, targetSubjectName: string) {
    if (targetSubjectId === currentSubjectId) return;
    setMovingId(targetSubjectId);
    try {
      await onMoveQuestion(questionId, targetSubjectId);
      setOpen(false);
      setFilter("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to move question");
    } finally {
      setMovingId(null);
    }
  }

  async function handleCreateAndMove(e: React.FormEvent) {
    e.preventDefault();
    const name = newSubName.trim();
    if (!name) {
      toast.error("Please enter a section name");
      return;
    }
    const groupId = newGroupId || courseSections[0]?.id;
    if (!groupId) {
      toast.error("No folder available in course");
      return;
    }

    setCreating(true);
    try {
      await onMoveQuestion(questionId, undefined, {
        courseId,
        name,
        groupId,
      });
      setOpen(false);
      setShowCreate(false);
      setNewSubName("");
      setFilter("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create section and move");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:border-indigo-300 font-medium transition-colors shadow-2xs cursor-pointer ${className}`}
          title={`Move question to another section (Current: ${currentSubject?.name || "Unknown"})`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="hidden sm:inline">Move:</span>
          <span className="font-semibold max-w-[110px] md:max-w-[140px] truncate">
            {currentSubject?.name || "Section"}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-0 border border-border bg-card shadow-xl rounded-xl text-card-foreground z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="p-3 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Move to section
            </span>
            {currentSubject && (
              <span className="text-[10px] font-semibold text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/80 truncate max-w-[150px]">
                Current: {currentSubject.name}
              </span>
            )}
          </div>

          {/* Filter input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search sections..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-muted-foreground/70"
              autoFocus
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Section List */}
        <div className="max-h-64 overflow-y-auto p-1.5 space-y-2">
          {totalFilteredCount === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground italic">
              No sections match "{filter}"
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="space-y-0.5">
                <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80 px-2 py-1 flex items-center gap-1.5">
                  <Folder className="w-3 h-3 text-indigo-500/70" />
                  <span className="truncate">{group.name}</span>
                </div>
                {group.subjects.map((sub) => {
                  const isCurrent = sub.id === currentSubjectId;
                  const isMoving = movingId === sub.id;

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      disabled={isCurrent || movingId !== null}
                      onClick={() => handleSelectSubject(sub.id, sub.name)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        isCurrent
                          ? "bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold cursor-default border border-indigo-200/50 dark:border-indigo-900/50"
                          : "hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 text-foreground cursor-pointer"
                      }`}
                    >
                      <span className="truncate pr-2">{sub.name}</span>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-1.5 py-0.5 rounded shrink-0">
                          <Check className="w-2.5 h-2.5" />
                          Current
                        </span>
                      ) : isMoving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer: Create new section */}
        <div className="p-2 border-t border-border bg-muted/20">
          {!showCreate ? (
            <button
              type="button"
              onClick={() => {
                setShowCreate(true);
                setNewGroupId(courseSections[0]?.id || "");
              }}
              className="w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              + Create new section in this course
            </button>
          ) : (
            <form onSubmit={handleCreateAndMove} className="space-y-2 p-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">New Section</span>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <input
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder="Section name (e.g. Arrhythmias)"
                className="w-full px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />

              {courseSections.length > 1 && (
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Folder / Group:
                  </label>
                  <select
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                  >
                    {courseSections.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newSubName.trim()}
                  className="flex-1 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                >
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Create & Move
                </button>
              </div>
            </form>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
