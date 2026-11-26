import { MODULE_CATALOG } from "@repo/org-archetypes";
import {
  PERMISSION_REGISTRY,
  RETIRED_PERMISSIONS,
  isBetaOffModule,
  type PermissionDefinition,
} from "@repo/validation";

/**
 * The modules that have a page in Chapter settings (#4073), in rail order.
 *
 * Each one is a row in the rail's Modules group and opens one page: the
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

/**
 * A module page's own words. Its name is the catalog's (`MODULE_CATALOG`),
 * the one the plan table, the composer and the plus menu also show, so the
 * two can't drift apart (#6031).
 */
type ModuleCopy = Pick<ModuleSettings, "key" | "description" | "offNote">;

const MODULE_COPY: readonly ModuleCopy[] = [
  {
    key: "chat",
    description: "Channels and direct messages for the whole chapter.",
    offNote: "",
  },
  {
    key: "announcements",
    description: "Officer posts that reach every member, with a push.",
    offNote: "",
  },
  {
    key: "events",
    description:
      "The chapter calendar, RSVPs, required attendance and check-in.",
    offNote:
      "Members don't see Events in the sidebar or as a card in chat, and no new events can be made.",
  },
  {
    key: "points",
    description:
      "The points ledger and standings: points from events, service and officers.",
    offNote:
      "Members don't see points on their profile or in the Directory, and nothing earns points until it's back on.",
  },
  {
    key: "hours",
    description:
      "Members log service and study hours; officers approve service for points.",
    offNote:
      "Members don't see service or study hours on their profile, and no hours can be logged.",
  },
  {
    key: "geofences",
    description:
      "Places on the map where a study session counts, and what it earns.",
    offNote: "Study sessions can't start, and the Study zones tool is hidden.",
  },
  {
    key: "tasks",
    description: "Assign work to members and confirm it's done.",
    offNote:
      "Members don't see Tasks in the sidebar or as a card in chat, and no new tasks can be made.",
  },
  {
    key: "polls",
    description: "Quick votes posted in a channel.",
    offNote: "No one can post a new poll in chat.",
  },
  {
    key: "meetings",
    description:
      "Minutes for chapter, exec and committee meetings, posted to the members each meeting invites.",
    offNote:
      "Members don't see Meetings in the sidebar, and no minutes can be started or posted. Minutes already written are kept.",
  },
  {
    key: "documents",
    description: "The chapter's files: bylaws, minutes, forms.",
    offNote: "Members don't see Documents in the sidebar.",
  },
  {
    key: "backwork",
    description: "The chapter's library of past coursework.",
    offNote: "Members don't see Backwork in the sidebar.",
  },
  {
    key: "reports",
    description: "Exports of attendance, points, roster and service.",
    offNote: "The Reports tool is hidden and nothing can be exported.",
  },
  {
    key: "rush",
    description: "Prospects, notes, votes and bids during recruitment.",
    offNote: "Members don't see Recruitment, and no prospect can be added.",
  },
  {
    key: "dues",
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
        label: entry.label,
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
