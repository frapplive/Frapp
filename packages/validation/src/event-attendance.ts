/**
 * Who an event is for, per role: `spec/behavior/events.md` § Attendance by role.
 *
 * An event sets one default for the whole chapter ("everyone else") and may
 * name roles that differ from it. Each role is Required, Optional or Not
 * invited; so is the default. The columns that carry it:
 *
 * - `required_role_ids`: roles that must attend.
 * - `optional_role_ids`: roles invited, not required.
 * - `excluded_role_ids`: roles not invited.
 * - `others_invited` + `is_mandatory`: the default for a member who holds none
 *   of those roles. Not invited when `others_invited` is false; otherwise
 *   Required when `is_mandatory`, else Optional.
 *
 * A member who holds several listed roles gets the strongest of them
 * (Required, then Optional, then Not invited), so an officer who is also a new
 * member is still required at an officers-only meeting. A listed role always
 * beats the default.
 *
 * Every check (who sees the event, who may check in, who the auto-absent sweep
 * marks, who is notified) reads through {@link eventAttendanceFor}, in the API
 * and in the apps, so one rule decides them all.
 */

export const EVENT_ATTENDANCE_STATUSES = [
  "required",
  "optional",
  "not_invited",
] as const;

export type EventAttendanceStatus = (typeof EVENT_ATTENDANCE_STATUSES)[number];

/** The words a picker shows for each status. */
export const EVENT_ATTENDANCE_LABELS: Record<EventAttendanceStatus, string> = {
  required: "Required",
  optional: "Optional",
  not_invited: "Not invited",
};

/** The event fields the rule reads. Older rows may lack the new columns. */
export interface EventAttendanceFields {
  is_mandatory?: boolean | null;
  required_role_ids?: readonly string[] | null;
  optional_role_ids?: readonly string[] | null;
  excluded_role_ids?: readonly string[] | null;
  /** Absent on a row written before the column: read as `true`. */
  others_invited?: boolean | null;
  /**
   * What the officer picked, tiers included (Paul, 2026-11-22: "THE MAIN
   * POINT IS TO BE ABLE TO ADD TIERS HERE"), or `null` when the event names
   * no tier. The `*_role_ids` columns are always the effective role ids, so
   * every check reads only them; the editors read this to show a tier row.
   */
  attendance_picks?: EventAttendancePicks | null;
}

/**
 * An event's picks per answer (`events.attendance_picks`), each entry a role
 * id or a tier as {@link attendanceTierEntry} spells it. The database
 * expands them into the `*_role_ids` columns (`events_expand_attendance_picks`):
 * a tier stands for every role in it, now and after a role joins or leaves
 * it, until the event ends.
 */
export interface EventAttendancePicks {
  required: string[];
  optional: string[];
  not_invited: string[];
}

const TIER_ENTRY_PREFIX = "tier:";

/** A tier as an attendance list and a draft key spell it: `tier:<id>`. */
export function attendanceTierEntry(tierId: string): string {
  return `${TIER_ENTRY_PREFIX}${tierId.toLowerCase()}`;
}

/** The tier id an entry names, or `null` for a role id. */
export function attendanceTierIdOf(entry: string): string | null {
  return entry.startsWith(TIER_ENTRY_PREFIX)
    ? entry.slice(TIER_ENTRY_PREFIX.length).toLowerCase()
    : null;
}

/**
 * Request lists as the API stores them: `attendance_picks` holds them as sent
 * when any names a tier (else `null`), and each `*_role_ids` keeps only its
 * role ids, which the database tops up with the tiers' roles.
 */
export function splitAttendancePicks(lists: {
  required_role_ids: readonly string[] | null;
  optional_role_ids: readonly string[] | null;
  excluded_role_ids: readonly string[] | null;
}): {
  attendance_picks: EventAttendancePicks | null;
  required_role_ids: string[] | null;
  optional_role_ids: string[] | null;
  excluded_role_ids: string[] | null;
} {
  // A tier entry is matched against `tier:` plus the lowercase uuid, so one
  // sent in another case is spelled that way rather than matching nothing.
  const entries = (list: readonly string[] | null) => [
    ...new Set(
      (list ?? []).map((entry) => {
        const tierId = attendanceTierIdOf(entry.toLowerCase());
        return tierId === null ? entry : attendanceTierEntry(tierId);
      }),
    ),
  ];
  const picks: EventAttendancePicks = {
    required: entries(lists.required_role_ids),
    optional: entries(lists.optional_role_ids),
    not_invited: entries(lists.excluded_role_ids),
  };
  const namesTier = [
    ...picks.required,
    ...picks.optional,
    ...picks.not_invited,
  ].some((entry) => attendanceTierIdOf(entry) !== null);
  const rolesOf = (
    list: readonly string[] | null,
    entries: string[],
  ): string[] | null => {
    if (list === null) return null;
    const roles = entries.filter((entry) => attendanceTierIdOf(entry) === null);
    return roles.length > 0 || !namesTier ? roles : null;
  };
  return {
    attendance_picks: namesTier ? picks : null,
    required_role_ids: rolesOf(lists.required_role_ids, picks.required),
    optional_role_ids: rolesOf(lists.optional_role_ids, picks.optional),
    excluded_role_ids: rolesOf(lists.excluded_role_ids, picks.not_invited),
  };
}

function readPicks(value: unknown): EventAttendancePicks | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const list = (key: string) =>
    Array.isArray(record[key])
      ? (record[key] as unknown[]).filter(
          (id): id is string => typeof id === "string",
        )
      : [];
  return {
    required: list("required"),
    optional: list("optional"),
    not_invited: list("not_invited"),
  };
}

export interface EventAttendance {
  status: EventAttendanceStatus;
  /**
   * True when a listed role decided the status, false when the default did.
   * The alumni rule hangs on this: an alumnus is held to a non-targeted event
   * only when a role names them (`spec/behavior/alumni.md`).
   */
  byRole: boolean;
}

function holdsAny(
  listed: readonly string[] | null | undefined,
  memberRoleIds: readonly string[],
): boolean {
  if (!listed || listed.length === 0) return false;
  return listed.some((roleId) => memberRoleIds.includes(roleId));
}

/**
 * Whether a member holding none of the listed roles is invited. A row with
 * no `others_invited` (`null`: written before the column, or by a client
 * that predates it) reads with the older meaning, where a non-empty
 * `required_role_ids` was the whole audience. Deriving it on read, rather
 * than backfilling once, keeps an older API or client correct for as long
 * as it keeps writing during a deploy.
 */
export function eventOthersInvited(event: EventAttendanceFields): boolean {
  if (typeof event.others_invited === "boolean") return event.others_invited;
  return (event.required_role_ids?.length ?? 0) === 0;
}

/**
 * The roles an event invites, by name ("Exec, Brothers"), or `null` when
 * everyone is invited or no listed role is known. Minutes are read by those
 * the event invited, so this names who can read them (#5562).
 */
export function eventInvitedRoleNames(
  event: EventAttendanceFields,
  roles: readonly { id: string; name: string }[],
  tiers: readonly { id: string; name: string }[] = [],
): string | null {
  if (eventOthersInvited(event)) return null;
  // As picked, so a tier reads "Cabinet" rather than each of its roles.
  const picks = event.attendance_picks;
  const nameOf = attendanceEntryName(roles, tiers);
  const names = [
    ...new Set([
      ...(picks?.required ?? event.required_role_ids ?? []),
      ...(picks?.optional ?? event.optional_role_ids ?? []),
    ]),
  ]
    .map((id) => nameOf(id))
    .filter((name): name is string => !!name);
  return names.length > 0 ? names.join(", ") : null;
}

/** The default status for a member who holds none of the listed roles. */
export function eventDefaultAttendance(
  event: EventAttendanceFields,
): EventAttendanceStatus {
  if (!eventOthersInvited(event)) return "not_invited";
  return event.is_mandatory ? "required" : "optional";
}

/** What `event` asks of a member holding `memberRoleIds`. */
export function eventAttendanceFor(
  event: EventAttendanceFields,
  memberRoleIds: readonly string[],
): EventAttendance {
  if (holdsAny(event.required_role_ids, memberRoleIds)) {
    return { status: "required", byRole: true };
  }
  if (holdsAny(event.optional_role_ids, memberRoleIds)) {
    return { status: "optional", byRole: true };
  }
  if (holdsAny(event.excluded_role_ids, memberRoleIds)) {
    return { status: "not_invited", byRole: true };
  }
  return { status: eventDefaultAttendance(event), byRole: false };
}

/**
 * Whether anyone is kept out: the event's read gate (list, detail, search,
 * feed, pushes) only has work to do when this is true.
 */
export function eventLimitsAudience(event: EventAttendanceFields): boolean {
  return (
    !eventOthersInvited(event) || (event.excluded_role_ids?.length ?? 0) > 0
  );
}

/** Whether any role is set apart from the default: a list's "By role" badge. */
export function eventSetsRolesApart(event: EventAttendanceFields): boolean {
  return (
    !eventOthersInvited(event) ||
    (event.required_role_ids?.length ?? 0) > 0 ||
    (event.optional_role_ids?.length ?? 0) > 0 ||
    (event.excluded_role_ids?.length ?? 0) > 0
  );
}

/**
 * The rule's fields off a loosely typed event record (a list row, a Realtime
 * payload), dropping anything malformed. A row from before the columns reads
 * as it did then ({@link eventOthersInvited}).
 */
export function attendanceFieldsOf(
  event: Record<string, unknown>,
): EventAttendanceFields {
  const ids = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : null;
  return {
    is_mandatory: event.is_mandatory === true,
    required_role_ids: ids(event.required_role_ids),
    optional_role_ids: ids(event.optional_role_ids),
    excluded_role_ids: ids(event.excluded_role_ids),
    others_invited:
      typeof event.others_invited === "boolean" ? event.others_invited : null,
    attendance_picks: readPicks(event.attendance_picks),
  };
}

/** Whether anyone at all is required: the auto-absent sweep's filter. */
export function eventRequiresAnyone(event: EventAttendanceFields): boolean {
  return (
    (event.required_role_ids?.length ?? 0) > 0 ||
    (eventOthersInvited(event) && Boolean(event.is_mandatory))
  );
}

/**
 * An editor's draft of the rule: the default and the roles that differ from
 * it. The apps build it, {@link attendanceToWire} turns it into the columns.
 */
export interface EventAttendanceDraft {
  everyone: EventAttendanceStatus;
  /**
   * Role id, or tier entry ({@link attendanceTierEntry}), to its status. One
   * whose status equals `everyone` is dropped.
   */
  roles: Record<string, EventAttendanceStatus>;
}

export interface EventAttendanceWire {
  is_mandatory: boolean;
  others_invited: boolean;
  required_role_ids: string[];
  optional_role_ids: string[];
  excluded_role_ids: string[];
}

/** The draft as request fields. Every field is sent, so an edit can clear. */
export function attendanceToWire(
  draft: EventAttendanceDraft,
): EventAttendanceWire {
  const byStatus: Record<EventAttendanceStatus, string[]> = {
    required: [],
    optional: [],
    not_invited: [],
  };
  for (const [roleId, status] of Object.entries(draft.roles)) {
    if (status === draft.everyone) continue;
    byStatus[status].push(roleId);
  }
  return {
    is_mandatory: draft.everyone === "required",
    others_invited: draft.everyone !== "not_invited",
    required_role_ids: byStatus.required,
    optional_role_ids: byStatus.optional,
    excluded_role_ids: byStatus.not_invited,
  };
}

/** A stored event back into an editor's draft. */
export function attendanceFromEvent(
  event: EventAttendanceFields,
): EventAttendanceDraft {
  const everyone = eventDefaultAttendance(event);
  const roles: Record<string, EventAttendanceStatus> = {};
  // The picks, tiers and all, when the event names a tier; the role lists
  // otherwise (they hold every tier's roles, not the tier).
  const picks = event.attendance_picks;
  // Lowest precedence first, so a role listed twice keeps the stronger status.
  for (const id of picks?.not_invited ?? event.excluded_role_ids ?? []) {
    roles[id] = "not_invited";
  }
  for (const id of picks?.optional ?? event.optional_role_ids ?? []) {
    roles[id] = "optional";
  }
  for (const id of picks?.required ?? event.required_role_ids ?? []) {
    roles[id] = "required";
  }
  for (const [id, status] of Object.entries(roles)) {
    if (status === everyone) delete roles[id];
  }
  return { everyone, roles };
}

/** A fresh event's rule: everyone invited, nobody required. */
export function emptyAttendanceDraft(): EventAttendanceDraft {
  return { everyone: "optional", roles: {} };
}

/**
 * One line for the form's Who's coming row, the picker's summary and an
 * event's detail, naming the roles set apart first and the default last:
 * "Optional for everyone", "Officers required, everyone else optional",
 * "Brothers required, New Members optional, nobody else invited". More than
 * two roles in one answer read "A, B +3". `roleName` resolves an id; an
 * unknown id reads as "a role".
 */
export function describeAttendance(
  draft: EventAttendanceDraft,
  roleName: (roleId: string) => string | undefined,
): string {
  const entries = Object.entries(draft.roles).filter(
    ([, status]) => status !== draft.everyone,
  );
  if (entries.length === 0) {
    if (draft.everyone === "not_invited") return "Nobody invited yet";
    return `${EVENT_ATTENDANCE_LABELS[draft.everyone]} for everyone`;
  }
  const list = (items: string[]) =>
    items.length <= 2
      ? items.join(" and ")
      : `${items.slice(0, 2).join(", ")} +${items.length - 2}`;
  const parts: string[] = [];
  for (const status of EVENT_ATTENDANCE_STATUSES) {
    const names = entries
      .filter(([, s]) => s === status)
      .map(([id]) => roleName(id) ?? "a role")
      .sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
      );
    if (names.length > 0) {
      parts.push(
        `${list(names)} ${EVENT_ATTENDANCE_LABELS[status].toLowerCase()}`,
      );
    }
  }
  parts.push(
    draft.everyone === "not_invited"
      ? "nobody else invited"
      : `everyone else ${EVENT_ATTENDANCE_LABELS[draft.everyone].toLowerCase()}`,
  );
  return parts.join(", ");
}

// The editors' moves, shared so web and mobile set a rule the same way.

/** Past this many roles an editor's list gets a search field. */
export const ATTENDANCE_SEARCH_FROM = 8;

/**
 * The answers a row offers. `allowRequired` false drops Required, for a
 * member who may make events but not require attendance, except on a row
 * already set to Required, which keeps it so its answer stays visible.
 */
export function attendanceChoices(
  current: EventAttendanceStatus,
  allowRequired: boolean,
  floor?: EventAttendanceStatus,
): EventAttendanceStatus[] {
  return EVENT_ATTENDANCE_STATUSES.filter(
    (status) =>
      (allowRequired || status !== "required" || current === "required") &&
      (!floor || STRENGTH[status] >= STRENGTH[floor]),
  );
}

const STRENGTH: Record<EventAttendanceStatus, number> = {
  required: 2,
  optional: 1,
  not_invited: 0,
};

/**
 * The weakest answer a role row may take: its tier's, when the tier is set
 * apart. A member gets the strongest answer of everything they hold, and the
 * database lists the role under its tier's answer too, so a role can be
 * raised above its tier but never let off it; the editors offer only the
 * answers at or above it.
 */
export function attendanceFloorOf(
  draft: EventAttendanceDraft,
  tierEntry?: string | null,
): EventAttendanceStatus | undefined {
  return tierEntry ? draft.roles[tierEntry] : undefined;
}

/**
 * The chapter's Alumni role id from a `GET /v1/roles` payload, or undefined.
 * An alumnus is held to an event only when a role of theirs is set apart
 * (`spec/behavior/alumni.md`), so the editors say so on the Alumni row.
 */
export function alumniRoleIdOf(roles: unknown): string | undefined {
  if (!Array.isArray(roles)) return undefined;
  for (const row of roles) {
    if (
      row &&
      typeof row === "object" &&
      (row as { system_key?: unknown }).system_key === "ALUMNI" &&
      typeof (row as { id?: unknown }).id === "string"
    ) {
      return (row as { id: string }).id;
    }
  }
  return undefined;
}

/** The line under the Alumni row while it follows Everyone else. */
export const ALUMNI_FOLLOWING_NOTE = "Left out unless set here";

/**
 * A row's answer under a draft: its own when set apart, else its tier's when
 * `tierEntry` (the role's tier, {@link attendanceTierEntry}) is set apart,
 * else the default. A member gets the strongest answer of all they hold, so a
 * role that follows its tier answers as the tier does.
 */
export function attendanceOfRole(
  draft: EventAttendanceDraft,
  roleId: string,
  tierEntry?: string | null,
): EventAttendanceStatus {
  const own = draft.roles[roleId];
  const tier = attendanceFloorOf(draft, tierEntry);
  if (own && tier) return STRENGTH[own] >= STRENGTH[tier] ? own : tier;
  return own ?? tier ?? draft.everyone;
}

/**
 * The name for a draft key: a role's, or a tier's for a tier entry. Feeds
 * {@link describeAttendance}, so "Cabinet required, nobody else invited"
 * reads the same on every surface.
 */
export function attendanceEntryName(
  roles: readonly { id: string; name: string }[],
  tiers: readonly { id: string; name: string }[],
): (entry: string) => string | undefined {
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const tierNames = new Map(
    tiers.map((tier) => [tier.id.toLowerCase(), tier.name]),
  );
  return (entry) => {
    const tierId = attendanceTierIdOf(entry);
    return tierId === null ? roleNames.get(entry) : tierNames.get(tierId);
  };
}

/**
 * The picker's rows, one per role: the roles set apart when it opened
 * (`pinned`) first, then the rest, each part by name, matching every typed
 * word of `query`. The order is taken once per visit, so a row never jumps
 * while the officer sets it. An id in `pinned` that no longer names a role (a
 * role deleted since) keeps a row, named by `missingName`, so it can be reset.
 */
export function attendanceRows<
  T extends { id: string; name: string; hidden?: boolean },
>(
  options: readonly T[],
  pinned: readonly string[],
  query: string,
  missingName: string,
): { id: string; name: string }[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (name: string) =>
    words.every((word) => name.toLowerCase().includes(word));
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  const known = new Map(options.map((role) => [role.id, role]));
  const pinnedSet = new Set(pinned);
  const top = pinned
    .map((id) => ({ id, name: known.get(id)?.name ?? missingName }))
    .sort(byName);
  // A `hidden` role (the chapter's Everyone role, #4191) is offered only
  // where the event already sets it apart: "Everyone else" is its row.
  const rest = options
    .filter((role) => !pinnedSet.has(role.id) && !role.hidden)
    .map((role) => ({ id: role.id, name: role.name }))
    .sort(byName);
  return [...top, ...rest].filter((row) => matches(row.name));
}

/**
 * The draft after the default changes. A role whose status now equals the
 * default no longer differs, so it leaves the list.
 */
export function withEveryone(
  draft: EventAttendanceDraft,
  everyone: EventAttendanceStatus,
): EventAttendanceDraft {
  const roles: Record<string, EventAttendanceStatus> = {};
  for (const [id, status] of Object.entries(draft.roles)) {
    if (status !== everyone) roles[id] = status;
  }
  return { everyone, roles };
}

/**
 * The draft after one row's answer changes. A row whose answer now equals
 * what it would follow anyway (its tier's, when `tierEntry` is set apart,
 * else Everyone else's) leaves the list.
 */
export function withRole(
  draft: EventAttendanceDraft,
  roleId: string,
  status: EventAttendanceStatus | null,
  tierEntry?: string | null,
): EventAttendanceDraft {
  const roles = { ...draft.roles };
  const follows = attendanceFloorOf(draft, tierEntry) ?? draft.everyone;
  if (status === null || status === follows) delete roles[roleId];
  else roles[roleId] = status;
  return { ...draft, roles };
}

/** Whether a draft's rule invites nobody at all: both editors refuse it. */
export function attendanceInvitesNobody(wire: EventAttendanceWire): boolean {
  return (
    !wire.others_invited &&
    wire.required_role_ids.length === 0 &&
    wire.optional_role_ids.length === 0
  );
}

/**
 * `others_invited` for a create body, or `undefined` when a row stored
 * without it would read the same ({@link eventOthersInvited}). Leaving it
 * out keeps a plain event creatable against an API that predates the field
 * (a mobile update can reach phones before the API deploys). An update
 * always sends it, since the stored row may hold an explicit value.
 */
export function othersInvitedForCreate(
  wire: EventAttendanceWire,
): boolean | undefined {
  const derived = wire.required_role_ids.length === 0;
  return wire.others_invited === derived ? undefined : wire.others_invited;
}
