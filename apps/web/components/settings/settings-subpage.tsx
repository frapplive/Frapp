"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { SectionTitledByPage } from "@/components/profile/profile-section";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/**
 * The way back from a page opened inside a module page of Chapter settings
 * (#3837): one channel's settings, or Discord import, both drawn in place of
 * the Chat page. A quiet line above the page's heading, the way Discord's
 * channel settings and iOS Settings put the parent's name behind a back arrow,
 * so the rail row stays lit and nothing else moves.
 */
export function SettingsBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

/**
 * A page opened from a settings row (a module page's channel, a Chapter tab
 * page, a role, tier or group under Roles and groups): the back line naming
 * the page it came from, its heading under the same rule a module page's
 * header draws, and its body.
 */
export function SettingsSubpage({
  backHref,
  backLabel,
  title,
  titleLeading,
  actions,
  children,
  shown = true,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  /** Drawn before the title: a role's or group's colour dot. */
  titleLeading?: ReactNode;
  /**
   * The page's own actions, at the title's trailing edge: a "View as"
   * button, the ⋯ (`ActionMenuButton`) with Move and Delete, never in the
   * page's body (rulebook § 2).
   */
  actions?: ReactNode;
  children: ReactNode;
  /** False while the page stays mounted but hidden, keeping its drafts. */
  shown?: boolean;
}) {
  // The row that opened this page is gone with the page it sat on, so focus
  // starts at this page's heading, which a screen reader then reads, rather
  // than falling back to the top of the document.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!shown) return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [shown]);
  return (
    <div className="space-y-8">
      <header className="space-y-1 border-b border-border pb-6">
        <SettingsBackLink href={backHref} label={backLabel} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {titleLeading}
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 break-words text-title text-foreground outline-none"
          >
            {title}
          </h2>
          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      <SectionTitledByPage.Provider value={true}>
        {children}
      </SectionTitledByPage.Provider>
    </div>
  );
}
