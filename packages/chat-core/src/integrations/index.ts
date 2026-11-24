/**
 * Chat integrations: the slash-command catalog, the input parsers, and the
 * rich-message payload shapes (`@repo/chat-core/integrations`).
 *
 * Framework-free. `./dispatch` and `apps/web` read it; the rich renderers live
 * in the apps (React on web, React Native on mobile). Until #3228 this was its
 * own package, `@repo/chat-integrations`, whose `types` and `require` export
 * conditions pointed at a `dist/` nothing built (#989, #918), so
 * `chat-core/polls` redeclared the poll shapes instead of importing them (and
 * mobile read them from there). As a
 * source-only chat-core subpath it has no such conditions, and `./polls`
 * re-exports the poll shapes from `./payloads`.
 *
 * Chunk 04 shipped the catalog scaffold (all commands `implemented: false`);
 * Chunk 05 flips `/poll` and `/announce` to `implemented: true` and adds the
 * dispatch + parsers below.
 */

import { canAll } from "@repo/validation";
import { listOr } from "../list-words";

export * from "./parsers";
export * from "./payloads";

/**
 * A slash command the user can invoke from the composer. `requiredModule` ties
 * the command to a `chapters.enabled_modules` key; the UI hides commands whose
 * module is disabled. `null` means no module gates it (`/announce`); who may
 * use a command is a separate rule (`filterSlashCommands`' `canAnnounce`).
 */
export interface SlashCommand {
  /** Invocation token without the leading slash, e.g. "event". */
  name: string;
  /**
   * Palette label when it differs from `name`. Rush renders the chapter's
   * recruitment vocabulary (`intake`, `recruitment`, …) here; dispatch still
   * keys on canonical `name: "rush"`.
   */
  displayName?: string;
  /** One-line description shown in the palette. */
  description: string;
  /** Hint text for the argument string, e.g. "<title> <date>". */
  usage?: string;
  /**
   * `enabled_modules` key that gates this command, or `null` when no module does.
   * Resolve it against the member view's `enabled_modules`
   * (`useChapterModuleGateState` on web), never the officer-only config, which
   * errors for every member below President (#2957).
   */
  requiredModule: string | null;
  /**
   * Whether a renderer/dispatch exists. Always `false` in Chunk 04 — the
   * palette surfaces these but invoking one shows an "Available in Chunk 05"
   * toast rather than executing.
   */
  implemented: boolean;
}

/**
 * `/rush`'s subcommands, what each one does, and every key its dispatch
 * needs (#4070). Every rush route sits under `members:view`; `add` posts
 * with `rush:add`; `vote` and `bid` take a name, which dispatch resolves
 * through `GET /v1/rush/candidates` (`rush:view`) before it posts with
 * `rush:vote` or `rush:bid`. The palette offers only the subcommands a role
 * holds all of (#4084, `rushSubcommandsFor`), and this table is the one
 * source of the `/rush` row's usage and description.
 */
export const RUSH_SUBCOMMANDS = [
  {
    name: "add",
    phrase: "add a candidate",
    usage: "add @candidate",
    permissions: ["members:view", "rush:add"],
  },
  {
    name: "vote",
    phrase: "vote on a candidate",
    usage: "vote <candidate-id>",
    permissions: ["members:view", "rush:view", "rush:vote"],
  },
  {
    name: "bid",
    phrase: "extend a bid",
    usage: "bid @candidate",
    permissions: ["members:view", "rush:view", "rush:bid"],
  },
] as const;
export type RushSubcommand = (typeof RUSH_SUBCOMMANDS)[number]["name"];

const ALL_RUSH_SUBCOMMANDS: readonly RushSubcommand[] = RUSH_SUBCOMMANDS.map(
  (sub) => sub.name,
);

/**
 * The `/rush` subcommands `permissions` allows, in catalog order. `undefined`
 * (not read yet, or the read failed) allows all three, as `canAnnounce`'s
 * absence does: the server refuses what the role can't do anyway.
 */
export function rushSubcommandsFor(
  permissions: readonly string[] | undefined,
): RushSubcommand[] {
  return RUSH_SUBCOMMANDS.filter(
    (sub) => permissions === undefined || canAll(sub.permissions, permissions),
  ).map((sub) => sub.name);
}

/** The `/rush` row's description and usage for `allowed` subcommands. */
function rushRowText(allowed: readonly RushSubcommand[]): {
  description: string;
  usage: string;
} {
  const subs = RUSH_SUBCOMMANDS.filter((sub) => allowed.includes(sub.name));
  const description = listOr(subs.map((sub) => sub.phrase));
  return {
    description: description.charAt(0).toUpperCase() + description.slice(1),
    usage: subs.map((sub) => sub.usage).join(" | "),
  };
}

export const SLASH_COMMANDS: readonly SlashCommand[] = Object.freeze([
  {
    name: "event",
    description: "Create an event with an interactive card",
    usage: '"<name>" <YYYY-MM-DD> <HH:MM>-<HH:MM> [location] [points=<n>]',
    requiredModule: "events",
    implemented: true,
  },
  {
    name: "task",
    description: "Create a task card and assign it",
    usage: '"<title>" @assignee <due date> [points]',
    requiredModule: "tasks",
    implemented: true,
  },
  {
    name: "poll",
    description: "Start a poll",
    usage: '"<question>" <option> <option> …',
    requiredModule: "polls",
    implemented: true,
  },
  {
    name: "dues",
    description: "Dues reminders and balances",
    usage: "remind overdue",
    requiredModule: "dues",
    implemented: false,
  },
  {
    name: "points",
    description: "Grant or deduct member points",
    usage: "grant|deduct @member <amount> for <reason>",
    requiredModule: "points",
    implemented: true,
  },
  {
    name: "hours",
    description: "Log service hours",
    usage: "log <duration> <description>",
    requiredModule: "hours",
    implemented: true,
  },
  {
    name: "rush",
    ...rushRowText(ALL_RUSH_SUBCOMMANDS),
    requiredModule: "rush",
    implemented: true,
  },
  {
    name: "announce",
    description: "Post an announcement",
    usage: "<message>",
    requiredModule: null,
    implemented: true,
  },
]);

/** Vocab aliases that dispatch as the canonical `rush` command. */
const RUSH_COMMAND_ALIASES = ["recruitment", "intake", "induction"] as const;

/**
 * Slash token for the chapter's recruitment vocabulary. `"Intake"` →
 * `"intake"`; empty / punctuation-only falls back to `"rush"`.
 */
function recruitmentCommandSlug(label?: string | null): string {
  const slug = (label ?? "rush")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "rush";
}

function isRushCommandToken(
  token: string,
  recruitment?: string | null,
): boolean {
  const needle = token.trim().toLowerCase();
  if (needle === "rush") return true;
  if ((RUSH_COMMAND_ALIASES as readonly string[]).includes(needle)) {
    return true;
  }
  return needle === recruitmentCommandSlug(recruitment);
}

/**
 * Guarded lookup by command name. Returns `undefined` for unknown names so
 * callers handle the missing case explicitly (no bare map subscript).
 * Rush also matches {@link RUSH_COMMAND_ALIASES} and the chapter vocab slug.
 */
export function getSlashCommand(
  name: string,
  options?: { recruitment?: string },
): SlashCommand | undefined {
  const needle = name.trim().toLowerCase();
  const found = SLASH_COMMANDS.find((command) => command.name === needle);
  const command =
    found ??
    (isRushCommandToken(needle, options?.recruitment)
      ? SLASH_COMMANDS.find((entry) => entry.name === "rush")
      : undefined);
  if (!command) return undefined;
  if (command.name !== "rush") return command;
  const chapterSlug = recruitmentCommandSlug(options?.recruitment);
  const displayName =
    needle !== "rush"
      ? needle
      : chapterSlug !== "rush"
        ? chapterSlug
        : undefined;
  return displayName ? { ...command, displayName } : command;
}

/**
 * Filters the command catalog for the palette. `query` is the text typed after
 * the slash; an empty query returns everything. Commands whose module is
 * disabled are excluded via the supplied predicate (on web, the gate from
 * `useChapterModuleGateState`, which reads the member view). Commands with no
 * `requiredModule` pass the module gate; `/announce` can still be left out by
 * `options.canAnnounce` below.
 *
 * Pass `options.recruitment` so the rush row matches and displays the chapter's
 * vocabulary token (`/intake`, `/recruitment`, …) without changing `name`.
 *
 * Pass `options.canAnnounce: false` to leave `/announce` out for a member who
 * can't post in the announcements channel; the server refuses their
 * announcement anyway (#3414), so offering it would only lead to a refusal.
 * Absent reads as allowed.
 *
 * Pass `options.permissions`, the member's permission list, so the rush row
 * offers only the subcommands their role holds the key for, and is left out
 * when it holds none (#4084). Absent (not read yet) offers all three.
 */
export function filterSlashCommands(
  query: string,
  isModuleEnabled: (moduleKey: string) => boolean,
  options?: {
    recruitment?: string;
    canAnnounce?: boolean;
    permissions?: readonly string[];
  },
): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  const displayName = recruitmentCommandSlug(options?.recruitment);
  const rushAllowed = rushSubcommandsFor(options?.permissions);
  // The rush row is narrowed to the role's subcommands before the search, so
  // a search for one it can't use doesn't match the full catalog text.
  const rows = SLASH_COMMANDS.flatMap((command) => {
    if (command.name !== "rush") return [command];
    if (rushAllowed.length === 0) return [];
    return [{ ...command, ...rushRowText(rushAllowed) }];
  });
  return rows
    .filter((command) => {
      if (command.requiredModule && !isModuleEnabled(command.requiredModule)) {
        return false;
      }
      if (command.name === "announce" && options?.canAnnounce === false) {
        return false;
      }
      if (needle.length === 0) return true;
      // A command word with details after it (`event Chapter Dinner`): the
      // palette's search box is where a member types a whole command (#3773).
      // For rush, not a subcommand the role can't use (`rush bid Sam`).
      const args = paletteCommandArgs(query, command, options);
      if (args !== null) {
        return command.name !== "rush" || rushArgsAllowed(args, rushAllowed);
      }
      if (command.name === "rush") {
        return (
          command.name.includes(needle) ||
          displayName.includes(needle) ||
          (RUSH_COMMAND_ALIASES as readonly string[]).some((alias) =>
            alias.includes(needle),
          ) ||
          command.description.toLowerCase().includes(needle)
        );
      }
      return (
        command.name.includes(needle) ||
        command.description.toLowerCase().includes(needle)
      );
    })
    .map((command) =>
      command.name === "rush" && displayName !== "rush"
        ? { ...command, displayName }
        : command,
    );
}

/**
 * Whether typed `/rush` details may run for a role allowed `allowed`: not
 * when they open with a subcommand it can't use. Anything else (a typo, no
 * subcommand) goes through, and dispatch answers with the usage.
 */
function rushArgsAllowed(
  args: string,
  allowed: readonly RushSubcommand[],
): boolean {
  const word = args.split(/\s+/, 1)[0]!.toLowerCase();
  const isSubcommand = (ALL_RUSH_SUBCOMMANDS as readonly string[]).includes(
    word,
  );
  return !isSubcommand || (allowed as readonly string[]).includes(word);
}

/**
 * The details typed after `command`'s own word in the palette's search box,
 * or `null` when the query doesn't start with that word followed by more.
 *
 * Typing `/` opens the palette, and everything after it is typed into the
 * palette's search box rather than the composer, so `/event Chapter Dinner`
 * reaches the palette as the query `event Chapter Dinner`. Matching on the
 * first word keeps the command listed, and this hands the rest to it on pick
 * (#3773). The word must be the command's exactly (or, for rush, the
 * chapter's recruitment word or an alias), so a multi-word description search
 * like `interactive card` passes no arguments.
 */
export function paletteCommandArgs(
  query: string,
  command: SlashCommand,
  options?: { recruitment?: string },
): string | null {
  const match = /^(\S+)\s+(\S[\s\S]*)$/.exec(query.trim());
  if (!match) return null;
  const word = match[1]!.toLowerCase();
  const isCommandWord =
    command.name === "rush"
      ? isRushCommandToken(word, options?.recruitment)
      : word === command.name;
  return isCommandWord ? match[2]!.trim() : null;
}

/** Result of parsing composer text for a slash command. */
export interface ParsedSlashInput {
  /** True when the text begins with a slash. */
  isSlash: boolean;
  /** Command name (without slash), or `null` when no command token is present. */
  command: string | null;
  /** Everything after the command token, trimmed. */
  args: string;
  /** The original input. */
  raw: string;
}

const SLASH_PATTERN = /^\/([A-Za-z][\w-]*)?\s*([\s\S]*)$/;

/**
 * Parses composer text. `/event Formal 8pm` → `{ isSlash:true, command:"event",
 * args:"Formal 8pm" }`. A lone `/` opens the palette with `command:null`. Plain
 * text → `{ isSlash:false, command:null, args:<text> }` and is sent as
 * `kind:"text"`.
 */
export function parseSlashInput(raw: string): ParsedSlashInput {
  if (!raw.startsWith("/")) {
    return { isSlash: false, command: null, args: raw, raw };
  }
  const match = SLASH_PATTERN.exec(raw);
  if (!match) {
    return { isSlash: true, command: null, args: "", raw };
  }
  const command = match[1] ? match[1].toLowerCase() : null;
  return { isSlash: true, command, args: (match[2] ?? "").trim(), raw };
}
