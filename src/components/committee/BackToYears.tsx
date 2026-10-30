import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

/**
 * Back to the list of years, one level up from the year page. `keep` tells the committee home not to reset the version,
 * so a student who is in the AQUA version stays in it and one in the University version stays there.
 */
export function BackToYears({ className }: { className?: string }) {
  return (
    <Link to="/committee" search={{ keep: true }} className={className}>
      <ChevronLeft size={16} /> Back to years
    </Link>
  );
}
