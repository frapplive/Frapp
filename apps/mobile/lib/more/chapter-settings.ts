import {
  CHAPTER_LOGS_PERMISSIONS,
  can,
  canAll,
  canAny,
} from "@repo/validation";
import { canCreateChannel } from "@/lib/chat/create-channel";

/**
 * Who sees Chapter settings on the phone, and which of its groups (#4074).
 *
 * Web's chapter menu offers it to anyone with a page there (`hasSettingsDestination`
 * in `apps/web/components/settings/settings-access.ts`). The phone carries
 * some of those pages, so its chapter menu offers it to the same people only where it has
 * something to show them: a treasurer who holds just `billing:view` reaches
 * Plan and billing on web, and would find nothing here.
 *
 * - `chapter`: the accent, chat background and study zones, behind
 *   `chapter-config:view`, as the Settings group they moved from was.
 * - `roles`: web's Roles and groups tab gate, `chapter-config:view`,
 *   `roles:manage` or `groups:manage` (one page for both since Paul's
 *   2026-11-19 call).
 *
 * - `newChannel`: New channel (#5296), for whoever can make one
 *   (`canCreateChannel`, which Chat home's "+" asks too).
 * - `newRole`: New role (#5296), behind `POST /v1/roles`' `roles:manage`;
 *   the row also waits for a tier the officer ranks above (`newRolePlacements`).
 *
 * - `pledgeClasses`: Pledge class (#6029), web's tab gate `roles:manage`
 *   (`settings-access.ts`), with the `members:view` its list and roster
 *   reads take.
 * - `memberFields`: Member fields (#6029), `chapter-config:view`, what
 *   `GET /v1/custom-fields` takes, as web's tab.
 *
 * - `logs`: the Logs screen (Paul, 2026-11-21), behind what
 *   `GET /v1/audit-log` takes: `chapter-config:view` and `members:view`, as
 *   web's Logs row (`settings-access.ts`).
 *
 * `usePermissionList()` is `[]` while loading, so every answer here is false
 * until the role is read: the item fails closed.
 */
export function chapterSettingsAccess(permissions: readonly string[]) {
  const chapter = can("chapter-config:view", permissions);
  const roles = canAny(
    ["chapter-config:view", "roles:manage", "groups:manage"],
    permissions,
  );
  const logs = canAll(CHAPTER_LOGS_PERMISSIONS, permissions);
  const newChannel = canCreateChannel(permissions);
  const newRole = can("roles:manage", permissions);
  return {
    chapter,
    roles,
    logs,
    newChannel,
    newRole,
    pledgeClasses: canAll(["roles:manage", "members:view"], permissions),
    memberFields: chapter,
    any: chapter || roles || newChannel,
  };
}
