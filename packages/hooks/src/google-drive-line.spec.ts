import { describe, expect, it } from "vitest";
import { driveFolderLine, driveFolderUrl } from "./google-drive-line";

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
