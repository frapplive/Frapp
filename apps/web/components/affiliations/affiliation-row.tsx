"use client";

import type { ReactNode } from "react";
import { getArchetype } from "@repo/org-archetypes";
import { chapterMarkFor, CrestTile } from "@/components/layout/crest-tile";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { cn } from "@/lib/utils";

/**
 * One chapter, council or school in an affiliation list (#5974): its mark,
 * its name over one muted line, then whatever it ends in (a status, buttons).
 * Both affiliation pages draw this one row, on the dense list's hairlines, so
 * a chapter reads the same on the council's Chapters page as a council does
 * on a chapter's School and council page.
 *
 * With `menu`, the row's rare and destructive actions sit behind its ⋯ and
 * right-click (`RowMenu`); actions a person takes every time are buttons in
 * `trailing`.
 */
export function AffiliationRow({
  name,
  meta,
  trailing,
  menu,
  busy = false,
}: {
  name: string;
  meta?: ReactNode;
  trailing?: ReactNode;
  menu?: { entries: readonly RowMenuEntry[]; label: string };
  /** One of its steps is saving: the row dims in place. */
  busy?: boolean;
}) {
  const body = (menuButton: ReactNode) => (
    <li
      aria-busy={busy || undefined}
      className={cn(
        "group flex min-h-14 items-center gap-3 px-2 py-2 transition-opacity",
        busy && "opacity-60",
      )}
    >
      <CrestTile mark={chapterMarkFor({ name })} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {name}
        </span>
        {meta ? (
          <span className="block truncate text-caption text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center gap-2">{trailing}</span>
      ) : null}
      {menuButton}
    </li>
  );
  if (!menu) return body(null);
  return (
    <RowMenu
      entries={
        busy
          ? menu.entries.map((entry) =>
              entry.type === "item" ? { ...entry, disabled: true } : entry,
            )
          : menu.entries
      }
      label={menu.label}
    >
      {body}
    </RowMenu>
  );
}

/**
 * A chapter's line under its name, from its public listing only: its kind of
 * organization, then its school ("IFC Fraternity · Rensselaer Polytechnic
 * Institute"). Never anything of the chapter's own data.
 */
export function chapterListingMeta(chapter: {
  org_archetype: string | null;
  university: string;
}): string {
  const archetype =
    chapter.org_archetype &&
    getArchetype(chapter.org_archetype).key === chapter.org_archetype
      ? getArchetype(chapter.org_archetype).label
      : null;
  return [archetype, chapter.university || null].filter(Boolean).join(" · ");
}
