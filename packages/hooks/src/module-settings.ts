import type { GoalMetric } from "@repo/validation";
import type { TierRow, TieredRole } from "./role-tiers";

/*
 * A module page of Chapter settings in the settings-rows shape (#6030,
 * `spec/ui/design-system/components.md` § Settings rows): the values its rows
 * show and the pages those rows open. Pure, with no React and no request, so
 * web and the phone read the same words (`@repo/hooks/module-settings`).
 */

/** The `?page=` prefix of a permission's page, opened from a Who can row. */
const WHO_CAN_PAGE_PREFIX = "can-";

/** The page a Who can row opens: `can-events:create`. */
export function whoCanPageId(permission: string): string {
  return `${WHO_CAN_PAGE_PREFIX}${permission}`;
}

/** The permission a Who can page is about, or `null` for any other page. */
export function permissionOfWhoCanPage(
  page: string | null | undefined,
): string | null {
  if (!page?.startsWith(WHO_CAN_PAGE_PREFIX)) return null;
  const permission = page.slice(WHO_CAN_PAGE_PREFIX.length);
  return permission || null;
}

/**
 * Who holds a permission, as a module page answers it: the tiers that have
 * it, then each role that has it where its tier doesn't (outside the tiers,
 * or set apart from its tier), which is the same rule the role's own page
 * marks. The President's wildcard role is never listed: the page says once
 * that the President can do everything.
 *
 * `tierHas` and `roleHas` are the caller's reads, so a switch flipped a
 * moment ago (the toggles' optimistic overlay) shows in the value at once.
 */
export function whoCanHolders(
  permission: string,
  tiers: readonly TierRow[],
  roles: readonly TieredRole[],
  tierHas: (tier: TierRow, permission: string) => boolean,
  roleHas: (role: TieredRole, permission: string) => boolean,
): { tiers: TierRow[]; roles: TieredRole[] } {
  const holdingTiers = tiers.filter((tier) => tierHas(tier, permission));
  const holdingRoles = roles.filter((role) => {
    if (!roleHas(role, permission)) return false;
    const tier = tiers.find((candidate) => candidate.id === role.tier_id);
    return !tier || !tierHas(tier, permission);
  });
  return { tiers: holdingTiers, roles: holdingRoles };
}

/** What a Who can row says when no tier or role holds the permission. */
export const ONLY_THE_PRESIDENT = "Only the President";

/**
 * A Who can row's value: the holders' names, tiers first, as many as read in
 * a glance ("Exec board, Officers and chairs and 2 more"), or "Only the
 * President". The page the row opens lists every one.
 */
export function whoCanSummary(names: readonly string[], shown = 2): string {
  if (names.length === 0) return ONLY_THE_PRESIDENT;
  if (names.length <= shown) return names.join(", ");
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}

/** The goal as a member is held to it, in the unit its row is typed in. */
const GOAL_UNIT: Record<
  GoalMetric,
  { per: number; one: string; many: string }
> = {
  points: { per: 1, one: "point", many: "points" },
  service: { per: 60, one: "hour", many: "hours" },
  study: { per: 60, one: "hour a week", many: "hours a week" },
};

/**
 * A Goals row's value: "No goal", "120 points", "4 hours a week", and how many
 * roles are held to a different goal ("20 hours, 2 roles differ"). Hours are
 * stored as minutes and shown in whole hours, as the goal form types them.
 */
export function goalSummary(
  metric: GoalMetric,
  goal: { everyone: number | null; roles: readonly unknown[] } | undefined,
): string {
  const differ = goal?.roles.length ?? 0;
  const unit = GOAL_UNIT[metric];
  const base =
    goal?.everyone == null
      ? "No goal"
      : (() => {
          const amount = Math.round(goal.everyone / unit.per);
          return `${amount.toLocaleString("en-US")} ${amount === 1 ? unit.one : unit.many}`;
        })();
  if (differ === 0) return base;
  return `${base}, ${differ} ${differ === 1 ? "role differs" : "roles differ"}`;
}

/** "6 stages", "1 tag", "None": a count row's value. */
export function countSummary(count: number, one: string, many: string): string {
  if (count === 0) return "None";
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}
