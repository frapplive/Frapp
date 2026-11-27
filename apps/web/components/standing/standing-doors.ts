import { WEB_ADDRESS_PARAMS } from "@repo/validation";
/**
 * The three numbers a member can open from their own Profile (#5950): each is
 * a panel docked in place of the page, never a page of its own. Points,
 * Service hours and Study hours were sidebar rows until then; standing is a
 * fact about a person, so it is read on the person (`spec/product/surfaces.md`).
 */
export const STANDING_DOORS = ["points", "service", "study"] as const;

export type StandingDoor = (typeof STANDING_DOORS)[number];

/** The search param that names the open panel: `/profile?open=points`. */
export const STANDING_PARAM = WEB_ADDRESS_PARAMS.profile.open;

/**
 * Where a door opens. Anything that used to link to `/points`, `/service` or
 * `/study` (a notification, the assistant's sources, the old routes'
 * redirects) links here, so there is one address per panel.
 */
export function standingHref(door: StandingDoor): string {
  return `/profile?${STANDING_PARAM}=${door}`;
}

/** The door a `?open=` value names, or `null` for none or an unknown one. */
export function standingDoorFrom(value: string | null): StandingDoor | null {
  return (STANDING_DOORS as readonly string[]).includes(value ?? "")
    ? (value as StandingDoor)
    : null;
}

/**
 * Directory's standings, where "ranked 2 of 23" leads: the same list of
 * members, sorted by the number (`members-directory.tsx`).
 */
export const STANDINGS_SORT_PARAM = "sort";
export const POINTS_STANDINGS_HREF = `/members?${STANDINGS_SORT_PARAM}=points`;
