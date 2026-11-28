import { useMyPermissions } from "@repo/hooks";
import { canAny } from "@repo/validation";

/**
 * Who sees the roles part of Roles and groups: its tiers and roles, and a
 * role's or tier's own screen (web's `canSeeRoles`, `settings-roles-tab.tsx`).
 * A `groups:manage` holder alone sees only the groups.
 */
export const ROLES_VIEW_PERMISSIONS = [
  "roles:manage",
  "chapter-config:view",
] as const;

/**
 * Whether this member may see a role's or tier's screen. A web link opens
 * those screens straight from a message (#6049), not only from Roles and
 * groups' list, so each screen checks for itself. `loading` until the
 * member's permissions arrive; a failed read fails closed.
 */
export function useRolesVisibility(): "loading" | "allowed" | "hidden" {
  const { data, isError } = useMyPermissions();
  if (!Array.isArray(data?.permissions)) return isError ? "hidden" : "loading";
  return canAny([...ROLES_VIEW_PERMISSIONS], data.permissions)
    ? "allowed"
    : "hidden";
}
