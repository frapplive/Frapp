"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCurrentChapter, useMyPermissions } from "@repo/hooks";
import {
  availableNewActions,
  NEW_ACTION_LABELS,
  WEB_NEW_ACTIONS,
  type NewActionKey,
} from "@repo/validation";
import { MINUTES_DOCUMENTS_HREF } from "@/components/documents/document-links";
import { newIntentHref } from "@/components/layout/new-intent";
import { standingHref } from "@/components/standing/standing-doors";
import {
  DirectMessagesGlyph,
  DocumentsGlyph,
  EventsGlyph,
  MeetingsGlyph,
  ServiceGlyph,
  TasksGlyph,
  type NavGlyphComponent,
} from "@/components/layout/nav-glyphs";
import { MESSAGES_ROUTE } from "@/components/layout/shell-layout";
import { buttonVariants } from "@/components/ui/button";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { cn } from "@/lib/utils";

/**
 * What New starts, as a row of buttons under Frapp Intelligence's field
 * (#5946, Paul 2026-11-24: "the direct actions ... sit under the field").
 *
 * New is two ways to begin one thing: say it ("make an event for Thursday at
 * 7") or press the form. The buttons are the app's one New list
 * (`@repo/validation` `sections.ts`), in its order and words and behind its
 * one rule for who may use each, which the phone's + reads too, so the two
 * apps offer a member the same things. Each opens the form its own page's
 * button opens (`new-intent.ts`), never a second copy of it.
 *
 * Quiet outlined buttons, each led by its place's glyph, so the eye lands on
 * the field first and can still pick a form out by shape. ChatGPT, Claude
 * and Notion's home hang their shortcuts under the field the same way.
 *
 * A member whose role starts none of them gets nothing here, not an empty
 * row.
 */
const WEB_ACTIONS: Record<
  NewActionKey,
  { href: string; icon: NavGlyphComponent } | null
> = {
  // Minutes are filed in Documents (#5949): its add menu holds New minutes.
  newMinutes: {
    href: newIntentHref(MINUTES_DOCUMENTS_HREF, "minutes"),
    icon: MeetingsGlyph,
  },
  newEvent: { href: newIntentHref("/events"), icon: EventsGlyph },
  // Activity's New task (#5948): the board's Mine part opens its add line.
  newTask: { href: newIntentHref("/activity"), icon: TasksGlyph },
  message: { href: newIntentHref(MESSAGES_ROUTE), icon: DirectMessagesGlyph },
  // The member's own Service hours panel on Profile holds the form (#5950).
  logHours: {
    href: newIntentHref(standingHref("service")),
    icon: ServiceGlyph,
  },
  upload: { href: newIntentHref("/documents"), icon: DocumentsGlyph },
  // The phone's, or another row's (`WEB_NEW_ACTIONS`).
  search: null,
  invite: null,
  hostCheckIn: null,
  study: null,
};

/** The actions this member can start from the browser, in the shared order. */
export function useWebNewActions(): NewActionKey[] {
  const permissions = useMyPermissions().data?.permissions;
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  // The member view of the chapter: officers and members alike can read its
  // `enabled_modules`, which the org config endpoint is not (#1982).
  const { data: chapter } = useCurrentChapter({
    chapterId: activeChapterId,
    enabled: !!activeChapterId,
  });
  const enabledModules = chapter?.enabled_modules;
  return useMemo(() => {
    const available = new Set(
      availableNewActions({ permissions, enabledModules }),
    );
    return WEB_NEW_ACTIONS.filter((key) => available.has(key));
  }, [permissions, enabledModules]);
}

export function NewActions({ className }: { className?: string }) {
  const actions = useWebNewActions();
  if (actions.length === 0) return null;
  return (
    <ul
      aria-label="Start something new"
      data-new-actions=""
      // Six fit one line of the 720px column; fewer centre under the field.
      className={cn("flex flex-wrap justify-center gap-1.5", className)}
    >
      {actions.map((key) => {
        const action = WEB_ACTIONS[key];
        if (!action) return null;
        const Icon = action.icon;
        return (
          <li key={key}>
            <Link
              href={action.href}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "gap-1.5 bg-transparent px-2.5 font-medium",
              )}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {NEW_ACTION_LABELS[key]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
