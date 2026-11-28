import { describe, expect, it } from "vitest";
import {
  DISCORD_IMPORT_COPY,
  discordImportedMessagesLabel,
  discordImportingLabel,
  studyZoneRuleUnit,
} from "./officer-tools-copy";

describe("Discord import row values (#6031)", () => {
  it("counts messages in the singular and plural", () => {
    expect(discordImportedMessagesLabel(1)).toBe("1 message");
    expect(discordImportedMessagesLabel(0)).toBe("0 messages");
    expect(discordImportedMessagesLabel(4120)).toBe("4,120 messages");
  });

  it("says Importing with a percent only once there is one", () => {
    expect(discordImportingLabel(null)).toBe("Importing");
    expect(discordImportingLabel(42)).toBe("Importing 42%");
  });

  it("keeps the page's own words for the states a row can be in", () => {
    expect(DISCORD_IMPORT_COPY.rowState).toEqual({
      notStarted: "Not started",
      waiting: "Waiting to start",
      deleting: "Deleting",
      stoppedOnError: "Stopped on an error",
      deletionStopped: "Deletion stopped",
      stopped: "Stopped",
    });
  });
});

describe("studyZoneRuleUnit (#6031)", () => {
  it("agrees with the box: 1 point, 1 minute", () => {
    expect(studyZoneRuleUnit("points", "1")).toBe("point");
    expect(studyZoneRuleUnit("minutes", 1)).toBe("minute");
  });

  it("reads plural for any other number, and for an empty box", () => {
    expect(studyZoneRuleUnit("points", "2")).toBe("points");
    expect(studyZoneRuleUnit("minutes", "30")).toBe("minutes");
    expect(studyZoneRuleUnit("minutes", "0")).toBe("minutes");
    expect(studyZoneRuleUnit("minutes", "")).toBe("minutes");
  });
});
