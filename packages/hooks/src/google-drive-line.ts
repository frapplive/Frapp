import { formatActedLabel } from "@repo/formatting";
import type { components } from "@repo/api-sdk";

type DriveConnection = components["schemas"]["GoogleDriveConnectionDto"];

/**
 * The Drive folder's one state line in Documents, the same words on web and
 * the phone (#5583, Paul's Drive-as-a-folder pick, 2026-11-25): what it
 * holds and when it last matched Drive, and how much a pass left out
 * rather than hiding it ("Synced today at 8:40 PM · 494 files · 753 left
 * out · 209 folders not read").
 */
export function driveFolderLine(
  connection: DriveConnection,
  now: Date = new Date(),
): string {
  if (connection.status === "no_access") {
    return "Frapp can't see it in Google Drive";
  }
  const files = count(connection.synced_count, "file");
  if (connection.syncing) return `Syncing · ${files} so far`;
  const parts = [
    formatActedLabel("Synced", connection.last_synced_at, now) ??
      "Not synced yet",
    files,
  ];
  if (connection.skipped_count > 0) {
    parts.push(`${connection.skipped_count.toLocaleString("en-US")} left out`);
  }
  if (connection.folders_left_out > 0) {
    parts.push(`${count(connection.folders_left_out, "folder")} not read`);
  }
  return parts.join(" · ");
}

/**
 * Why the line's counts fall short, and what brings the rest in: under the
 * line on web and in the menu on the phone, only when a pass left any out
 * (the Drive panel said this before the line replaced it, 2026-11-25).
 */
export function driveShortfallNote(connection: DriveConnection): string | null {
  if (connection.status === "no_access" || connection.syncing) return null;
  const notes: string[] = [];
  if (connection.skipped_count > 0) {
    notes.push(
      "Left out: Forms and shortcuts, file types Documents doesn't take, files over 25 MB, and files past the first 5,000.",
    );
  }
  if (connection.folders_left_out > 0) {
    notes.push(
      "Not read: folders past 10 levels or the first 1,000, and everything in them. Move them higher up in Drive, or connect a smaller folder.",
    );
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

/**
 * What the folder's menu offers, one rule for web and the phone. Only the
 * connected folder has a menu: Sync now and Disconnect act on the whole
 * connection, so a folder below it offers just Open in Google Drive, as a
 * button (a menu of one becomes a button, `rulebook.md` § 9).
 */
export function driveFolderActions(
  connection: DriveConnection,
  driveFolderId: string,
  syncPending: boolean,
): {
  /** The connected folder itself, rather than one sync made below it. */
  root: boolean;
  lost: boolean;
  syncing: boolean;
  /** Sync now runs: the connected folder, not mid-pass, not lost. */
  canSync: boolean;
} {
  const root = driveFolderId === connection.folder_id;
  const lost = connection.status === "no_access";
  const syncing = connection.syncing || syncPending;
  return { root, lost, syncing, canSync: root && !syncing && !lost };
}

/** A synced folder in Google Drive, to open from Documents. */
export function driveFolderUrl(driveFolderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(driveFolderId)}`;
}

function count(value: number, noun: string): string {
  return `${value.toLocaleString("en-US")} ${noun}${value === 1 ? "" : "s"}`;
}
