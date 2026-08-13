import { useEffect, useState } from "react";

export type ScrollState = {
  /** True when within `topThreshold` px of the top */
  atTop: boolean;
  /** True when the user is scrolling down past `triggerOffset` */
  hidden: boolean;
};

/**
 * Tracks scroll direction for a slide-away header.
 * - At top of page → atTop=true, hidden=false (transparent header).
 * - Scrolling down past triggerOffset → hidden=true.
 * - Scrolling up at all → hidden=false (header reappears with bg).
 */
export function useScrollDirection(opts?: { topThreshold?: number; triggerOffset?: number }): ScrollState {
  const topThreshold = opts?.topThreshold ?? 20;
  const triggerOffset = opts?.triggerOffset ?? 80;
  const [state, setState] = useState<ScrollState>({ atTop: true, hidden: false });

  useEffect(() => {
    let lastY = typeof window !== "undefined" ? window.scrollY : 0;
    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const atTop = y < topThreshold;
        let hidden = state.hidden;
        if (atTop) {
          hidden = false;
        } else if (y > lastY && y > triggerOffset) {
          hidden = true;
        } else if (y < lastY) {
          hidden = false;
        }
        setState((prev) =>
          prev.atTop === atTop && prev.hidden === hidden ? prev : { atTop, hidden },
        );
        lastY = y;
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topThreshold, triggerOffset]);

  return state;
}
