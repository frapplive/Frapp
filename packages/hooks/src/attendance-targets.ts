import {
  attendanceEntryName,
  attendanceRows,
  attendanceTierEntry,
  attendanceTierIdOf,
} from "@repo/validation";
import { toRoleOptions } from "./chapter-roles";
import { normalizeTieredRoles, normalizeTiers } from "./role-tiers";

/*
 * What the Who's coming editors list (`spec/behavior/events.md` § Attendance
 * by role), for web's popover (`apps/web/components/events/attendance-
 * editor.tsx`) and the phone's sheet (`apps/mobile/components/events/
 * attendance-sheet.tsx`) alike, so the two offer the same rows in the same
 * order: the chapter's tiers first (Paul, 2026-11-22: "THE MAIN POINT IS TO BE
 * ABLE TO ADD TIERS HERE"), then its roles. A tier row stands for every role
 * in it, now and later; its key in the draft is `tier:<id>`. Pure: each app
 * reads the roles and tiers with its own hooks and hands the payloads here.
 */

/** One row of a Who's coming editor. */
export type AttendanceTargetRow = {
  /** The draft key: a role id, or `tier:<id>`. */
  id: string;
  name: string;
  kind: "tier" | "role";
  /** A tier's line under its name: how many roles it holds now. */
  detail?: string;
  /** A role's tier as a draft key, for the answer it follows. */
  tierEntry?: string;
};

export type AttendanceTargets = {
  rows: AttendanceTargetRow[];
  /** Every tier and role the chapter has, for "Show all N". */
  total: number;
  /** The name for any draft key; a key nothing names reads `missing`. */
  nameOf: (key: string) => string;
};

function rolesLabel(count: number): string {
  if (count === 0) return "No roles yet";
  return count === 1 ? "1 role" : `${count} roles`;
}

/**
 * The rows for `search`, with the keys set apart when the editor opened
 * (`pinned`) leading each kind, as `attendanceRows` orders roles. A pinned
 * key nothing names any more (a deleted role or tier) keeps a row, named
 * `missingRole` or `missingTier`, so it can be reset.
 */
export function attendanceTargets(
  rolesData: unknown,
  tiersData: unknown,
  pinned: readonly string[],
  search: string,
  { missingRole, missingTier }: { missingRole: string; missingTier: string },
): AttendanceTargets {
  const roleOptions = toRoleOptions(rolesData, "hide");
  const tiered = normalizeTieredRoles(rolesData);
  const tiers = normalizeTiers(tiersData);
  const counts = new Map<string, number>();
  const tierOfRole = new Map<string, string>();
  for (const role of tiered) {
    if (!role.tier_id) continue;
    counts.set(role.tier_id, (counts.get(role.tier_id) ?? 0) + 1);
    tierOfRole.set(role.id, attendanceTierEntry(role.tier_id));
  }
  const tierOptions = tiers.map((tier) => ({
    id: attendanceTierEntry(tier.id),
    name: tier.name,
  }));
  const isTier = (key: string) => attendanceTierIdOf(key) !== null;
  const tierRows = attendanceRows(
    tierOptions,
    pinned.filter(isTier),
    search,
    missingTier,
  ).map((row): AttendanceTargetRow => {
    const tierId = attendanceTierIdOf(row.id) ?? "";
    const known = tiers.some((tier) => tier.id.toLowerCase() === tierId);
    return {
      ...row,
      kind: "tier",
      detail: known ? `Tier · ${rolesLabel(counts.get(tierId) ?? 0)}` : "Tier",
    };
  });
  const roleRows = attendanceRows(
    roleOptions,
    pinned.filter((key) => !isTier(key)),
    search,
    missingRole,
  ).map((row): AttendanceTargetRow => ({
    ...row,
    kind: "role",
    tierEntry: tierOfRole.get(row.id),
  }));
  const named = attendanceEntryName(roleOptions, tiers);
  return {
    rows: [...tierRows, ...roleRows],
    total:
      tierOptions.length + roleOptions.filter((role) => !role.hidden).length,
    nameOf: (key) => named(key) ?? (isTier(key) ? missingTier : missingRole),
  };
}

/**
 * The name for a Who's coming key (a role id, or `tier:<id>`) as every
 * summary line reads it, on web and the phone: "Cabinet required, nobody
 * else invited" (`describeAttendance`). A role key nothing names reads
 * "Removed role" once the roles have loaded, and a tier key "Removed tier"
 * once the tiers have; before (or when a list failed to load), it reads as
 * unknown, so a summary never calls a live role or tier removed.
 */
export function attendanceNamesFrom(
  rolesData: unknown,
  tiersData: unknown,
  { rolesLoaded, tiersLoaded }: { rolesLoaded: boolean; tiersLoaded: boolean },
): (key: string) => string | undefined {
  const named = attendanceEntryName(
    toRoleOptions(rolesData, "keep"),
    normalizeTiers(tiersData),
  );
  return (key) => {
    const name = named(key);
    if (name !== undefined) return name;
    if (attendanceTierIdOf(key) === null) {
      return rolesLoaded ? "Removed role" : undefined;
    }
    return tiersLoaded ? "Removed tier" : undefined;
  };
}
