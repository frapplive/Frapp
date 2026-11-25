"use client";

import { useEffect, useRef } from "react";

/**
 * Sits under a list drawn a page at a time (`useRenderWindow`, #6088) and
 * asks for the next page once it comes within a screen of the viewport, so
 * the rows are there before the reader scrolls to them.
 *
 * Give it `key={shown.length}`: an observer reports only when the sentinel
 * crosses into view, so one still in view after a page lands would never
 * report again. A fresh observer reports where the sentinel is now.
 *
 * Where there is no `IntersectionObserver`, it asks at once, and the list is
 * drawn whole a page per render, as it was before windowing.
 */
export function MoreRowsSentinel({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      onReach();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onReach]);
  return <div ref={ref} aria-hidden="true" className="h-px" />;
}
