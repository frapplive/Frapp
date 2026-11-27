import {
  PERSONAL_SETTINGS_PAGES,
  isBetaOffModule,
  type PersonalSettingsPage,
} from "@repo/validation";

/**
 * The personal Settings page's sections (`/preferences`, #3856): the shared
 * pages in `@repo/validation` (`PERSONAL_SETTINGS_PAGES`), which the phone's
 * Settings screen lists too, so both apps carry the same pages in the same
 * order under the same words (#6032).
 *
 * A section's `value` is its `?section=` address. Other screens link to these,
 * and the API's Discord link and Google Calendar sign-in return to `apps` and
 * `calendar` (`AUTHOR_LINK_RETURN_PATH`, `GOOGLE_CALENDAR_WEB_RETURNS`), so
 * renaming one is a sweep. `SECTION_ALIASES` keeps a retired address working.
 */
export const PERSONAL_SETTINGS_PATH = "/preferences";

export const PERSONAL_SETTINGS_SECTIONS = PERSONAL_SETTINGS_PAGES;

export type PersonalSettingsSection = PersonalSettingsPage;

/**
 * Sections that belong to one module, and leave while it is off for every
 * chapter in the beta (`BETA_OFF_MODULES`). Dues is off for the beta, so My
 * invoices has nothing to list and no row.
 */
const SECTION_MODULES: Partial<Record<PersonalSettingsSection, string>> = {
  invoices: "dues",
};

/**
 * Whether a section is in the product right now. `aiAvailable` is whether the
 * server has AI (`aiAvailableFrom(useAiConsent())`): the AI section shows
 * only on `true`, so with `AI_ENABLED` off, or before the server answers,
 * Settings is what it was.
 */
export function isPersonalSettingsSectionShown(
  section: PersonalSettingsSection,
  aiAvailable?: boolean,
): boolean {
  if (section === "ai") return aiAvailable === true;
  const moduleKey = SECTION_MODULES[section];
  return !(moduleKey && isBetaOffModule(moduleKey));
}

/** The section the page opens on, and falls back to for an unknown `?section=`. */
const DEFAULT_PERSONAL_SETTINGS_SECTION: PersonalSettingsSection =
  "notifications";

export function personalSettingsHref(section: PersonalSettingsSection): string {
  return section === DEFAULT_PERSONAL_SETTINGS_SECTION
    ? PERSONAL_SETTINGS_PATH
    : `${PERSONAL_SETTINGS_PATH}?section=${section}`;
}

/**
 * Retired `?section=` addresses and where they open now. `discord` was the
 * Discord history section until Linked apps took its row (#5407); a Discord
 * sign-in started before that change still comes back to it. `alerts`,
 * `appearance` and `calendar` folded into Notifications, Chat and Linked apps
 * (#6032); Google Calendar's web sign-in still returns to `calendar`.
 */
const SECTION_ALIASES: Record<string, PersonalSettingsSection> = {
  discord: "apps",
  alerts: "notifications",
  appearance: "chat",
  calendar: "apps",
};

export function resolvePersonalSettingsSection(
  param: string | null | undefined,
  aiAvailable?: boolean,
): PersonalSettingsSection {
  const value =
    param && Object.hasOwn(SECTION_ALIASES, param)
      ? SECTION_ALIASES[param]
      : param;
  const match = PERSONAL_SETTINGS_SECTIONS.find((s) => s.value === value);
  return match && isPersonalSettingsSectionShown(match.value, aiAvailable)
    ? match.value
    : DEFAULT_PERSONAL_SETTINGS_SECTION;
}
