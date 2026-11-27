"use client";

import Link from "next/link";
import { CircleAlert, Import, Upload } from "lucide-react";
import { formatDay } from "@repo/formatting";
import {
  DISCORD_IMPORT_COPY,
  discordCategoryDoneLabel,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { EYEBROW } from "@/components/ui/typography";
import {
  meterFillClassName,
  meterTrackClassName,
} from "@/components/shared/meter";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { discordImportPagePath } from "@/components/settings/settings-paths";
import { cn } from "@/lib/utils";
import {
  importPercent,
  purgeProgress,
  type ImportRow,
} from "./import-progress";
import { groupWarnings, KEPT_WARNINGS } from "./import-warnings";
import {
  categoryTiles,
  importTotals,
  useBotImportProgress,
  type CategoryProgress,
} from "./category-progress";
import type { ImportProgress } from "./import-watch-panel";
import { purgeLine } from "./delete-import-copy";
import type { ImportSource } from "./source-step";
import {
  ArrivalCategories,
  ArrivalMark,
  ArrivalSweep,
  useArrival,
  useCountUp,
} from "./import-arrival";
import {
  DiscordImportFrame,
  DiscordImportPageFrame,
} from "./discord-import-frame";

function count(value: number): string {
  return value.toLocaleString("en-US");
}

/** "6 messages", "1 message". */
function counted(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

function Meter({ percent }: { percent: number }) {
  return (
    <div aria-hidden="true" className={meterTrackClassName}>
      <div className={meterFillClassName} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * State 1: nothing imported yet. The two ways in, as settings rows (#6031):
 * picking one opens the wizard past its own first step.
 */
export function ImportLanding({
  botAvailable,
  onPick,
  lastDeleted,
  onDismissDeleted,
  unfinished,
  onDeleteUnfinished,
  deleting,
}: {
  botAvailable: boolean;
  onPick: (source: ImportSource) => void;
  /** The last import, deleted, until the admin dismisses the line. */
  lastDeleted: ImportRow | null;
  onDismissDeleted: () => void;
  /** An import set up part-way and left, which may hold an uploaded export. */
  unfinished: ImportRow | null;
  onDeleteUnfinished: () => void;
  deleting: boolean;
}) {
  return (
    <DiscordImportFrame>
      <div className="space-y-4">
        {unfinished ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <p className="text-muted-foreground">
              An import
              {unfinished.guild_name
                ? ` from ${unfinished.guild_name}`
                : ""}{" "}
              was set up and not started. Delete it to remove anything uploaded
              for it.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteUnfinished}
              disabled={deleting}
            >
              Delete
            </Button>
          </div>
        ) : null}

        {lastDeleted ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <p className="text-muted-foreground">
              The import from {lastDeleted.guild_name ?? "your Discord server"}{" "}
              was deleted.
            </p>
            <Button variant="ghost" size="sm" onClick={onDismissDeleted}>
              Dismiss
            </Button>
          </div>
        ) : null}

        <SettingsGroup
          label={DISCORD_IMPORT_COPY.title}
          footnote={DISCORD_IMPORT_COPY.startFootnote}
        >
          {/*
            Two genuine ways in, not a primary and a fallback: the upload is
            the path that keeps working if Discord ever refuses the shared
            bot, and the only one when a chapter can't install apps. Connect
            Discord shows dimmed with its reason where the bot isn't usable.
          */}
          <SettingsRow
            icon={Import}
            label={DISCORD_IMPORT_COPY.connect}
            description={
              botAvailable
                ? DISCORD_IMPORT_COPY.connectLine
                : DISCORD_IMPORT_COPY.connectUnavailable
            }
            value={null}
            disabled={!botAvailable}
            onClick={() => onPick("bot")}
          />
          <SettingsRow
            icon={Upload}
            label={DISCORD_IMPORT_COPY.upload}
            description={DISCORD_IMPORT_COPY.uploadLine}
            value={null}
            onClick={() => onPick("upload")}
          />
        </SettingsGroup>
      </div>
    </DiscordImportFrame>
  );
}

/**
 * The running import's Discord categories as rows (#6031): each one's name
 * and how many of its channels and threads are done, green once the last one
 * finishes.
 */
function CategoryRows({ categories }: { categories: CategoryProgress[] }) {
  const tiles = categoryTiles(categories);
  if (tiles.length === 0) return null;
  return (
    <SettingsGroup label="Progress by Discord category">
      {tiles.map((tile) => (
        <SettingsRow
          key={tile.key}
          label={tile.name}
          control={
            <span
              className={cn(
                "text-sm tabular-nums",
                tile.finished ? "text-success" : "text-muted-foreground",
              )}
            >
              {discordCategoryDoneLabel(tile.done, tile.total)}
              {tile.failed > 0 ? (
                <span className="text-destructive-text">
                  {" "}
                  · {count(tile.failed)} failed
                </span>
              ) : null}
            </span>
          }
        />
      ))}
    </SettingsGroup>
  );
}

/** State 3: importing. A count that only climbs, and the way to stop. */
export function ImportRunning({
  row,
  onStop,
  stopping,
  channels,
}: {
  row: ImportRow;
  onStop: () => void;
  stopping: boolean;
  /** The channel panel, when the admin has opened it. */
  channels: React.ReactNode;
}) {
  const percent = importPercent(row);
  const hasChannelCounts =
    row.channels_total !== null && row.channels_total !== undefined;
  const progress = useBotImportProgress(row, true).data as
    ImportProgress | undefined;
  // The worker reads one channel or thread at a time.
  const now = row.status === "running" ? progress?.running[0] : undefined;
  return (
    <DiscordImportFrame>
      <section aria-labelledby="discord-import-running" className="space-y-4">
        <div className="space-y-1">
          <p className={cn(EYEBROW, "text-muted")}>
            {row.status === "ready" ? "Waiting to start" : "Importing"}
            {row.guild_name ? ` · ${row.guild_name}` : ""}
          </p>
          <h2
            id="discord-import-running"
            className="text-headline tabular-nums"
          >
            {counted(row.imported_messages, "message", "messages")} in so far
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasChannelCounts
              ? `${count(row.channels_done ?? 0)} of ${count(row.channels_total as number)} channels and threads done. `
              : ""}
            {/* While the worker waits out a temporary error, its note takes
              this line's place, so the page says "paused" rather than
              looking stalled, and nothing moves (#1692). */}
            {row.error ??
              "You can close this tab. You'll get a notification when it finishes."}
          </p>
        </div>
        {percent !== null ? (
          <div className="space-y-1">
            <Meter percent={percent} />
            {/* The bar is aria-hidden; this is the accessible signal. */}
            <p className="text-caption text-muted-foreground tabular-nums">
              {percent}%
            </p>
          </div>
        ) : null}
        {now ? (
          <p className="text-sm">
            Now importing{" "}
            <span className="font-semibold">#{now.discord_channel_name}</span>
            <span className="text-muted-foreground tabular-nums">
              {" "}
              · {counted(now.imported_count, "message", "messages")}
            </span>
          </p>
        ) : null}
        <CategoryRows categories={progress?.categories ?? []} />
        {channels}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onStop} disabled={stopping}>
            Stop import
          </Button>
        </div>
      </section>
    </DiscordImportFrame>
  );
}

/** A purge in progress: the messages counted down. */
export function ImportDeleting({ row }: { row: ImportRow }) {
  const progress = purgeProgress(row);
  return (
    <DiscordImportFrame>
      <section aria-labelledby="discord-import-deleting" className="space-y-3">
        <h2 id="discord-import-deleting" className="text-headline">
          Deleting the import
        </h2>
        {/* The worker's "paused" note stands in for the count, as it does
          while importing (#1692). */}
        <p className="text-sm text-muted-foreground">
          {row.error ?? purgeLine(row)}
        </p>
        {progress && progress.left > 0 ? (
          <div className="space-y-1">
            <Meter percent={progress.percent} />
            <p className="text-caption text-muted-foreground tabular-nums">
              {progress.percent}%
            </p>
          </div>
        ) : null}
      </section>
    </DiscordImportFrame>
  );
}

const FINISHED_TITLE: Record<string, string> = {
  completed: DISCORD_IMPORT_COPY.finishedDescription,
  failed: "The import stopped on an error.",
  cancelled: "The import was stopped.",
};

/**
 * State 4: done, or stopped part-way, in the settings-rows shape (#6031):
 * the state in the header's line, the Import group's value rows (what came
 * over, and what didn't as a page of its own), then Delete import alone in
 * the last group. Resume stays a button under the state line for an import
 * that failed.
 */
export function ImportFinished({
  row,
  onDelete,
  deleting,
  onResume,
  resuming,
  channels,
}: {
  row: ImportRow;
  onDelete: () => void;
  deleting: boolean;
  onResume: () => void;
  resuming: boolean;
  channels: React.ReactNode;
}) {
  const done = row.status === "completed";
  // A deletion that failed part-way leaves the import `failed` too (#2944):
  // the import itself came over, so it must not read as an import that broke.
  const purged = row.purged_messages ?? 0;
  const deletionFailed = row.status === "failed" && purged > 0;
  // An import that failed picks up where it stopped when started again; one
  // the admin stopped, or whose deletion failed, does not.
  const resumable = row.status === "failed" && !deletionFailed;
  const stateLine = deletionFailed
    ? "The deletion stopped on an error."
    : (FINISHED_TITLE[row.status] ?? "The import stopped.");
  const warned = row.warnings?.length ?? 0;
  const since = formatDay(row.messages_after);
  const finishedOn = row.completed_at ? formatDay(row.completed_at) : null;
  // A completed bot import counts its channels and threads apart; until that
  // read lands, or on an upload, the row's combined count stands in. One
  // stopped part-way counts only what it got through, which the categories
  // don't split, so nothing is read for it.
  const progress = useBotImportProgress(row, false, done);
  const categories = (progress.data as ImportProgress | undefined)?.categories;
  const totals = done && categories?.length ? importTotals(categories) : null;
  // The landing (#3493): once, on a completed import this browser hasn't
  // landed yet. Every other time this is the frame it lands on. A bot
  // import's landing waits for its categories, so none arrive mid-moment;
  // an upload has none.
  const arrival = useArrival(row, row.source !== "bot" || !progress.isPending);
  const { playing } = arrival;
  const messages = useCountUp(row.imported_messages, arrival);
  const tiles = done && categories ? categoryTiles(categories) : [];
  // Done, every channel it read; stopped part-way, the ones it got through,
  // since the rest never came over.
  const channelCount = totals
    ? totals.channels + totals.threads
    : done && typeof row.channels_total === "number"
      ? row.channels_total
      : !done && typeof row.channels_done === "number"
        ? row.channels_done
        : null;
  return (
    <DiscordImportFrame
      titleLeading={done ? <ArrivalMark {...arrival} /> : undefined}
      description={stateLine}
    >
      <div className="space-y-8">
        {row.error || resumable ? (
          <div className="space-y-3">
            {row.error ? (
              <p className="text-sm text-destructive-text">{row.error}</p>
            ) : null}
            {resumable ? (
              <div className="space-y-1.5">
                <Button onClick={onResume} disabled={resuming}>
                  {DISCORD_IMPORT_COPY.resumeImport}
                </Button>
                <p className="text-xs text-muted-foreground">
                  It picks up where it stopped. Nothing already imported comes
                  in twice.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="relative isolate overflow-hidden rounded-[14px]">
            <ArrivalSweep playing={playing} />
            <SettingsGroup heading={DISCORD_IMPORT_COPY.importGroup}>
              {row.guild_name ? (
                <SettingsRow
                  label={DISCORD_IMPORT_COPY.server}
                  control={<Value>{row.guild_name}</Value>}
                />
              ) : null}
              <SettingsRow
                label={DISCORD_IMPORT_COPY.messages}
                description={since ? `Since ${since}` : undefined}
                control={
                  <Value
                    shown={count(messages)}
                    full={count(row.imported_messages)}
                  />
                }
              />
              <SettingsRow
                label={DISCORD_IMPORT_COPY.files}
                control={<Value>{count(row.attachments_imported)}</Value>}
              />
              {channelCount !== null ? (
                <SettingsRow
                  label={DISCORD_IMPORT_COPY.channels}
                  description={
                    totals
                      ? `${counted(totals.channels, "channel", "channels")} and ${counted(totals.threads, "thread", "threads")}`
                      : done
                        ? undefined
                        : "Done before it stopped"
                  }
                  control={<Value>{count(channelCount)}</Value>}
                />
              ) : null}
              {done && finishedOn ? (
                <SettingsRow
                  label={DISCORD_IMPORT_COPY.finished}
                  control={<Value>{finishedOn}</Value>}
                />
              ) : null}
              {purged > 0 ? (
                // A deletion that failed part-way (#2944).
                <SettingsRow
                  label="Already deleted"
                  control={<Value>{count(purged)}</Value>}
                />
              ) : null}
              {warned > 0 ? (
                <SettingsRow
                  id="discord-import-issues-row"
                  icon={CircleAlert}
                  label={DISCORD_IMPORT_COPY.issues}
                  value={count(warned)}
                  href={discordImportPagePath("issues")}
                />
              ) : null}
            </SettingsGroup>
          </div>
        </div>

        <ArrivalCategories tiles={tiles} playing={playing} />

        {done ? (
          <div>
            <Button variant="secondary" asChild>
              <Link href="/chat">Open chat</Link>
            </Button>
          </div>
        ) : null}

        {channels}

        <SettingsGroup
          label={DISCORD_IMPORT_COPY.deleteImport}
          footnote={DISCORD_IMPORT_COPY.deleteFootnote}
        >
          <SettingsRow
            label={DISCORD_IMPORT_COPY.deleteImport}
            destructive
            value=""
            disabled={deleting}
            onClick={onDelete}
          />
        </SettingsGroup>
      </div>
    </DiscordImportFrame>
  );
}

/** A value row's figure, at the row's end. */
function Value({
  children,
  shown,
  full,
}: {
  children?: React.ReactNode;
  /** While a number counts up: what the screen draws; a reader gets `full`. */
  shown?: string;
  full?: string;
}) {
  return (
    <span className="text-sm tabular-nums text-muted-foreground">
      {full === undefined ? (
        children
      ) : shown === full ? (
        full
      ) : (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="sr-only">{full}</span>
        </>
      )}
    </span>
  );
}

/**
 * What didn't come over (`&page=issues`, #6031), opened from a finished
 * import's row: the import's warnings grouped by reason, each reason's lines
 * folded under it.
 */
export function ImportIssues({ row }: { row: ImportRow }) {
  const groups = groupWarnings(row.warnings ?? []);
  const warned = row.warnings?.length ?? 0;
  return (
    <DiscordImportPageFrame title={DISCORD_IMPORT_COPY.issues}>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everything came over.</p>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-1.5" aria-label={DISCORD_IMPORT_COPY.issues}>
            {groups.map((group) => (
              <li key={group.key}>
                <details className="rounded-lg border border-border px-3 py-2 text-sm">
                  <summary className="flex cursor-pointer justify-between gap-3">
                    <span>{group.title}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {count(group.items.length)}
                    </span>
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {group.items.map((item, index) => (
                      <li key={`${group.key}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          {warned >= KEPT_WARNINGS ? (
            <p className="text-xs text-muted-foreground">
              Only the last {KEPT_WARNINGS} are kept.
            </p>
          ) : null}
        </div>
      )}
    </DiscordImportPageFrame>
  );
}
