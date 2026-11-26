import { MODULE_CATALOG } from "@repo/org-archetypes";
import {
  GOAL_METRIC_COPY,
  GOAL_TARGET_MAX,
  INTEREST_FORM_SETTINGS_COPY,
  MEETING_SECTIONS_COPY,
  PERMISSION_REGISTRY,
  RUSH_SETTINGS_COPY,
  RETIRED_PERMISSIONS,
  isBetaOffModule,
  type GoalMetric,
  type PermissionDefinition,
} from "@repo/validation";
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

/** Points are stored as points; hours as minutes, typed as whole hours. */
export function goalPerUnit(metric: GoalMetric): number {
  return GOAL_UNIT[metric].per;
}

/** A goal as typed: points as points, hours as whole hours; `null` is none. */
export function goalToTyped(
  metric: GoalMetric,
  stored: number | null,
): number | null {
  return stored === null ? null : Math.round(stored / goalPerUnit(metric));
}

/** A typed goal as the API stores it: hours go back to minutes. */
export function goalToStored(
  metric: GoalMetric,
  typed: number | null,
): number | null {
  return typed === null ? null : typed * goalPerUnit(metric);
}

/** The largest goal that can be typed, in the unit its row is typed in. */
export function goalTypedMax(metric: GoalMetric): number {
  return Math.floor(GOAL_TARGET_MAX[metric] / goalPerUnit(metric));
}

/** The measures each module's Goals group holds, in its rows' order. */
export const MODULE_GOAL_METRICS: Readonly<
  Record<string, readonly GoalMetric[]>
> = {
  points: ["points"],
  hours: ["service", "study"],
};

/** The page a Goals row opens: `goal-points`. */
export function goalPageId(metric: GoalMetric): string {
  return `goal-${metric}`;
}

/** The measure a goal page is about, or `null` for any other page. */
export function goalMetricOfPage(
  page: string | null | undefined,
): GoalMetric | null {
  if (!page?.startsWith("goal-")) return null;
  const metric = page.slice("goal-".length);
  return Object.hasOwn(GOAL_UNIT, metric) ? (metric as GoalMetric) : null;
}

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

/**
 * The modules that have a page in Chapter settings (#4073), in rail order,
 * on web and the phone alike (#6030): web's rail and the phone's Modules group
 * list the same rows in the same order and words.
 *
 * Each one is a row in the Modules group and opens one page: the
 * switch, the rules the chapter can really set, who can do what, and the
 * module's officer tool. The order is how often a chapter reaches for each,
 * not the catalog's order: chat and events first, recruitment and dues last.
 *
 * Not every `MODULE_CATALOG` entry is here. Members, the audit log and
 * Chapter settings itself are the chapter, not a module you switch; Billing
 * is Plan and billing. The catalog's prototype extras (Academics, Risk
 * Management, Lines and the rest) have no product behind them, so the
 * Modules tab's switches for them saved a value nothing read (#1760) and
 * they get no page.
 */
export type ModuleSettings = {
  /** `enabled_modules` key, and the rail row's `?tab=` value. */
  key: string;
  label: string;
  /** One line under the page title: what the module is for a member. */
  description: string;
  /** What switching it off takes away, said on the page while it is off. */
  offNote: string;
  /** Free modules are always on; the switch is drawn locked. */
  alwaysOn: boolean;
  tier: "free" | "paid";
};

type ModuleCopy = Pick<
  ModuleSettings,
  "key" | "label" | "description" | "offNote"
>;

const MODULE_COPY: readonly ModuleCopy[] = [
  {
    key: "chat",
    label: "Chat",
    description: "Channels and direct messages for the whole chapter.",
    offNote: "",
  },
  {
    key: "announcements",
    label: "Announcements",
    description: "Officer posts that reach every member, with a push.",
    offNote: "",
  },
  {
    key: "events",
    label: "Events",
    description:
      "The chapter calendar, RSVPs, required attendance and check-in.",
    offNote:
      "Members don't see Events in the sidebar or as a card in chat, and no new events can be made.",
  },
  {
    key: "points",
    label: "Points",
    description:
      "The points ledger and standings: points from events, service and officers.",
    offNote:
      "Members don't see points on their profile or in the Directory, and nothing earns points until it's back on.",
  },
  {
    key: "hours",
    label: "Service hours",
    description:
      "Members log service and study hours; officers approve service for points.",
    offNote:
      "Members don't see service or study hours on their profile, and no hours can be logged.",
  },
  {
    key: "geofences",
    label: "Study zones",
    description:
      "Places on the map where a study session counts, and what it earns.",
    offNote: "Study sessions can't start, and the Study zones tool is hidden.",
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Assign work to members and confirm it's done.",
    offNote:
      "Members don't see Tasks in the sidebar or as a card in chat, and no new tasks can be made.",
  },
  {
    key: "polls",
    label: "Polls",
    description: "Quick votes posted in a channel.",
    offNote: "No one can post a new poll in chat.",
  },
  {
    key: "meetings",
    label: "Meetings",
    description:
      "Minutes for chapter, exec and committee meetings, posted to the members each meeting invites.",
    offNote:
      "Members don't see Meetings in the sidebar, and no minutes can be started or posted. Minutes already written are kept.",
  },
  {
    key: "documents",
    label: "Documents",
    description: "The chapter's files: bylaws, minutes, forms.",
    offNote: "Members don't see Documents in the sidebar.",
  },
  {
    key: "backwork",
    label: "Backwork",
    description: "The chapter's library of past coursework.",
    offNote: "Members don't see Backwork in the sidebar.",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Exports of attendance, points, roster and service.",
    offNote: "The Reports tool is hidden and nothing can be exported.",
  },
  {
    key: "rush",
    label: "Recruitment",
    description: "Prospects, notes, votes and bids during recruitment.",
    offNote: "Members don't see Recruitment, and no prospect can be added.",
  },
  {
    key: "dues",
    label: "Dues",
    description: "Dues amounts, payment plans and late fees.",
    offNote: "Members aren't invoiced for dues.",
  },
];

/** Every module with a page, in rail order, catalog tier attached. */
export const MODULE_SETTINGS: readonly ModuleSettings[] = MODULE_COPY.flatMap(
  (copy) => {
    const entry = MODULE_CATALOG.find((m) => m.key === copy.key);
    if (!entry) return [];
    return [
      {
        ...copy,
        alwaysOn: entry.alwaysOn,
        tier: entry.tier === "paid" ? "paid" : "free",
      },
    ];
  },
);

const MODULE_SETTINGS_BY_KEY: ReadonlyMap<string, ModuleSettings> = new Map(
  MODULE_SETTINGS.map((module) => [module.key, module]),
);

export function moduleSettingsFor(key: string): ModuleSettings | undefined {
  return MODULE_SETTINGS_BY_KEY.get(key);
}

export function isModuleSettingsTab(tab: string): boolean {
  return MODULE_SETTINGS_BY_KEY.has(tab);
}

/**
 * Modules with a page this release. A module that is off for every chapter in
 * the beta (`BETA_OFF_MODULES`, Dues today) has none, the way the Dues tab
 * was hidden before it.
 */
export function shownModuleSettings(): readonly ModuleSettings[] {
  return MODULE_SETTINGS.filter((module) => !isBetaOffModule(module.key));
}

/**
 * The permissions that belong to a module, from the permission registry the
 * Roles page reads (#4069), so "who can" on a module page and the Roles page
 * name the same things in the same words. The retired ones
 * (`RETIRED_PERMISSIONS`, #5728) are left out, as the Roles page leaves them.
 */
export function modulePermissions(
  moduleKey: string,
): readonly PermissionDefinition[] {
  return PERMISSION_REGISTRY.filter(
    (entry) =>
      entry.module === moduleKey && !RETIRED_PERMISSIONS.has(entry.permission),
  );
}

/** A question's own screen under Recruitment's interest form: `question-<id>`. */
export const INTEREST_QUESTION_PAGE = "question-";

/**
 * What a module's screen is titled on the phone (#6030): the module's name,
 * or the name of one of its screens (`page`), the same words web titles its
 * pages with. The phone's back control over one of these screens reads it
 * too. `null` for a module there is no page for; a page it doesn't know is
 * the module itself, as the screen shows it.
 */
export function moduleScreenTitle(
  key: string,
  page?: string | null,
): string | null {
  const module = isBetaOffModule(key) ? undefined : moduleSettingsFor(key);
  if (!module) return null;
  if (!page) return module.label;
  const permission = permissionOfWhoCanPage(page);
  if (permission) {
    return (
      modulePermissions(key).find((entry) => entry.permission === permission)
        ?.label ?? module.label
    );
  }
  const metric = goalMetricOfPage(page);
  if (metric) {
    return MODULE_GOAL_METRICS[key]?.includes(metric)
      ? GOAL_METRIC_COPY[metric].label
      : module.label;
  }
  if (key === "meetings" && page === "sections") {
    return MEETING_SECTIONS_COPY.title;
  }
  if (key === "rush") {
    if (page === "interest-form") return INTEREST_FORM_SETTINGS_COPY.title;
    if (page.startsWith(INTEREST_QUESTION_PAGE)) return "Question";
    if (page === "stages") return RUSH_SETTINGS_COPY.stages.title;
    if (page === "tags") return RUSH_SETTINGS_COPY.tags.title;
  }
  return module.label;
}
