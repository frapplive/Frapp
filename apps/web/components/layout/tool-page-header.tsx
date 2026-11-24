"use client";

import type * as React from "react";

import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { PageTitleText } from "@/components/layout/top-bar";
import type { PageTitle } from "@/components/layout/page-title";
import { cn } from "@/lib/utils";

/**
 * The page's own header (Paul, 2026-11-11): the page's title on the left, its
 * actions, and a close button on the right, 48px like the sidebar's head and
 * chat's channel header beside it, so the panels read as a set the way
 * Slack's channel and its right-hand panel do.
 *
 * It is the page's way out. The close button is on every page, so whether a
 * page can be closed never depends on how it was reached: the Settings
 * tools, Profile and the personal Settings page have no sidebar row to click
 * again. Escape inside the page and dragging the divider to the right edge
 * close it too (`dashboard-shell.tsx`, `split-divider.tsx`). Closing lands
 * on the open conversation.
 *
 * From `lg` up it carries the route's title and `<h1>`: there is no top bar
 * there (#5946). Below `lg` the shell is a single page under the top bar,
 * which holds the title; this header then shows only when a page put actions
 * in it, as one pinned row of them. CSS shows one copy of the title or the
 * other, so the first paint is right before the width is known.
 */
export function ToolPageHeader({
  pageTitle,
  titleIsHeading,
  onClose,
  actionSlotRef,
}: {
  pageTitle: PageTitle | null;
  /** Whether this copy is the route's `<h1>` (the shell knows it is wide). */
  titleIsHeading: boolean;
  onClose: () => void;
  /**
   * The box the page's `PageActions` renders into, between the title and the
   * X (`page-actions.tsx`, Paul 2026-11-19).
   */
  actionSlotRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    // A `div`, not a `<header>`: a banner is the whole page's, and this
    // heads one pane of it.
    <div
      data-tool-page-header=""
      // `@container`: a page's actions break on the page's own width, which
      // this header shares, as they did in the row under it.
      // Below `lg` it shows only when a page put actions in it
      // (`page-actions.tsx`), as one pinned row of them: the title is in the
      // top bar there.
      className="@container hidden h-12 shrink-0 items-center gap-3 border-b border-border px-4 lg:flex sm:px-6 has-[[data-page-actions]:not(:empty)]:flex"
    >
      <div className="hidden min-w-0 flex-1 items-center lg:flex">
        {pageTitle ? (
          <PageTitleText pageTitle={pageTitle} asHeading={titleIsHeading} />
        ) : null}
      </div>
      <div
        ref={actionSlotRef}
        data-tool-page-actions=""
        className="ml-auto flex min-w-0 shrink items-center justify-end empty:hidden"
      />
      <PanelCloseButton
        label={pageTitle ? `Close ${pageTitle.title}` : "Close page"}
        onClick={onClose}
        className="-mr-2 max-lg:hidden"
      />
    </div>
  );
}

/**
 * The X at the right end of a side-by-side panel's 48px header: the tool
 * page's (above) and chat's channel header (#4223), so the two panels close
 * the same way, the way Slack's channel and its right-hand panel each carry
 * one.
 *
 * Each header passes the margin that puts the 36px square's right edge 16px
 * from its panel's edge, so the X sits in the same place in every panel:
 * `-mr-2` against this header's 24px gutter, none against chat's 16px, and
 * `mr-2` against the thread's 8px.
 */
export function PanelCloseButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <IconButton
      label={label}
      onClick={onClick}
      className={cn("shrink-0 text-muted-foreground", className)}
    >
      <X className="h-[18px] w-[18px]" aria-hidden="true" />
    </IconButton>
  );
}
