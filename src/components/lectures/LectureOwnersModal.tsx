import { X } from "lucide-react";
import { LectureCourseOwnersDashboard } from "./LectureCourseOwnersDashboard";

interface Props {
  courseId: string;
  courseTitle?: string;
  isHead?: boolean;
  isAdmin?: boolean;
  onClose: () => void;
}

export function LectureOwnersModal({ courseId, courseTitle, isHead = false, isAdmin = false, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-background border border-border rounded-3xl shadow-2xl p-6 sm:p-8 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-end -mb-4">
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <LectureCourseOwnersDashboard
          courseId={courseId}
          courseTitle={courseTitle}
          isHead={isHead}
          isAdmin={isAdmin}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
