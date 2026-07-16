import * as React from "react";
import { BREAKPOINT_MOBILE, BREAKPOINT_TABLET } from "@/constants";

export type Breakpoint = "mobile" | "tablet" | "desktop";

/** Returns true when viewport width < 768px. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < BREAKPOINT_MOBILE : false
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < BREAKPOINT_MOBILE);
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < BREAKPOINT_MOBILE);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

/**
 * Returns the current breakpoint tier:
 *  - "mobile"  → < 768px
 *  - "tablet"  → 768–1023px
 *  - "desktop" → ≥ 1024px
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = React.useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth;
    if (w < BREAKPOINT_MOBILE) return "mobile";
    if (w < BREAKPOINT_TABLET) return "tablet";
    return "desktop";
  });

  React.useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < BREAKPOINT_MOBILE) setBp("mobile");
      else if (w < BREAKPOINT_TABLET) setBp("tablet");
      else setBp("desktop");
    };
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);

  return bp;
}
