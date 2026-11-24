/**
 * Council profiles and role packs (#5933).
 *
 * A council is a `chapters` row with `kind = 'council'` (ADR-27 decision 3,
 * `spec/architecture/school-layer.md` § 2.3). Its `council_type` selects one
 * of the profiles below: code data, like the chapter archetypes in
 * `@repo/org-archetypes`, never a branch on a name
 * (`spec/behavior/council-types.md` § Council profiles).
 *
 * The role packs are **seed data only**, as `STARTING_ROLE_TIERS` is for a
 * chapter: once a council exists its tiers and roles are its own rows, every
 * title renames, and only `systemKey` carries meaning (`school-layer.md`
 * § 5.3). The API seeds them (`CouncilService`); web and the phone read the
 * titles to offer the founder theirs.
 */

import { COUNCIL_RECRUITMENT_PERMISSIONS } from "./permission-registry";

export const COUNCIL_TYPES = [
  "ifc",
  "panhellenic",
  "nphc",
  "mgc",
  "other",
] as const;
export type CouncilType = (typeof COUNCIL_TYPES)[number];

export function isCouncilType(value: unknown): value is CouncilType {
  return (
    typeof value === "string" &&
    (COUNCIL_TYPES as readonly string[]).includes(value)
  );
}

/** `council-types.md` § Recruitment models. */
export const RECRUITMENT_MODELS = ["open_bidding", "formal", "none"] as const;
export type RecruitmentModel = (typeof RECRUITMENT_MODELS)[number];

/**
 * The `org_archetype` a council row stores: a marker only, never a chapter
 * archetype (`school-layer.md` § 2.3). The database refuses it on a chapter
 * and refuses anything else on a council (`chapters_council_fields_kind`).
 */
export const COUNCIL_ARCHETYPE = "council";

/** The `system_key`s a council's seeded roles carry. */
export type CouncilSystemKey = "PRESIDENT" | "MEMBER" | "EVERYONE";

export interface CouncilTierSeed {
  name: string;
  permissions: readonly string[];
}

export interface CouncilRoleSeed {
  /** Stable id for the founder's pick, never stored: the role's row id is. */
  key: string;
  name: string;
  /** Position in the profile's `tiers`, 0 highest; `null` is outside them. */
  tier: number | null;
  systemKey: CouncilSystemKey | null;
  /** What the role holds beyond its tier, seeded as "on" overrides. */
  extraPermissions: readonly string[];
  /** Offered to the founder as their own title. */
  pickable: boolean;
}

export interface CouncilProfile {
  type: CouncilType;
  /** The type's name, as a founder picks it. */
  label: string;
  /** The type's short name, for "<school> IFC". */
  short: string;
  /** One line under the label in the type picker. */
  description: string;
  /** What its type allows, default first (`chapters_council_fields_kind`). */
  recruitmentModels: readonly [RecruitmentModel, ...RecruitmentModel[]];
  tiers: readonly CouncilTierSeed[];
  roles: readonly CouncilRoleSeed[];
}

/** Every member's floor: the baseline every member route needs (`rbac.md`). */
const MEMBER_FLOOR = ["members:view"] as const;

/** What the Executive board tier adds (`school-layer.md` § 5.3). */
const EXECUTIVE_BOARD = [
  ...MEMBER_FLOOR,
  "council:recruitment_view",
  "council:announce",
  "council:calendar_manage",
  "council:chapters_manage",
] as const;

const ADMIN_KEY = "admin";

/**
 * The Council admin: the `PRESIDENT` key and `*`, as a chapter's President
 * holds it. The founder holds it beside their own title until the real
 * President takes it through Transfer presidency (`school-layer.md` § 5.3).
 */
function councilAdmin(): CouncilRoleSeed {
  return {
    key: ADMIN_KEY,
    name: "Council admin",
    tier: 0,
    systemKey: "PRESIDENT",
    extraPermissions: ["*"],
    pickable: false,
  };
}

/** Every member holds it; outside the tiers, as a chapter's Everyone is. */
function everyone(): CouncilRoleSeed {
  return {
    key: "everyone",
    name: "Everyone",
    tier: null,
    systemKey: "EVERYONE",
    extraPermissions: MEMBER_FLOOR,
    pickable: false,
  };
}

function title(
  key: string,
  name: string,
  tier: number,
  extraPermissions: readonly string[] = [],
): CouncilRoleSeed {
  return {
    key,
    name,
    tier,
    systemKey: null,
    extraPermissions,
    pickable: true,
  };
}

/**
 * The floor role: `MEMBER`, the role presidency claim walks to, the invite
 * fallback and what an outgoing President keeps (`school-layer.md` § 5.3).
 */
function delegate(tier: number): CouncilRoleSeed {
  return {
    key: "delegate",
    name: "Delegate",
    tier,
    systemKey: "MEMBER",
    extraPermissions: [],
    pickable: true,
  };
}

const THREE_TIERS: readonly CouncilTierSeed[] = [
  { name: "Executive board", permissions: EXECUTIVE_BOARD },
  { name: "Officers", permissions: MEMBER_FLOOR },
  { name: "Delegates", permissions: MEMBER_FLOOR },
];

/**
 * `council-types.md` § Default role titles. Each type's Executive board
 * titles, any extra tier, and its Delegates tier.
 */
const PROFILES: Record<CouncilType, CouncilProfile> = {
  ifc: {
    type: "ifc",
    label: "Interfraternity Council",
    short: "IFC",
    description: "The council of a school's IFC fraternities.",
    recruitmentModels: ["open_bidding", "none"],
    tiers: THREE_TIERS,
    roles: [
      councilAdmin(),
      title("president", "President", 0),
      title("vp_recruitment", "VP Recruitment", 0, [
        "council:recruitment_manage",
      ]),
      title("vp_judicial", "VP Judicial", 0),
      title("treasurer", "Treasurer", 0),
      title("secretary", "Secretary", 0),
      delegate(2),
      everyone(),
    ],
  },
  panhellenic: {
    type: "panhellenic",
    label: "Panhellenic Council",
    short: "Panhellenic",
    description: "The council of a school's NPC sororities.",
    recruitmentModels: ["formal", "none"],
    tiers: [
      THREE_TIERS[0]!,
      THREE_TIERS[1]!,
      { name: "Recruitment counselors", permissions: MEMBER_FLOOR },
      THREE_TIERS[2]!,
    ],
    roles: [
      councilAdmin(),
      title("president", "President", 0),
      title("vp_recruitment", "VP Recruitment", 0, [
        "council:recruitment_manage",
      ]),
      title("vp_recruitment_counselors", "VP Recruitment Counselors", 0, [
        "council:counselors_manage",
      ]),
      title("vp_judicial", "VP Judicial", 0),
      title("vp_finance", "VP Finance", 0),
      title("vp_philanthropy", "VP Philanthropy", 0),
      title("vp_public_relations", "VP Public Relations", 0),
      title("recruitment_counselor", "Recruitment Counselor", 2, [
        "council:pnm_group_view",
      ]),
      delegate(3),
      everyone(),
    ],
  },
  nphc: {
    type: "nphc",
    label: "National Pan-Hellenic Council",
    short: "NPHC",
    description: "The council of a school's Divine Nine organizations.",
    recruitmentModels: ["none"],
    tiers: THREE_TIERS,
    roles: [
      councilAdmin(),
      title("president", "President", 0),
      title("vice_president", "Vice President", 0),
      title("secretary", "Secretary", 0),
      title("treasurer", "Treasurer", 0),
      title("parliamentarian", "Parliamentarian", 0),
      title("public_relations", "Public Relations", 0),
      delegate(2),
      title("alternate_delegate", "Alternate delegate", 2),
      everyone(),
    ],
  },
  mgc: {
    type: "mgc",
    label: "Multicultural Greek Council",
    short: "MGC",
    description: "The council of a school's multicultural organizations.",
    recruitmentModels: ["none"],
    tiers: THREE_TIERS,
    roles: [
      councilAdmin(),
      title("president", "President", 0),
      title("vice_president", "Vice President", 0),
      title("secretary", "Secretary", 0),
      title("treasurer", "Treasurer", 0),
      title("vp_programming", "VP Programming", 0),
      title("vp_judicial", "VP Judicial", 0),
      delegate(2),
      everyone(),
    ],
  },
  other: {
    type: "other",
    label: "Another council",
    short: "Council",
    description: "Any other council of organizations at your school.",
    recruitmentModels: ["none", "open_bidding"],
    tiers: THREE_TIERS,
    roles: [
      councilAdmin(),
      title("president", "President", 0),
      title("vice_president", "Vice President", 0),
      title("secretary", "Secretary", 0),
      title("treasurer", "Treasurer", 0),
      delegate(2),
      everyone(),
    ],
  },
};

export const COUNCIL_PROFILES: Readonly<Record<CouncilType, CouncilProfile>> =
  PROFILES;

export function councilProfile(type: CouncilType): CouncilProfile {
  return PROFILES[type];
}

/** A type's default recruitment model, the first it allows. */
export function defaultRecruitmentModel(type: CouncilType): RecruitmentModel {
  return PROFILES[type].recruitmentModels[0];
}

/**
 * A key list as a council of `model` holds it: a council whose model is
 * `none` holds no `council-recruitment` key, `council:recruitment_view`
 * included (`council-types.md` § Default role titles).
 */
export function keysForRecruitmentModel(
  permissions: readonly string[],
  model: RecruitmentModel,
): string[] {
  return model === "none"
    ? permissions.filter((key) => !COUNCIL_RECRUITMENT_PERMISSIONS.has(key))
    : [...permissions];
}

/**
 * The modules a council's space shows today (#5933, UI design v8 § 3:
 * "chat, roles and settings now; Recruitment, Calendar and Chapters later").
 * A council's `enabled_modules` lists every other module as `false`, so the
 * module gates web and the phone already have hide chapter features in a
 * council. It locks nothing (`isModuleEnabled` reads a missing key as on):
 * the routes' tenant kinds do that (`school-layer.md` § 2.3).
 */
export const COUNCIL_MODULES_ON: ReadonlySet<string> = new Set([
  "chat",
  "members",
  "announcements",
  "audit-log",
  "chapter-settings",
]);

/** A council's `enabled_modules`: every module key off but {@link COUNCIL_MODULES_ON}. */
export function councilEnabledModules(
  moduleKeys: readonly string[],
): Record<string, boolean> {
  return Object.fromEntries(
    moduleKeys.map((key) => [key, COUNCIL_MODULES_ON.has(key)]),
  );
}

/** The titles a founder picks theirs from, in the pack's order. */
export function pickableCouncilTitles(
  type: CouncilType,
): { key: string; name: string }[] {
  return PROFILES[type].roles
    .filter((role) => role.pickable)
    .map(({ key, name }) => ({ key, name }));
}

/** The founder's pick: a seeded title's key, or a title of their own. */
export const COUNCIL_CUSTOM_TITLE_KEY = "custom";

/** `POST /v1/councils`: the school already has a council of that type (§ 2.3). */
export const COUNCIL_TYPE_TAKEN_CODE = "council.type_taken";
/** `POST /v1/councils`: the founder holds no verified school email there (§ 5.3). */
export const COUNCIL_SCHOOL_UNVERIFIED_CODE = "council.school_unverified";

export const COUNCIL_NAME_MAX = 80;
export const COUNCIL_TITLE_MAX = 40;

/** The name a new council is offered: "RPI IFC", "RPI Panhellenic". */
export function defaultCouncilName(
  type: CouncilType,
  schoolShortName: string,
): string {
  return `${schoolShortName.trim()} ${PROFILES[type].short}`.trim();
}

/** Every key a pack seeds is a council key or one a council shares. */
export function councilPackKeys(type: CouncilType): string[] {
  const profile = PROFILES[type];
  return [
    ...new Set([
      ...profile.tiers.flatMap((tier) => tier.permissions),
      ...profile.roles.flatMap((role) => role.extraPermissions),
    ]),
  ];
}
