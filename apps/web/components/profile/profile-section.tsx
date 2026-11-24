"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SectionLabel } from "@/components/shared/section-label";
import { cn } from "@/lib/utils";

/**
 * True inside a settings page opened from a row (`SettingsSubpage`), whose
 * heading already names the section: its own label is then read, not drawn,
 * so the page doesn't say "Chapter mark" twice.
 */
export const SectionTitledByPage = createContext(false);

/**
 * One block of `/profile` or of the personal Settings page (`/preferences`):
 * a section on the page surface, named by its
 * section label, with at most one line under the label saying what the block
 * controls when the label alone can't. The Page grammar's "no wrapper card"
 * rule (`spec/ui/web-dashboard/README.md`), applied to a screen that used to
 * stack seven `Card`s, each with its own description.
 *
 * `id` names the section's label for `aria-labelledby` and is an anchor, so
 * `scroll-mt-16` keeps the label clear of the sticky top bar on arrival.
 */
export function ProfileSection({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const labelId = `${id}-label`;
  const titledByPage = useContext(SectionTitledByPage);
  return (
    <section
      id={id}
      aria-labelledby={labelId}
      className="scroll-mt-16 space-y-4"
    >
      <div
        className={cn("space-y-1", titledByPage && hint == null && "sr-only")}
      >
        <div className={titledByPage ? "sr-only" : undefined}>
          <SectionLabel id={labelId}>{title}</SectionLabel>
        </div>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
