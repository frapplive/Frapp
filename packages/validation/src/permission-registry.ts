/**
 * The permission registry: what each system permission is called, what it
 * lets a role do, and which module it belongs to (#4069).
 *
 * **The one source for those words.** The API serves it at
 * `GET /v1/roles/permissions-catalog`; web and mobile read it from here, so a
 * permission reads the same on every surface. The permission strings
 * themselves are still enforced by the API's guards
 * (`SystemPermissions` in `apps/api/src/domain/constants/permissions.ts`),
 * and `permissions.registry.spec.ts` there fails when the two lists differ.
 *
 * `module` is a `MODULE_CATALOG` key (`@repo/org-archetypes`), or `chapter`
 * for a permission that belongs to the chapter rather than to one module. The
 * same API spec pins that.
 *
 * `scope` is `chapter` or `council` (#5933, `school-layer.md` § 5.1). A
 * council key (`council:*`) is held only by a council's roles: the API serves
 * it in a council's catalog and refuses it in a chapter's role writes
 * (`roles.permission.reserved`), and every route that requires one serves the
 * council tenant kind alone. A council's catalog also carries the chapter
 * keys it shares ({@link COUNCIL_SHARED_PERMISSIONS}).
 */

export type PermissionScope = "chapter" | "council";

/**
 * The groups permissions are shown under, in display order. `label` is the
 * product's name for the group, which is not always the module's own
 * (`geofences` is "Study zones" wherever a member reads it).
 */
export const PERMISSION_MODULES = [
  { key: "chapter", label: "Chapter" },
  { key: "members", label: "Members" },
  { key: "chat", label: "Chat" },
  { key: "announcements", label: "Announcements" },
  { key: "events", label: "Events" },
  { key: "tasks", label: "Tasks" },
  { key: "meetings", label: "Meetings" },
  { key: "points", label: "Points" },
  { key: "hours", label: "Service hours" },
  { key: "polls", label: "Polls" },
  { key: "rush", label: "Recruitment" },
  { key: "backwork", label: "Backwork" },
  { key: "documents", label: "Documents" },
  { key: "geofences", label: "Study zones" },
  { key: "reports", label: "Reports" },
  { key: "billing", label: "Billing" },
  // Council keys (#5933). Not module-catalog keys: a council's modules are
  // its council profile's, and a chapter never sees these groups.
  { key: "council", label: "Council" },
  { key: "council-recruitment", label: "Council recruitment" },
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]["key"];

export interface PermissionDefinition {
  /** The stored string, e.g. `events:create`. Never renamed: roles hold it. */
  permission: string;
  module: PermissionModuleKey;
  /** A row label: what the role can do, verb first. */
  label: string;
  /** One line saying what granting it opens. */
  description: string;
  scope: PermissionScope;
}

function chapterPermission(
  permission: string,
  module: PermissionModuleKey,
  label: string,
  description: string,
): PermissionDefinition {
  return { permission, module, label, description, scope: "chapter" };
}

function councilPermission(
  permission: `council:${string}`,
  module: "council" | "council-recruitment",
  label: string,
  description: string,
): PermissionDefinition {
  return { permission, module, label, description, scope: "council" };
}

export const PERMISSION_REGISTRY: readonly PermissionDefinition[] = [
  chapterPermission(
    "*",
    "chapter",
    "Everything",
    "Every permission, including ones added later. Only the President holds it.",
  ),
  chapterPermission(
    "roles:manage",
    "chapter",
    "Manage roles",
    "Create, edit and delete roles, give roles to members, edit pledge classes, and fix the names and graduation years of members ranked below them or at their own rank.",
  ),
  // Paul, 2026-11-20 (#5725): a switch a chapter turns on for its top tier,
  // so one cabinet officer can make another Stewardship Chair. Without it,
  // the roles must rank below you (#4071); a member at your own rank is
  // reachable either way, for those roles (#5843), and so is a member ranked
  // above you, though never for a role at your own rank (#5903).
  chapterPermission(
    "roles:assign_own_level",
    "chapter",
    "Give roles at your own level",
    "With Manage roles, also give and take away roles at your own level, not only those below it, on members at your own level or below. On someone ranked above you, only roles below your own.",
  ),
  chapterPermission(
    "chapter-config:view",
    "chapter",
    "See chapter settings",
    "Open chapter settings, custom fields and, with the directory, the audit log.",
  ),
  chapterPermission(
    "chapter-config:manage",
    "chapter",
    "Change chapter settings",
    "Change chapter settings, modules, custom fields, and the chapter's name, accent and logo.",
  ),
  chapterPermission(
    "semester:rollover",
    "chapter",
    "Start a new semester",
    "Close the current semester and start the next one.",
  ),
  // AI (ADR-28). The API leaves these two out of the catalog it serves while
  // its AI switch is off, and the web role and tier pages, which draw from
  // this registry, leave them out the same way (`isPermissionHidden` in
  // `@repo/hooks`, which web and the phone share).
  chapterPermission(
    "ai:use",
    "chapter",
    "Use AI",
    "Ask for AI drafts and answers, once the chapter has turned AI on.",
  ),
  chapterPermission(
    "ai:act",
    "chapter",
    "Let AI take actions",
    "Have AI carry out things the member could do themselves, after they confirm each one.",
  ),

  chapterPermission(
    "members:view",
    "members",
    "See the full directory",
    "See every member, and open chat, the roster and events.",
  ),
  chapterPermission(
    "members:invite",
    "members",
    "Invite members",
    "Invite people by email or link, and revoke invites.",
  ),
  chapterPermission(
    "members:remove",
    "members",
    "Remove members",
    "Remove a member from the chapter.",
  ),
  // Chat timeouts (#6006; Paul's go, relayed by Shawn, 2026-11-25): a
  // permission of its own rather than `channels:manage`, so a chapter can
  // hand moderation to someone who shouldn't edit channels.
  chapterPermission(
    "members:timeout",
    "members",
    "Time out members",
    "Stop a member ranked below them from posting or reacting in channels for up to a week. DMs aren't affected.",
  ),
  // Groups (#4076) carry no permissions, so keeping one current needs less
  // trust than `roles:manage`: a house manager can keep "Third floor" right.
  chapterPermission(
    "groups:manage",
    "members",
    "Manage groups",
    "Create, rename and delete groups like Third floor or Live-ins, choose who is in them, and choose which can be pinged.",
  ),

  chapterPermission(
    "channels:create",
    "chat",
    "Create channels",
    "Add new chat channels.",
  ),
  chapterPermission(
    "channels:manage",
    "chat",
    "Manage channels and pins",
    "Edit and delete channels, pin messages, close anyone's poll, and set who can use a channel.",
  ),
  chapterPermission(
    "alumni:post",
    "chat",
    "Post in the alumni channel",
    "No longer used. Who can post in a channel is set in that channel's settings.",
  ),

  chapterPermission(
    "announcements:post",
    "announcements",
    "Post announcements",
    "No longer used. Who can post in a channel is set in that channel's settings.",
  ),

  chapterPermission(
    "events:create",
    "events",
    "Create events",
    "Add events to the chapter calendar.",
  ),
  chapterPermission(
    "events:update",
    "events",
    "Edit events",
    "Change an event's details and take attendance.",
  ),
  chapterPermission(
    "events:delete",
    "events",
    "Delete events",
    "Delete an event from the calendar.",
  ),

  chapterPermission(
    "tasks:manage",
    "tasks",
    "Manage tasks",
    "Create and assign tasks, and confirm them done.",
  ),

  chapterPermission(
    "meetings:record",
    "meetings",
    "Write meeting minutes",
    "Start minutes for a meeting, and edit and post the ones they started.",
  ),
  chapterPermission(
    "meetings:edit",
    "meetings",
    "Edit anyone's minutes",
    "Edit and post minutes another officer started, before or after they are posted.",
  ),
  chapterPermission(
    "meetings:delete",
    "meetings",
    "Delete minutes",
    "Delete a meeting's minutes for good.",
  ),

  chapterPermission(
    "points:adjust",
    "points",
    "Add or remove points",
    "Give or take points from a member by hand.",
  ),
  chapterPermission(
    "points:view_all",
    "points",
    "See every member's points",
    "See every member's point history, not only their own.",
  ),
  chapterPermission(
    "predictions:create",
    "points",
    "Ask predictions",
    "Ask a question members can stake points on.",
  ),
  chapterPermission(
    "predictions:manage",
    "points",
    "Manage predictions",
    "Confirm, settle again or void any prediction, including after it pays.",
  ),

  chapterPermission(
    "service:log",
    "hours",
    "Log service hours",
    "Submit service hours for approval.",
  ),
  chapterPermission(
    "service:approve",
    "hours",
    "Approve service hours",
    "Approve or reject the service hours members submit.",
  ),

  chapterPermission(
    "polls:create",
    "polls",
    "Create polls",
    "Start a poll in a channel.",
  ),
  chapterPermission(
    "polls:view_all",
    "polls",
    "See every poll",
    "See every poll in the chapter with its vote counts.",
  ),

  chapterPermission(
    "rush:view",
    "rush",
    "See prospects",
    "Look up a prospect and see their bid status.",
  ),
  chapterPermission(
    "rush:add",
    "rush",
    "Add and work prospects",
    "Add a prospect to the chapter's recruitment list and move them between stages.",
  ),
  chapterPermission(
    "rush:notes",
    "rush",
    "Write notes and tag prospects",
    "Write notes on a prospect and tag them.",
  ),
  chapterPermission(
    "rush:read_notes",
    "rush",
    "Read recruitment notes",
    "Read the notes members write on prospects.",
  ),
  chapterPermission(
    "rush:vote",
    "rush",
    "Vote on and rate prospects",
    "Cast a vote on a prospect and rate them from 1 to 5.",
  ),
  chapterPermission(
    "rush:view_results",
    "rush",
    "See vote results",
    "See how many votes a prospect has and their average rating.",
  ),
  chapterPermission(
    "rush:bid",
    "rush",
    "Record bids",
    "Record that the chapter extended a bid to a prospect.",
  ),
  chapterPermission(
    "rush:manage",
    "rush",
    "Manage recruitment",
    "Edit the chapter's stages and tags, and delete anyone's note on a prospect.",
  ),

  chapterPermission(
    "backwork:upload",
    "backwork",
    "Upload backwork",
    "Add study resources to Backwork.",
  ),
  chapterPermission(
    "backwork:admin",
    "backwork",
    "Manage backwork",
    "Manage courses and professors, and delete resources.",
  ),

  chapterPermission(
    "chapter_docs:upload",
    "documents",
    "Upload documents",
    "Add documents to the chapter's files.",
  ),
  chapterPermission(
    "chapter_docs:manage",
    "documents",
    "Manage documents",
    "Organize and delete the chapter's documents.",
  ),

  chapterPermission(
    "geofences:manage",
    "geofences",
    "Manage study zones",
    "Create, edit and delete the places study hours count.",
  ),

  chapterPermission(
    "reports:export",
    "reports",
    "Export reports",
    "Export attendance, points and roster reports.",
  ),

  chapterPermission(
    "billing:view",
    "billing",
    "See billing",
    "See the chapter's plan and every member's invoices.",
  ),
  chapterPermission(
    "billing:manage",
    "billing",
    "Manage billing and invoices",
    "Change the chapter's plan and create member invoices.",
  ),

  // Council keys, `school-layer.md` § 5.1 and `council-types.md` § Default
  // role titles (#5933). The explicit-grant keys (`council:grades_import`,
  // `council:eligibility_manage`, `council:matching_operate`) are not here
  // yet: they join with the check that keeps `*` from satisfying them (§ 4.2
  // rule 2), so no role can hold one before that check exists.
  councilPermission(
    "council:chapters_manage",
    "council",
    "Manage member chapters",
    "Propose, accept, suspend and end the chapters that belong to the council.",
  ),
  councilPermission(
    "council:announce",
    "council",
    "Announce to chapters",
    "Send announcements to member chapters' council contacts.",
  ),
  councilPermission(
    "council:calendar_manage",
    "council",
    "Manage the council calendar",
    "Add and change the council dates member chapters see.",
  ),
  councilPermission(
    "council:campus_post",
    "council",
    "Post to campus",
    "Post to the school's campus feed, once the council is verified.",
  ),
  councilPermission(
    "council:campus_moderate",
    "council",
    "Moderate campus",
    "Hide campus posts and messages at the council's school and act on reports.",
  ),
  councilPermission(
    "council:recruitment_view",
    "council-recruitment",
    "See the master list",
    "See registered PNMs, interest counts, eligibility verdicts and acceptances.",
  ),
  councilPermission(
    "council:recruitment_manage",
    "council-recruitment",
    "Run recruitment",
    "Run the registration form, imports and merges, season dates and rules, bid-day release, and see PNM phone numbers.",
  ),
  councilPermission(
    "council:recruitment_reports",
    "council-recruitment",
    "Export recruitment reports",
    "Export the reports the Greek life office asks for.",
  ),
  councilPermission(
    "council:counselors_manage",
    "council-recruitment",
    "Manage recruitment counselors",
    "Assign counselors to PNM groups and publish disaffiliation records.",
  ),
  councilPermission(
    "council:pnm_group_view",
    "council-recruitment",
    "See an assigned PNM group",
    "See the names and schedules of the PNM group you're assigned, and nothing else.",
  ),
];

/**
 * The chapter keys a council's catalog carries beside its own
 * (`school-layer.md` § 5.1): membership, roles, chat, events, documents,
 * billing and the settings and audit log. Everything else in the registry
 * gates a route that serves chapters only, so offering it to a council would
 * be a switch that does nothing.
 */
export const COUNCIL_SHARED_PERMISSIONS: ReadonlySet<string> = new Set([
  "*",
  "roles:manage",
  "roles:assign_own_level",
  "chapter-config:view",
  "chapter-config:manage",
  "members:view",
  "members:invite",
  "members:remove",
  // Chat timeouts (#6006): a council's channels are chat like a chapter's.
  "members:timeout",
  "groups:manage",
  "channels:create",
  "channels:manage",
  "events:create",
  "events:update",
  "events:delete",
  "billing:view",
  "billing:manage",
]);

/** A permission string in the council namespace, system or not. */
export function isCouncilPermission(permission: string): boolean {
  return permission.startsWith("council:");
}

/** Every `council-recruitment` key, which a council whose model is `none` never shows or seeds. */
export const COUNCIL_RECRUITMENT_PERMISSIONS: ReadonlySet<string> = new Set(
  PERMISSION_REGISTRY.filter(
    (entry) => entry.module === "council-recruitment",
  ).map((entry) => entry.permission),
);

/**
 * Permissions left off the role and tier pages, web and phone (through
 * `isPermissionHidden` in `@repo/hooks`), and off a module page's "Who can"
 * (`modulePermissions`), where both showed as switches captioned "No longer
 * used" (#5728). They decide no channel's posters since #3722. The Discord
 * import's read-gate picker, fed by the API catalog, still lists them.
 *
 * They stay in the registry, the API catalog and stored role data until
 * #4286 retires them, because two readers remain: the Discord importer starts
 * a read-only channel's posters from `announcements:post` holders, and the
 * phone's Support the Chapter button shows to `alumni:post` holders. The
 * seeded roles carry what those read. `alumni:post` also decides who may give
 * the Alumni role, as any role's permissions do (#5729).
 */
export const RETIRED_PERMISSIONS: ReadonlySet<string> = new Set([
  "alumni:post",
  "announcements:post",
]);

const BY_PERMISSION: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSION_REGISTRY.map((entry) => [entry.permission, entry]),
);

const MODULE_LABELS: ReadonlyMap<string, string> = new Map(
  PERMISSION_MODULES.map((module) => [module.key, module.label]),
);

/**
 * The recruitment permissions a role needs to do what any member could do
 * before recruitment had permissions of its own (#4070): look a prospect up,
 * add one, write notes, vote, see the count and record a bid. The seeded
 * Member role holds them, and migration
 * `20261111010000_rush_permissions_backfill.sql` carries the same six for
 * existing roles. `rush:manage` is left out: nobody could delete or export.
 */
export const RUSH_MEMBER_PERMISSIONS = [
  "rush:view",
  "rush:add",
  "rush:notes",
  "rush:vote",
  "rush:view_results",
  "rush:bid",
] as const;

/** The registry entry for a permission string, if it is a system one. */
export function permissionDefinition(
  permission: string,
): PermissionDefinition | undefined {
  return BY_PERMISSION.get(permission);
}

/** The display name of a registry module key. */
export function permissionModuleLabel(module: PermissionModuleKey): string {
  return MODULE_LABELS.get(module) ?? module;
}

function words(text: string): string {
  return text.replace(/[-_]/g, " ").trim();
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What a permission lets a role do, in words a chapter president reads.
 *
 * A permission the registry doesn't know (a chapter's custom string) reads
 * from its own string instead, `"fines:waive"` as "Waive fines", so a row is
 * never blank or a constant. A third segment qualifies the subject: a Discord
 * import's per-role read gate `"channels:read:exec-board"` reads "Read exec
 * board channels".
 */
export function permissionLabel(permission: string): string {
  const known = BY_PERMISSION.get(permission);
  if (known) return known.label;
  if (!permission.includes(":")) return sentenceCase(words(permission));
  const [subjectPart = "", actionPart = "", ...qualifier] =
    permission.split(":");
  const subject = words(subjectPart);
  const action = words(actionPart);
  if (!action) return sentenceCase(subject);
  const object = [words(qualifier.join(" ")), subject]
    .filter(Boolean)
    .join(" ");
  return `${sentenceCase(action)} ${object}`;
}

export interface PermissionGroup<T> {
  label: string;
  entries: T[];
}

/**
 * Groups permission rows by registry module, in `PERMISSION_MODULES` order,
 * keeping the given order within a group. The wildcard is dropped: it is not a
 * permission anyone toggles. A string the registry doesn't know groups under
 * its own namespace (`fines:waive` under "Fines"), after the known groups; one
 * with no namespace lands under "Chapter".
 */
export function groupPermissionsByModule<T extends { permission: string }>(
  rows: readonly T[],
): PermissionGroup<T>[] {
  const known = new Map<string, T[]>();
  const customOrder: string[] = [];
  const custom = new Map<string, T[]>();
  const chapterLabel = permissionModuleLabel("chapter");

  for (const row of rows) {
    if (row.permission === "*") continue;
    const definition = BY_PERMISSION.get(row.permission);
    const namespace = row.permission.includes(":")
      ? row.permission.slice(0, row.permission.indexOf(":"))
      : "";
    const label = definition
      ? permissionModuleLabel(definition.module)
      : namespace
        ? sentenceCase(words(namespace))
        : chapterLabel;
    const isKnownGroup = PERMISSION_MODULES.some(
      (module) => module.label === label,
    );
    const bucket = isKnownGroup ? known : custom;
    if (!bucket.has(label)) {
      bucket.set(label, []);
      if (!isKnownGroup) customOrder.push(label);
    }
    bucket.get(label)!.push(row);
  }

  return [
    ...PERMISSION_MODULES.filter((module) => known.has(module.label)).map(
      (module) => ({ label: module.label, entries: known.get(module.label)! }),
    ),
    ...customOrder.map((label) => ({ label, entries: custom.get(label)! })),
  ];
}
