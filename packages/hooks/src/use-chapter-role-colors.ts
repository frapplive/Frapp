"use client";

import { useMemo } from "react";
import { chapterRoleColors } from "@repo/validation";

import { parseChapterRoles } from "./chapter-roles";
import { useGroups } from "./use-groups";
import { useRoles } from "./use-roles";

/**
 * The custom colors this chapter's roles and groups already wear, most used
 * first (#5966): the color picker's "In your chapter" row, so a new
 * committee can match an existing one without its hex. Reads the same
 * cached roles and groups the Roles and groups page already loaded; while
 * either is loading, or the viewer can't read it, it contributes nothing.
 */
export function useChapterRoleColors(options?: {
  enabled?: boolean;
}): string[] {
  const roles = useRoles(options);
  const groups = useGroups(options);
  return useMemo(
    () =>
      chapterRoleColors([
        ...parseChapterRoles(roles.data).map((role) => role.color),
        ...(groups.data ?? []).map((group) => group.color),
      ]),
    [roles.data, groups.data],
  );
}
