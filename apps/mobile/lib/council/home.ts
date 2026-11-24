import { can } from "@repo/validation";

/**
 * A council's home on the Activity tab (#5933,
 * `components/council/council-home.tsx`): its words, and which first steps
 * a viewer is offered.
 */
export const COUNCIL_HOME_COPY = {
  /** The tab's own name: the tab bar is the same layout for both kinds. */
  title: "Activity",
  loading: "Loading your council",
  failed: "Couldn't load your council",
  notVerified: "Not verified yet",
  verified: "Verified",
  getStarted: "Get started",
  // The Invite screen's own title, as You's Admin row says it: one name for
  // one place (principles.md P8.3).
  invite: "Invite members",
  titles: "Edit titles",
} as const;

export type CouncilHomeStep = "invite" | "titles";

/**
 * The steps this viewer can take, in the order an officer takes them: bring
 * the delegates in (every invite route checks `members:invite`), then name
 * the titles (`roles:manage`, which a rename checks). `can` reads the
 * wildcard the Council admin holds.
 */
export function councilHomeSteps(
  permissions: readonly string[],
): CouncilHomeStep[] {
  const steps: CouncilHomeStep[] = [];
  if (can("members:invite", permissions)) steps.push("invite");
  if (can("roles:manage", permissions)) steps.push("titles");
  return steps;
}
