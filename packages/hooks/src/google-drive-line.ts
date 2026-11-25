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

/** A synced folder in Google Drive, to open from Documents. */
export function driveFolderUrl(driveFolderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(driveFolderId)}`;
}

function count(value: number, noun: string): string {
  return `${value.toLocaleString("en-US")} ${noun}${value === 1 ? "" : "s"}`;
}
