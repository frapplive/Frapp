import {
  CHAPTER_LOGS_PERMISSIONS,
  can,
  canAll,
  canAny,
} from "@repo/validation";

/**
 * Who sees Chapter settings on the phone, and which of its groups (#4074).
 *
 * Web's chapter menu offers it to anyone with a page there (`hasSettingsDestination`
 * in `apps/web/components/settings/settings-access.ts`). The phone carries
 * two of those pages, so its chapter menu offers it to the same people only where it has
 * something to show them: a treasurer who holds just `billing:view` reaches
 * Plan and billing on web, and would find nothing here.
 *
 * - `chapter`: the accent, chat background and study zones, behind
 *   `chapter-config:view`, as the Settings group they moved from was.
 * - `roles`: web's Roles and groups tab gate, `chapter-config:view`,
 *   `roles:manage` or `groups:manage` (one page for both since Paul's
 *   2026-11-19 call).
 *
 * - `newChannel`: New channel (#5296), for whoever Chat home's "+" opens the
 *   same sheet to: `POST /v1/channels` takes `channels:create`, and the
 *   sheet's who-can-see lists read `GET /v1/channels/access-options`, which
 *   takes `channels:manage`.
 * - `newRole`: New role (#5296), behind `POST /v1/roles`' `roles:manage`;
 *   the row also waits for a tier the officer ranks above (`newRolePlacements`).
 *
 * - `logs`: the Logs screen (Paul, 2026-11-21), behind what
 *   `GET /v1/audit-log` takes: `chapter-config:view` and `members:view`, as
 *   web's Logs row (`settings-access.ts`).
 *
 * `usePermissionList()` is `[]` while loading, so every answer here is false
 * until the role is read: the item fails closed.
 */
/** What New channel needs: the create route's and the access lists' guards. */
const CREATE_CHANNEL_PERMISSIONS = [
  "channels:create",
  "channels:manage",
] as const;

export function chapterSettingsAccess(permissions: readonly string[]) {
  const chapter = can("chapter-config:view", permissions);
  const roles = canAny(
    ["chapter-config:view", "roles:manage", "groups:manage"],
    permissions,
  );
  const logs = canAll(CHAPTER_LOGS_PERMISSIONS, permissions);
  const newChannel = canAll(CREATE_CHANNEL_PERMISSIONS, permissions);
  const newRole = can("roles:manage", permissions);
  return {
    chapter,
    roles,
    logs,
    newChannel,
    newRole,
    any: chapter || roles || newChannel,
  };
}
