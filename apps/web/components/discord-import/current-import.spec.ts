import { describe, expect, it } from "vitest";
import type { ImportRow } from "./import-progress";
import { currentImport, importRowState, importStage } from "./current-import";

const row = (id: string, status: string, created_at: string) =>
  ({ id, status, created_at }) as unknown as ImportRow;

describe("currentImport", () => {
  it("is the newest import that holds anything, past drafts and deleted ones", () => {
    const { current, lastDeleted } = currentImport([
      row("old", "purged", "2026-09-01T00:00:00Z"),
      row("kept", "completed", "2026-09-30T00:00:00Z"),
      row("left", "draft", "2026-10-02T00:00:00Z"),
    ]);
    expect(current?.id).toBe("kept");
    expect(lastDeleted).toBeNull();
  });

  it("names no draft while an import is current", () => {
    expect(
      currentImport([
        row("kept", "completed", "2026-09-30T00:00:00Z"),
        row("left", "draft", "2026-10-02T00:00:00Z"),
      ]).unfinished,
    ).toBeNull();
  });

  it("is nothing once the import is deleted, and names the newest deleted one", () => {
    const { current, lastDeleted, unfinished } = currentImport([
      row("first", "purged", "2026-09-01T00:00:00Z"),
      row("second", "purged", "2026-09-30T00:00:00Z"),
      row("older", "draft", "2026-10-01T00:00:00Z"),
      row("left", "draft", "2026-10-02T00:00:00Z"),
    ]);
    expect(current).toBeNull();
    expect(lastDeleted?.id).toBe("second");
    // A draft can hold an uploaded export, so the start offers to delete it.
    expect(unfinished?.id).toBe("left");
  });

  it("is nothing at all for a chapter that never imported", () => {
    expect(currentImport([])).toEqual({
      current: null,
      lastDeleted: null,
      unfinished: null,
    });
  });
});

describe("importStage", () => {
  it.each([
    ["ready", "importing"],
    ["running", "importing"],
    ["purging", "deleting"],
    ["completed", "finished"],
    ["failed", "finished"],
    ["cancelled", "finished"],
  ])("puts a %s import on the %s page", (status, stage) => {
    expect(importStage(row("x", status, "2026-09-30T00:00:00Z"))).toBe(stage);
  });
});

describe("importRowState (#6031)", () => {
  const at = "2026-09-30T00:00:00Z";
  const with_ = (status: string, fields: Partial<ImportRow> = {}) =>
    ({ ...row("i", status, at), ...fields }) as ImportRow;

  it("says Not started with nothing imported", () => {
    expect(importRowState([])).toBe("Not started");
    expect(importRowState([row("d", "draft", at)])).toBe("Not started");
  });

  it("says how far a running import is", () => {
    expect(
      importRowState([
        with_("running", {
          source: "upload",
          imported_messages: 42,
          total_messages: 100,
          channels_total: null,
        }),
      ]),
    ).toBe("Importing 42%");
  });

  it("counts a finished import's messages", () => {
    expect(
      importRowState([with_("completed", { imported_messages: 4120 })]),
    ).toBe("4,120 messages");
  });

  it("says a failed import stopped on an error", () => {
    expect(importRowState([with_("failed")])).toBe("Stopped on an error");
  });
});
