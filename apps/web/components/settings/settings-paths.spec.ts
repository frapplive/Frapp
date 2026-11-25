import { describe, expect, it } from "vitest";
import {
  CHAT_REPORTS_SETTINGS_PATH,
  channelDescriptionPath,
  channelSettingsPath,
  chatSettingsPagePath,
  settingsSubpageFor,
} from "./settings-paths";

/**
 * Which page Chapter settings draws in place of the Chat page (#6031): a
 * channel's settings or one of its pages, Discord import, or one of the Chat
 * page's own pages, each only for a viewer holding the tool behind it.
 */
const holdsAll = () => true;
const holdsNone = () => false;
const params = (
  over: Partial<Record<"channel" | "tool" | "page", string>>,
) => ({
  channel: over.channel ?? null,
  tool: over.tool ?? null,
  page: over.page ?? null,
});

describe("settingsSubpageFor", () => {
  it("opens a channel's settings, or one of its pages", () => {
    expect(
      settingsSubpageFor("chat", params({ channel: "c1" }), holdsAll),
    ).toEqual({
      kind: "channel",
      channelId: "c1",
      page: null,
    });
    expect(
      settingsSubpageFor(
        "chat",
        params({ channel: "c1", page: "pins" }),
        holdsAll,
      ),
    ).toEqual({ kind: "channel", channelId: "c1", page: "pins" });
  });

  it("reads a page a channel doesn't have as the channel's settings", () => {
    expect(
      settingsSubpageFor(
        "chat",
        params({ channel: "c1", page: "background" }),
        holdsAll,
      ),
    ).toEqual({ kind: "channel", channelId: "c1", page: null });
  });

  it("opens the Chat page's own pages", () => {
    for (const page of ["background", "reports"] as const) {
      expect(settingsSubpageFor("chat", params({ page }), holdsAll)).toEqual({
        kind: "chat-page",
        page,
      });
    }
    expect(
      settingsSubpageFor("chat", params({ page: "pins" }), holdsAll),
    ).toBeNull();
  });

  it("opens Discord import", () => {
    expect(
      settingsSubpageFor("chat", params({ tool: "discord-import" }), holdsAll),
    ).toEqual({ kind: "discord-import" });
  });

  it("opens nothing for a viewer without the tool, or on another module's page", () => {
    expect(
      settingsSubpageFor("chat", params({ channel: "c1" }), holdsNone),
    ).toBeNull();
    expect(
      settingsSubpageFor("chat", params({ page: "reports" }), holdsNone),
    ).toBeNull();
    expect(
      settingsSubpageFor("chat", params({ tool: "discord-import" }), holdsNone),
    ).toBeNull();
    expect(
      settingsSubpageFor("events", params({ channel: "c1" }), holdsAll),
    ).toBeNull();
  });
});

describe("the addresses", () => {
  it("builds a channel's, its pages', its description's and the Chat page's", () => {
    expect(channelSettingsPath("c 1")).toBe("/settings?tab=chat&page=chat-admin&channel=c%201");
    expect(channelSettingsPath("c1", "see")).toBe(
      "/settings?tab=chat&page=see&channel=c1",
    );
    expect(channelDescriptionPath("c1")).toBe(
      "/settings?tab=chat&page=chat-admin&channel=c1&focus=description",
    );
    expect(chatSettingsPagePath("background")).toBe(
      "/settings?tab=chat&page=background",
    );
    expect(CHAT_REPORTS_SETTINGS_PATH).toBe("/settings?tab=chat&page=reports");
  });
});
