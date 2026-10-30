import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

/** Goes back to the page the student came from; opens the committee page only when there is nothing to go back to. */
export function BackToYears({ className }: { className?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const content = (
    <>
      <ChevronLeft size={16} /> Back to years
    </>
  );
  if (!canGoBack) {
    return (
      <Link to="/committee" className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => router.history.back()} className={className}>
      {content}
    </button>
  );
}
