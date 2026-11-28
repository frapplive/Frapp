import { usePermissionList } from "@repo/hooks";
import { canAny } from "@repo/validation";

/** What a viewer who may not see them is told on a role or tier screen. */
export const ROLES_HIDDEN_TITLE = "Your role can't see roles";

/** Who sees the chapter's roles and tiers, as web's Roles and groups shows them. */
export const SEE_ROLES_PERMISSIONS = ["roles:manage", "chapter-config:view"];

/**
 * Whether the viewer may see the roles and tiers: `true` or `false` once
 * their permissions have loaded, `undefined` before. The role and tier
 * screens open from a web link too (#6049), not only from Roles and groups,
 * which draws its role list for the same viewers.
 */
export function useCanSeeRoles(): boolean | undefined {
  const permissions = usePermissionList();
  // Every member holds something (`members:view` at least), so an empty
  // list is one still loading.
  if (permissions.length === 0) return undefined;
  return canAny(SEE_ROLES_PERMISSIONS, permissions);
}
