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

import type {
  CustomFieldType,
  CustomFieldVisibility,
} from "./chapter-config";

/** "1 member", "14 members", "No members": a role's or group's value. */
export function memberCountLabel(count: number): string {
  if (count === 0) return "No members";
  return count === 1 ? "1 member" : `${count} members`;
}

/** The value on a tier's Permissions row: "22 on", or "None on". */
export function permissionsOnLabel(count: number): string {
  return count === 0 ? "None on" : `${count} on`;
}

/**
 * The words that name a tier, in the chapter's own word for one (`tier`, its
 * vocabulary's singular as the sentence needs it): "Add tier", "Delete
 * level", "Anyone can @mention this tier".
 */
export function addTierLabel(tier: string): string {
  return `Add ${tier}`;
}

export function deleteTierLabel(tier: string): string {
  return `Delete ${tier}`;
}

export function mentionTierLabel(tier: string): string {
  return `Anyone can @mention this ${tier}`;
}

export const PEOPLE_SETTINGS_COPY = {
  pageTitle: "Roles and groups",
  search: "Find a role or group",
  permissionsRow: "Permissions",
  addRole: "Add role",
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
  mentionGroup: "Anyone can @mention this group",
  moveUp: "Move up",
  moveDown: "Move down",
  deleteRole: "Delete role",
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
    body: "You lose the President role when they get it. Only the new President can move it again.",
    action: "Transfer presidency",
  };
}

/** The confirm for deleting a role, from its row's menu or its page. */
export function deleteRoleConfirm(name: string): {
  title: string;
  body: string;
  action: string;
} {
  return {
    title: `Delete ${name}?`,
    body: "Members holding this role lose what it gives them right away. This can't be undone.",
    action: PEOPLE_SETTINGS_COPY.deleteRole,
  };
}

/**
 * The confirm for deleting a tier, which only an empty tier allows.
 * `tierName` is the tier's own name; `tier` and `tiers` the chapter's word.
 */
export function deleteTierConfirm(
  tierName: string,
  tier: string,
  tiers: string,
): { title: string; body: string; action: string } {
  return {
    title: `Delete ${tierName}?`,
    body: `It has no roles left, so nobody loses anything. The other ${tiers} keep their order.`,
    action: deleteTierLabel(tier),
  };
}

/** The confirm for deleting one of the chapter's own groups. */
export function deleteGroupConfirm(name: string): {
  title: string;
  body: string;
  action: string;
} {
  return {
    title: `Delete ${name}?`,
    body: "Its members stay in the chapter. A channel that lists it stops letting them in through it.",
    action: `Delete ${name}`,
  };
}

/*
 * Pledge class and Member fields (#6029's second half). The pledge class
 * pages draw the chapter's own word for a class (`classTerm`) as typed, in a
 * heading or a label, never inflected: a plural or lowercased form of a
 * free-text word comes out wrong for "PC" or "Family".
 */
export const PLEDGE_CLASS_SETTINGS_COPY = {
  footnote: "Oldest first.",
  rename: "Rename",
  members: "Members",
  addMember: "Add a member",
  nobodyYet: "Nobody is in it yet.",
  everyoneIn: "Everyone is already in it.",
  empty: "Nothing here yet. Add the oldest one first.",
  readOnly: "Only officers who manage roles can change this list.",
} as const;

/** The last row of the pledge class list, in the chapter's own word as typed. */
export function addPledgeClassLabel(classTerm: string): string {
  return `Add ${classTerm}`;
}

/** The confirm for deleting a pledge class. `memberCount` null: not known. */
export function deletePledgeClassConfirm(
  name: string,
  memberCount: number | null,
): { title: string; body: string; action: string } {
  return {
    title: `Delete ${name}?`,
    body:
      memberCount === null
        ? "Any members in it are left without one. They keep their number."
        : memberCount > 0
          ? `Its ${memberCountLabel(memberCount).toLowerCase()} ${memberCount === 1 ? "is" : "are"} left without one. They keep their number.`
          : "No members are in it.",
    action: `Delete ${name}`,
  };
}


/** A field's type, as its row and its page say it, in the picker's order. */
export const MEMBER_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  decimal: "Decimal",
  phone: "Phone",
  select: "Pick one",
  boolean: "Yes or no",
};

/** Who can see a field's values besides its member, in the picker's order. */
export const MEMBER_FIELD_VISIBILITY_LABEL: Record<
  CustomFieldVisibility,
  string
> = {
  chapter: "Whole chapter",
  exec: "Exec",
  president: "President",
  self: "Self only",
};

export const MEMBER_FIELDS_COPY = {
  pageTitle: "Member fields",
  addField: "Add a field",
  createField: "Add field",
  footnote: "Every change here is recorded in Logs.",
  empty: "No fields yet. Members fill these in under More details.",
  name: "Name",
  type: "Type",
  options: "Options",
  addOption: "Add an option",
  noOptions: "No options yet",
  needsOption: "Add an option first",
  needsName: "Add a name first",
  visibleTo: "Visible to",
  required: "Required",
  sensitive: "Sensitive",
  maxLength: "Longest answer",
  noLimit: "No limit",
  deleteField: "Delete field",
} as const;

/**
 * A field row's muted line: its type, and its flags. "Pick one of 4 ·
 * Required", "Phone · Required · Sensitive".
 */
export function memberFieldFacts(field: {
  type: CustomFieldType;
  required: boolean;
  sensitive: boolean;
  options?: { choices?: readonly string[] | null } | null;
}): string {
  const choices = field.options?.choices?.length ?? 0;
  const type =
    field.type === "select" && choices > 0
      ? `Pick one of ${choices}`
      : MEMBER_FIELD_TYPE_LABEL[field.type];
  return [
    type,
    field.required ? MEMBER_FIELDS_COPY.required : null,
    field.sensitive ? MEMBER_FIELDS_COPY.sensitive : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A pick-one field's options as its row value: "S, M, L, XL". */
export function memberFieldOptionsValue(
  choices: readonly string[] | null | undefined,
): string {
  return choices && choices.length > 0
    ? choices.join(", ")
    : MEMBER_FIELDS_COPY.noOptions;
}

/** The confirm for deleting a member field. */
export function deleteMemberFieldConfirm(label: string): {
  title: string;
  body: string;
  action: string;
} {
  return {
    title: `Delete ${label}?`,
    body: "Members lose what they entered in it, and it leaves the directory. This can't be undone.",
    action: MEMBER_FIELDS_COPY.deleteField,
  };
}

/**
 * The writes that put fields in `orderedIds`' order: each field whose `sort`
 * isn't already its place gets its place. The API orders by `sort`, then by
 * when the field was made, so equal sorts (every field starts at 0) are
 * spread out the first time anything moves.
 */
export function memberFieldSortPatches(
  orderedIds: readonly string[],
  fields: readonly { id: string; sort: number }[],
): { id: string; sort: number }[] {
  const sortById = new Map(fields.map((field) => [field.id, field.sort]));
  return orderedIds.flatMap((id, index) =>
    sortById.has(id) && sortById.get(id) !== index ? [{ id, sort: index }] : [],
  );
}

/** One place up or down: the ids in their new order, or null at an end. */
export function moveId(
  ids: readonly string[],
  id: string,
  by: -1 | 1,
): string[] | null {
  const index = ids.indexOf(id);
  const target = index + by;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
