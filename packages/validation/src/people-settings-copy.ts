/**
 * Words both apps' People settings pages say (Roles and groups, a tier's page,
 * a role's page, a group's page), so web and the phone can't drift
 * (#6029, the settings-shape epic #5964; `spec/ui/design-system/components.md`
 * § Settings rows). A footnote is the one muted line under a group: what its
 * rows share, never a second copy of a row's own words.
 *
 * `tier` and `tiers` are the chapter's own words for a tier (its vocabulary),
 * already in the case the sentence needs.
 */

/** "1 member", "14 members", "No members": a role's or group's value. */
export function memberCountLabel(count: number): string {
  if (count === 0) return "No members";
  return count === 1 ? "1 member" : `${count} members`;
}

/** The value on a tier's Permissions row: "22 on", or "None on". */
export function permissionsOnLabel(count: number): string {
  return count === 0 ? "None on" : `${count} on`;
}

export function addTierLabel(tier: string): string {
  return `Add ${tier}`;
}

export const PEOPLE_SETTINGS_COPY = {
  pageTitle: "Roles and groups",
  search: "Find a role or group",
  permissionsRow: "Permissions",
  addRole: "Add role",
  addTier: "Add tier",
  groupsHeading: "Groups",
  newGroup: "New group",
  autoGroupsRow: "Pledge classes, class years and majors",
  invitesHeading: "Invites and presidency",
  defaultInviteRole: "Default invite role",
  noDefaultInviteRole: "No role",
  transferPresidency: "Transfer presidency",
  rolesInTierHeading: "Roles in it",
  roleHeading: "Role",
  name: "Name",
  color: "Color",
  members: "Members",
  addMember: "Add a member",
  noneYet: "None yet",
  mentionRole: "Anyone can @mention this role",
  mentionTier: "Anyone can @mention this tier",
  mentionGroup: "Anyone can @mention this group",
  moveUp: "Move up",
  moveDown: "Move down",
  deleteRole: "Delete role",
  deleteTier: "Delete tier",
  deleteGroup: "Delete group",
} as const;

/** Under the Groups group, on both apps. */
export const GROUPS_FOOTNOTE =
  "For @mentions and who can see a channel. A group gives no permissions.";

/**
 * Under Invites and presidency: both rows write a Logs entry. The same words
 * as the Chapter tab's About the chapter footnote, for the same reason.
 */
export { CHAPTER_ABOUT_FOOTNOTE as INVITES_FOOTNOTE } from "./chapter-settings-copy";

/** Under the roles outside the tiers. */
export function outsideTiersFootnote(tier: string): string {
  return `Rank below every ${tier}, like alumni or advisors.`;
}

/** The heading of the roles outside the tiers: "Outside the tiers". */
export function outsideTiersHeading(tiers: string): string {
  return `Outside the ${tiers}`;
}

/** Under a tier page's first permissions group. */
export function tierPermissionsFootnote(tierName: string): string {
  return `What every role in ${tierName} can do. A role can be set apart on its own page.`;
}

/** Under a role page's first permissions group. */
export function rolePermissionsFootnote(
  tierName: string | null,
  tiers: string,
): string {
  return tierName
    ? `Starts from ${tierName}. Rows set apart from it say so.`
    : `Outside the ${tiers}, so its permissions are its own.`;
}

/** A role's permission set apart from its tier, said under the row. */
export function setApartLabel(tierName: string, tierHasIt: boolean): string {
  return `Set for this role. ${tierName} has it ${tierHasIt ? "on" : "off"}.`;
}

/** The three answers a role's permission row offers, in this order. */
export function overrideChoiceLabels(
  tierName: string,
  tierHasIt: boolean,
): { inherit: string; on: string; off: string } {
  return {
    inherit: `Same as ${tierName} · ${tierHasIt ? "On" : "Off"}`,
    on: "On",
    off: "Off",
  };
}

/** Under an automatic group's page: its name and members follow a member detail. */
export const AUTO_GROUP_FOOTNOTE: Record<
  "pledge_class" | "class_year" | "major",
  string
> = {
  pledge_class: "Follows the pledge class: rename the class to rename it.",
  class_year: "Follows each member's graduation year.",
  major: "Follows each member's major.",
};

/** The confirm for Transfer presidency, naming who gets it. */
export function transferPresidencyConfirm(name: string): {
  title: string;
  body: string;
  action: string;
} {
  return {
    title: `Transfer presidency to ${name}?`,
    body: "You lose the President role when they get it.",
    action: "Transfer presidency",
  };
}
