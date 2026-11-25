import { describe, expect, it } from "vitest";
import {
  driveFolderActions,
  driveFolderLine,
  driveFolderUrl,
  driveShortfallNote,
} from "./google-drive-line";

const NOW = new Date(2026, 10, 25, 21, 0);
const base = {
  folder_id: "f-1",
  folder_name: "Tau Nu FIJI",
  folder_url: "https://drive.google.com/drive/folders/f-1",
  status: "active" as const,
  last_synced_at: new Date(2026, 10, 25, 20, 40).toISOString(),
  synced_count: 494,
  skipped_count: 0,
  folders_left_out: 0,
  syncing: false,
  who_can_see: null,
};

describe("driveFolderLine", () => {
  it("says when it last synced and what it holds", () => {
    expect(driveFolderLine(base, NOW)).toMatch(
      /^Synced today at 8:40\sPM · 494 files$/,
    );
  });

  it("names what a pass left out instead of hiding it", () => {
    expect(
      driveFolderLine(
        { ...base, skipped_count: 1753, folders_left_out: 209 },
        NOW,
      ),
    ).toMatch(/ · 494 files · 1,753 left out · 209 folders not read$/);
  });

  it("counts while a pass runs", () => {
    expect(driveFolderLine({ ...base, syncing: true }, NOW)).toBe(
      "Syncing · 494 files so far",
    );
  });

  it("says before the first pass", () => {
    expect(
      driveFolderLine({ ...base, last_synced_at: null, synced_count: 1 }, NOW),
    ).toBe("Not synced yet · 1 file");
  });

  it("says first that Frapp lost the folder", () => {
    expect(driveFolderLine({ ...base, status: "no_access" }, NOW)).toBe(
      "Frapp can't see it in Google Drive",
    );
  });

  it("links a synced folder in Drive", () => {
    expect(driveFolderUrl("a/b")).toBe(
      "https://drive.google.com/drive/folders/a%2Fb",
    );
  });
});

describe("driveShortfallNote", () => {
  it("says nothing when the pass brought everything in", () => {
    expect(driveShortfallNote(base)).toBeNull();
  });

  it("says why files were left out and folders not read, and the fix", () => {
    const note = driveShortfallNote({
      ...base,
      skipped_count: 3,
      folders_left_out: 2,
    });
    expect(note).toMatch(/^Left out: Forms and shortcuts/);
    expect(note).toMatch(/Move them higher up in Drive/);
  });

  it("waits out a pass and a lost folder", () => {
    expect(
      driveShortfallNote({ ...base, skipped_count: 3, syncing: true }),
    ).toBeNull();
    expect(
      driveShortfallNote({ ...base, skipped_count: 3, status: "no_access" }),
    ).toBeNull();
  });
});

describe("driveFolderActions", () => {
  it("syncs only the connected folder, between passes, while Frapp sees it", () => {
    expect(driveFolderActions(base, "f-1", false)).toEqual({
      root: true,
      lost: false,
      syncing: false,
      canSync: true,
    });
    expect(driveFolderActions(base, "sub", false).canSync).toBe(false);
    expect(driveFolderActions(base, "f-1", true).canSync).toBe(false);
    expect(
      driveFolderActions({ ...base, syncing: true }, "f-1", false).canSync,
    ).toBe(false);
    expect(
      driveFolderActions({ ...base, status: "no_access" }, "f-1", false)
        .canSync,
    ).toBe(false);
  });
});
