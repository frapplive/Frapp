import { describe, expect, it } from "vitest";

import {
  availableNewActions,
  NEW_ACTION_LABELS,
  NEW_ACTION_ORDER,
  SECTION_NAMES,
  WEB_NEW_ACTIONS,
} from "./sections";

/**
 * These are the words both apps draw. They are written out here, not read
 * back from the module, so a change to one is a change someone made on
 * purpose: it moves the web nav, the phone's titles and the phone's + panel
 * together.
 */
describe("the app's section names and New actions", () => {
  it("names each place once", () => {
    expect(SECTION_NAMES).toEqual({
      activity: "Activity",
      calendar: "Calendar",
      directory: "Directory",
      messages: "Messages",
      resources: "Resources",
      search: "Search",
    });
  });

  it("lists what New starts, in order, with its words", () => {
    expect(
      NEW_ACTION_ORDER.map((key) => [key, NEW_ACTION_LABELS[key]]),
    ).toEqual([
      ["newMinutes", "New minutes"],
      ["search", "Search"],
      ["newEvent", "New event"],
      ["newTask", "New task"],
      ["invite", "Invite"],
      ["message", "New message"],
      ["hostCheckIn", "Host check-in"],
      ["logHours", "Log hours"],
      ["study", "Study"],
      ["upload", "Upload"],
    ]);
  });

  it("has a label for every action and no label without one", () => {
    expect(Object.keys(NEW_ACTION_LABELS).sort()).toEqual(
      [...NEW_ACTION_ORDER].sort(),
    );
  });

  it("draws on web only what a browser can start, in the shared order (#5946)", () => {
    expect(WEB_NEW_ACTIONS).toEqual([
      "newMinutes",
      "newEvent",
      "newTask",
      "message",
      "logHours",
      "upload",
    ]);
  });

  it("offers each action by the checks its endpoint makes", () => {
    const officer = availableNewActions({
      permissions: ["*"],
      enabledModules: undefined,
    });
    expect(officer).toEqual([...NEW_ACTION_ORDER]);
    // A member: search, message and study, with every module on.
    expect(
      availableNewActions({
        permissions: ["members:view"],
        enabledModules: undefined,
      }),
    ).toEqual(["search", "message", "study"]);
    // A module switched off takes its actions with it.
    expect(
      availableNewActions({
        permissions: ["*"],
        enabledModules: { events: false },
      }),
    ).not.toContain("newEvent");
    // Unknown permissions offer nothing.
    expect(
      availableNewActions({
        permissions: undefined,
        enabledModules: undefined,
      }),
    ).toEqual([]);
  });
});
