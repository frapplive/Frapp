import { describe, expect, it } from "vitest";
import { notificationScreensForPath } from "./seen-screens";

describe("notificationScreensForPath", () => {
  it("names the screens a page shows the subject of", () => {
    expect(notificationScreensForPath("/events")).toEqual([
      "events",
      "ai_suggestions",
    ]);
    expect(notificationScreensForPath("/events/abc")).toEqual([
      "events",
      "ai_suggestions",
    ]);
    expect(notificationScreensForPath("/members")).toEqual(["members"]);
    // Task reviews, the weekly recap push (#4985), and every task and
    // suggested task since the Tasks page folded in (#5948).
    expect(notificationScreensForPath("/activity")).toEqual([
      "tasks",
      "activity",
      "ai_suggestions",
    ]);
    // Suggested tasks are reviewed under their minutes too.
    expect(notificationScreensForPath("/meetings/abc")).toEqual([
      "ai_suggestions",
    ]);
  });

  it("leaves chat to the channel read, and matches whole segments only", () => {
    expect(notificationScreensForPath("/chat")).toEqual([]);
    // The tools inside Chapter settings mark their own rows (#3837).
    expect(notificationScreensForPath("/settings")).toEqual([]);
    expect(notificationScreensForPath("/chat/abc")).toEqual([]);
    expect(notificationScreensForPath("/eventsfoo")).toEqual([]);
    expect(notificationScreensForPath("/")).toEqual([]);
    expect(notificationScreensForPath(null)).toEqual([]);
  });
});
