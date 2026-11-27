import { describe, expect, it } from "vitest";
import { chapterSettingsAccess } from "./chapter-settings";

// The gate on the chapter menu's Chapter settings item (Chat home) and on the
// screen's groups (#4074).
describe("chapterSettingsAccess", () => {
  it("fails closed while the role loads ([])", () => {
    expect(chapterSettingsAccess([]).any).toBe(false);
  });

  it("offers nothing to an ordinary member or a billing-only treasurer", () => {
    // Plan and billing doesn't come to the phone: no door to an empty screen.
    expect(chapterSettingsAccess(["members:view", "events:update"]).any).toBe(
      false,
    );
    expect(chapterSettingsAccess(["billing:view"]).any).toBe(false);
  });

  it("opens Roles alone to a roles:manage holder, and everything to a config viewer", () => {
    expect(chapterSettingsAccess(["roles:manage"])).toEqual({
      chapter: false,
      roles: true,
      logs: false,
      newChannel: false,
      pledgeClasses: false,
      memberFields: false,
      any: true,
    });
    expect(chapterSettingsAccess(["chapter-config:view"])).toEqual({
      chapter: true,
      roles: true,
      logs: false,
      newChannel: false,
      pledgeClasses: false,
      memberFields: true,
      any: true,
    });
    expect(
      chapterSettingsAccess(["chapter-config:view", "members:view"]).logs,
    ).toBe(true);
    expect(chapterSettingsAccess(["*"]).any).toBe(true);
  });

  // #6029: each row shows to whoever web's tab shows to, with the reads it takes.
  it("offers Pledge class to a roles manager and Member fields to a config viewer", () => {
    expect(
      chapterSettingsAccess(["roles:manage", "members:view"]).pledgeClasses,
    ).toBe(true);
    expect(chapterSettingsAccess(["members:view"]).pledgeClasses).toBe(false);
    expect(chapterSettingsAccess(["chapter-config:view"]).memberFields).toBe(
      true,
    );
    expect(chapterSettingsAccess(["*"])).toMatchObject({
      pledgeClasses: true,
      memberFields: true,
    });
  });

  it("opens Roles and groups to a groups:manage holder alone", () => {
    expect(chapterSettingsAccess(["groups:manage"])).toEqual({
      chapter: false,
      roles: true,
      logs: false,
      newChannel: false,
      pledgeClasses: false,
      memberFields: false,
      any: true,
    });
  });

  // #5296: New channel needs what the create route and the sheet's
  // who-can-see lists take, so it is never a row that fails on save.
  it("offers New channel only with channels:create and channels:manage", () => {
    expect(chapterSettingsAccess(["channels:create"]).newChannel).toBe(false);
    expect(chapterSettingsAccess(["channels:manage"]).newChannel).toBe(false);
    const both = chapterSettingsAccess(["channels:create", "channels:manage"]);
    expect(both.newChannel).toBe(true);
    // Enough to open Chapter settings on its own.
    expect(both.any).toBe(true);
    expect(chapterSettingsAccess(["*"]).newChannel).toBe(true);
  });
});
