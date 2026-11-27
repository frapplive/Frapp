import {
  DISCORD_IMPORT_COPY,
  discordImportedMessagesLabel,
  discordImportingLabel,
  isDiscordImportClearable,
} from "@repo/validation";
import { importPercent, type ImportRow } from "./import-progress";

/**
 * What the page shows: the chapter's one import (a chapter moves off Discord
 * once, and the API refuses a second import while the first still holds its
 * messages), or nothing yet.
 *
 * A draft is a wizard someone left part-way. It holds no messages, so the
 * page starts over rather than showing it, but an upload's draft can hold the
 * export already uploaded for it, counted against the chapter's archive
 * space, so the start names the newest one and offers to delete it. A deleted
 * (`purged`) import holds nothing, so the page goes back to the start, naming
 * the last one deleted until it is dismissed (cleared).
 */
export interface CurrentImport {
  current: ImportRow | null;
  /** The newest deleted import, only when there is no current one. */
  lastDeleted: ImportRow | null;
  /** The newest draft left part-way, only when there is no current one. */
  unfinished: ImportRow | null;
}

function newestFirst(a: ImportRow, b: ImportRow): number {
  return b.created_at.localeCompare(a.created_at);
}

export function currentImport(rows: readonly ImportRow[]): CurrentImport {
  const sorted = [...rows].sort(newestFirst);
  const current =
    sorted.find((row) => row.status !== "draft" && row.status !== "purged") ??
    null;
  const lastDeleted = current
    ? null
    : (sorted.find((row) => isDiscordImportClearable(row.status)) ?? null);
  const unfinished = current
    ? null
    : (sorted.find((row) => row.status === "draft") ?? null);
  return { current, lastDeleted, unfinished };
}

/** Which of the page's states an import is in. */
export type ImportStage = "importing" | "deleting" | "finished";

export function importStage(row: ImportRow): ImportStage {
  if (row.status === "ready" || row.status === "running") return "importing";
  if (row.status === "purging") return "deleting";
  return "finished";
}

/**
 * The import's state in a few words, at the end of the Chat page's Discord
 * import row (#6031), saying what the page says: "Not started", "Waiting to
 * start", "Importing 42%", "4,120 messages", "Stopped on an error",
 * "Deletion stopped" (a delete that failed part-way, #2944, which Resume
 * doesn't pick up), "Stopped", "Deleting".
 */
export function importRowState(rows: readonly ImportRow[]): string {
  const words = DISCORD_IMPORT_COPY.rowState;
  const { current } = currentImport(rows);
  if (!current) return words.notStarted;
  if (current.status === "ready") return words.waiting;
  const stage = importStage(current);
  if (stage === "importing")
    return discordImportingLabel(importPercent(current));
  if (stage === "deleting") return words.deleting;
  if (current.status === "completed")
    return discordImportedMessagesLabel(current.imported_messages);
  if (current.status === "failed")
    return (current.purged_messages ?? 0) > 0
      ? words.deletionStopped
      : words.stoppedOnError;
  return words.stopped;
}
