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
 * A page opened inside a module page: the back line, its heading under the
 * same rule a module page's header draws, and its body.
 */
export function SettingsSubpage({
  backHref,
  backLabel,
  title,
  description,
  children,
  shown = true,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  /** One muted line under the title, when the title alone can't say it. */
  description?: ReactNode;
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
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-title text-foreground outline-none"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <SectionTitledByPage.Provider value={true}>
        {children}
      </SectionTitledByPage.Provider>
    </div>
  );
}
